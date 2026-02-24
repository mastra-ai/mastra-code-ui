import type { TokenUsage } from "../types/ipc"

interface StatusBarProps {
	modeId: string
	modelId: string
	tokenUsage: TokenUsage
	isAgentActive: boolean
	projectName?: string
	gitBranch?: string
	onOpenModelSelector: () => void
	onOpenSettings: () => void
}

const modeColors: Record<string, string> = {
	build: "var(--mode-build)",
	plan: "var(--mode-plan)",
	fast: "var(--mode-fast)",
}

function formatTokens(n: number): string {
	if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M"
	if (n >= 1_000) return (n / 1_000).toFixed(1) + "k"
	return String(n)
}

export function StatusBar({
	modeId,
	modelId,
	tokenUsage,
	isAgentActive,
	gitBranch,
	onOpenModelSelector,
	onOpenSettings,
}: StatusBarProps) {
	const modeColor = modeColors[modeId] ?? "var(--accent)"

	// Extract short model name
	const modelShort = modelId.includes("/")
		? modelId.split("/").pop()
		: modelId || "no model"

	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				gap: 12,
				padding: "4px 24px",
				height: 28,
				borderTop: "1px solid var(--border-muted)",
				background: "var(--bg-surface)",
				fontSize: 11,
				color: "var(--muted)",
				flexShrink: 0,
			}}
		>
			{/* Mode badge */}
			<span
				style={{
					background: modeColor + "22",
					color: modeColor,
					padding: "1px 8px",
					borderRadius: 3,
					fontWeight: 500,
					textTransform: "capitalize",
					border: `1px solid ${modeColor}44`,
				}}
			>
				{modeId}
			</span>

			{/* Model name (clickable) */}
			<button
				onClick={onOpenModelSelector}
				style={{
					background: "transparent",
					border: "none",
					color: "var(--muted)",
					cursor: "pointer",
					fontSize: 11,
					padding: "1px 4px",
					borderRadius: 3,
				}}
				title="Change model"
			>
				{modelShort}
			</button>

			{/* Git branch */}
			{gitBranch && (
				<span
					style={{
						display: "flex",
						alignItems: "center",
						gap: 3,
					}}
				>
					<span style={{ color: "var(--accent)", fontSize: 12 }}>
						&#x2387;
					</span>
					{gitBranch}
				</span>
			)}

			{/* Running indicator */}
			{isAgentActive && (
				<span
					style={{
						display: "flex",
						alignItems: "center",
						gap: 4,
						color: modeColor,
					}}
				>
					<span
						style={{
							width: 5,
							height: 5,
							borderRadius: "50%",
							background: modeColor,
							animation: "pulse 1.5s ease-in-out infinite",
						}}
					/>
					running
				</span>
			)}

			<div style={{ flex: 1 }} />

			{/* Token usage */}
			<span>{formatTokens(tokenUsage.totalTokens)} tokens</span>

			{/* Settings gear */}
			<button
				onClick={onOpenSettings}
				style={{
					background: "transparent",
					border: "none",
					color: "var(--muted)",
					cursor: "pointer",
					fontSize: 13,
					padding: "1px 2px",
					lineHeight: 1,
					display: "flex",
					alignItems: "center",
				}}
				title="Settings (Cmd+,)"
			>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
					<circle cx="12" cy="12" r="3" />
					<path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
				</svg>
			</button>
		</div>
	)
}
