import { useState } from "react"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { Message, MessageContent } from "../types/ipc"

interface AssistantMessageProps {
	message: Message & { isStreaming?: boolean }
}

export function AssistantMessage({ message }: AssistantMessageProps) {
	const [showThinking, setShowThinking] = useState(false)

	const textParts = message.content?.filter(
		(c: MessageContent) => c.type === "text",
	)
	const thinkingParts = message.content?.filter(
		(c: MessageContent) => c.type === "thinking",
	)
	const text = textParts
		?.map((c: MessageContent) => (c as unknown as { text: string }).text)
		.join("")
	const thinking = thinkingParts
		?.map(
			(c: MessageContent) =>
				(c as unknown as { thinking: string }).thinking,
		)
		.join("")

	return (
		<div style={{ padding: "8px 0", lineHeight: 1.6 }}>
			{/* Thinking block with inline preview */}
			{thinking && (
				<div style={{ marginBottom: 6 }}>
					<button
						onClick={() => setShowThinking(!showThinking)}
						style={{
							display: "flex",
							alignItems: "center",
							gap: 8,
							padding: "3px 0",
							cursor: "pointer",
							fontSize: 13,
							background: "none",
							border: "none",
							color: "inherit",
							width: "100%",
							textAlign: "left",
						}}
					>
						<span style={{ fontSize: 14, flexShrink: 0, width: 20, textAlign: "center" }}>
							&#9881;
						</span>
						<span style={{ color: "var(--muted)", fontWeight: 500 }}>
							Thinking
						</span>
						{!showThinking && (
							<span
								style={{
									background: "var(--bg-surface)",
									padding: "1px 8px",
									borderRadius: 4,
									fontFamily: "var(--font-mono, 'SF Mono', Monaco, 'Cascadia Code', monospace)",
									fontSize: 12,
									color: "var(--thinking-text)",
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap",
									flex: 1,
									minWidth: 0,
								}}
							>
								{thinking.replace(/\n/g, " ").slice(0, 120)}
								{thinking.length > 120 ? "\u2026" : ""}
							</span>
						)}
					</button>
					{showThinking && (
						<div
							style={{
								marginTop: 4,
								paddingLeft: 28,
								color: "var(--thinking-text)",
								fontSize: 12,
								whiteSpace: "pre-wrap",
								lineHeight: 1.5,
							}}
						>
							{thinking}
						</div>
					)}
				</div>
			)}

			{/* Main text */}
			{text && (
				<div className="markdown-body">
					<Markdown remarkPlugins={[remarkGfm]}>{text}</Markdown>
					{message.isStreaming && (
						<span
							style={{
								display: "inline-block",
								width: 2,
								height: 14,
								background: "var(--accent)",
								marginLeft: 2,
								animation: "blink 1s step-end infinite",
							}}
						/>
					)}
					<style>{`
						@keyframes blink {
							0%, 100% { opacity: 1; }
							50% { opacity: 0; }
						}
						.markdown-body h1, .markdown-body h2, .markdown-body h3 {
							color: var(--text);
							margin: 16px 0 8px;
							font-weight: 600;
						}
						.markdown-body h1 { font-size: 18px; }
						.markdown-body h2 { font-size: 15px; }
						.markdown-body h3 { font-size: 14px; }
						.markdown-body p { margin: 6px 0; }
						.markdown-body ul, .markdown-body ol {
							padding-left: 20px;
							margin: 6px 0;
						}
						.markdown-body li { margin: 2px 0; }
						.markdown-body blockquote {
							border-left: 3px solid var(--border-muted);
							padding-left: 12px;
							color: var(--muted);
							margin: 8px 0;
						}
						.markdown-body table {
							border-collapse: collapse;
							margin: 8px 0;
						}
						.markdown-body th, .markdown-body td {
							border: 1px solid var(--border);
							padding: 6px 10px;
							font-size: 12px;
						}
						.markdown-body th {
							background: var(--bg-surface);
							font-weight: 600;
						}
						.markdown-body hr {
							border: none;
							border-top: 1px solid var(--border-muted);
							margin: 12px 0;
						}
						.markdown-body strong { font-weight: 600; }
					`}</style>
				</div>
			)}
		</div>
	)
}
