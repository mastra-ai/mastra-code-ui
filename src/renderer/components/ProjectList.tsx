import { useState, useMemo } from "react"
import type { WorktreeStatus } from "./Sidebar"

interface WorktreeInfo {
	path: string
	branch: string
}

export interface EnrichedProject {
	name: string
	rootPath: string
	lastOpened: string
	gitBranch?: string
	isWorktree?: boolean
	mainRepoPath?: string
	worktrees: WorktreeInfo[]
}

interface ProjectListProps {
	projects: EnrichedProject[]
	activeProjectPath: string | null
	isAgentActive: boolean
	activeWorktrees: Set<string>
	unreadWorktrees: Set<string>
	worktreeStatuses: Map<string, WorktreeStatus>
	linkedIssues?: Record<string, { issueId: string; issueIdentifier: string }>
	onSwitchProject: (path: string) => void
	onOpenFolder: () => void
	onRemoveProject: (path: string) => void
	onCreateWorktree: (repoPath: string) => void
}

// Stable color palette for worktree branches — visually distinct
const branchColors = [
	"#7c3aed", // purple
	"#2563eb", // blue
	"#059669", // green
	"#d97706", // amber
	"#dc2626", // red
	"#0891b2", // cyan
	"#c026d3", // fuchsia
	"#ea580c", // orange
	"#16a34a", // emerald
	"#e11d48", // rose
]

// Hash a string to a stable color index so the same branch always gets the same color
function hashColor(str: string): string {
	let hash = 0
	for (let i = 0; i < str.length; i++) {
		hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
	}
	return branchColors[Math.abs(hash) % branchColors.length]
}

const statusConfig: Record<WorktreeStatus, { label: string; color: string }> = {
	in_progress: { label: "In Progress", color: "#d97706" },
	in_review: { label: "In Review", color: "#2563eb" },
	done: { label: "Done", color: "#059669" },
	archived: { label: "Archived", color: "#6b7280" },
}

const statusOrder: WorktreeStatus[] = ["in_progress", "in_review", "done", "archived"]

function WorktreeIndicator({ color, isSpinning, isGlowing }: { color: string; isSpinning: boolean; isGlowing: boolean }) {
	if (isSpinning) {
		return (
			<span
				style={{
					width: 10,
					height: 10,
					flexShrink: 0,
					display: "inline-block",
					borderRadius: "50%",
					border: `2px solid transparent`,
					borderTopColor: color,
					borderRightColor: color,
					animation: "wt-spin 0.8s linear infinite",
				}}
			/>
		)
	}

	return (
		<span
			style={{
				width: 10,
				height: 10,
				borderRadius: "50%",
				background: color,
				flexShrink: 0,
				boxShadow: isGlowing ? `0 0 6px 2px ${color}, 0 0 12px 4px ${color}60` : "none",
			}}
		/>
	)
}

function StatusBadge({ status }: { status: WorktreeStatus }) {
	const config = statusConfig[status]
	return (
		<span
			style={{
				fontSize: 9,
				fontWeight: 600,
				color: config.color,
				background: `${config.color}18`,
				padding: "1px 5px",
				borderRadius: 3,
				whiteSpace: "nowrap",
				letterSpacing: "0.3px",
			}}
		>
			{config.label}
		</span>
	)
}

