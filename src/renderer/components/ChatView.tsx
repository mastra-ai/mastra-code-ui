import { useEffect, useRef } from "react"
import { AssistantMessage } from "./AssistantMessage"
import { UserMessage } from "./UserMessage"
import { ToolExecution } from "./ToolExecution"
import { SubagentExecution } from "./SubagentExecution"
import { TodoProgress } from "./TodoProgress"
import type { Message } from "../types/ipc"

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

	// Build a flat list of renderable items from messages
	const items: Array<{
		type: "user" | "assistant" | "tool" | "subagent"
		key: string
		data: unknown
	}> = []

	for (const msg of messages) {
		if (msg.role === "user") {
			items.push({ type: "user", key: `msg-${msg.id}`, data: msg })
		} else if (msg.role === "assistant") {
			// Extract text content
			const textContent = msg.content
				?.filter(
					(c) => c.type === "text" || c.type === "thinking",
				)
			if (textContent && textContent.length > 0) {
				items.push({
					type: "assistant",
					key: `msg-${msg.id}`,
					data: { ...msg, isStreaming: msg.id === streamingMessageId },
				})
			}

			// Extract tool calls
			if (msg.content) {
				for (const c of msg.content) {
					if (c.type === "tool_call") {
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
				}
			}
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
			{items.length === 0 && !isAgentActive && (
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						justifyContent: "center",
						height: "100%",
						color: "var(--dim)",
						gap: 8,
					}}
				>
					<div style={{ fontSize: 24 }}>Mastra Code</div>
					<div style={{ fontSize: 13 }}>
						Send a message to get started
					</div>
				</div>
			)}

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

			{/* Loading indicator */}
			{isAgentActive && (
				<div
					style={{
						padding: "12px 0",
						display: "flex",
						alignItems: "center",
						gap: 8,
						color: "var(--muted)",
						fontSize: 12,
					}}
				>
					<span className="loading-dot" />
					Thinking...
					<style>{`
						@keyframes pulse {
							0%, 100% { opacity: 0.3; }
							50% { opacity: 1; }
						}
						.loading-dot {
							width: 6px;
							height: 6px;
							border-radius: 50%;
							background: var(--accent);
							animation: pulse 1.5s ease-in-out infinite;
						}
					`}</style>
				</div>
			)}

			{/* Bottom padding */}
			<div style={{ height: 16 }} />
		</div>
	)
}
