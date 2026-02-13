import type { Message, MessageContent } from "../types/ipc"

interface UserMessageProps {
	message: Message
}

export function UserMessage({ message }: UserMessageProps) {
	const textParts = message.content?.filter(
		(c: MessageContent) => c.type === "text",
	)
	const text = textParts
		?.map((c: MessageContent) => (c as unknown as { text: string }).text)
		.join("")
	const images = message.content?.filter(
		(c: MessageContent) => c.type === "image",
	)

	return (
		<div
			style={{
				padding: "10px 14px",
				margin: "8px 0",
				background: "var(--user-message-bg)",
				borderRadius: 8,
				color: "var(--user-message-text)",
				fontSize: 13,
				whiteSpace: "pre-wrap",
				wordBreak: "break-word",
			}}
		>
			{text}
			{images && images.length > 0 && (
				<div style={{ marginTop: 8, display: "flex", gap: 8 }}>
					{images.map((img: MessageContent, i: number) => (
						<img
							key={i}
							src={`data:${(img as unknown as { mimeType: string }).mimeType};base64,${(img as unknown as { data: string }).data}`}
							style={{
								maxWidth: 300,
								maxHeight: 200,
								borderRadius: 6,
								border: "1px solid var(--border-muted)",
							}}
						/>
					))}
				</div>
			)}
		</div>
	)
}
