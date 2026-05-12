import { useEffect, useRef, useState } from "react"
import { AssistantMessage } from "./AssistantMessage"
import { UserMessage } from "./UserMessage"
import { ToolExecution } from "./ToolExecution"
import {
	ToolGroup,
	getToolGroupKind,
	shouldRenderToolGroup,
	type ToolGroupKind,
} from "./ToolGroup"
import { SubagentExecution } from "./SubagentExecution"
import { TodoProgress } from "./TodoProgress"
import { AsciiLogo } from "./AsciiLogo"
import { ShimmerText } from "./Shimmer"
import type { Message } from "../types/ipc"
import type { PendingQuestion, ToolQuestionState } from "../types/chat"
import { getToolResultIsError } from "../utils/askUser"

type ChatToolItem = {
	id: string
	name: string
	args: unknown
	result?: unknown
	isError?: boolean
	status: "pending" | "running" | "complete" | "error"
	shellOutput?: string
	question?: ToolQuestionState
}

function ElapsedTime({ startedAt }: { startedAt: number }) {
	const [elapsed, setElapsed] = useState(0)

	useEffect(() => {
		const interval = setInterval(() => {
			setElapsed((Date.now() - startedAt) / 1000)
		}, 100)
		return () => clearInterval(interval)
	}, [startedAt])

	return (
		<div className="agent-activity-state">
			<span className="agent-activity-glyph">{"\u22EE"}</span>
			<span>{elapsed.toFixed(1)}s</span>
		</div>
	)
}

function AgentSuspensionState({
	pendingQuestion,
}: {
	pendingQuestion: PendingQuestion
}) {
	const isPreparing = pendingQuestion.responseEnabled === false

	return (
		<div
			className="agent-activity-state agent-suspension-state"
			data-agent-state="waiting-for-response"
			title={pendingQuestion.question}
		>
			<span className="agent-activity-glyph">{"\u22EE"}</span>
			<ShimmerText style={{ color: "var(--muted)" }}>
				{isPreparing
					? "Agent is preparing a question"
					: "Agent is waiting for response"}
			</ShimmerText>
		</div>
	)
}

function getHistoricalToolResult(
	message: Message,
	toolId: string,
): Message["content"][number] | undefined {
	return message.content.find((content) => {
		if (content.type !== "tool_result") return false
		return content.id === toolId
	})
}

function buildHistoricalToolItem(
	toolCall: Message["content"][number],
	toolResult: Message["content"][number] | undefined,
): ChatToolItem {
	const isError = getToolResultIsError(
		toolResult?.result,
		toolResult?.isError === true,
	)

	return {
		id: toolCall.id as string,
		name: toolCall.name as string,
		args: toolCall.args,
		result: toolResult?.result,
		isError,
		status: toolResult ? (isError ? "error" : "complete") : "pending",
	}
}

function mergeToolItem(
	liveTool: ChatToolItem | undefined,
	historicalTool: ChatToolItem,
): ChatToolItem {
	if (!liveTool) return historicalTool

	const historicalFinished =
		historicalTool.status === "complete" || historicalTool.status === "error"

	return {
		...historicalTool,
		...liveTool,
		result: liveTool.result ?? historicalTool.result,
		isError: liveTool.isError ?? historicalTool.isError,
		status: historicalFinished ? historicalTool.status : liveTool.status,
	}
}

interface ChatViewProps {
	messages: Message[]
	tools: Map<string, ChatToolItem>
	subagents: Map<
		string,
		{
			toolCallId: string
			agentType: string
			task: string
			modelId?: string
			tools: Array<{
				name: string
				args: unknown
				result?: unknown
				isError?: boolean
				status: "running" | "complete"
			}>
			result?: string
			isError?: boolean
			durationMs?: number
			status: "running" | "complete"
		}
	>
	isAgentActive: boolean
	agentStartedAt: number | null
	pendingQuestion?: PendingQuestion | null
	streamingMessageId: string | null
	todos: Array<{
		content: string
		status: "pending" | "in_progress" | "completed"
		activeForm: string
	}>
	onFileClick?: (filePath: string) => void
}

