import { useRef, useState, useCallback, useEffect } from "react"

interface EditorInputProps {
	onSend: (content: string) => void
	onAbort: () => void
	isAgentActive: boolean
	modeId: string
	modelId: string
	onOpenModelSelector: () => void
}

const modeColors: Record<string, string> = {
	build: "var(--mode-build)",
	plan: "var(--mode-plan)",
	fast: "var(--mode-fast)",
}

export function EditorInput({
	onSend,
	onAbort,
	isAgentActive,
	modeId,
	modelId,
	onOpenModelSelector,
}: EditorInputProps) {
	const textareaRef = useRef<HTMLTextAreaElement>(null)
	const [value, setValue] = useState("")

	useEffect(() => {
		textareaRef.current?.focus()
	}, [isAgentActive])

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault()
				if (isAgentActive) return
				const trimmed = value.trim()
				if (!trimmed) return
				onSend(trimmed)
				setValue("")
			}
			if (e.key === "Escape" && isAgentActive) {
				onAbort()
			}
		},
		[value, isAgentActive, onSend, onAbort],
	)

	const handleChange = useCallback(
		(e: React.ChangeEvent<HTMLTextAreaElement>) => {
			setValue(e.target.value)
			// Auto-resize
			const ta = e.target
			ta.style.height = "auto"
			ta.style.height = Math.min(ta.scrollHeight, 200) + "px"
		},
		[],
	)

	const borderColor = modeColors[modeId] ?? "var(--border)"

	// Extract short model name
	const modelShort = modelId.includes("/")
		? modelId.split("/").pop()
		: modelId || "no model"

	return (
		<div
			style={{
				padding: "8px 24px 12px",
				borderTop: "1px solid var(--border-muted)",
				flexShrink: 0,
			}}
		>
			<div
				style={{
					display: "flex",
					alignItems: "flex-end",
					gap: 8,
					background: "var(--bg-surface)",
					border: `1px solid ${borderColor}44`,
					borderRadius: 8,
					padding: "8px 12px",
					transition: "border-color 0.15s",
				}}
			>
				<textarea
					ref={textareaRef}
					value={value}
					onChange={handleChange}
					onKeyDown={handleKeyDown}
					placeholder={
						isAgentActive
							? "Agent is running... (Esc to abort)"
							: "Send a message... (Enter to send, Shift+Enter for newline)"
					}
					disabled={isAgentActive}
					rows={1}
					style={{
						flex: 1,
						background: "transparent",
						border: "none",
						outline: "none",
						color: "var(--text)",
						fontSize: 13,
						fontFamily: "inherit",
						lineHeight: 1.5,
						resize: "none",
						minHeight: 20,
						maxHeight: 200,
						opacity: isAgentActive ? 0.5 : 1,
					}}
				/>
				{isAgentActive ? (
					<button
						onClick={onAbort}
						style={{
							padding: "4px 12px",
							background: "var(--error)",
							color: "#fff",
							borderRadius: 4,
							fontSize: 11,
							fontWeight: 500,
							cursor: "pointer",
							flexShrink: 0,
						}}
					>
						Stop
					</button>
				) : (
					<button
						onClick={() => {
							const trimmed = value.trim()
							if (!trimmed) return
							onSend(trimmed)
							setValue("")
						}}
						style={{
							padding: "4px 12px",
							background: value.trim()
								? "var(--accent)"
								: "var(--bg-elevated)",
							color: value.trim() ? "#fff" : "var(--dim)",
							borderRadius: 4,
							fontSize: 11,
							fontWeight: 500,
							cursor: value.trim() ? "pointer" : "default",
							flexShrink: 0,
						}}
					>
						Send
					</button>
				)}
			</div>
			{/* Model selector below input */}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "flex-end",
					padding: "4px 4px 0",
				}}
			>
				<button
					onClick={onOpenModelSelector}
					style={{
						background: "transparent",
						border: "none",
						color: "var(--dim)",
						cursor: "pointer",
						fontSize: 11,
						padding: "2px 6px",
						borderRadius: 3,
						transition: "color 0.15s",
					}}
					onMouseEnter={(e) => {
						e.currentTarget.style.color = "var(--text)"
					}}
					onMouseLeave={(e) => {
						e.currentTarget.style.color = "var(--dim)"
					}}
					title="Change model"
				>
					{modelShort}
				</button>
			</div>
		</div>
	)
}
