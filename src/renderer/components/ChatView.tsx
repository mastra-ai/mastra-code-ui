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

	// Helper to extract text from message content
	function getMessageText(msg: Message): string {
		return (
			msg.content
				?.filter((c) => c.type === "text" || c.type === "thinking")
				.map((c) => {
					const block = c as unknown as Record<string, unknown>
					return (block.text ?? block.thinking ?? "") as string
				})
				.join("") ?? ""
		)
	}

	// Build a flat list of renderable items from messages
	const items: Array<{
		type: "user" | "assistant" | "tool" | "subagent"
		key: string
		data: unknown
	}> = []

	let lastAssistantText = ""

	for (const msg of messages) {
		if (msg.role === "user") {
			items.push({ type: "user", key: `msg-${msg.id}`, data: msg })
			lastAssistantText = ""
		} else if (msg.role === "assistant") {
			// Deduplicate: skip text if identical to previous assistant message
			const currentText = getMessageText(msg)
			const isNewText = currentText && currentText !== lastAssistantText

			if (isNewText) {
				const textContent = msg.content?.filter(
					(c) => c.type === "text" || c.type === "thinking",
				)
				if (textContent && textContent.length > 0) {
					items.push({
						type: "assistant",
						key: `msg-${msg.id}`,
						data: { ...msg, isStreaming: msg.id === streamingMessageId },
					})
				}
			}
			if (currentText) {
				lastAssistantText = currentText
			}

			// Always extract tool calls (even if text was deduplicated)
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
