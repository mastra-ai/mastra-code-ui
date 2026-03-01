import type React from "react"

// Reusable setting row
export function SettingRow({
	label,
	description,
	children,
}: {
	label: string
	description?: string
	children: React.ReactNode
}) {
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				justifyContent: "space-between",
				padding: "12px 0",
				borderBottom: "1px solid var(--border-muted)",
				gap: 24,
			}}
		>
			<div style={{ flex: 1, minWidth: 0 }}>
				<div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>
					{label}
				</div>
				{description && (
					<div
						style={{
							fontSize: 11,
							color: "var(--muted)",
							marginTop: 2,
							lineHeight: 1.4,
						}}
					>
						{description}
					</div>
				)}
			</div>
			<div style={{ flexShrink: 0 }}>{children}</div>
		</div>
	)
}

// Toggle switch
export function Toggle({
	checked,
	onChange,
}: {
	checked: boolean
	onChange: (v: boolean) => void
}) {
	return (
		<button
			onClick={() => onChange(!checked)}
			style={{
				width: 36,
				height: 20,
				borderRadius: 10,
				background: checked ? "var(--accent)" : "var(--bg-elevated)",
				border: `1px solid ${checked ? "var(--accent)" : "var(--border)"}`,
				position: "relative",
				cursor: "pointer",
				transition: "background 0.15s, border-color 0.15s",
			}}
		>
			<span
				style={{
					position: "absolute",
					top: 2,
					left: checked ? 18 : 2,
					width: 14,
					height: 14,
					borderRadius: "50%",
					background: "#fff",
					transition: "left 0.15s",
				}}
			/>
		</button>
	)
}

// Select dropdown
export function Select({
	value,
	options,
	onChange,
}: {
	value: string
	options: Array<{ value: string; label: string }>
	onChange: (v: string) => void
}) {
	return (
		<select
			value={value}
			onChange={(e) => onChange(e.target.value)}
			style={{
				background: "var(--bg-elevated)",
				color: "var(--text)",
				border: "1px solid var(--border)",
				borderRadius: 4,
				padding: "4px 8px",
				fontSize: 12,
				cursor: "pointer",
				fontFamily: "inherit",
				minWidth: 120,
			}}
		>
			{options.map((o) => (
				<option key={o.value} value={o.value}>
					{o.label}
				</option>
			))}
		</select>
	)
}

// Section header
export function SectionHeader({ title }: { title: string }) {
	return (
		<div
			style={{
				fontSize: 10,
				fontWeight: 600,
				color: "var(--muted)",
				textTransform: "uppercase",
				letterSpacing: "0.5px",
				padding: "16px 0 4px",
			}}
		>
			{title}
		</div>
	)
}
