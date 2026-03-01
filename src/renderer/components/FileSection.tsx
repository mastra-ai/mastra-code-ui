import type { GitFile } from "../types/git"
import { statusLabel, statusColor } from "../utils/git"

export interface FileSectionProps {
	title: string
	files: GitFile[]
	sectionType: "staged" | "unstaged" | "untracked"
	activeFilePath?: string | null
	onFileClick?: (filePath: string) => void
	onStage: (files: string[]) => void
	onUnstage: (files: string[]) => void
	onStageAll: () => void
	onUnstageAll: () => void
}

export function FileSection({
	title,
	files,
	sectionType,
	activeFilePath,
	onFileClick,
	onStage,
	onUnstage,
	onStageAll,
	onUnstageAll,
}: FileSectionProps) {
	if (files.length === 0) return null

	return (
		<div style={{ marginBottom: 8 }}>
			<div
				style={{
					padding: "4px 12px",
					fontSize: 10,
					fontWeight: 600,
					color: "var(--dim)",
					textTransform: "uppercase",
					letterSpacing: "0.5px",
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
				}}
			>
				<span>
					{title} ({files.length})
				</span>
				{sectionType === "staged" && (
					<button
						onClick={onUnstageAll}
						style={{
							fontSize: 9,
							color: "var(--muted)",
							cursor: "pointer",
							background: "none",
							border: "none",
							textTransform: "none",
							letterSpacing: "normal",
							padding: "0 2px",
						}}
						title="Unstage all"
					>
						Unstage All
					</button>
				)}
				{(sectionType === "unstaged" || sectionType === "untracked") && (
					<button
						onClick={onStageAll}
						style={{
							fontSize: 9,
							color: "var(--muted)",
							cursor: "pointer",
							background: "none",
							border: "none",
							textTransform: "none",
							letterSpacing: "normal",
							padding: "0 2px",
						}}
						title="Stage all"
					>
						Stage All
					</button>
				)}
			</div>
			{files.map((file) => {
				const isActive = file.path === activeFilePath
				return (
					<button
						key={file.path + file.status}
						onClick={() => onFileClick?.(file.path)}
						style={{
							display: "flex",
							alignItems: "center",
							width: "100%",
							padding: "3px 12px",
							paddingLeft: isActive ? 10 : 12,
							fontSize: 12,
							textAlign: "left",
							cursor: "pointer",
							gap: 6,
							background: isActive
								? "var(--selected-bg)"
								: "transparent",
							border: "none",
							borderLeft: isActive
								? "2px solid var(--accent)"
								: "2px solid transparent",
						}}
					>
						<span
							style={{
								fontSize: 10,
								color: statusColor(file.status),
								fontWeight: 600,
								width: 14,
								flexShrink: 0,
							}}
						>
							{statusLabel(file.status).charAt(0).toUpperCase()}
						</span>
						<span
							style={{
								color: "var(--text)",
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap",
								flex: 1,
							}}
						>
							{file.path}
						</span>
						<span
							style={{
								fontSize: 10,
								color: statusColor(file.status),
								flexShrink: 0,
							}}
						>
							{statusLabel(file.status)}
						</span>
						<span
							onClick={(e) => {
								e.stopPropagation()
								if (sectionType === "staged") {
									onUnstage([file.path])
								} else {
									onStage([file.path])
								}
							}}
							style={{
								fontSize: 13,
								color:
									sectionType === "staged"
										? "var(--error)"
										: "var(--success)",
								cursor: "pointer",
								padding: "0 2px",
								fontWeight: 700,
								flexShrink: 0,
								lineHeight: 1,
							}}
							title={
								sectionType === "staged" ? "Unstage" : "Stage"
							}
						>
							{sectionType === "staged" ? "\u2212" : "+"}
						</span>
					</button>
				)
			})}
		</div>
	)
}
