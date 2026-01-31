/**
 * Subagent tool — spawns a subagent to perform a focused task.
 *
 * The parent agent calls this tool with a task description and agent type.
 * A fresh Agent instance is created with the subagent's constrained tool set,
 * runs via agent.stream(), and returns the text result.
 *
 * Stream events are forwarded to the parent harness so the TUI can show
 * real-time subagent activity (tool calls, text deltas, etc.).
 */
import { createTool } from "@mastra/core/tools"
import { Agent } from "@mastra/core/agent"
import { z } from "zod/v3"
import { getSubagentDefinition, getSubagentIds } from "../agents/index.js"
import type { HarnessEvent, HarnessRuntimeContext } from "../harness/types.js"

export interface SubagentToolDeps {
    /**
     * The full tool registry from the parent agent.
     * The subagent will receive a subset based on its allowedTools.
     */
    tools: Record<string, any>

    /**
     * Function to resolve a model ID to a language model instance.
     * Shared with the parent agent so subagents use the same providers.
     */
    resolveModel: (modelId: string) => any

    /**
     * Model ID to use for subagent tasks.
     * Defaults to a fast model to keep costs down.
     */
    defaultModelId?: string
}

// Default model for subagent tasks — fast and cheap
const DEFAULT_SUBAGENT_MODEL = "anthropic/claude-sonnet-4-20250514"

export function createSubagentTool(deps: SubagentToolDeps) {
    const validAgentTypes = getSubagentIds()

    return createTool({
        id: "subagent",
        description: `Delegate a focused task to a specialized subagent. The subagent runs independently with a constrained toolset, then returns its findings as text.

Available agent types:
- **explore**: Read-only codebase exploration. Has access to view, search_content, and find_files. Use for questions like "find all usages of X", "how does module Y work", "what files are related to Z".
- **plan**: Read-only analysis and planning. Same tools as explore. Use for "create an implementation plan for X", "analyze the architecture of Y".

The subagent runs in its own context — it does NOT see the parent conversation history. Write a clear, self-contained task description.

Use this tool when:
- You need to explore a large area of the codebase before making changes
- You want to run multiple investigations in parallel
- The task is self-contained and doesn't require writing code`,
        inputSchema: z.object({
            agentType: z
                .enum(validAgentTypes as [string, ...string[]])
                .describe("Type of subagent to spawn"),
            task: z
                .string()
                .describe(
                    "Clear, self-contained description of what the subagent should do. Include all relevant context — the subagent cannot see the parent conversation.",
                ),
            modelId: z
                .string()
                .optional()
                .describe(
                    `Model ID to use for this task. Defaults to ${DEFAULT_SUBAGENT_MODEL}.`,
                ),
        }),
        execute: async ({ agentType, task, modelId }, context) => {
            const definition = getSubagentDefinition(agentType)
            if (!definition) {
                return {
                    content: `Unknown agent type: ${agentType}. Valid types: ${validAgentTypes.join(", ")}`,
                    isError: true,
                }
            }

            // Get emit function from harness context (if available)
            const harnessCtx = context?.requestContext?.get("harness") as HarnessRuntimeContext | undefined
            const emitEvent = harnessCtx?.emitEvent
            // toolCallId from the parent agent's tool invocation
            const toolCallId = context?.agent?.toolCallId ?? "unknown"

            // Build the constrained tool set
            const subagentTools: Record<string, any> = {}
            for (const toolId of definition.allowedTools) {
                if (deps.tools[toolId]) {
                    subagentTools[toolId] = deps.tools[toolId]
                }
            }

            // Resolve the model
            const resolvedModelId = modelId ?? deps.defaultModelId ?? DEFAULT_SUBAGENT_MODEL
            let model: any
            try {
                model = deps.resolveModel(resolvedModelId)
            } catch (err) {
                return {
                    content: `Failed to resolve model "${resolvedModelId}": ${err instanceof Error ? err.message : String(err)}`,
                    isError: true,
                }
            }

            // Create a fresh agent with constrained tools
            const subagent = new Agent({
                id: `subagent-${definition.id}`,
                name: `${definition.name} Subagent`,
                instructions: definition.instructions,
                model,
                tools: subagentTools,
            })

            const startTime = Date.now()

            // Notify TUI that subagent is starting
            emitEvent?.({
                type: "subagent_start",
                toolCallId,
                agentType,
                task,
            })

            try {
                const response = await subagent.stream(task, {
                    maxSteps: 50,
                })

                // Consume the fullStream to forward events to the TUI
                const reader = response.fullStream.getReader()
                let finalText = ""

                while (true) {
                    const { done, value: chunk } = await reader.read()
                    if (done) break

                    switch (chunk.type) {
                        case "text-delta":
                            finalText += chunk.payload.text
                            emitEvent?.({
                                type: "subagent_text_delta",
                                toolCallId,
                                agentType,
                                textDelta: chunk.payload.text,
                            })
                            break

                        case "tool-call":
                            emitEvent?.({
                                type: "subagent_tool_start",
                                toolCallId,
                                agentType,
                                subToolName: chunk.payload.toolName,
                                subToolArgs: chunk.payload.args,
                            })
                            break

                        case "tool-result":
                            emitEvent?.({
                                type: "subagent_tool_end",
                                toolCallId,
                                agentType,
                                subToolName: chunk.payload.toolName,
                                subToolResult: chunk.payload.result,
                                isError: chunk.payload.isError ?? false,
                            })
                            break
                    }
                }

                // Use getFullOutput to get the authoritative final text
                const fullOutput = await response.getFullOutput()
                const resultText = fullOutput.text || finalText

                const durationMs = Date.now() - startTime
                emitEvent?.({
                    type: "subagent_end",
                    toolCallId,
                    agentType,
                    result: resultText,
                    isError: false,
                    durationMs,
                })

                return {
                    content: resultText,
                    isError: false,
                }
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err)
                const durationMs = Date.now() - startTime

                emitEvent?.({
                    type: "subagent_end",
                    toolCallId,
                    agentType,
                    result: message,
                    isError: true,
                    durationMs,
                })

                return {
                    content: `Subagent "${definition.name}" failed: ${message}`,
                    isError: true,
                }
            }
        },
    })
}
