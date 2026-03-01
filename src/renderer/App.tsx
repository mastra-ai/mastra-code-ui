import { useState, useCallback, useMemo } from "react"
import { Sidebar } from "./components/Sidebar"
import { ChatView } from "./components/ChatView"
import { StatusBar } from "./components/StatusBar"
import { EditorInput } from "./components/EditorInput"
import { ToolApprovalDialog } from "./components/ToolApprovalDialog"
import { AskQuestionDialog } from "./components/AskQuestionDialog"
import { PlanApproval } from "./components/PlanApproval"
import { ModelSelector } from "./components/ModelSelector"
import { Settings } from "./components/Settings"
import { TaskBoard } from "./components/TaskBoard"
import { LoginDialog } from "./components/LoginDialog"
import { WelcomeScreen } from "./components/WelcomeScreen"
import { RightSidebar, type RightSidebarTab } from "./components/RightSidebar"
import { FileEditor } from "./components/FileEditor"
import { DiffEditor } from "./components/DiffEditor"
import { AgentDashboard } from "./components/AgentDashboard"
import { CommandPalette, type CommandItem } from "./components/CommandPalette"
import { QuickFileOpen } from "./components/QuickFileOpen"
import { BrowserView } from "./components/BrowserView"
import { OpenInDropdown } from "./components/OpenInDropdown"
import type {
	TokenUsage,
	ThreadInfo,
	OMProgressState,
	Message,
} from "./types/ipc"
import { ensureAudioContext } from "./utils/audio"
import { useChatReducer } from "./hooks/useChatReducer"
import { useAuthManager } from "./hooks/useAuthManager"
import { useDialogManager } from "./hooks/useDialogManager"
import { useTabManager } from "./hooks/useTabManager"
import { useProjectManager } from "./hooks/useProjectManager"
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts"
import { useHarnessEvents } from "./hooks/useHarnessEvents"

