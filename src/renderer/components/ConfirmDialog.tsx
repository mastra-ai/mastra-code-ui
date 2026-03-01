interface ConfirmDialogProps {
	title: string
	description: string
	confirmLabel?: string
	confirmVariant?: "danger" | "primary"
	onConfirm: () => void
	onCancel: () => void
}

export function ConfirmDialog({
	title,
	description,
	confirmLabel = "Delete",
	confirmVariant = "danger",
	onConfirm,
	onCancel,
}: ConfirmDialogProps) {
	return (
		<div
			style={{
				position: "fixed",
				inset: 0,
				background: "rgba(0,0,0,0.5)",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				zIndex: 9999,
			}}
			onClick={onCancel}
		>
			<div
				onClick={(e) => e.stopPropagation()}
				style={{
					background: "var(--bg-surface)",
					border: "1px solid var(--border-muted)",
					borderRadius: 8,
					padding: "20px 24px",
					maxWidth: 320,
					width: "90%",
				}}
			>
				<div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>
					{title}
				</div>
				<div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 16 }}>
					{description}
				</div>
				<div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
					<button
						onClick={onCancel}
						style={{
							padding: "6px 14px",
							fontSize: 12,
							borderRadius: 4,
							background: "var(--bg)",
							color: "var(--text)",
							cursor: "pointer",
							border: "1px solid var(--border-muted)",
						}}
					>
						Cancel
					</button>
					<button
						onClick={onConfirm}
						style={{
							padding: "6px 14px",
							fontSize: 12,
							borderRadius: 4,
							background: confirmVariant === "danger" ? "var(--error)" : "var(--accent)",
							color: "#fff",
							cursor: "pointer",
							border: "none",
						}}
					>
						{confirmLabel}
					</button>
				</div>
			</div>
		</div>
	)
}