function FilterChip({ label, active, color, onClick }: {
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

export function ProjectList({
	projects,
	activeProjectPath,
	isAgentActive,
	activeWorktrees,
	unreadWorktrees,
	worktreeStatuses,
	linkedIssues,
	onSwitchProject,
	onOpenFolder,
	onRemoveProject,
	onCreateWorktree,
}: ProjectListProps) {
	const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
	const [hoveredProject, setHoveredProject] = useState<string | null>(null)
	const [confirmRemovePath, setConfirmRemovePath] = useState<string | null>(null)
	const [filterText, setFilterText] = useState("")
	const [groupByStatus, setGroupByStatus] = useState(false)
	const [collapsedStatuses, setCollapsedStatuses] = useState<Set<string>>(new Set())
	// Multi-select filters: null = all selected (default), Set = only these are selected
	const [selectedRepos, setSelectedRepos] = useState<Set<string> | null>(null)
	const [selectedStatuses, setSelectedStatuses] = useState<Set<WorktreeStatus> | null>(null)

	// Group projects: root projects have worktrees nested underneath
	const groups = useMemo(() => {
		const result: Array<{
			root: EnrichedProject
			worktrees: EnrichedProject[]
		}> = []
		const seen = new Set<string>()

		for (const p of projects) {
			const groupKey = p.mainRepoPath || p.rootPath
			if (seen.has(groupKey)) continue
			seen.add(groupKey)

			const root =
				projects.find(
					(q) => q.rootPath === groupKey && !q.isWorktree,
				) ||
				projects.find((q) => q.rootPath === groupKey) ||
				p
			const wts = p.worktrees || []

			result.push({
				root,
				worktrees: wts.map((wt) => ({
					name: wt.branch,
					rootPath: wt.path,
					lastOpened: "",
					gitBranch: wt.branch,
					isWorktree: true,
					mainRepoPath: groupKey,
					worktrees: [],
				})),
			})
		}
		return result
	}, [projects])

	// All repo names for filter chips
	const allRepoNames = useMemo(() => groups.map((g) => g.root.name), [groups])

	// All statuses that actually exist for filter chips
	const allActiveStatuses = useMemo(() => {
		const found = new Set<WorktreeStatus>()
		for (const g of groups) {
			for (const wt of g.worktrees) {
				found.add(worktreeStatuses.get(wt.rootPath) || "in_progress")
			}
		}
		return statusOrder.filter((s) => found.has(s))
	}, [groups, worktreeStatuses])

	// Apply text filter + repo multi-select filter
	const filteredGroups = useMemo(() => {
		let filtered = groups

		// Repo multi-select filter
		if (selectedRepos !== null) {
			filtered = filtered.filter((g) => selectedRepos.has(g.root.name))
		}

		// Text filter
		if (filterText.trim()) {
			const q = filterText.toLowerCase()
			filtered = filtered
				.map((g) => {
					const rootMatches = g.root.name.toLowerCase().includes(q)
					const matchedWorktrees = g.worktrees.filter(
						(wt) =>
							(wt.gitBranch || wt.name).toLowerCase().includes(q) ||
							g.root.name.toLowerCase().includes(q),
					)
					if (rootMatches) return g
					if (matchedWorktrees.length > 0) return { ...g, worktrees: matchedWorktrees }
					return null
				})
				.filter(Boolean) as typeof groups
		}

		return filtered
	}, [groups, filterText, selectedRepos])

	// Status-grouped view: flatten all worktrees, group by status
	const statusGroups = useMemo(() => {
		if (!groupByStatus) return null
		const q = filterText.toLowerCase()
		const grouped: Record<WorktreeStatus, Array<{ wt: EnrichedProject; repoName: string }>> = {
			in_progress: [],
			in_review: [],
			done: [],
			archived: [],
		}

		for (const g of groups) {
			// Repo filter (also applies in status mode)
			if (selectedRepos !== null && !selectedRepos.has(g.root.name)) continue

			for (const wt of g.worktrees) {
				// Text filter
				if (q && !(wt.gitBranch || wt.name).toLowerCase().includes(q) && !g.root.name.toLowerCase().includes(q)) {
					continue
				}
				const status = worktreeStatuses.get(wt.rootPath) || "in_progress"
				// Status multi-select filter
				if (selectedStatuses !== null && !selectedStatuses.has(status)) continue
				grouped[status].push({ wt, repoName: g.root.name })
			}
		}
		return grouped
	}, [groupByStatus, groups, worktreeStatuses, filterText, selectedRepos, selectedStatuses])

	function toggleCollapse(rootPath: string) {
		setCollapsed((prev) => {
			const next = new Set(prev)
			if (next.has(rootPath)) next.delete(rootPath)
			else next.add(rootPath)
			return next
		})
	}

	function toggleStatusCollapse(status: string) {
		setCollapsedStatuses((prev) => {
			const next = new Set(prev)
			if (next.has(status)) next.delete(status)
			else next.add(status)
			return next
		})
	}

	function toggleRepoFilter(repoName: string) {
		setSelectedRepos((prev) => {
			if (prev === null) {
				// First click: select only this one (deselect all others)
				return new Set([repoName])
			}
			const next = new Set(prev)
			if (next.has(repoName)) {
				next.delete(repoName)
				// If nothing selected, go back to "all"
				if (next.size === 0) return null
			} else {
				next.add(repoName)
				// If all are selected, go back to "all"
				if (next.size === allRepoNames.length) return null
			}
			return next
		})
	}

	function toggleStatusFilter(status: WorktreeStatus) {
		setSelectedStatuses((prev) => {
			if (prev === null) {
				return new Set([status])
			}
			const next = new Set(prev)
			if (next.has(status)) {
				next.delete(status)
				if (next.size === 0) return null
			} else {
				next.add(status)
				if (next.size === allActiveStatuses.length) return null
			}
			return next
		})
	}

	const isActive = (projectPath: string) => projectPath === activeProjectPath

	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				padding: "12px 0",
			}}
		>
			{/* CSS animations for spinner and glow */}
			<style>{`
				@keyframes wt-spin {
					to { transform: rotate(360deg); }
				}
			`}</style>

			{/* Filter + Group controls */}
			<div style={{ padding: "0 12px 8px", display: "flex", flexDirection: "column", gap: 6 }}>
				{/* Filter input */}
				<div style={{ position: "relative" }}>
					<svg
						width="13" height="13" viewBox="0 0 24 24"
						fill="none" stroke="var(--dim)" strokeWidth="2"
						strokeLinecap="round" strokeLinejoin="round"
						style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
					>
						<circle cx="11" cy="11" r="8" />
						<line x1="21" y1="21" x2="16.65" y2="16.65" />
					</svg>
					<input
						type="text"
						value={filterText}
						onChange={(e) => setFilterText(e.target.value)}
						placeholder="Filter..."
						style={{
							width: "100%",
							padding: "6px 8px 6px 28px",
							background: "var(--bg)",
							color: "var(--text)",
							border: "1px solid var(--border)",
							borderRadius: 5,
							fontSize: 11,
							outline: "none",
							boxSizing: "border-box",
						}}
						onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)" }}
						onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)" }}
					/>
					{filterText && (
						<button
							onClick={() => setFilterText("")}
							style={{
								position: "absolute",
								right: 4,
								top: "50%",
								transform: "translateY(-50%)",
								background: "transparent",
								border: "none",
								color: "var(--muted)",
								cursor: "pointer",
								fontSize: 12,
								padding: "2px 4px",
								lineHeight: 1,
							}}
						>
							&times;
						</button>
					)}
				</div>

				{/* Segmented control: Repo | Status + Add button */}
				<div style={{ display: "flex", gap: 6 }}>
					<div style={{
						flex: 1,
						display: "flex",
						borderRadius: 5,
						border: "1px solid var(--border)",
						overflow: "hidden",
					}}>
						<button
							onClick={() => setGroupByStatus(false)}
							style={{
								flex: 1,
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								gap: 4,
								padding: "4px 6px",
								background: !groupByStatus ? "var(--selected-bg)" : "transparent",
								color: !groupByStatus ? "var(--text)" : "var(--dim)",
								fontSize: 10,
								fontWeight: 600,
								cursor: "pointer",
								border: "none",
								borderRight: "1px solid var(--border)",
								transition: "all 0.15s ease",
							}}
						>
							<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
								<path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
							</svg>
							Repo
						</button>
						<button
							onClick={() => setGroupByStatus(true)}
							style={{
								flex: 1,
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								gap: 4,
								padding: "4px 6px",
								background: groupByStatus ? "var(--selected-bg)" : "transparent",
								color: groupByStatus ? "var(--text)" : "var(--dim)",
								fontSize: 10,
								fontWeight: 600,
								cursor: "pointer",
								border: "none",
								transition: "all 0.15s ease",
							}}
						>
							<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
								<line x1="4" y1="6" x2="20" y2="6" />
								<line x1="4" y1="12" x2="16" y2="12" />
								<line x1="4" y1="18" x2="12" y2="18" />
							</svg>
							Status
						</button>
					</div>
					<button
						onClick={onOpenFolder}
						title="Add Workspace"
						style={{
							padding: "5px 10px",
							background: "transparent",
							color: "var(--muted)",
							borderRadius: 5,
							fontSize: 14,
							cursor: "pointer",
							border: "1px solid var(--border)",
							lineHeight: 1,
						}}
					>
						+
					</button>
				</div>

				{/* Multi-select filter chips */}
				{!groupByStatus && allRepoNames.length > 1 && (
					<div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
						{allRepoNames.map((name) => (
							<FilterChip
								key={name}
								label={name}
								active={selectedRepos === null || selectedRepos.has(name)}
								onClick={() => toggleRepoFilter(name)}
							/>
						))}
					</div>
				)}
				{groupByStatus && allActiveStatuses.length > 1 && (
					<div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
						{allActiveStatuses.map((status) => (
							<FilterChip
								key={status}
								label={statusConfig[status].label}
								color={statusConfig[status].color}
								active={selectedStatuses === null || selectedStatuses.has(status)}
								onClick={() => toggleStatusFilter(status)}
							/>
						))}
					</div>
				)}
			</div>

			{/* Status-grouped view */}
			{groupByStatus && statusGroups && (
				<>
					{statusOrder.map((status) => {
						const items = statusGroups[status]
						if (items.length === 0) return null
						const config = statusConfig[status]
						const isStatusExpanded = !collapsedStatuses.has(status)

						return (
							<div key={status} style={{ marginBottom: 2 }}>
								{/* Status group header */}
								<button
									onClick={() => toggleStatusCollapse(status)}
									style={{
										display: "flex",
										alignItems: "center",
										gap: 6,
										width: "100%",
										padding: "6px 14px",
										background: "transparent",
										cursor: "pointer",
										borderRadius: 0,
										borderLeft: `3px solid ${config.color}`,
									}}
								>
									<span style={{
										fontSize: 8,
										color: config.color,
										display: "inline-block",
										transition: "transform 0.15s ease",
										transform: isStatusExpanded ? "rotate(0deg)" : "rotate(-90deg)",
									}}>
										&#9660;
									</span>
									<span style={{
										fontSize: 10,
										fontWeight: 700,
										color: config.color,
										textTransform: "uppercase",
										letterSpacing: "0.5px",
									}}>
										{config.label}
									</span>
									<span style={{
										fontSize: 10,
										color: "var(--dim)",
										marginLeft: "auto",
									}}>
										{items.length}
									</span>
								</button>

								{/* Worktree items in this status group */}
								{isStatusExpanded && items.map(({ wt, repoName }) => {
									const wtColor = hashColor(wt.gitBranch || wt.rootPath)
									const wtIsActive = isActive(wt.rootPath)
									const wtIsSpinning = activeWorktrees.has(wt.rootPath) || (wtIsActive && isAgentActive)
									const wtIsGlowing = unreadWorktrees.has(wt.rootPath)

									return (
										<button
											key={wt.rootPath}
											onClick={() => onSwitchProject(wt.rootPath)}
											style={{
												display: "flex",
												alignItems: "center",
												width: "100%",
												padding: "10px 14px 10px 28px",
												textAlign: "left",
												cursor: "pointer",
												borderRadius: 0,
												borderLeft: wtIsActive
													? `3px solid ${wtColor}`
													: "3px solid transparent",
												background: wtIsActive
													? "var(--selected-bg)"
													: "transparent",
												gap: 8,
											}}
										>
											<WorktreeIndicator
												color={wtColor}
												isSpinning={wtIsSpinning}
												isGlowing={wtIsGlowing}
											/>
											<div style={{ flex: 1, minWidth: 0 }}>
												<div
													style={{
														fontSize: 12,
														color: "var(--text)",
														whiteSpace: "nowrap",
														overflow: "hidden",
														textOverflow: "ellipsis",
														fontWeight: 500,
													}}
												>
													{wt.gitBranch || wt.name}
												</div>
												<div
													style={{
														fontSize: 10,
														color: "var(--dim)",
														marginTop: 1,
														display: "flex",
														alignItems: "center",
														gap: 6,
													}}
												>
													{repoName}
													{linkedIssues?.[wt.rootPath] && (
														<span
															style={{
																fontSize: 9,
																color: "#5E6AD2",
																background: "#5E6AD218",
																padding: "0px 4px",
																borderRadius: 2,
																fontFamily: "monospace",
																fontWeight: 500,
															}}
														>
															{linkedIssues[wt.rootPath].issueIdentifier}
														</span>
													)}
												</div>
											</div>
										</button>
									)
								})}
							</div>
						)
					})}

					{/* Show repos with no worktrees even in grouped view */}
					{filteredGroups.filter((g) => g.worktrees.length === 0).length > 0 && (
						<div style={{ marginTop: 4 }}>
							<div style={{
								padding: "6px 14px",
								fontSize: 10,
								fontWeight: 700,
								color: "var(--dim)",
								textTransform: "uppercase",
								letterSpacing: "0.5px",
								borderLeft: "3px solid var(--border-muted)",
							}}>
								Repos
							</div>
							{filteredGroups.filter((g) => g.worktrees.length === 0).map(({ root }) => (
								<button
									key={root.rootPath}
									onClick={() => onSwitchProject(root.rootPath)}
									style={{
										display: "flex",
										alignItems: "center",
										width: "100%",
										padding: "10px 14px 10px 28px",
										textAlign: "left",
										cursor: "pointer",
										borderRadius: 0,
										borderLeft: isActive(root.rootPath) ? "3px solid var(--accent)" : "3px solid transparent",
										background: isActive(root.rootPath) ? "var(--selected-bg)" : "transparent",
										gap: 8,
									}}
								>
									<span style={{
										fontSize: 13,
										fontWeight: 700,
										color: "var(--text)",
										whiteSpace: "nowrap",
										overflow: "hidden",
										textOverflow: "ellipsis",
									}}>
										{root.name}
									</span>
								</button>
							))}
						</div>
					)}
				</>
			)}

			{/* Default repo-grouped view */}
			{!groupByStatus && (
				<>
					{filteredGroups.length === 0 && (
						<div
							style={{
								padding: "16px",
								color: "var(--dim)",
								fontSize: 12,
								textAlign: "center",
							}}
						>
							{filterText || selectedRepos ? "No matches" : "No projects yet"}
						</div>
					)}

					{filteredGroups.map(({ root, worktrees }) => {
						const hasWorktrees = worktrees.length > 0
						const isExpanded = !collapsed.has(root.rootPath)

						return (
							<div
								key={root.rootPath}
								style={{ marginBottom: 4 }}
								onMouseEnter={() => setHoveredProject(root.rootPath)}
								onMouseLeave={() => setHoveredProject(null)}
							>
								{/* Root project (repo) */}
								<div style={{ display: "flex", alignItems: "center" }}>
									<button
										onClick={() => {
											if (hasWorktrees) {
												toggleCollapse(root.rootPath)
											} else {
												onSwitchProject(root.rootPath)
											}
										}}
										style={{
											display: "flex",
											alignItems: "center",
											flex: 1,
											minWidth: 0,
											padding: "10px 14px",
											textAlign: "left",
											cursor: "pointer",
											borderRadius: 0,
											borderLeft: isActive(root.rootPath)
												? "3px solid var(--accent)"
												: "3px solid transparent",
											background: isActive(root.rootPath)
												? "var(--selected-bg)"
												: "transparent",
											gap: 10,
										}}
									>
										{hasWorktrees && (
											<span
												style={{
													width: 14,
													fontSize: 9,
													color: "var(--muted)",
													flexShrink: 0,
												}}
											>
												{isExpanded ? "\u25BC" : "\u25B6"}
											</span>
										)}
										<div
											style={{
												flex: 1,
												overflow: "hidden",
											}}
										>
											<div
												style={{
													fontSize: 13,
													fontWeight: 700,
													color: "var(--text)",
													whiteSpace: "nowrap",
													overflow: "hidden",
													textOverflow: "ellipsis",
												}}
											>
												{root.name}
											</div>
										</div>
										{hasWorktrees && (
											<span style={{
												fontSize: 10,
												color: "var(--dim)",
												flexShrink: 0,
											}}>
												{worktrees.length}
											</span>
										)}
									</button>
									{hoveredProject === root.rootPath && (
										<button
											onClick={(e) => {
												e.stopPropagation()
												setConfirmRemovePath(root.rootPath)
											}}
											title="Remove workspace"
											style={{
												flexShrink: 0,
												padding: "4px 10px",
												fontSize: 14,
												color: "var(--muted)",
												background: "transparent",
												cursor: "pointer",
												lineHeight: 1,
												opacity: 0.6,
											}}
											onMouseEnter={(e) => { (e.target as HTMLElement).style.opacity = "1"; (e.target as HTMLElement).style.color = "var(--error)" }}
											onMouseLeave={(e) => { (e.target as HTMLElement).style.opacity = "0.6"; (e.target as HTMLElement).style.color = "var(--muted)" }}
										>
											&#x2715;
										</button>
									)}
								</div>

								{/* Worktrees (nested) */}
								{hasWorktrees &&
									isExpanded &&
									worktrees.map((wt) => {
										const wtColor = hashColor(wt.gitBranch || wt.rootPath)
										const wtIsActive = isActive(wt.rootPath)
										const wtIsSpinning = activeWorktrees.has(wt.rootPath) || (wtIsActive && isAgentActive)
										const wtIsGlowing = unreadWorktrees.has(wt.rootPath)
										const wtStatus = worktreeStatuses.get(wt.rootPath)

										return (
											<button
												key={wt.rootPath}
												onClick={() =>
													onSwitchProject(wt.rootPath)
												}
												style={{
													display: "flex",
													alignItems: "center",
													width: "100%",
													padding: "10px 14px 10px 28px",
													textAlign: "left",
													cursor: "pointer",
													borderRadius: 0,
													borderLeft: wtIsActive
														? `3px solid ${wtColor}`
														: "3px solid transparent",
													background: wtIsActive
														? "var(--selected-bg)"
														: "transparent",
													gap: 8,
												}}
											>
												<WorktreeIndicator
													color={wtColor}
													isSpinning={wtIsSpinning}
													isGlowing={wtIsGlowing}
												/>
												<span
													style={{
														fontSize: 12,
														color: "var(--text)",
														whiteSpace: "nowrap",
														overflow: "hidden",
														textOverflow: "ellipsis",
														fontWeight: 500,
														flex: 1,
														minWidth: 0,
													}}
												>
													{wt.gitBranch || wt.name}
												</span>
												{linkedIssues?.[wt.rootPath] && (
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
													{linkedIssues[wt.rootPath].issueIdentifier}
												</span>
											)}
											{wtStatus && <StatusBadge status={wtStatus} />}
											</button>
										)
									})}

								{/* Add worktree button — below worktrees */}
								{root.gitBranch && isExpanded && (
									<button
										onClick={() => onCreateWorktree(root.rootPath)}
										title="New worktree"
										style={{
											display: "flex",
											alignItems: "center",
											gap: 8,
											width: "100%",
											padding: "8px 14px 8px 28px",
											background: "transparent",
											cursor: "pointer",
											borderRadius: 0,
											borderLeft: "3px solid transparent",
											color: "var(--muted)",
											fontSize: 12,
										}}
										onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text)" }}
										onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--muted)" }}
									>
										<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
											<circle cx="12" cy="12" r="10" />
											<line x1="12" y1="8" x2="12" y2="16" />
											<line x1="8" y1="12" x2="16" y2="12" />
										</svg>
										<span>New worktree</span>
									</button>
								)}
							</div>
						)
					})}
				</>
			)}

			{/* Remove confirmation modal */}
			{confirmRemovePath && (
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
					onClick={() => setConfirmRemovePath(null)}
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
							Remove workspace?
						</div>
						<div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 16 }}>
							"{groups.find((g) => g.root.rootPath === confirmRemovePath)?.root.name || "Untitled"}" will be removed from the sidebar. Files on disk will not be deleted.
						</div>
						<div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
							<button
								onClick={() => setConfirmRemovePath(null)}
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
								onClick={() => {
									onRemoveProject(confirmRemovePath)
									setConfirmRemovePath(null)
								}}
								style={{
									padding: "6px 14px",
									fontSize: 12,
									borderRadius: 4,
									background: "var(--error)",
									color: "#fff",
									cursor: "pointer",
									border: "none",
								}}
							>
								Remove
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	)
}
