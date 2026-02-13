import { useState, useEffect } from "react"

interface ProjectInfo {
	name: string
	rootPath: string
	gitBranch?: string
	isWorktree?: boolean
	lastOpened?: string
}

interface ProjectSwitcherProps {
	currentProject: ProjectInfo | null
	onClose: () => void
}

export function ProjectSwitcher({
	currentProject,
	onClose,
}: ProjectSwitcherProps) {
	const [recentProjects, setRecentProjects] = useState<ProjectInfo[]>([])

	useEffect(() => {
		async function load() {
			try {
				const result = (await window.api.invoke({
					type: "getRecentProjects",
				})) as ProjectInfo[]
				setRecentProjects(result || [])
			} catch {
				// ignore
			}
		}
		load()
	}, [])

	useEffect(() => {
		const handleKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose()
		}
		window.addEventListener("keydown", handleKey)
		return () => window.removeEventListener("keydown", handleKey)
	}, [onClose])

	async function handleOpenFolder() {
		try {
			const result = (await window.api.invoke({
				type: "openFolderDialog",
			})) as { path?: string; cancelled?: boolean }
			if (result?.path) {
				await window.api.invoke({
					type: "switchProject",
					path: result.path,
				})
				onClose()
			}
		} catch (err) {
			console.error("Failed to open folder:", err)
		}
	}

	async function handleSwitchProject(projectPath: string) {
		try {
			await window.api.invoke({
				type: "switchProject",
				path: projectPath,
			})
			onClose()
		} catch (err) {
			console.error("Failed to switch project:", err)
		}
	}

	return (
		<div
			style={{
				position: "fixed",
				inset: 0,
				background: "rgba(0, 0, 0, 0.6)",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				zIndex: 100,
			}}
		>
			<div
				style={{
					background: "var(--bg-elevated)",
					border: "1px solid var(--border)",
					borderRadius: 12,
					padding: 24,
					maxWidth: 500,
					width: "90%",
					maxHeight: "70vh",
					overflow: "hidden",
					display: "flex",
					flexDirection: "column",
				}}
			>
				<div
					style={{
						fontSize: 14,
						fontWeight: 600,
						marginBottom: 16,
						color: "var(--text)",
					}}
				>
					Open Project
				</div>

				{currentProject && (
					<div
						style={{
							padding: "8px 12px",
							background: "var(--bg-surface)",
							borderRadius: 6,
							marginBottom: 12,
							fontSize: 12,
						}}
					>
						<div style={{ color: "var(--text)", fontWeight: 500 }}>
							{currentProject.name}
						</div>
						<div
							style={{
								color: "var(--dim)",
								fontSize: 11,
								marginTop: 2,
							}}
						>
							{currentProject.rootPath}
							{currentProject.gitBranch &&
								` (${currentProject.gitBranch})`}
							{currentProject.isWorktree && " [worktree]"}
						</div>
					</div>
				)}

				<button
					onClick={handleOpenFolder}
					style={{
						width: "100%",
						padding: "10px 16px",
						background: "var(--accent)",
						color: "#fff",
						borderRadius: 6,
						fontSize: 12,
						fontWeight: 500,
						cursor: "pointer",
						marginBottom: 16,
					}}
				>
					Open Folder...
				</button>

				{recentProjects.length > 0 && (
					<>
						<div
							style={{
								fontSize: 10,
								fontWeight: 600,
								color: "var(--dim)",
								textTransform: "uppercase",
								letterSpacing: "0.5px",
								marginBottom: 8,
							}}
						>
							Recent Projects
						</div>
						<div
							style={{
								flex: 1,
								overflowY: "auto",
							}}
						>
							{recentProjects.map((project) => (
								<button
									key={project.rootPath}
									onClick={() =>
										handleSwitchProject(project.rootPath)
									}
									style={{
										display: "block",
										width: "100%",
										padding: "8px 12px",
										textAlign: "left",
										cursor: "pointer",
										borderRadius: 4,
										marginBottom: 2,
									}}
									onMouseEnter={(e) => {
										e.currentTarget.style.background =
											"var(--bg-surface)"
									}}
									onMouseLeave={(e) => {
										e.currentTarget.style.background =
											"transparent"
									}}
								>
									<div
										style={{
											fontSize: 12,
											color: "var(--text)",
										}}
									>
										{project.name}
									</div>
									<div
										style={{
											fontSize: 11,
											color: "var(--dim)",
											marginTop: 2,
										}}
									>
										{project.rootPath}
									</div>
								</button>
							))}
						</div>
					</>
				)}

				<div style={{ marginTop: 12, textAlign: "right" }}>
					<button
						onClick={onClose}
						style={{
							padding: "6px 16px",
							background: "var(--bg-surface)",
							color: "var(--muted)",
							borderRadius: 6,
							border: "1px solid var(--border)",
							cursor: "pointer",
							fontSize: 12,
						}}
					>
						Cancel
					</button>
				</div>
			</div>
		</div>
	)
}
