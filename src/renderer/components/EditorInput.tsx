import { useRef, useState, useCallback, useEffect } from "react"
import {
	useSlashAutocomplete,
	type SlashCommand,
} from "./SlashCommandAutocomplete"

interface EditorInputProps {
	onSend: (content: string) => void
	onAbort: () => void
	isAgentActive: boolean
	modeId: string
	onBuiltinCommand?: (name: string) => void
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
	onBuiltinCommand,
}: EditorInputProps) {
	const textareaRef = useRef<HTMLTextAreaElement>(null)
	const [value, setValue] = useState("")
	const [showSlashMenu, setShowSlashMenu] = useState(false)
	const [slashFilter, setSlashFilter] = useState("")
	const [activeCommand, setActiveCommand] = useState<SlashCommand | null>(null)

	useEffect(() => {
		textareaRef.current?.focus()
	}, [isAgentActive])

	const handleCommandSelect = useCallback(
		(command: SlashCommand) => {
			if (command.builtin && onBuiltinCommand) {
				onBuiltinCommand(command.name)
				setValue("")
				setActiveCommand(null)
				setShowSlashMenu(false)
				textareaRef.current?.focus()
			} else {
				setActiveCommand(command)
				setValue("")
				setShowSlashMenu(false)
				textareaRef.current?.focus()
			}
		},
		[onBuiltinCommand],
	)

	const handleSlashClose = useCallback(() => {
		setShowSlashMenu(false)
	}, [])

	const slash = useSlashAutocomplete(
		slashFilter,
		showSlashMenu,
		handleCommandSelect,
		handleSlashClose,
	)

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			// Delegate to slash autocomplete first when open
			if (showSlashMenu && slash.handleKeyDown(e)) {
				return
			}

			// Backspace at start of input removes the command chip
			if (e.key === "Backspace" && activeCommand && value === "") {
				e.preventDefault()
				setActiveCommand(null)
				return
			}

			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault()
				if (isAgentActive) return
				const trimmed = value.trim()
				if (!trimmed && !activeCommand) return
				const message = activeCommand
					? `/${activeCommand.name} ${trimmed}`.trim()
					: trimmed
				onSend(message)
				setValue("")
				setActiveCommand(null)
				setShowSlashMenu(false)
			}
			if (e.key === "Escape" && isAgentActive) {
				onAbort()
			}
		},
		[value, isAgentActive, onSend, onAbort, showSlashMenu, slash, activeCommand],
	)

	const handleChange = useCallback(
		(e: React.ChangeEvent<HTMLTextAreaElement>) => {
			const newVal = e.target.value
			setValue(newVal)

			// Detect slash commands (only when no command chip is active)
			if (!activeCommand && newVal.startsWith("/") && !newVal.includes("\n")) {
				setShowSlashMenu(true)
				setSlashFilter(newVal.slice(1).split(" ")[0])
			} else {
				setShowSlashMenu(false)
			}

			// Auto-resize
			const ta = e.target
			ta.style.height = "auto"
			ta.style.height = Math.min(ta.scrollHeight, 200) + "px"
		},
		[activeCommand],
	)

	const borderColor = modeColors[modeId] ?? "var(--border)"

	return (
		<div
			style={{
				padding: "8px 24px 12px",
				borderTop: "1px solid var(--border-muted)",
				flexShrink: 0,
			}}
		>
			<div style={{ position: "relative" }}>
				{slash.element}
				<div
					style={{
						display: "flex",
						alignItems: "flex-end",
						flexWrap: "wrap",
						gap: 6,
						background: "var(--bg-surface)",
						border: `1px solid ${borderColor}44`,
						borderRadius: 8,
						padding: "8px 12px",
						transition: "border-color 0.15s",
					}}
				>
					{activeCommand && (
						<span
							onClick={() => {
								setActiveCommand(null)
								textareaRef.current?.focus()
							}}
							style={{
								display: "inline-flex",
								alignItems: "center",
								gap: 4,
								padding: "2px 8px",
								background: "var(--accent)" + "22",
								color: "var(--accent)",
								borderRadius: 4,
								fontSize: 12,
								fontFamily: "var(--font-mono, monospace)",
								fontWeight: 500,
								flexShrink: 0,
								cursor: "pointer",
								lineHeight: 1.5,
							}}
						>
							/{activeCommand.name}
							<span style={{ fontSize: 10, opacity: 0.6 }}>&times;</span>
						</span>
					)}
					<textarea
						ref={textareaRef}
						value={value}
						onChange={handleChange}
						onKeyDown={handleKeyDown}
						placeholder={
							isAgentActive
								? "Agent is running... (Esc to abort)"
								: activeCommand
									? "Add a message..."
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
								if (!trimmed && !activeCommand) return
								const message = activeCommand
									? `/${activeCommand.name} ${trimmed}`.trim()
									: trimmed
								onSend(message)
								setValue("")
								setActiveCommand(null)
								setShowSlashMenu(false)
							}}
							style={{
								padding: "4px 12px",
								background: value.trim() || activeCommand
									? "var(--accent)"
									: "var(--bg-elevated)",
								color: value.trim() || activeCommand ? "#fff" : "var(--dim)",
								borderRadius: 4,
								fontSize: 11,
								fontWeight: 500,
								cursor: value.trim() || activeCommand ? "pointer" : "default",
								flexShrink: 0,
							}}
						>
							Send
						</button>
					)}
				</div>
			</div>
		</div>
	)
}
