import type { TokenUsage } from "../types/ipc"

interface StatusBarProps {
	modeId: string
	modelId: string
	tokenUsage: TokenUsage
	isAgentActive: boolean
	projectName?: string
	gitBranch?: string
	onOpenModelSelector: () => void
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

			</div>
	)
}
