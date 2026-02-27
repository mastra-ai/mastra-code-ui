import { useEffect, useRef, useState } from "react"
import { AssistantMessage } from "./AssistantMessage"
import { UserMessage } from "./UserMessage"
import { ToolExecution } from "./ToolExecution"
import { SubagentExecution } from "./SubagentExecution"
import { TodoProgress } from "./TodoProgress"
import { AsciiLogo } from "./AsciiLogo"
import type { Message } from "../types/ipc"

function ElapsedTime({ startedAt }: { startedAt: number }) {
	const [elapsed, setElapsed] = useState(0)

	useEffect(() => {
		const interval = setInterval(() => {
			setElapsed((Date.now() - startedAt) / 1000)
		}, 100)
		return () => clearInterval(interval)
	}, [startedAt])

	return (
		<div
			style={{
				padding: "4px 0",
				display: "flex",
				alignItems: "center",
				gap: 6,
				color: "var(--dim)",
				fontSize: 12,
			}}
		>
			<span style={{ letterSpacing: 2, fontSize: 14 }}>{"\u22EE"}</span>
			<span>{elapsed.toFixed(1)}s</span>
		</div>
	)
}

interface ChatViewProps {
	messages: Message[]
	tools: Map<
		string,
		{
			id: string
			name: string
			args: unknown
			result?: unknown
			isError?: boolean
			status: "pending" | "running" | "complete" | "error"
			shellOutput?: string
		}
	>
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
	streamingMessageId: string | null
	todos: Array<{
		content: string
		status: "pending" | "in_progress" | "completed"
		activeForm: string
	}>
}

export function ChatView({
	messages,
	tools,
	subagents,
	isAgentActive,
	agentStartedAt,
	streamingMessageId,
	todos,
}: ChatViewProps) {
	const scrollRef = useRef<HTMLDivElement>(null)
	const isAutoScroll = useRef(true)

	useEffect(() => {
		if (isAutoScroll.current && scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight
		}
	}, [messages, tools, subagents])

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
		type: "user" | "assistant" | "tool" | "subagent"
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
			let textGroupIndex = 0
			const isStreaming = msg.id === streamingMessageId

			const flushText = (isTrailing: boolean) => {
				if (pendingTextBlocks.length === 0) return
				const hasContent = pendingTextBlocks.some((c) => {
					const block = c as unknown as Record<string, unknown>
					const text = (block.text ?? block.thinking ?? "") as string
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
						pendingTextBlocks.push(c)
					} else if (c.type === "tool_call") {
						// Flush any accumulated text before this tool call
						flushText(false)

						const toolId = c.id as string
						const toolState = tools.get(toolId)
						const subagentState = subagents.get(toolId)

						if (subagentState) {
							items.push({
								type: "subagent",
								key: `subagent-${toolId}`,
								data: subagentState,
							})
						} else {
							items.push({
								type: "tool",
								key: `tool-${toolId}`,
								data: toolState ?? {
									id: toolId,
									name: c.name as string,
									args: c.args,
									status: "pending",
								},
							})
						}
					}
					// tool_result blocks are skipped — tool state is tracked separately
				}
			}
			// Flush any trailing text (e.g. the final summary after tool calls)
			flushText(true)
		}
	}

	return (
		<div
			ref={scrollRef}
			onScroll={handleScroll}
			style={{
				flex: 1,
				overflowY: "auto",
				padding: "16px 24px",
			}}
		>
			{items.length === 0 && !isAgentActive && <AsciiLogo />}

			{items.map((item) => {
				switch (item.type) {
					case "user":
						return (
							<UserMessage key={item.key} message={item.data as Message} />
						)
					case "assistant":
						return (
							<AssistantMessage
								key={item.key}
								message={item.data as Message & { isStreaming: boolean }}
							/>
						)
					case "tool":
						return (
							<ToolExecution
								key={item.key}
								tool={
									item.data as {
										id: string
										name: string
										args: unknown
										result?: unknown
										isError?: boolean
										status: string
										shellOutput?: string
									}
								}
							/>
						)
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

			{/* Elapsed time indicator */}
			{isAgentActive && agentStartedAt && (
				<ElapsedTime startedAt={agentStartedAt} />
			)}

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