export function App() {
	// Core hooks
	const [chat, dispatch] = useChatReducer()
	const auth = useAuthManager()
	const dialogs = useDialogManager()

	// Remaining state that's cross-cutting
	const [modeId, setModeId] = useState("build")
	const [thinkingLevel, setThinkingLevel] = useState("off")
	const [modelId, setModelId] = useState("")
	const [tokenUsage, setTokenUsage] = useState<TokenUsage>({
		promptTokens: 0,
		completionTokens: 0,
		totalTokens: 0,
	})
	const [omProgress, setOMProgress] = useState<OMProgressState | null>(null)
	const [omModelIds, setOMModelIds] = useState<{ observer: string; reflector: string }>({
		observer: "google/gemini-2.5-flash",
		reflector: "google/gemini-2.5-flash",
	})
	const [threads, setThreads] = useState<ThreadInfo[]>([])
	const [currentThreadId, setCurrentThreadId] = useState<string | null>(null)
	const [tasks, setTasks] = useState<
		Array<{
			content: string
			status: "pending" | "in_progress" | "completed"
			activeForm: string
		}>
	>([])

	// Sidebar state
	const [sidebarVisible, setSidebarVisible] = useState(true)
	const [rightSidebarVisible, setRightSidebarVisible] = useState(true)
	const [rightSidebarTab, setRightSidebarTab] = useState<RightSidebarTab>("files")

	// Tab manager
	const tabs = useTabManager(currentThreadId)

	// Project manager
	const project = useProjectManager(dispatch, {
		setOpenThreadTabs: tabs.setOpenThreadTabs,
		setOpenFiles: tabs.setOpenFiles,
		setActiveTab: tabs.setActiveTab,
		setThreads,
		setTokenUsage,
	})

	// Keyboard shortcuts
	useKeyboardShortcuts({
		activeTab: tabs.activeTab,
		enrichedProjects: project.enrichedProjects,
		projectInfo: project.projectInfo,
		setShowCommandPalette: dialogs.setShowCommandPalette,
		setRightSidebarVisible,
		setSidebarVisible,
		setRightSidebarTab,
		setActiveTab: tabs.setActiveTab,
		setShowQuickFileOpen: dialogs.setShowQuickFileOpen,
		handleOpenFolder: project.handleOpenFolder,
		handleCloseTab: tabs.handleCloseTab,
		handleSwitchProject: project.handleSwitchProject,
	})

	// Initialize app & subscribe to harness events
	async function initializeApp() {
		try {
			const session = (await window.api.invoke({
				type: "getSession",
			})) as {
				currentThreadId: string | null
				currentModeId: string
				threads: ThreadInfo[]
			}
			if (session) {
				setModeId(session.currentModeId)
				setCurrentThreadId(session.currentThreadId)
				setThreads(session.threads)
				if (session.currentThreadId) {
					tabs.setOpenThreadTabs([session.currentThreadId])
					tabs.setActiveTab(`thread:${session.currentThreadId}`)
				}
			}

			const state = (await window.api.invoke({ type: "getState" })) as {
				currentModelId?: string
				notifications?: string
				observerModelId?: string
				reflectorModelId?: string
				thinkingLevel?: string
				tasks?: Array<{
					content: string
					status: "pending" | "in_progress" | "completed"
					activeForm: string
				}>
			}
			if (state?.currentModelId) setModelId(state.currentModelId)
			if (state?.thinkingLevel) setThinkingLevel(state.thinkingLevel)
			if (state?.tasks) setTasks(state.tasks)
			if (state?.notifications) project.notificationPrefRef.current = state.notifications
			if (state?.observerModelId || state?.reflectorModelId) {
				setOMModelIds({
					observer: state.observerModelId ?? "google/gemini-2.5-flash",
					reflector: state.reflectorModelId ?? "google/gemini-2.5-flash",
				})
			}

			const usage = (await window.api.invoke({
				type: "getTokenUsage",
			})) as TokenUsage
			if (usage) setTokenUsage(usage)

			window.api.invoke({ type: "getOMProgress" }).then((progress) => {
				setOMProgress((progress as OMProgressState) ?? null)
			}).catch(() => {})

			const loggedIn = (await window.api.invoke({
				type: "getLoggedInProviders",
			})) as string[]
			console.log("[AUTH] getLoggedInProviders result:", loggedIn)
			console.log("[AUTH] state?.currentModelId:", state?.currentModelId)
			if (loggedIn?.length > 0) {
				auth.setLoggedInProviders(new Set(loggedIn))
			}
			const authenticated = loggedIn && loggedIn.length > 0

			try {
				const proj = (await window.api.invoke({
					type: "getProjectInfo",
				})) as { name: string; rootPath: string; gitBranch?: string; isWorktree?: boolean }
				if (proj) project.setProjectInfo(proj)
			} catch {
				// ignore
			}

			await project.loadEnrichedProjects()
			auth.setIsAuthenticated(authenticated)
			await loadMessages()
			project.loadPRStatus()
		} catch (err) {
			console.error("Failed to initialize:", err)
		}
	}

	async function loadMessages() {
		try {
			const msgs = (await window.api.invoke({
				type: "getMessages",
			})) as Message[]
			if (msgs) dispatch({ type: "SET_MESSAGES", messages: msgs })
		} catch {
			// Thread may not exist yet
		}
	}

	async function loadThreads(): Promise<ThreadInfo[] | undefined> {
		try {
			const list = (await window.api.invoke({
				type: "listThreads",
			})) as ThreadInfo[]
			if (list) setThreads(list)
			return list
		} catch {
			return undefined
		}
	}

	const handleNewThread = useCallback(async () => {
		const thread = (await window.api.invoke({ type: "createThread" })) as { id: string } | undefined
		dispatch({ type: "CLEAR" })
		if (thread?.id) {
			tabs.setOpenThreadTabs((prev) =>
				prev.includes(thread.id) ? prev : [...prev, thread.id],
			)
			tabs.setActiveTab(`thread:${thread.id}`)
		}
	}, [])

	// Harness events
	useHarnessEvents({
		dispatch,
		setModeId,
		setModelId,
		setCurrentThreadId,
		setTokenUsage,
		setOMProgress,
		setOMModelIds,
		setThreads,
		setOpenThreadTabs: tabs.setOpenThreadTabs,
		setActiveTab: tabs.setActiveTab,
		setTasks,
		setPendingApproval: dialogs.setPendingApproval,
		setPendingQuestion: dialogs.setPendingQuestion,
		setPendingPlan: dialogs.setPendingPlan,
		setLoginState: auth.setLoginState,
		setIsAuthenticated: auth.setIsAuthenticated,
		setLoggedInProviders: auth.setLoggedInProviders,
		setProjectInfo: project.setProjectInfo,
		setProjectSwitching: project.setProjectSwitching,
		setOpenFiles: tabs.setOpenFiles,
		setUnreadWorktrees: project.setUnreadWorktrees,
		setActiveWorktrees: project.setActiveWorktrees,
		setSidebarVisible,
		setRightSidebarVisible,
		setRightSidebarTab,
		projectInfoRef: project.projectInfoRef,
		notificationPrefRef: project.notificationPrefRef,
		loadMessages,
		loadThreads,
		loadPRStatus: project.loadPRStatus,
		loadEnrichedProjects: project.loadEnrichedProjects,
		handleNewThread,
		handleOpenFolder: project.handleOpenFolder,
		handleBrowserOpenRef: tabs.handleBrowserOpenRef,
		initializeApp,
		setShowCommandPalette: dialogs.setShowCommandPalette,
	})

	// Chat handlers
	const handleSend = useCallback(async (content: string) => {
		ensureAudioContext()
		let finalContent = content
		if (content.startsWith("/")) {
			const spaceIndex = content.indexOf(" ")
			const commandName = spaceIndex === -1 ? content.slice(1) : content.slice(1, spaceIndex)
			const args = spaceIndex === -1 ? [] : content.slice(spaceIndex + 1).trim().split(/\s+/)
			try {
				finalContent = (await window.api.invoke({
					type: "processSlashCommand",
					commandName,
					args,
				})) as string
			} catch {
				// Command not found — send as-is
			}
		}
		dispatch({
			type: "MESSAGE_START",
			message: {
				id: `user-${Date.now()}`,
				role: "user",
				content: [{ type: "text", text: finalContent }],
				createdAt: new Date().toISOString(),
			},
		})
		await window.api.invoke({ type: "sendMessage", content: finalContent })
	}, [])

	const handleAbort = useCallback(async () => {
		ensureAudioContext()
		await window.api.invoke({ type: "abort" })
	}, [])

	const handleSwitchThread = useCallback(async (threadId: string) => {
		await window.api.invoke({ type: "switchThread", threadId })
		tabs.setOpenThreadTabs((prev) =>
			prev.includes(threadId) ? prev : [...prev, threadId],
		)
		tabs.setActiveTab(`thread:${threadId}`)
	}, [])

	const handleDeleteThread = useCallback(async (threadId: string) => {
		await window.api.invoke({ type: "deleteThread", threadId })
		tabs.setOpenThreadTabs((prev) => prev.filter((id) => id !== threadId))
		if (tabs.activeTab === `thread:${threadId}`) {
			tabs.setActiveTab("chat")
		}
		if (currentThreadId === threadId) {
			setCurrentThreadId(null)
			dispatch({ type: "CLEAR" })
		}
		loadThreads()
	}, [currentThreadId, tabs.activeTab])

	const handleToggleThinking = useCallback(async () => {
		const newLevel = thinkingLevel === "off" ? "medium" : "off"
		setThinkingLevel(newLevel)
		await window.api.invoke({ type: "setThinkingLevel", level: newLevel })
	}, [thinkingLevel])

	const handleTogglePlanning = useCallback(async () => {
		const newMode = modeId === "plan" ? "build" : "plan"
		await window.api.invoke({ type: "switchMode", modeId: newMode })
	}, [modeId])

	const handleBuiltinCommand = useCallback(
		async (name: string) => {
			switch (name) {
				case "new":
					handleNewThread()
					break
				case "clear":
					dispatch({ type: "CLEAR" })
					break
				case "plan":
					await window.api.invoke({ type: "switchMode", modeId: "plan" })
					break
				case "build":
					await window.api.invoke({ type: "switchMode", modeId: "build" })
					break
				case "fast":
					await window.api.invoke({ type: "switchMode", modeId: "fast" })
					break
				case "model":
					dialogs.setShowModelSelector(true)
					break
				case "thinking":
					handleToggleThinking()
					break
				case "settings":
					tabs.setActiveTab("settings")
					break
				case "help":
					dialogs.setShowCommandPalette(true)
					break
			}
		},
		[handleNewThread, handleToggleThinking],
	)

	// Command palette items
	const commandPaletteItems = useMemo((): CommandItem[] => {
		const close = () => dialogs.setShowCommandPalette(false)
		const items: CommandItem[] = []

		items.push({ id: "settings", label: "Open Settings", group: "Navigation", shortcut: "\u2318,", action: () => { tabs.setActiveTab("settings"); close() } })
		items.push({ id: "tasks", label: "Open Task Board", group: "Navigation", action: () => { tabs.setActiveTab("tasks"); close() } })
		items.push({ id: "agents", label: "Open Agent Dashboard", group: "Navigation", action: () => { tabs.setActiveTab("agents"); close() } })
		items.push({ id: "focus-git", label: "Focus Git Panel", group: "Navigation", shortcut: "\u2318\u21e7G", action: () => { setRightSidebarVisible(true); setRightSidebarTab("git"); close() } })
		items.push({ id: "focus-files", label: "Focus File Tree", group: "Navigation", action: () => { setRightSidebarVisible(true); setRightSidebarTab("files"); close() } })
		items.push({ id: "focus-context", label: "Focus Context Panel", group: "Navigation", action: () => { setRightSidebarVisible(true); setRightSidebarTab("context"); close() } })

		items.push({ id: "search-files", label: "Search Files", group: "Actions", shortcut: "\u2318P", action: () => { dialogs.setShowQuickFileOpen(true); close() } })
		items.push({ id: "new-thread", label: "New Thread", group: "Actions", action: () => { handleNewThread(); close() } })
		items.push({ id: "switch-model", label: "Switch Model", group: "Actions", action: () => { dialogs.setShowModelSelector(true); close() } })
		items.push({ id: "open-folder", label: "Open Folder", group: "Actions", shortcut: "\u2318O", action: () => { project.handleOpenFolder(); close() } })
		items.push({ id: "clone-repo", label: "Clone from URL", group: "Actions", action: () => { project.handleShowCloneModal(); close() } })
		items.push({ id: "toggle-left-sidebar", label: "Toggle Left Sidebar", group: "Actions", shortcut: "\u2318B", action: () => { setSidebarVisible((v) => !v); close() } })
		items.push({ id: "toggle-right-sidebar", label: "Toggle Right Sidebar", group: "Actions", shortcut: "\u2318`", action: () => { setRightSidebarVisible((v) => !v); close() } })
		items.push({ id: "open-browser", label: "Open Browser", group: "Actions", action: () => { tabs.handleBrowserOpen("about:blank"); close() } })
		items.push({ id: "toggle-thinking", label: thinkingLevel === "off" ? "Enable Thinking" : "Disable Thinking", group: "Actions", action: () => { handleToggleThinking(); close() } })
		items.push({ id: "toggle-planning", label: modeId === "plan" ? "Switch to Build Mode" : "Switch to Plan Mode", group: "Actions", action: () => { handleTogglePlanning(); close() } })

		for (const threadId of tabs.openThreadTabs) {
			const thread = threads.find((t) => t.id === threadId)
			items.push({
				id: `tab-thread-${threadId}`,
				label: thread?.title || "New Thread",
				group: "Open Tabs",
				action: () => { tabs.setActiveTab(`thread:${threadId}`); close() },
			})
		}
		for (const fileTab of tabs.openFiles) {
			const name = fileTab.split("/").pop() || fileTab
			items.push({
				id: `tab-file-${fileTab}`,
				label: name,
				description: fileTab,
				group: "Open Tabs",
				action: () => { tabs.setActiveTab(fileTab); close() },
			})
		}

		for (const p of project.enrichedProjects) {
			items.push({
				id: `project-${p.rootPath}`,
				label: p.name,
				description: p.gitBranch || "",
				group: "Workspaces",
				action: () => { project.handleSwitchProject(p.rootPath); close() },
			})
		}

		return items
	}, [tabs.openThreadTabs, tabs.openFiles, threads, project.enrichedProjects, modeId, thinkingLevel])

	return (
		<div
			style={{
				display: "flex",
				height: "100vh",
				overflow: "hidden",
			}}
		>
			{/* Left sidebar */}
			<Sidebar
				threads={threads}
				currentThreadId={currentThreadId}
				loggedInProviders={auth.loggedInProviders}
				projectName={project.projectInfo?.name ?? ""}
				sidebarVisible={sidebarVisible}
				enrichedProjects={project.enrichedProjects}
				activeProjectPath={project.projectInfo?.rootPath ?? null}
				isAgentActive={chat.isAgentActive}
				activeWorktrees={project.activeWorktrees}
				unreadWorktrees={project.unreadWorktrees}
				worktreeStatuses={project.worktreeStatuses}
				linkedIssues={project.linkedIssues}
				onSwitchThread={handleSwitchThread}
				onNewThread={handleNewThread}
				onDeleteThread={handleDeleteThread}
				onLogin={auth.handleLogin}
				onSwitchProject={project.handleSwitchProject}
				onOpenFolder={project.handleOpenFolder}
				onCloneRepo={project.handleShowCloneModal}
				onRemoveProject={project.handleRemoveProject}
				onCreateWorktree={project.handleCreateWorktree}
				onDeleteWorktree={project.handleDeleteWorktree}
				onOpenSettings={() => tabs.setActiveTab("settings")}
				onOpenAccounts={() => {
					tabs.setActiveTab("settings")
					tabs.setSettingsSection("accounts")
				}}
				onOpenTasks={() => tabs.setActiveTab("tasks")}
				onOpenAgents={() => tabs.setActiveTab("agents")}
				isSettingsActive={tabs.activeTab === "settings"}
				isTasksActive={tabs.activeTab === "tasks"}
				isAgentsActive={tabs.activeTab === "agents"}
				activeAgentCount={project.activeWorktrees.size}
			/>

			{/* Center panel */}
			<div
				style={{
					flex: 1,
					display: "flex",
					flexDirection: "column",
					overflow: "hidden",
					minWidth: 0,
				}}
			>
				{/* Tab bar */}
				<div
					className="titlebar-drag"
					style={{
						height: 38,
						borderBottom: "1px solid var(--border-muted)",
						display: "flex",
						alignItems: "stretch",
						background: "var(--bg-surface)",
						flexShrink: 0,
						paddingLeft: sidebarVisible ? 0 : 78,
					}}
				>
					{tabs.openThreadTabs.length === 0 ? (
						<button
							className="titlebar-no-drag"
							onClick={() => tabs.setActiveTab("chat")}
							style={{
								display: "flex",
								alignItems: "center",
								gap: 6,
								padding: "0 16px",
								fontSize: 11,
								fontWeight: 500,
								color: tabs.activeTab === "chat" || tabs.activeTab.startsWith("thread:") ? "var(--text)" : "var(--muted)",
								background: tabs.activeTab === "chat" || tabs.activeTab.startsWith("thread:") ? "var(--bg)" : "transparent",
								borderBottom: tabs.activeTab === "chat" || tabs.activeTab.startsWith("thread:") ? "2px solid var(--accent)" : "2px solid transparent",
								cursor: "pointer",
							}}
						>
							New Thread
						</button>
					) : (
						tabs.openThreadTabs.map((threadId) => {
							const thread = threads.find((t) => t.id === threadId)
							const tabId = `thread:${threadId}`
							const isActive = tabs.activeTab === tabId
							return (
								<div
									key={tabId}
									style={{
										display: "flex",
										alignItems: "center",
										gap: 4,
										background: isActive ? "var(--bg)" : "transparent",
										borderBottom: isActive
											? "2px solid var(--accent)"
											: "2px solid transparent",
									}}
								>
									<button
										className="titlebar-no-drag"
										onClick={async () => {
											await window.api.invoke({ type: "switchThread", threadId })
											tabs.setActiveTab(tabId)
										}}
										style={{
											padding: "0 4px 0 12px",
											fontSize: 11,
											fontWeight: 500,
											color: isActive ? "var(--text)" : "var(--muted)",
											cursor: "pointer",
											transition: "color 0.1s",
										}}
									>
										{thread?.title || "New Thread"}
									</button>
									<button
										className="titlebar-no-drag"
										onClick={(e) => {
											e.stopPropagation()
											tabs.handleCloseTab(tabId)
										}}
										style={{
											color: "var(--dim)",
											cursor: "pointer",
											fontSize: 11,
											padding: "0 8px 0 2px",
											lineHeight: 1,
										}}
										title="Close"
									>
										&times;
									</button>
								</div>
							)
						})
					)}

					{/* Open file/diff/browser tabs */}
					{tabs.openFiles.map((tabId) => {
						const isDiff = tabId.startsWith("diff:")
						const isBrowser = tabId.startsWith("browser:")
						const filePath = isDiff ? tabId.slice(5) : isBrowser ? tabId.slice(8) : tabId
						const fileName = isBrowser
							? (() => { try { return new URL(filePath).host || "Browser" } catch { return "Browser" } })()
							: filePath.split("/").pop() || filePath
						const isActive = tabs.activeTab === tabId
						const isDirtyTab = tabs.dirtyFiles.has(tabId)
						return (
							<div
								key={tabId}
								style={{
									display: "flex",
									alignItems: "center",
									gap: 4,
									background: isActive ? "var(--bg)" : "transparent",
									borderBottom: isActive ? "2px solid var(--accent)" : "2px solid transparent",
								}}
							>
								<button
									className="titlebar-no-drag"
									onClick={() => tabs.setActiveTab(tabId)}
									style={{
										padding: "0 4px 0 12px",
										fontSize: 11,
										fontWeight: 500,
										color: isActive ? "var(--text)" : "var(--muted)",
										cursor: "pointer",
										transition: "color 0.1s",
										display: "flex",
										alignItems: "center",
										gap: 4,
									}}
								>
									{isDiff && (
										<span style={{ fontSize: 9, color: "var(--warning)", fontWeight: 700 }}>M</span>
									)}
									{isBrowser && (
										<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
											<circle cx="12" cy="12" r="10" />
											<line x1="2" y1="12" x2="22" y2="12" />
											<path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
										</svg>
									)}
									{fileName}
									{isDirtyTab && (
										<span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--text)", flexShrink: 0 }} />
									)}
								</button>
								<button
									className="titlebar-no-drag"
									onClick={(e) => { e.stopPropagation(); tabs.handleCloseTab(tabId) }}
									style={{ color: "var(--dim)", cursor: "pointer", fontSize: 11, padding: "0 8px 0 2px", lineHeight: 1 }}
									title="Close"
								>
									&times;
								</button>
							</div>
						)
					})}

					{/* New thread button */}
					<button
						className="titlebar-no-drag"
						onClick={handleNewThread}
						style={{
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							padding: "0 8px",
							fontSize: 16,
							color: "var(--muted)",
							cursor: "pointer",
							transition: "color 0.1s",
						}}
						title="New Thread"
					>
						+
					</button>

					<div style={{ flex: 1 }} />

					{/* PR button */}
					{project.projectInfo?.gitBranch && project.projectInfo.gitBranch !== "main" && project.projectInfo.gitBranch !== "master" && (() => {
						const pr = project.prStatus
						const hasOpenPR = pr?.exists && (pr.state === "open")
						const isMerged = pr?.exists && pr.state === "merged"
						let label = "Create PR"
						let dotColor = ""
						let titleText = "Create PR from current branch"
						if (hasOpenPR) {
							label = `#${pr.number}`
							titleText = `${pr.title} — ${pr.url}`
							if (pr.checks === "passing") { dotColor = "var(--success)"; label += " passing" }
							else if (pr.checks === "failing") { dotColor = "var(--error)"; label += " failing" }
							else if (pr.checks === "pending") { dotColor = "var(--warning)"; label += " pending" }
							if (pr.isDraft) label = `#${pr.number} draft`
						} else if (isMerged) {
							label = `#${pr!.number} merged`
							dotColor = "var(--accent)"
							titleText = `Merged — ${pr!.url}`
						}
						return (
							<button
								className="titlebar-no-drag"
								onClick={() => {
									if (hasOpenPR && pr?.url) {
										window.api.invoke({ type: "openExternal", url: pr.url })
									} else if (!isMerged) {
										if (chat.isAgentActive) return
										handleSend("Create a pull request for this branch. Push if needed first.")
									}
								}}
								style={{
									display: "flex",
									alignItems: "center",
									gap: 5,
									padding: "0 10px",
									fontSize: 11,
									fontWeight: 500,
									color: hasOpenPR ? "var(--text)" : isMerged ? "var(--dim)" : chat.isAgentActive ? "var(--dim)" : "var(--muted)",
									cursor: isMerged ? "default" : "pointer",
									transition: "color 0.1s",
								}}
								title={titleText}
							>
								{dotColor && (
									<span style={{ width: 6, height: 6, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
								)}
								{!dotColor && (
									<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
										<circle cx="5" cy="3.5" r="2" />
										<circle cx="5" cy="12.5" r="2" />
										<circle cx="11" cy="5.5" r="2" />
										<line x1="5" y1="5.5" x2="5" y2="10.5" />
										<path d="M9 5.5 H7 C5.9 5.5 5 6.4 5 7.5" />
									</svg>
								)}
								{label}
							</button>
						)
					})()}

					{/* Open in... dropdown */}
					<OpenInDropdown projectPath={project.projectInfo?.rootPath ?? null} />

					{/* Right sidebar toggle */}
					<button
						className="titlebar-no-drag"
						onClick={() => setRightSidebarVisible((v) => !v)}
						style={{
							display: "flex",
							alignItems: "center",
							padding: "0 10px",
							color: rightSidebarVisible ? "var(--text)" : "var(--muted)",
							cursor: "pointer",
							transition: "color 0.1s",
						}}
						title="Toggle Explorer (Cmd+Shift+E)"
					>
						<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
							<rect x="1" y="2" width="14" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
							<line x1="10.5" y1="2" x2="10.5" y2="14" stroke="currentColor" strokeWidth="1.2" />
						</svg>
					</button>
				</div>

				{auth.isAuthenticated === null ? (
					<div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
						<div style={{ width: 24, height: 24, border: "2px solid var(--border)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
						<style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
					</div>
				) : auth.isAuthenticated === false ? (
					<WelcomeScreen onLogin={auth.handleLogin} onApiKey={auth.handleApiKey} onSkip={auth.handleSkipLogin} />
				) : project.enrichedProjects.length === 0 && (tabs.activeTab === "chat" || tabs.activeTab.startsWith("thread:")) ? (
					<div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40, gap: 24 }}>
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 220 32" style={{ height: 28, color: "var(--text)" }}>
							<path fill="currentColor" d="M5 17.3a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9m5.9-11.6a4.5 4.5 0 0 1 4.4 5.4c-.3 1.4-.6 3 .2 4.2l1.3 1.9.3.2.3-.2 1.3-1.9c.8-1.2.5-2.7.2-4.1a4.5 4.5 0 1 1 8.8.1c-.3 1.3-.6 2.7 0 3.9l1.3 2v.1a4.5 4.5 0 1 1-4.3 3.4c.3-1.3.6-2.7 0-3.9l-1.2-2h-.2L22 16.5c-.8 1.2-.5 2.8-.2 4.2a4.5 4.5 0 1 1-8.8.3q.5-2-.4-3.8l-.9-1.3q-.9-1.2-2.4-1.6a4.5 4.5 0 0 1 1.6-8.7M56.6 22v-6.9q0-1-.7-1.7t-1.7-.7q-1.3 0-2.1 1T51 16v6h-2.8V10.6h2.9v2.2q.6-1 1.6-1.8 1-.6 2.5-.7 1.2 0 2.3.7t1.5 1.8q.6-1.2 1.7-1.8a5 5 0 0 1 2.5-.7q2 0 3.1 1.2 1.3 1.2 1.3 3.2V22h-3v-6.6q0-1.4-.6-2t-1.7-.7q-1.2 0-2.1.9t-.9 2.3V22zm18.6.3q-1.5 0-3-.7a6 6 0 0 1-2-2.2q-.7-1.5-.7-3 0-1.8.7-3.2a6 6 0 0 1 5-3q1.4 0 2.6.7t1.8 1.6v-1.9h3V22h-3v-2q-.6 1.2-1.8 1.8-1.2.5-2.6.5M76 20q1.6 0 2.6-1t1-2.7-1-2.7-2.6-1-2.6 1-1 2.7 1 2.7 2.6 1m14 2.3a7 7 0 0 1-4.1-1q-1.5-1.2-1.6-3L87 18q0 1 .8 1.6t2.2.7a3 3 0 0 0 1.7-.5q.7-.4.7-1a1 1 0 0 0-.6-1l-1.4-.6-3.8-.9q-.8-.3-1.4-.9t-.6-1.7q0-1.6 1.4-2.6t3.8-1 3.6 1a3 3 0 0 1 1.6 2.5l-2.8.1q0-.6-.6-1.2t-1.8-.5q-1 0-1.7.4t-.6 1 .6 1l1.5.4 3.7.9q.8.3 1.5 1 .5.6.5 1.7 0 1.8-1.4 2.8-1.5 1-4 1m12.6 0q-1.9 0-3-1a4 4 0 0 1-1.2-2.8v-5.7h-2.5v-2.2h2.5V7.2h2.9v3.4h3.7v2.2h-3.7V18q0 1 .4 1.4.5.5 1.3.5l1-.2.9-.6.4 2.4q-.3.3-1.1.5-.7.2-1.6.2m4.3-.3V10.6h2.9V13q.5-1.2 1.5-2a4 4 0 0 1 4.2-.4l-.3 2.8-.9-.4-1-.2-1 .2q-.7.2-1.2.6t-1 1.2q-.3.7-.3 2V22zm14.7.3q-1.6 0-3-.7a6 6 0 0 1-2-2.2q-.8-1.5-.8-3 0-1.8.7-3.2a6 6 0 0 1 5-3q1.5 0 2.6.7t1.9 1.6v-1.9h2.9V22h-3v-2q-.6 1.2-1.8 1.8-1.1.5-2.5.5m.7-2.3q1.6 0 2.6-1t1-2.7-1-2.7-2.6-1-2.6 1-1 2.7 1 2.7 2.6 1"/>
							<text x="130" y="22" fill="#00FF41" fontFamily="'Lucida Console', 'Courier New', monospace" fontSize="24" fontWeight="700" letterSpacing="1">code</text>
						</svg>
						<div style={{ textAlign: "center", maxWidth: 420 }}>
							<div style={{ fontSize: 20, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>
								Open a project to get started
							</div>
							<div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>
								Point Mastra Code at a repository or folder to start coding with AI.
							</div>
						</div>
						<div style={{ display: "flex", gap: 12 }}>
							<button
								onClick={project.handleOpenFolder}
								style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 28px", background: "var(--accent)", color: "#fff", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 14, border: "none", transition: "opacity 0.15s" }}
								onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.85" }}
								onMouseLeave={(e) => { e.currentTarget.style.opacity = "1" }}
							>
								<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
									<path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
								</svg>
								Open Folder
							</button>
							<button
								onClick={project.handleShowCloneModal}
								style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 28px", background: "transparent", color: "var(--text)", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 14, border: "1px solid var(--border)", transition: "opacity 0.15s" }}
								onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.85" }}
								onMouseLeave={(e) => { e.currentTarget.style.opacity = "1" }}
							>
								<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
									<circle cx="18" cy="18" r="3" /><circle cx="6" cy="6" r="3" />
									<path d="M13 6h3a2 2 0 012 2v7" /><line x1="6" y1="9" x2="6" y2="21" />
								</svg>
								Clone from URL
							</button>
						</div>
						<div style={{ fontSize: 11, color: "var(--dim)" }}>
							or press <kbd style={{ padding: "2px 6px", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 4, fontSize: 11, fontFamily: "inherit" }}>&#8984;O</kbd> anytime
						</div>
					</div>
				) : (
					<>
						<div
							onMouseDown={() => {
								const p = project.projectInfoRef.current?.rootPath
								if (p) {
									project.setUnreadWorktrees((prev) => {
										if (!prev.has(p)) return prev
										const next = new Set(prev)
										next.delete(p)
										return next
									})
								}
							}}
							style={{
								flex: 1,
								display: tabs.activeTab === "chat" || tabs.activeTab.startsWith("thread:") ? "flex" : "none",
								flexDirection: "column",
								overflow: "hidden",
							}}
						>
							<ChatView
								messages={chat.messages}
								tools={chat.tools}
								subagents={chat.subagents}
								isAgentActive={chat.isAgentActive}
								agentStartedAt={chat.agentStartedAt}
								streamingMessageId={chat.streamingMessageId}
								todos={tasks}
							/>
							<EditorInput
								onSend={handleSend}
								onAbort={handleAbort}
								isAgentActive={chat.isAgentActive}
								modeId={modeId}
								onBuiltinCommand={handleBuiltinCommand}
							/>
						</div>

						{tabs.activeTab === "settings" && (
							<Settings
								onClose={() => tabs.setActiveTab("chat")}
								loggedInProviders={auth.loggedInProviders}
								onLogin={auth.handleLogin}
								onApiKey={auth.handleApiKey}
								onLogout={auth.handleLogout}
								initialSection={tabs.settingsSection}
								onSectionChange={(s) => tabs.setSettingsSection(s)}
							/>
						)}

						{tabs.activeTab === "tasks" && <TaskBoard agentTasks={tasks} onClose={() => tabs.setActiveTab("chat")} onStartWork={project.handleStartWorkOnIssue} onStartWorkGithub={project.handleStartWorkOnGithubIssue} linkedIssues={project.linkedIssues} onSwitchToWorktree={project.handleSwitchProject} />}

						{tabs.activeTab === "agents" && (
							<AgentDashboard
								onClose={() => tabs.setActiveTab("chat")}
								onSwitchToAgent={project.handleSwitchProject}
							/>
						)}

						{tabs.activeTab !== "chat" && tabs.activeTab !== "settings" && tabs.activeTab !== "tasks" && tabs.activeTab !== "agents" && !tabs.activeTab.startsWith("thread:") &&
							(tabs.activeTab.startsWith("browser:") ? (
								<BrowserView
									url={tabs.activeTab.slice(8)}
									onNavigate={(newUrl) => {
										const oldTab = tabs.activeTab
										const newTab = `browser:${newUrl}`
										if (oldTab !== newTab) {
											tabs.setOpenFiles((prev) => prev.map((f) => (f === oldTab ? newTab : f)))
											tabs.setActiveTab(newTab)
										}
									}}
									onClose={() => tabs.handleCloseTab(tabs.activeTab)}
								/>
							) : tabs.activeTab.startsWith("diff:") ? (
								<DiffEditor
									filePath={tabs.activeTab.slice(5)}
									onClose={() => tabs.handleCloseTab(tabs.activeTab)}
									onOpenFile={tabs.handleFileClick}
								/>
							) : (
								<FileEditor
									ref={tabs.fileEditorRef}
									filePath={tabs.activeTab}
									onClose={() => tabs.handleCloseTab(tabs.activeTab)}
									onDirtyChange={(dirty) => tabs.handleDirtyChange(tabs.activeTab, dirty)}
								/>
							))}
					</>
				)}

				<StatusBar
					modeId={modeId}
					modelId={modelId}
					tokenUsage={tokenUsage}
					isAgentActive={chat.isAgentActive}
					projectName={project.projectInfo?.name}
					gitBranch={project.projectInfo?.gitBranch}
					onOpenModelSelector={dialogs.handleOpenModelSelector}
					omProgress={omProgress}
					omModelIds={omModelIds}
					loggedInProviders={auth.loggedInProviders}
					onOpenOMSettings={() => {
						tabs.setActiveTab("settings")
						tabs.setSettingsSection("memory")
					}}
					thinkingEnabled={thinkingLevel !== "off"}
					onToggleThinking={handleToggleThinking}
					planningEnabled={modeId === "plan"}
					onTogglePlanning={handleTogglePlanning}
				/>
			</div>

			{/* Right sidebar */}
			<RightSidebar
				visible={rightSidebarVisible && project.enrichedProjects.length > 0}
				activeTab={rightSidebarTab}
				onTabChange={setRightSidebarTab}
				projectName={project.projectInfo?.name ?? ""}
				projectPath={project.projectInfo?.rootPath ?? null}
				onFileClick={tabs.handleFileClick}
				onDiffClick={tabs.handleDiffClick}
				activeFilePath={tabs.openFiles.includes(tabs.activeTab) ? tabs.activeTab : null}
				activeDiffPath={tabs.activeTab.startsWith("diff:") ? tabs.activeTab.slice(5) : null}
				loading={project.projectSwitching}
				onOpenBrowser={tabs.handleBrowserOpen}
			/>

			{/* Modal dialogs */}
			{dialogs.pendingApproval && (
				<ToolApprovalDialog
					toolCallId={dialogs.pendingApproval.toolCallId}
					toolName={dialogs.pendingApproval.toolName}
					args={dialogs.pendingApproval.args}
					category={dialogs.pendingApproval.category}
					categoryLabel={dialogs.pendingApproval.categoryLabel}
					onApprove={dialogs.handleApprove}
					onDecline={dialogs.handleDecline}
					onAlwaysAllow={dialogs.handleAlwaysAllow}
				/>
			)}

			{dialogs.pendingQuestion && (
				<AskQuestionDialog
					questionId={dialogs.pendingQuestion.questionId}
					question={dialogs.pendingQuestion.question}
					options={dialogs.pendingQuestion.options}
					onRespond={dialogs.handleQuestionResponse}
				/>
			)}

			{dialogs.pendingPlan && (
				<PlanApproval
					planId={dialogs.pendingPlan.planId}
					title={dialogs.pendingPlan.title}
					plan={dialogs.pendingPlan.plan}
					onRespond={dialogs.handlePlanResponse}
				/>
			)}

			{/* Clone modal */}
			{project.showCloneModal && (
				<div
					style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
					onClick={(e) => { if (e.target === e.currentTarget && !project.cloning) { project.setShowCloneModal(false) } }}
				>
					<div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 24, width: 480, maxWidth: "90vw", display: "flex", flexDirection: "column", gap: 16 }}>
						<div style={{ fontSize: 16, fontWeight: 600, color: "var(--text)" }}>Clone from URL</div>
						<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
							<label style={{ fontSize: 12, fontWeight: 500, color: "var(--muted)" }}>Git URL</label>
							<input type="text" value={project.cloneUrl} onChange={(e) => project.setCloneUrl(e.target.value)} placeholder="https://github.com/user/repo.git" autoFocus disabled={project.cloning}
								style={{ padding: "10px 12px", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", fontSize: 13, fontFamily: "inherit", outline: "none" }} />
						</div>
						<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
							<label style={{ fontSize: 12, fontWeight: 500, color: "var(--muted)" }}>Clone location</label>
							<div style={{ display: "flex", gap: 8 }}>
								<input type="text" value={project.cloneDest} onChange={(e) => project.setCloneDest(e.target.value)} placeholder="/path/to/directory" disabled={project.cloning}
									style={{ flex: 1, padding: "10px 12px", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", fontSize: 13, fontFamily: "inherit", outline: "none" }} />
								<button onClick={project.handleBrowseCloneDest} disabled={project.cloning}
									style={{ padding: "10px 16px", background: "var(--bg-elevated)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 500, whiteSpace: "nowrap" }}>
									Browse...
								</button>
							</div>
						</div>
						<div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
							<button onClick={() => { project.setShowCloneModal(false); project.setCloneUrl(""); project.setCloneDest("") }} disabled={project.cloning}
								style={{ padding: "8px 16px", background: "transparent", color: "var(--muted)", border: "1px solid var(--border)", borderRadius: 8, cursor: "pointer", fontSize: 13 }}>
								Cancel
							</button>
							<button onClick={project.handleCloneSubmit} disabled={!project.cloneUrl.trim() || !project.cloneDest.trim() || project.cloning}
								style={{ padding: "8px 20px", background: project.cloneUrl.trim() && project.cloneDest.trim() ? "var(--accent)" : "var(--bg-elevated)", color: project.cloneUrl.trim() && project.cloneDest.trim() ? "#fff" : "var(--dim)", border: "none", borderRadius: 8, cursor: project.cloneUrl.trim() && project.cloneDest.trim() && !project.cloning ? "pointer" : "default", fontSize: 13, fontWeight: 600, opacity: project.cloning ? 0.6 : 1 }}>
								{project.cloning ? "Cloning..." : "Clone repository"}
							</button>
						</div>
					</div>
				</div>
			)}

			{dialogs.showModelSelector && (
				<ModelSelector
					currentModelId={modelId}
					onSelect={dialogs.handleSwitchModel}
					onClose={() => dialogs.setShowModelSelector(false)}
				/>
			)}

			{dialogs.showCommandPalette && (
				<CommandPalette
					commands={commandPaletteItems}
					onClose={() => dialogs.setShowCommandPalette(false)}
				/>
			)}

			{dialogs.showQuickFileOpen && (
				<QuickFileOpen
					onSelect={(filePath) => {
						tabs.handleFileClick(filePath)
						dialogs.setShowQuickFileOpen(false)
					}}
					onClose={() => dialogs.setShowQuickFileOpen(false)}
				/>
			)}

			{tabs.pendingCloseTab && (
				<div
					style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0, 0, 0, 0.5)" }}
					onClick={() => tabs.setPendingCloseTab(null)}
				>
					<div
						onClick={(e) => e.stopPropagation()}
						style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "20px 24px", maxWidth: 360, width: "100%", display: "flex", flexDirection: "column", gap: 16 }}
					>
						<div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>Unsaved Changes</div>
						<div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
							This file has unsaved changes. Do you want to save before closing?
						</div>
						<div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
							<button
								onClick={() => { const tabId = tabs.pendingCloseTab!; tabs.setPendingCloseTab(null); tabs.forceCloseTab(tabId) }}
								style={{ fontSize: 12, padding: "6px 14px", borderRadius: 4, border: "1px solid var(--border)", background: "transparent", color: "var(--error)", cursor: "pointer", fontWeight: 500 }}
							>
								Discard
							</button>
							<button
								onClick={() => tabs.setPendingCloseTab(null)}
								style={{ fontSize: 12, padding: "6px 14px", borderRadius: 4, border: "1px solid var(--border)", background: "transparent", color: "var(--muted)", cursor: "pointer", fontWeight: 500 }}
							>
								Cancel
							</button>
							<button
								onClick={async () => { const tabId = tabs.pendingCloseTab!; tabs.setPendingCloseTab(null); await tabs.fileEditorRef.current?.save(); tabs.forceCloseTab(tabId) }}
								style={{ fontSize: 12, padding: "6px 14px", borderRadius: 4, border: "1px solid var(--border)", background: "var(--accent)", color: "var(--bg)", cursor: "pointer", fontWeight: 500 }}
							>
								Save & Close
							</button>
						</div>
					</div>
				</div>
			)}

			{auth.loginState && (
				<LoginDialog
					providerId={auth.loginState.providerId}
					stage={auth.loginState.stage}
					url={auth.loginState.url}
					instructions={auth.loginState.instructions}
					promptMessage={auth.loginState.promptMessage}
					promptPlaceholder={auth.loginState.promptPlaceholder}
					progressMessage={auth.loginState.progressMessage}
					errorMessage={auth.loginState.errorMessage}
					onSubmitCode={auth.handleLoginSubmitCode}
					onCancel={auth.handleLoginCancel}
					onClose={auth.handleLoginClose}
				/>
			)}
		</div>
	)
}
