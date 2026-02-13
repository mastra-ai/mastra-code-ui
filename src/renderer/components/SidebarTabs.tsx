export type SidebarTab = "threads" | "files" | "git"

interface SidebarTabsProps {
	activeTab: SidebarTab
	onTabChange: (tab: SidebarTab) => void
}

const tabs: Array<{ id: SidebarTab; label: string }> = [
	{ id: "threads", label: "Threads" },
	{ id: "files", label: "Files" },
	{ id: "git", label: "Git" },
]

export function SidebarTabs({ activeTab, onTabChange }: SidebarTabsProps) {
	return (
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
					className="titlebar-no-drag"
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
	)
}
