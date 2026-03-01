import { useState, useEffect, useRef } from "react"

const openTargets = [
	{
		id: "finder",
		label: "Finder",
		icon: (
			<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
				<rect x="2" y="2" width="12" height="12" rx="2" />
				<line x1="2" y1="6" x2="14" y2="6" />
				<line x1="6" y1="6" x2="6" y2="14" />
			</svg>
		),
	},
	{
		id: "cursor",
		label: "Cursor",
		icon: (
			<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
				<path d="M4 2 L4 14 L7.5 10.5 L11 14 L13 12 L9.5 8.5 L14 7 Z" />
			</svg>
		),
	},
	{
		id: "vscode",
		label: "VS Code",
		icon: (
			<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
				<path d="M11 1 L14 3 V13 L11 15 L2 9 L5 7 L11 11 V5 L5 9 L2 7 L11 1 Z" />
			</svg>
		),
	},
	{
		id: "terminal",
		label: "Terminal",
		icon: (
			<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
				<polyline points="4,5 7,8 4,11" />
				<line x1="9" y1="11" x2="12" y2="11" />
			</svg>
		),
	},
]

export function OpenInDropdown({ projectPath }: { projectPath: string | null }) {
	const [open, setOpen] = useState(false)
	const ref = useRef<HTMLDivElement>(null)

	useEffect(() => {
		if (!open) return
		const handler = (e: MouseEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node)) {
				setOpen(false)
			}
		}
		document.addEventListener("mousedown", handler)
		return () => document.removeEventListener("mousedown", handler)
	}, [open])

	if (!projectPath) return null

	return (
		<div ref={ref} className="titlebar-no-drag" style={{ position: "relative", display: "flex", alignItems: "center", height: "100%" }}>
			<button
				onClick={() => setOpen((v) => !v)}
				style={{
					display: "flex",
					alignItems: "center",
					gap: 4,
					padding: "2px 10px",
					fontSize: 11,
					fontWeight: 500,
					color: "var(--text)",
					cursor: "pointer",
					transition: "all 0.1s",
					borderRadius: 4,
					border: "1px solid var(--border)",
					background: "transparent",
				}}
				title="Open project in..."
			>
				Open in...
				<svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
					<path d="M2 3 L4 5 L6 3" />
				</svg>
			</button>
			{open && (
				<div
					style={{
						position: "absolute",
						top: "100%",
						right: 0,
						zIndex: 10,
						background: "var(--bg-elevated)",
						border: "1px solid var(--border)",
						borderRadius: 6,
						padding: 4,
						marginTop: 4,
						minWidth: 150,
						boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
					}}
				>
					<div style={{ padding: "4px 8px", fontSize: 10, color: "var(--dim)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.5px" }}>
						Open project in
					</div>
					{openTargets.map((target) => (
						<button
							key={target.id}
							onClick={() => {
								window.api.invoke({
									type: "openProjectIn",
									target: target.id,
									projectPath,
								})
								setOpen(false)
							}}
							style={{
								display: "flex",
								alignItems: "center",
								gap: 8,
								width: "100%",
								padding: "6px 8px",
								fontSize: 12,
								color: "var(--text)",
								cursor: "pointer",
								borderRadius: 4,
								background: "transparent",
								border: "none",
								textAlign: "left",
							}}
							onMouseEnter={(e) => {
								e.currentTarget.style.background = "var(--bg-hover)"
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.background = "transparent"
							}}
						>
							{target.icon}
							{target.label}
						</button>
					))}
				</div>
			)}
		</div>
	)
}
