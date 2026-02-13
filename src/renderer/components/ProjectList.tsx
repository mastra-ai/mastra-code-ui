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
	onSwitchProject: (path: string) => void
	onOpenFolder: () => void
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

export function ProjectList({
	projects,
	activeProjectPath,
	onSwitchProject,
	onOpenFolder,
}: ProjectListProps) {
	const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

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
			{/* Open Folder button */}
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
					Open Folder...
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
					<div key={root.rootPath} style={{ marginBottom: 4 }}>
						{/* Root project */}
						<button
							onClick={() => {
								if (hasWorktrees) toggleCollapse(root.rootPath)
								else onSwitchProject(root.rootPath)
							}}
							style={{
								display: "flex",
								alignItems: "center",
								width: "100%",
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

						{/* Worktrees (nested) */}
						{hasWorktrees &&
							isExpanded &&
							worktrees.map((wt, wtIndex) => {
								const wtColor = branchColors[wtIndex % branchColors.length]

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
											borderLeft: isActive(wt.rootPath)
												? `3px solid ${wtColor}`
												: "3px solid transparent",
											background: isActive(wt.rootPath)
												? "var(--selected-bg)"
												: "transparent",
											gap: 10,
										}}
									>
										<span
											style={{
												width: 10,
												height: 10,
												borderRadius: "50%",
												background: wtColor,
												flexShrink: 0,
											}}
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
					</div>
				)
			})}
		</div>
	)
}
