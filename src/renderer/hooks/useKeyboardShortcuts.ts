import { useEffect } from "react"
import type { EnrichedProject } from "../types/project-list"
import type { RightSidebarTab } from "../components/RightSidebar"
import type { ProjectInfo } from "../types/project"

interface UseKeyboardShortcutsArgs {
	activeTab: string
	enrichedProjects: EnrichedProject[]
	projectInfo: ProjectInfo | null
	setShowCommandPalette: React.Dispatch<React.SetStateAction<boolean>>
	setRightSidebarVisible: React.Dispatch<React.SetStateAction<boolean>>
	setSidebarVisible: React.Dispatch<React.SetStateAction<boolean>>
	setRightSidebarTab: React.Dispatch<React.SetStateAction<RightSidebarTab>>
	setActiveTab: React.Dispatch<React.SetStateAction<string>>
	setShowQuickFileOpen: React.Dispatch<React.SetStateAction<boolean>>
	handleOpenFolder: () => void
	handleCloseTab: (tabId: string) => void
	handleSwitchProject: (path: string) => void
}

export function useKeyboardShortcuts({
	activeTab,
	enrichedProjects,
	projectInfo,
	setShowCommandPalette,
	setRightSidebarVisible,
	setSidebarVisible,
	setRightSidebarTab,
	setActiveTab,
	setShowQuickFileOpen,
	handleOpenFolder,
	handleCloseTab,
	handleSwitchProject,
}: UseKeyboardShortcutsArgs) {
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			const isMod = e.metaKey || e.ctrlKey
			if (isMod && e.key === "k") {
				e.preventDefault()
				setShowCommandPalette((v) => !v)
				return
			}
			if (isMod && e.key === "`") {
				e.preventDefault()
				setRightSidebarVisible((v) => !v)
			}
			if (isMod && e.key === "b") {
				e.preventDefault()
				setSidebarVisible((v) => !v)
			}
			if (isMod && e.shiftKey && e.key === "E") {
				e.preventDefault()
				setRightSidebarVisible((v) => !v)
			}
			if (isMod && e.shiftKey && e.key === "G") {
				e.preventDefault()
				setRightSidebarVisible(true)
				setRightSidebarTab("git")
			}
			if (isMod && e.key === "o") {
				e.preventDefault()
				handleOpenFolder()
			}
			if (isMod && e.key === ",") {
				e.preventDefault()
				setActiveTab(activeTab === "settings" ? "chat" : "settings")
			}
			if (isMod && e.key === "w" && activeTab !== "chat") {
				e.preventDefault()
				handleCloseTab(activeTab)
			}
			if (isMod && e.key === "p") {
				e.preventDefault()
				setShowQuickFileOpen((v) => !v)
			}
			if (isMod && !e.shiftKey && !e.altKey && e.key >= "1" && e.key <= "9") {
				e.preventDefault()
				const index = parseInt(e.key) - 1
				if (index < enrichedProjects.length) {
					handleSwitchProject(enrichedProjects[index].rootPath)
				}
			}
			if (isMod && e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
				e.preventDefault()
				if (enrichedProjects.length > 1 && projectInfo?.rootPath) {
					const currentIdx = enrichedProjects.findIndex(
						(p) => p.rootPath === projectInfo.rootPath,
					)
					if (currentIdx !== -1) {
						const delta = e.key === "ArrowDown" ? 1 : -1
						const nextIdx =
							(currentIdx + delta + enrichedProjects.length) %
							enrichedProjects.length
						handleSwitchProject(enrichedProjects[nextIdx].rootPath)
					}
				}
			}
		}
		window.addEventListener("keydown", handleKeyDown)
		return () => window.removeEventListener("keydown", handleKeyDown)
	}, [activeTab, enrichedProjects, projectInfo])
}
