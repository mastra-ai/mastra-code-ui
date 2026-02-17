import { useState } from "react"

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

export function ProjectList({
	projects,
	activeProjectPath,
	isAgentActive,
	activeWorktrees,
	unreadWorktrees,
	onSwitchProject,
	onOpenFolder,
	onRemoveProject,
	onCreateWorktree,
}: ProjectListProps) {
	const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
	const [hoveredProject, setHoveredProject] = useState<string | null>(null)
	const [confirmRemovePath, setConfirmRemovePath] = useState<string | null>(null)

	// Group projects: root projects have worktrees nested underneath
	const groups: Array<{
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

		groups.push({
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

	function toggleCollapse(rootPath: string) {
		setCollapsed((prev) => {
			const next = new Set(prev)
			if (next.has(rootPath)) next.delete(rootPath)
			else next.add(rootPath)
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

			{/* Add Workspace button */}
			<div style={{ padding: "0 12px 12px" }}>
				<button
					onClick={onOpenFolder}
					style={{
						width: "100%",
						padding: "8px 12px",
						background: "transparent",
						color: "var(--muted)",
						borderRadius: 6,
						fontSize: 12,
						fontWeight: 500,
						cursor: "pointer",
						border: "1px solid var(--border)",
					}}
				>
					Add Workspace...
				</button>
			</div>

			{/* Project list */}
			{groups.length === 0 && (
				<div
					style={{
						padding: "16px",
						color: "var(--dim)",
						fontSize: 12,
						textAlign: "center",
					}}
				>
					No projects yet
				</div>
			)}

			{groups.map(({ root, worktrees }) => {
				const hasWorktrees = worktrees.length > 0
				const isExpanded = !collapsed.has(root.rootPath)
				const rootColor = "var(--accent)"

				return (
					<div
						key={root.rootPath}
						style={{ marginBottom: 4 }}
						onMouseEnter={() => setHoveredProject(root.rootPath)}
						onMouseLeave={() => setHoveredProject(null)}
					>
						{/* Root project */}
						<div style={{ display: "flex", alignItems: "center" }}>
							<button
								onClick={() => {
									if (hasWorktrees) toggleCollapse(root.rootPath)
									else onSwitchProject(root.rootPath)
								}}
								style={{
									display: "flex",
									alignItems: "center",
									flex: 1,
									minWidth: 0,
									padding: "12px 14px",
									textAlign: "left",
									cursor: "pointer",
									borderRadius: 0,
									borderLeft: isActive(root.rootPath)
										? `3px solid ${rootColor}`
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
											fontSize: 15,
											fontWeight: 700,
											color: "var(--text)",
											whiteSpace: "nowrap",
											overflow: "hidden",
											textOverflow: "ellipsis",
										}}
									>
										{root.name}
									</div>
									{root.gitBranch && (
										<div
											style={{
												fontSize: 12,
												color: rootColor,
												marginTop: 3,
												display: "flex",
												alignItems: "center",
												gap: 5,
											}}
										>
											<span style={{ fontSize: 13 }}>
												&#x2387;
											</span>
											{root.gitBranch}
										</div>
									)}
								</div>
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
									✕
								</button>
							)}
						</div>

						{/* Worktrees (nested) */}
						{hasWorktrees &&
							isExpanded &&
							worktrees.map((wt, wtIndex) => {
								const wtColor = branchColors[wtIndex % branchColors.length]
								const wtIsActive = isActive(wt.rootPath)
								const wtIsSpinning = activeWorktrees.has(wt.rootPath) || (wtIsActive && isAgentActive)
								const wtIsGlowing = unreadWorktrees.has(wt.rootPath)

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
											padding: "14px 14px 14px 28px",
											textAlign: "left",
											cursor: "pointer",
											borderRadius: 0,
											borderLeft: wtIsActive
												? `3px solid ${wtColor}`
												: "3px solid transparent",
											background: wtIsActive
												? "var(--selected-bg)"
												: "transparent",
											gap: 10,
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
											}}
										>
											{wt.gitBranch || wt.name}
										</span>
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
