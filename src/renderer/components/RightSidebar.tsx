import { FileTree } from "./FileTree"
import { GitPanel } from "./GitPanel"

export type RightSidebarTab = "files" | "git"

const tabs: Array<{ id: RightSidebarTab; label: string }> = [
	{ id: "files", label: "Files" },
	{ id: "git", label: "Git" },
]

interface RightSidebarProps {
	visible: boolean
	activeTab: RightSidebarTab
	onTabChange: (tab: RightSidebarTab) => void
	projectName: string
	onFileClick: (filePath: string) => void
	onDiffClick: (filePath: string) => void
}

export function RightSidebar({
	visible,
	activeTab,
	onTabChange,
	projectName,
	onFileClick,
	onDiffClick,
}: RightSidebarProps) {
	if (!visible) return null

	return (
		<div
			style={{
				width: 280,
				borderLeft: "1px solid var(--border-muted)",
				display: "flex",
				flexDirection: "column",
				background: "var(--bg-surface)",
				flexShrink: 0,
			}}
		>
			{/* Tab strip */}
			<div
				style={{
					display: "flex",
					borderBottom: "1px solid var(--border-muted)",
					flexShrink: 0,
				}}
			>
				{tabs.map((tab) => (
					<button
						key={tab.id}
						onClick={() => onTabChange(tab.id)}
						style={{
							flex: 1,
							padding: "6px 0",
							fontSize: 11,
							fontWeight: 500,
							color:
								activeTab === tab.id
									? "var(--text)"
									: "var(--muted)",
							borderBottom:
								activeTab === tab.id
									? "2px solid var(--accent)"
									: "2px solid transparent",
							cursor: "pointer",
							transition: "color 0.15s",
						}}
					>
						{tab.label}
					</button>
				))}
			</div>

			{/* Tab content */}
			{activeTab === "files" && (
				<FileTree projectName={projectName} onFileClick={onFileClick} />
			)}
			{activeTab === "git" && <GitPanel onFileClick={onDiffClick} />}
		</div>
	)
}