export function ChatView({
	messages,
	tools,
	subagents,
	isAgentActive,
	agentStartedAt,
	pendingQuestion,
	streamingMessageId,
	todos,
	onFileClick,
}: ChatViewProps) {
	const scrollRef = useRef<HTMLDivElement>(null)
	const isAutoScroll = useRef(true)

	useEffect(() => {
		if (isAutoScroll.current && scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight
		}
	}, [messages, tools, subagents, pendingQuestion])

	function handleScroll() {
		if (!scrollRef.current) return
		const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
		isAutoScroll.current = scrollHeight - scrollTop - clientHeight < 100
	}

	// Build a flat list of renderable items from messages, preserving the
	// natural interleaved order of text blocks and tool calls within each
	// assistant message.  The harness accumulates the entire agentic turn into
	// a single message (text → tool_call → tool_result → text → …), so we
	// walk the content array in order and emit items as we encounter them.
	const items: Array<{
		type: "user" | "assistant" | "tool" | "toolGroup" | "subagent"
		key: string
		data: unknown
	}> = []

	for (const msg of messages) {
		if (msg.role === "user") {
			items.push({ type: "user", key: `msg-${msg.id}`, data: msg })
		} else if (msg.role === "assistant") {
			// Walk content blocks in order and group consecutive text/thinking
			// blocks into a single assistant item, emitting tool items inline.
			let pendingTextBlocks: typeof msg.content = []
			let pendingToolGroup: {
				kind: ToolGroupKind
				tools: ChatToolItem[]
			} | null = null
			let textGroupIndex = 0
			let toolGroupIndex = 0
			const isStreaming = msg.id === streamingMessageId

			const flushToolGroup = () => {
				if (!pendingToolGroup) return
				const group = pendingToolGroup

				if (shouldRenderToolGroup(group.kind, group.tools)) {
					items.push({
						type: "toolGroup",
						key: `tool-group-${msg.id}-${toolGroupIndex}`,
						data: group,
					})
					toolGroupIndex++
				} else {
					for (const tool of group.tools) {
						items.push({
							type: "tool",
							key: `tool-${tool.id}`,
							data: tool,
						})
					}
				}

				pendingToolGroup = null
			}

			const queueTool = (tool: ChatToolItem) => {
				const kind = getToolGroupKind(tool)

				if (!kind) {
					flushToolGroup()
					items.push({
						type: "tool",
						key: `tool-${tool.id}`,
						data: tool,
					})
					return
				}

				if (pendingToolGroup && pendingToolGroup.kind !== kind) {
					flushToolGroup()
				}

				if (!pendingToolGroup) {
					pendingToolGroup = { kind, tools: [] }
				}

				pendingToolGroup.tools.push(tool)
			}

			const flushText = (isTrailing: boolean) => {
				if (pendingTextBlocks.length === 0) return
				const hasContent = pendingTextBlocks.some((c) => {
					if (c.type === "thinking") return true
					const block = c as unknown as Record<string, unknown>
					const text = (block.text ?? "") as string
					return text.length > 0
				})
				if (hasContent) {
					items.push({
						type: "assistant",
						key: `msg-${msg.id}-text-${textGroupIndex}`,
						data: {
							...msg,
							content: pendingTextBlocks,
							// Only show streaming cursor on the trailing (last) text group
							isStreaming: isStreaming && isTrailing,
						},
					})
				}
				textGroupIndex++
				pendingTextBlocks = []
			}

			if (msg.content) {
				for (const c of msg.content) {
					if (c.type === "text" || c.type === "thinking") {
						flushToolGroup()
						pendingTextBlocks.push(c)
					} else if (c.type === "tool_call") {
						// Flush any accumulated text before this tool call
						flushText(false)

						const toolId = c.id as string
						const toolResult = getHistoricalToolResult(msg, toolId)
						const historicalTool = buildHistoricalToolItem(c, toolResult)
						const toolState = mergeToolItem(tools.get(toolId), historicalTool)
						const subagentState = subagents.get(toolId)

						if (subagentState) {
							flushToolGroup()
							items.push({
								type: "subagent",
								key: `subagent-${toolId}`,
								data: subagentState,
							})
						} else {
							queueTool(toolState)
						}
					}
					// tool_result blocks are paired with their tool_call above.
				}
			}
			// Flush any trailing text (e.g. the final summary after tool calls)
			flushToolGroup()
			flushText(true)
		}
	}

	const isEmpty = items.length === 0 && !isAgentActive

	return (
		<div
			ref={scrollRef}
			onScroll={handleScroll}
			style={{
				flex: 1,
				overflowY: isEmpty ? "hidden" : "auto",
				padding: isEmpty ? "0 24px" : "16px 24px",
			}}
		>
			{isEmpty && <AsciiLogo />}

			<div
				style={{
					width: "100%",
					maxWidth: "var(--chat-column-max-width)",
					margin: "0 auto",
				}}
			>
				{items.map((item) => {
					switch (item.type) {
						case "user":
							return (
								<UserMessage
									key={item.key}
									message={item.data as Message}
									onFileClick={onFileClick}
								/>
							)
						case "assistant":
							return (
								<AssistantMessage
									key={item.key}
									message={item.data as Message & { isStreaming: boolean }}
									onFileClick={onFileClick}
								/>
							)
						case "tool":
							return (
								<ToolExecution
									key={item.key}
									onFileClick={onFileClick}
									tool={
										item.data as {
											id: string
											name: string
											args: unknown
											result?: unknown
											isError?: boolean
											status: string
											shellOutput?: string
											question?: ToolQuestionState
										}
									}
								/>
							)
						case "toolGroup": {
							const group = item.data as {
								kind: ToolGroupKind
								tools: ChatToolItem[]
							}
							return (
								<ToolGroup
									key={item.key}
									kind={group.kind}
									tools={group.tools}
									onFileClick={onFileClick}
								/>
							)
						}
						case "subagent":
							return (
								<SubagentExecution
									key={item.key}
									subagent={
										item.data as {
											toolCallId: string
											agentType: string
											task: string
											tools: Array<{
												name: string
												args: unknown
												result?: unknown
												isError?: boolean
												status: string
											}>
											result?: string
											isError?: boolean
											durationMs?: number
											status: string
										}
									}
								/>
							)
					}
				})}

				{/* Todo progress */}
				{todos.length > 0 && <TodoProgress todos={todos} />}

				{/* Agent activity indicator */}
				{isAgentActive && pendingQuestion ? (
					<AgentSuspensionState pendingQuestion={pendingQuestion} />
				) : isAgentActive && agentStartedAt ? (
					<ElapsedTime startedAt={agentStartedAt} />
				) : null}
			</div>

			<style>{`
				@keyframes pulse {
					0%, 100% { opacity: 0.3; }
					50% { opacity: 1; }
				}
			`}</style>

			{/* Bottom padding */}
			<div style={{ height: 16 }} />
		</div>
	)
}
