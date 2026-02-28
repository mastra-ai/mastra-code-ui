import { useState, useEffect, useCallback } from "react"

interface AgentData {
	worktreePath: string
	projectName: string
	gitBranch: string
	isActive: boolean
	currentTask: string | null
	linkedIssue: { id: string; identifier: string; provider: string } | null
	tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number }
	estimatedCost: number
	modelId: string | null
	startedAt: number | null
	totalDurationMs: number
	isCurrentSession: boolean
}

interface DashboardTotals {
	promptTokens: number
	completionTokens: number
	totalTokens: number
	estimatedCost: number
	activeCount: number
	totalCount: number
}

interface AgentDashboardProps {
	onClose: () => void
	onSwitchToAgent: (worktreePath: string) => void
}

// Stable color palette — same as ProjectList
const branchColors = [
	"#7c3aed", "#2563eb", "#059669", "#d97706", "#dc2626",
	"#0891b2", "#c026d3", "#ea580c", "#16a34a", "#e11d48",
]

function hashColor(str: string): string {
	let hash = 0
	for (let i = 0; i < str.length; i++) {
		hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
	}
	return branchColors[Math.abs(hash) % branchColors.length]
}

function formatTokens(n: number): string {
	if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M"
	if (n >= 1_000) return (n / 1_000).toFixed(1) + "k"
	return String(n)
}

function formatCost(n: number): string {
	if (n === 0) return "$0.00"
	if (n < 0.01) return "<$0.01"
	return "$" + n.toFixed(2)
}

function formatDuration(ms: number): string {
	const seconds = Math.floor(ms / 1000)
	if (seconds < 60) return `${seconds}s`
	const minutes = Math.floor(seconds / 60)
	if (minutes < 60) return `${minutes}m ${seconds % 60}s`
	const hours = Math.floor(minutes / 60)
	return `${hours}h ${minutes % 60}m`
}

function LiveDuration({ startedAt, baseDurationMs }: { startedAt: number | null; baseDurationMs: number }) {
	const [now, setNow] = useState(Date.now())

	useEffect(() => {
		if (!startedAt) return
		const interval = setInterval(() => setNow(Date.now()), 1000)
		return () => clearInterval(interval)
	}, [startedAt])

	const elapsed = baseDurationMs + (startedAt ? now - startedAt : 0)
	return <span>{formatDuration(elapsed)}</span>
}

function extractModelShort(modelId: string | null): string {
	if (!modelId) return "—"
	if (modelId.includes("/")) return modelId.split("/").pop() || modelId
	return modelId
}

