export function FilterChip({ label, active, color, onClick }: {
	label: string
	active: boolean
	color?: string
	onClick: () => void
}) {
	return (
		<button
			onClick={onClick}
			style={{
				padding: "2px 7px",
				fontSize: 9,
				fontWeight: 600,
				borderRadius: 3,
				cursor: "pointer",
				border: "1px solid",
				borderColor: active ? (color || "var(--accent)") : "var(--border)",
				background: active ? `${color || "var(--accent)"}20` : "transparent",
				color: active ? (color || "var(--text)") : "var(--dim)",
				whiteSpace: "nowrap",
				transition: "all 0.12s ease",
				lineHeight: "16px",
			}}
		>
			{label}
		</button>
	)
}
