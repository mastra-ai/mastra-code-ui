import { useState, useCallback, useRef, useEffect } from "react"
import type { FileEditorHandle } from "../components/FileEditor"

export function useTabManager(currentThreadId: string | null) {
	const [openFiles, setOpenFiles] = useState<string[]>([])
	const [openThreadTabs, setOpenThreadTabs] = useState<string[]>([])
	const [activeTab, setActiveTab] = useState<string>("chat")
	const [settingsSection, setSettingsSection] = useState<string | undefined>(
		undefined,
	)
	const [dirtyFiles, setDirtyFiles] = useState<Set<string>>(new Set())
	const [pendingCloseTab, setPendingCloseTab] = useState<string | null>(null)
	const fileEditorRef = useRef<FileEditorHandle>(null)

	// Sync harness thread when active tab changes to a thread tab
	useEffect(() => {
		if (activeTab.startsWith("thread:")) {
			const threadId = activeTab.slice(7)
			if (threadId !== currentThreadId) {
				window.api.invoke({ type: "switchThread", threadId })
			}
		}
	}, [activeTab])

	const handleDirtyChange = useCallback((filePath: string, dirty: boolean) => {
		setDirtyFiles((prev) => {
			if (dirty && !prev.has(filePath)) {
				const next = new Set(prev)
				next.add(filePath)
				return next
			}
			if (!dirty && prev.has(filePath)) {
				const next = new Set(prev)
				next.delete(filePath)
				return next
			}
			return prev
		})
	}, [])

	const handleFileClick = useCallback((filePath: string) => {
		setOpenFiles((prev) =>
			prev.includes(filePath) ? prev : [...prev, filePath],
		)
		setActiveTab(filePath)
	}, [])

	const forceCloseTab = useCallback((tabId: string) => {
		if (!tabId.startsWith("thread:")) {
			setDirtyFiles((prev) => {
				if (!prev.has(tabId)) return prev
				const next = new Set(prev)
				next.delete(tabId)
				return next
			})
		}
		if (tabId.startsWith("thread:")) {
			const threadId = tabId.slice(7)
			setOpenThreadTabs((prev) => {
				const next = prev.filter((id) => id !== threadId)
				setActiveTab((current) => {
					if (current !== tabId) return current
					if (next.length > 0) {
						const closedIdx = prev.indexOf(threadId)
						return `thread:${next[Math.min(closedIdx, next.length - 1)]}`
					}
					return "chat"
				})
				return next
			})
		} else {
			setOpenFiles((prev) => {
				const next = prev.filter((f) => f !== tabId)
				setActiveTab((current) => {
					if (current !== tabId) return current
					if (next.length > 0) {
						const closedIdx = prev.indexOf(tabId)
						return next[Math.min(closedIdx, next.length - 1)]
					}
					return "chat"
				})
				return next
			})
		}
	}, [])

	const handleCloseTab = useCallback(
		(tabId: string) => {
			// Check for unsaved changes in file editor tabs (not diff or thread tabs)
			if (
				!tabId.startsWith("thread:") &&
				!tabId.startsWith("diff:") &&
				dirtyFiles.has(tabId)
			) {
				setPendingCloseTab(tabId)
				return
			}
			forceCloseTab(tabId)
		},
		[dirtyFiles, forceCloseTab],
	)

	const handleDiffClick = useCallback((filePath: string) => {
		const tabId = "diff:" + filePath
		setOpenFiles((prev) => (prev.includes(tabId) ? prev : [...prev, tabId]))
		setActiveTab(tabId)
	}, [])

	const handleBrowserOpenRef = useRef<(url: string) => void>(() => {})
	const handleBrowserOpen = useCallback((url: string) => {
		const tabId = "browser:" + url
		setOpenFiles((prev) => {
			const existingBrowser = prev.find((f) => f.startsWith("browser:"))
			if (existingBrowser) {
				return prev.map((f) => (f === existingBrowser ? tabId : f))
			}
			return [...prev, tabId]
		})
		setActiveTab(tabId)
	}, [])
	handleBrowserOpenRef.current = handleBrowserOpen

	return {
		openFiles,
		setOpenFiles,
		openThreadTabs,
		setOpenThreadTabs,
		activeTab,
		setActiveTab,
		settingsSection,
		setSettingsSection,
		dirtyFiles,
		pendingCloseTab,
		setPendingCloseTab,
		fileEditorRef,
		handleDirtyChange,
		handleFileClick,
		forceCloseTab,
		handleCloseTab,
		handleDiffClick,
		handleBrowserOpen,
		handleBrowserOpenRef,
	}
}
