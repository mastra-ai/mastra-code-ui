import { useEffect, useRef } from "react"

interface ToolApprovalDialogProps {
	toolCallId: string
	toolName: string
	args: unknown
	category?: string | null
	categoryLabel?: string | null
	onApprove: (toolCallId: string) => void
	onDecline: (toolCallId: string) => void
	onAlwaysAllow?: (toolCallId: string, category: string) => void
}

export function ToolApprovalDialog({
	toolCallId,
	toolName,
	args,
	category,
	categoryLabel,
	onApprove,
	onDecline,
	onAlwaysAllow,
}: ToolApprovalDialogProps) {
	const approveRef = useRef<HTMLButtonElement>(null)

	useEffect(() => {
		approveRef.current?.focus()

		const handleKey = (e: KeyboardEvent) => {
			if (e.key === "y" || e.key === "Enter") {
				onApprove(toolCallId)
			} else if (e.key === "n" || e.key === "Escape") {
				onDecline(toolCallId)
			} else if (e.key === "a" && category && onAlwaysAllow) {
				onAlwaysAllow(toolCallId, category)
			}
		}
		window.addEventListener("keydown", handleKey)
		return () => window.removeEventListener("keydown", handleKey)
	}, [toolCallId, onApprove, onDecline, onAlwaysAllow, category])

	const formattedArgs = (() => {
		try {
			return JSON.stringify(args, null, 2)
		} catch {
			return String(args)
		}
	})()

	return (
		<div
			style={{
				position: "fixed",
				inset: 0,
				background: "rgba(0, 0, 0, 0.6)",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				zIndex: 100,
			}}
		>
			<div
				style={{
					background: "var(--bg-elevated)",
					border: "1px solid var(--border)",
					borderRadius: 12,
					padding: 24,
					maxWidth: 500,
					width: "90%",
					maxHeight: "80vh",
					overflow: "auto",
				}}
			>
				<div
					style={{
						fontSize: 14,
						fontWeight: 600,
						marginBottom: 12,
						color: "var(--warning)",
					}}
				>
					Tool Approval Required
				</div>

				<div style={{ marginBottom: 12 }}>
					<span style={{ color: "var(--muted)", fontSize: 12 }}>Tool: </span>
					<span style={{ color: "var(--tool-title)", fontSize: 13 }}>
						{toolName.replace(/_/g, " ")}
					</span>
					{categoryLabel && (
						<span
							style={{
								marginLeft: 8,
								fontSize: 10,
								color: "var(--muted)",
								background: "var(--bg-surface)",
								padding: "1px 6px",
								borderRadius: 3,
								border: "1px solid var(--border-muted)",
							}}
						>
							{categoryLabel}
						</span>
					)}
				</div>

				<pre
					style={{
						background: "var(--bg)",
						padding: 10,
						borderRadius: 6,
						fontSize: 11,
						color: "var(--tool-output)",
						overflow: "auto",
						maxHeight: 200,
						marginBottom: 16,
						border: "1px solid var(--border-muted)",
					}}
				>
					{formattedArgs}
				</pre>

				<div
					style={{
						display: "flex",
						gap: 8,
						justifyContent: "flex-end",
						flexWrap: "wrap",
					}}
				>
					<button
						onClick={() => onDecline(toolCallId)}
						style={{
							padding: "6px 16px",
							background: "var(--bg-surface)",
							color: "var(--muted)",
							borderRadius: 6,
							border: "1px solid var(--border)",
							cursor: "pointer",
						}}
					>
						Decline (n)
					</button>
					{category && categoryLabel && onAlwaysAllow && (
						<button
							onClick={() => onAlwaysAllow(toolCallId, category)}
							style={{
								padding: "6px 16px",
								background: "var(--bg-surface)",
								color: "var(--accent)",
								borderRadius: 6,
								border: "1px solid var(--accent)",
								cursor: "pointer",
								fontSize: 12,
							}}
						>
							Always allow {categoryLabel.toLowerCase()} (a)
						</button>
					)}
					<button
						ref={approveRef}
						onClick={() => onApprove(toolCallId)}
						style={{
							padding: "6px 16px",
							background: "var(--success)",
							color: "#fff",
							borderRadius: 6,
							cursor: "pointer",
							fontWeight: 500,
						}}
					>
						Approve (y)
					</button>
				</div>
			</div>
		</div>
	)
}
