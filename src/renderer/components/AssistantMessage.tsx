import { useMemo } from "react"
import { parseMarkdownIntoBlocks } from "streamdown"
import type { Message, MessageContent } from "../types/ipc"
import { MessageMarkdown } from "./MessageMarkdown"
import { ReasoningBlock } from "./ReasoningBlock"

function stripEmojis(text: string): string {
	return text
		.replace(/[\u{1F600}-\u{1F64F}]/gu, "")
		.replace(/[\u{1F300}-\u{1F5FF}]/gu, "")
		.replace(/[\u{1F680}-\u{1F6FF}]/gu, "")
		.replace(/[\u{1F1E0}-\u{1F1FF}]/gu, "")
		.replace(/[\u{1F900}-\u{1F9FF}]/gu, "")
		.replace(/[\u{1FA00}-\u{1FAFF}]/gu, "")
		.replace(/[\u{2700}-\u{27BF}]/gu, "")
}

interface AssistantMessageProps {
	message: Message & { isStreaming?: boolean }
	onFileClick?: (filePath: string) => void
}

type RenderBlock =
	| { type: "markdown"; key: string; content: string }
	| { type: "thinking"; key: string; content: string }

function getTextContent(part: MessageContent): string {
	const text = (part as { text?: unknown }).text
	return typeof text === "string" ? text : ""
}

function getThinkingContent(part: MessageContent): string {
	const thinking = (part as { thinking?: unknown }).thinking
	return typeof thinking === "string" ? thinking : ""
}

export function AssistantMessage({
	message,
	onFileClick,
}: AssistantMessageProps) {
	const text = useMemo(() => {
		let value = ""
		for (const part of message.content ?? []) {
			if (part.type === "text") {
				value += getTextContent(part)
			}
		}
		return value
	}, [message.content])

	const blocks = useMemo(() => {
		const renderBlocks: RenderBlock[] = []
		let textBuffer = ""
		let markdownGroupIndex = 0
		let thinkingIndex = 0

		const flushText = () => {
			const cleaned = stripEmojis(textBuffer)
			textBuffer = ""
			if (!cleaned) return

			let markdownBlocks: string[]
			try {
				markdownBlocks = parseMarkdownIntoBlocks(cleaned)
			} catch {
				markdownBlocks = [cleaned]
			}

			markdownBlocks.forEach((content, blockIndex) => {
				if (!content) return
				renderBlocks.push({
					type: "markdown",
					key: `markdown-${markdownGroupIndex}-${blockIndex}`,
					content,
				})
			})
			markdownGroupIndex++
		}

		for (const part of message.content ?? []) {
			if (part.type === "text") {
				textBuffer += getTextContent(part)
				continue
			}
			if (part.type === "thinking") {
				flushText()
				const thinking = getThinkingContent(part)
				renderBlocks.push({
					type: "thinking",
					key: `thinking-${thinkingIndex}`,
					content: thinking,
				})
				thinkingIndex++
			}
		}

		flushText()
		return renderBlocks
	}, [message.content])

	const isError = message.stopReason === "error"

	if (isError) {
		return (
			<div
				style={{
					padding: "8px 12px",
					margin: "8px 0",
					background: "var(--error-bg)",
					border: "1px solid var(--destructive)",
					color: "var(--destructive)",
					fontSize: 13,
					lineHeight: 1.5,
				}}
			>
				{message.errorMessage || text || "An error occurred"}
			</div>
		)
	}

	return (
		<div style={{ padding: "8px 0", lineHeight: 1.6 }}>
			{blocks.length > 0 && (
				<div data-component="markdown">
					{blocks.map((block, i) => {
						if (block.type === "thinking") {
							return (
								<ReasoningBlock
									key={block.key}
									content={block.content}
									streaming={!!message.isStreaming}
									onFileClick={onFileClick}
								/>
							)
						}
						const isLast = i === blocks.length - 1
						return (
							<MessageMarkdown
								key={block.key}
								content={block.content}
								streaming={isLast && !!message.isStreaming}
								onFileClick={onFileClick}
							/>
						)
					})}
				</div>
			)}
		</div>
	)
}
