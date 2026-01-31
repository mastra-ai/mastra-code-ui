/**
 * Task meta-tool — spawns a subagent to perform a focused task.
 *
 * The parent agent calls this tool with a task description and agent type.
 * A fresh Agent instance is created with the subagent's constrained tool set,
 * runs to completion via agent.generate(), and returns the text result.
 */
import { createTool } from "@mastra/core/tools"
import { Agent } from "@mastra/core/agent"
import { z } from "zod/v3"
import { getSubagentDefinition, getSubagentIds } from "../agents/index.js"

export interface TaskToolDeps {
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

export function createTaskTool(deps: TaskToolDeps) {
    const validAgentTypes = getSubagentIds()

    return createTool({
        id: "task",
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
        execute: async ({ agentType, task, modelId }) => {
            const definition = getSubagentDefinition(agentType)
            if (!definition) {
                return {
                    content: `Unknown agent type: ${agentType}. Valid types: ${validAgentTypes.join(", ")}`,
                    isError: true,
                }
            }

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

            try {
                const result = await subagent.generate(task, {
                    maxSteps: 50,
                })

                return {
                    content: result.text,
                    isError: false,
                }
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err)
                return {
                    content: `Subagent "${definition.name}" failed: ${message}`,
                    isError: true,
                }
            }
        },
    })
}