export function AgentDashboard({ onClose, onSwitchToAgent }: AgentDashboardProps) {
	const [agents, setAgents] = useState<AgentData[]>([])
	const [totals, setTotals] = useState<DashboardTotals | null>(null)
	const [loading, setLoading] = useState(true)
	const [hoveredAgent, setHoveredAgent] = useState<string | null>(null)

	const loadData = useCallback(async () => {
		try {
			const result = (await window.api.invoke({ type: "getAgentDashboardData" })) as {
				agents: AgentData[]
				totals: DashboardTotals
			}
			if (result) {
				setAgents(result.agents)
				setTotals(result.totals)
			}
		} catch {
			/* ignore */
		}
		setLoading(false)
	}, [])

	useEffect(() => {
		loadData()
		const interval = setInterval(loadData, 3000)
		return () => clearInterval(interval)
	}, [loadData])

	// Sort: running agents first, then by branch name
	const sorted = [...agents].sort((a, b) => {
		if (a.isActive !== b.isActive) return a.isActive ? -1 : 1
		if (a.isCurrentSession !== b.isCurrentSession) return a.isCurrentSession ? -1 : 1
		return a.gitBranch.localeCompare(b.gitBranch)
	})

	return (
		<div
			style={{
				flex: 1,
				display: "flex",
				flexDirection: "column",
				overflow: "hidden",
				background: "var(--bg)",
			}}
		>
			{/* CSS for spinner */}
			<style>{`
				@keyframes dash-spin {
					to { transform: rotate(360deg); }
				}
			`}</style>

			{/* Header */}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					padding: "12px 20px",
					borderBottom: "1px solid var(--border-muted)",
					flexShrink: 0,
					gap: 12,
				}}
			>
				<button
					onClick={onClose}
					style={{
						background: "transparent",
						border: "none",
						color: "var(--muted)",
						cursor: "pointer",
						padding: "2px 4px",
						fontSize: 16,
						lineHeight: 1,
					}}
					title="Back"
				>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
						<polyline points="15 18 9 12 15 6" />
					</svg>
				</button>
				<span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>
					Agents
				</span>
				{totals && totals.activeCount > 0 && (
					<span
						style={{
							fontSize: 9,
							fontWeight: 600,
							color: "#d97706",
							background: "#d9770618",
							padding: "1px 6px",
							borderRadius: 3,
						}}
					>
						{totals.activeCount} running
					</span>
				)}
				<div style={{ flex: 1 }} />
				{totals && totals.estimatedCost > 0 && (
					<span style={{ fontSize: 12, color: "var(--muted)", fontFamily: "monospace" }}>
						{formatCost(totals.estimatedCost)} total
					</span>
				)}
			</div>

			{/* Summary bar */}
			{totals && totals.totalCount > 0 && (
				<div
					style={{
						display: "flex",
						gap: 20,
						padding: "12px 20px",
						borderBottom: "1px solid var(--border-muted)",
						flexShrink: 0,
					}}
				>
					<SummaryItem label="Sessions" value={String(totals.totalCount)} />
					<SummaryItem label="Active" value={String(totals.activeCount)} color={totals.activeCount > 0 ? "#d97706" : undefined} />
					<SummaryItem label="Input" value={formatTokens(totals.promptTokens)} />
					<SummaryItem label="Output" value={formatTokens(totals.completionTokens)} />
					<SummaryItem label="Total tokens" value={formatTokens(totals.totalTokens)} />
					<SummaryItem label="Est. cost" value={formatCost(totals.estimatedCost)} color="var(--accent)" />
				</div>
			)}

			{/* Agent list */}
			<div style={{ flex: 1, overflowY: "auto", padding: "12px 20px" }}>
				{loading && (
					<div style={{ color: "var(--muted)", fontSize: 12, padding: "40px 0", textAlign: "center" }}>
						Loading...
					</div>
				)}

				{!loading && sorted.length === 0 && (
					<div style={{ padding: "60px 0", textAlign: "center" }}>
						<div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 4 }}>
							No agent sessions
						</div>
						<div style={{ fontSize: 12, color: "var(--dim)" }}>
							Create a worktree and start an agent to see it here.
						</div>
					</div>
				)}

				<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
					{sorted.map((agent) => {
						const branchColor = hashColor(agent.gitBranch || agent.projectName)
						const modelShort = extractModelShort(agent.modelId)

						return (
							<button
								key={agent.worktreePath}
								onClick={() => onSwitchToAgent(agent.worktreePath)}
								onMouseEnter={() => setHoveredAgent(agent.worktreePath)}
								onMouseLeave={() => setHoveredAgent(null)}
								style={{
									display: "flex",
									flexDirection: "column",
									gap: 8,
									padding: "12px 16px",
									background: hoveredAgent === agent.worktreePath
										? "var(--bg-elevated)"
										: "var(--bg-surface)",
									border: agent.isCurrentSession
										? "1px solid var(--accent)"
										: "1px solid var(--border-muted)",
									borderRadius: 8,
									cursor: "pointer",
									textAlign: "left",
									transition: "background 0.1s",
								}}
							>
								{/* Row 1: Status + Branch + Issue + Model */}
								<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
									{/* Status indicator */}
									{agent.isActive ? (
										<span
											style={{
												width: 10,
												height: 10,
												flexShrink: 0,
												display: "inline-block",
												borderRadius: "50%",
												border: "2px solid transparent",
												borderTopColor: branchColor,
												borderRightColor: branchColor,
												animation: "dash-spin 0.8s linear infinite",
											}}
										/>
									) : (
										<span
											style={{
												width: 10,
												height: 10,
												borderRadius: "50%",
												background: branchColor,
												flexShrink: 0,
												opacity: 0.6,
											}}
										/>
									)}

									{/* Branch name */}
									<span
										style={{
											fontSize: 13,
											fontWeight: 600,
											color: "var(--text)",
											overflow: "hidden",
											textOverflow: "ellipsis",
											whiteSpace: "nowrap",
											flex: 1,
											minWidth: 0,
										}}
									>
										{agent.gitBranch || agent.projectName}
									</span>

									{/* Linked issue */}
									{agent.linkedIssue && (
										<span
											style={{
												fontSize: 9,
												color: "#5E6AD2",
												background: "#5E6AD218",
												padding: "1px 6px",
												borderRadius: 3,
												border: "1px solid #5E6AD233",
												fontFamily: "monospace",
												fontWeight: 500,
												flexShrink: 0,
											}}
										>
											{agent.linkedIssue.identifier}
										</span>
									)}

									{/* Status badge */}
									<span
										style={{
											fontSize: 9,
											fontWeight: 600,
											color: agent.isActive ? "#d97706" : "var(--muted)",
											background: agent.isActive ? "#d9770618" : "var(--muted)18",
											padding: "1px 5px",
											borderRadius: 3,
											flexShrink: 0,
										}}
									>
										{agent.isActive ? "Running" : "Idle"}
									</span>

									{/* Current badge */}
									{agent.isCurrentSession && (
										<span
											style={{
												fontSize: 9,
												fontWeight: 600,
												color: "var(--accent)",
												background: "var(--accent)18",
												padding: "1px 5px",
												borderRadius: 3,
												flexShrink: 0,
											}}
										>
											Current
										</span>
									)}
								</div>

								{/* Row 2: Task */}
								{agent.currentTask && (
									<div
										style={{
											fontSize: 12,
											color: "var(--muted)",
											overflow: "hidden",
											textOverflow: "ellipsis",
											whiteSpace: "nowrap",
											paddingLeft: 18,
										}}
									>
										{agent.currentTask}
									</div>
								)}

								{/* Row 3: Metrics */}
								<div
									style={{
										display: "flex",
										gap: 16,
										paddingLeft: 18,
										fontSize: 11,
										color: "var(--dim)",
									}}
								>
									{/* Model */}
									<span style={{ fontFamily: "monospace" }}>{modelShort}</span>

									{/* Duration */}
									{(agent.totalDurationMs > 0 || agent.startedAt) && (
										<span>
											<LiveDuration startedAt={agent.startedAt} baseDurationMs={agent.totalDurationMs} />
										</span>
									)}

									{/* Tokens */}
									{agent.tokenUsage.totalTokens > 0 && (
										<span style={{ fontFamily: "monospace" }}>
											{formatTokens(agent.tokenUsage.totalTokens)} tokens
										</span>
									)}

									{/* Cost */}
									{agent.estimatedCost > 0 && (
										<span style={{ fontFamily: "monospace", color: "var(--accent)" }}>
											{formatCost(agent.estimatedCost)}
										</span>
									)}
								</div>
							</button>
						)
					})}
				</div>
			</div>
		</div>
	)
}

function SummaryItem({ label, value, color }: { label: string; value: string; color?: string }) {
	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
			<span style={{ fontSize: 10, color: "var(--dim)", textTransform: "uppercase", letterSpacing: "0.3px" }}>
				{label}
			</span>
			<span style={{ fontSize: 14, fontWeight: 600, color: color ?? "var(--text)", fontFamily: "monospace" }}>
				{value}
			</span>
		</div>
	)
}
