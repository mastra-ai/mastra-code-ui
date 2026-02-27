import { useState, useCallback, useReducer, useEffect, useRef } from "react"
import { Sidebar } from "./components/Sidebar"
import { ChatView } from "./components/ChatView"
import { StatusBar } from "./components/StatusBar"
import { EditorInput } from "./components/EditorInput"
import { ToolApprovalDialog } from "./components/ToolApprovalDialog"
import { AskQuestionDialog } from "./components/AskQuestionDialog"
import { PlanApproval } from "./components/PlanApproval"
import { ModelSelector } from "./components/ModelSelector"
import { Settings } from "./components/Settings"
import { TaskBoard, type LinearIssue, type GitHubIssue, type WorkflowStates } from "./components/TaskBoard"
import { LoginDialog } from "./components/LoginDialog"
import { WelcomeScreen } from "./components/WelcomeScreen"
import { RightSidebar, type RightSidebarTab } from "./components/RightSidebar"
import { FileEditor } from "./components/FileEditor"
import { DiffEditor } from "./components/DiffEditor"
import type { EnrichedProject } from "./components/ProjectList"
import type {
	HarnessEventPayload,
	Message,
	TokenUsage,
	ThreadInfo,
} from "./types/ipc"

// Chat state reducer
type ToolState = {
	id: string
	name: string
	args: unknown
	result?: unknown
	isError?: boolean
	status: "pending" | "running" | "complete" | "error"
	shellOutput?: string
}

type SubagentState = {
	toolCallId: string
	agentType: string
	task: string
	modelId?: string
	tools: Array<{
		name: string
		args: unknown
		result?: unknown
		isError?: boolean
		status: "running" | "complete"
	}>
	result?: string
	isError?: boolean
	durationMs?: number
	status: "running" | "complete"
}

type ChatState = {
	messages: Message[]
	isAgentActive: boolean
	agentStartedAt: number | null
	streamingMessageId: string | null
	tools: Map<string, ToolState>
	subagents: Map<string, SubagentState>
}

type ChatAction =
	| { type: "AGENT_START" }
	| { type: "AGENT_END" }
	| { type: "MESSAGE_START"; message: Message }
	| { type: "MESSAGE_UPDATE"; message: Message }
	| { type: "MESSAGE_END"; message: Message }
	| { type: "TOOL_START"; id: string; name: string; args: unknown }
	| { type: "TOOL_UPDATE"; id: string; partialResult: unknown }
	| { type: "TOOL_END"; id: string; result: unknown; isError: boolean }
	| {
			type: "SHELL_OUTPUT"
			id: string
			output: string
			stream: "stdout" | "stderr"
	  }
	| {
			type: "SUBAGENT_START"
			toolCallId: string
			agentType: string
			task: string
			modelId?: string
	  }
	| {
			type: "SUBAGENT_TOOL_START"
			toolCallId: string
			subToolName: string
			subToolArgs: unknown
	  }
	| {
			type: "SUBAGENT_TOOL_END"
			toolCallId: string
			subToolName: string
			subToolResult: unknown
			isError: boolean
	  }
	| {
			type: "SUBAGENT_END"
			toolCallId: string
			result: string
			isError: boolean
			durationMs: number
	  }
	| { type: "SET_MESSAGES"; messages: Message[] }
	| { type: "CLEAR" }

function chatReducer(state: ChatState, action: ChatAction): ChatState {
	switch (action.type) {
		case "AGENT_START":
			return { ...state, isAgentActive: true, agentStartedAt: Date.now() }
		case "AGENT_END":
			return {
				...state,
				isAgentActive: false,
				streamingMessageId: null,
			}
		case "MESSAGE_START": {
			// If this is a user message from the harness and we already have an
			// optimistic user message with the same text, skip the duplicate
			if (action.message.role === "user") {
				const lastMsg = state.messages[state.messages.length - 1]
				if (lastMsg?.role === "user") {
					// Already have a user message at the end — skip
					return state
				}
			}
			return {
				...state,
				messages: [...state.messages, action.message],
				streamingMessageId:
					action.message.role === "assistant" ? action.message.id : null,
			}
		}
		case "MESSAGE_UPDATE": {
			const msgs = state.messages.map((m) =>
				m.id === action.message.id ? action.message : m,
			)
			return { ...state, messages: msgs }
		}
		case "MESSAGE_END": {
			const msgs = state.messages.map((m) =>
				m.id === action.message.id ? action.message : m,
			)
			return { ...state, messages: msgs, streamingMessageId: null }
		}
		case "TOOL_START": {
			const tools = new Map(state.tools)
			tools.set(action.id, {
				id: action.id,
				name: action.name,
				args: action.args,
				status: "running",
			})
			return { ...state, tools }
		}
		case "TOOL_UPDATE": {
			const tools = new Map(state.tools)
			const tool = tools.get(action.id)
			if (tool) {
				tools.set(action.id, { ...tool, result: action.partialResult })
			}
			return { ...state, tools }
		}
		case "TOOL_END": {
			const tools = new Map(state.tools)
			const tool = tools.get(action.id)
			if (tool) {
				tools.set(action.id, {
					...tool,
					result: action.result,
					isError: action.isError,
					status: action.isError ? "error" : "complete",
				})
			}
			return { ...state, tools }
		}
		case "SHELL_OUTPUT": {
			const tools = new Map(state.tools)
			const tool = tools.get(action.id)
			if (tool) {
				tools.set(action.id, {
					...tool,
					shellOutput: (tool.shellOutput ?? "") + action.output,
				})
			}
			return { ...state, tools }
		}
		case "SUBAGENT_START": {
			const subagents = new Map(state.subagents)
			subagents.set(action.toolCallId, {
				toolCallId: action.toolCallId,
				agentType: action.agentType,
				task: action.task,
				modelId: action.modelId,
				tools: [],
				status: "running",
			})
			return { ...state, subagents }
		}
		case "SUBAGENT_TOOL_START": {
			const subagents = new Map(state.subagents)
			const sa = subagents.get(action.toolCallId)
			if (sa) {
				subagents.set(action.toolCallId, {
					...sa,
					tools: [
						...sa.tools,
						{
							name: action.subToolName,
							args: action.subToolArgs,
							status: "running",
						},
					],
				})
			}
			return { ...state, subagents }
		}
		case "SUBAGENT_TOOL_END": {
			const subagents = new Map(state.subagents)
			const sa = subagents.get(action.toolCallId)
			if (sa) {
				const tools = sa.tools.map((t) =>
					t.name === action.subToolName && t.status === "running"
						? {
								...t,
								result: action.subToolResult,
								isError: action.isError,
								status: "complete" as const,
							}
						: t,
				)
				subagents.set(action.toolCallId, { ...sa, tools })
			}
			return { ...state, subagents }
		}
		case "SUBAGENT_END": {
			const subagents = new Map(state.subagents)
			const sa = subagents.get(action.toolCallId)
			if (sa) {
				subagents.set(action.toolCallId, {
					...sa,
					result: action.result,
					isError: action.isError,
					durationMs: action.durationMs,
					status: "complete",
				})
			}
			return { ...state, subagents }
		}
		case "SET_MESSAGES":
			return {
				...state,
				messages: action.messages,
				tools: new Map(),
				subagents: new Map(),
			}
		case "CLEAR":
			return {
				messages: [],
				isAgentActive: false,
				agentStartedAt: null,
				streamingMessageId: null,
				tools: new Map(),
				subagents: new Map(),
			}
		default:
			return state
	}
}

const initialChatState: ChatState = {
	messages: [],
	isAgentActive: false,
	agentStartedAt: null,
	streamingMessageId: null,
	tools: new Map(),
	subagents: new Map(),
}

interface ProjectInfo {
	name: string
	rootPath: string
	gitBranch?: string
	isWorktree?: boolean
}

// R2D2-style completion sound using Web Audio API
// AudioContext must be created during a user gesture (click/keypress) due to
// browser autoplay policy. We lazily create it on the first user interaction
// and reuse it for all subsequent sounds.
let sharedAudioCtx: AudioContext | null = null

function ensureAudioContext() {
	if (!sharedAudioCtx) {
		try {
			sharedAudioCtx = new AudioContext()
		} catch {
			// Audio not available
		}
	}
	// Resume if suspended (can happen after idle)
	if (sharedAudioCtx?.state === "suspended") {
		sharedAudioCtx.resume().catch(() => {})
	}
}

function playCompletionSound() {
	if (!sharedAudioCtx) return
	try {
		const ctx = sharedAudioCtx
		if (ctx.state === "suspended") {
			ctx.resume().catch(() => {})
		}
		const now = ctx.currentTime
		const gain = ctx.createGain()
		gain.connect(ctx.destination)
		gain.gain.setValueAtTime(0.15, now)
		gain.gain.linearRampToValueAtTime(0, now + 1.2)

		// Chirp 1: rising sweep
		const o1 = ctx.createOscillator()
		o1.type = "square"
		o1.frequency.setValueAtTime(800, now)
		o1.frequency.exponentialRampToValueAtTime(2400, now + 0.12)
		o1.frequency.exponentialRampToValueAtTime(1800, now + 0.2)
		o1.connect(gain)
		o1.start(now)
		o1.stop(now + 0.2)

		// Chirp 2: warble
		const o2 = ctx.createOscillator()
		o2.type = "sine"
		o2.frequency.setValueAtTime(1200, now + 0.25)
		o2.frequency.exponentialRampToValueAtTime(2800, now + 0.35)
		o2.frequency.exponentialRampToValueAtTime(1600, now + 0.45)
		o2.frequency.exponentialRampToValueAtTime(3200, now + 0.55)
		o2.connect(gain)
		o2.start(now + 0.25)
		o2.stop(now + 0.55)

		// Chirp 3: happy descending trill
		const o3 = ctx.createOscillator()
		o3.type = "square"
		const g3 = ctx.createGain()
		g3.gain.setValueAtTime(0.1, now + 0.6)
		g3.gain.linearRampToValueAtTime(0, now + 1.1)
		o3.connect(g3)
		g3.connect(ctx.destination)
		o3.frequency.setValueAtTime(2600, now + 0.6)
		o3.frequency.exponentialRampToValueAtTime(3400, now + 0.7)
		o3.frequency.exponentialRampToValueAtTime(2000, now + 0.85)
		o3.frequency.exponentialRampToValueAtTime(2800, now + 0.95)
		o3.frequency.exponentialRampToValueAtTime(1400, now + 1.1)
		o3.start(now + 0.6)
		o3.stop(now + 1.1)
	} catch {
		// Audio not available
	}
}

export function App() {
	const [chat, dispatch] = useReducer(chatReducer, initialChatState)
	const [modeId, setModeId] = useState("build")
	const [modelId, setModelId] = useState("")
	const [tokenUsage, setTokenUsage] = useState<TokenUsage>({
		promptTokens: 0,
		completionTokens: 0,
		totalTokens: 0,
	})
	const [threads, setThreads] = useState<ThreadInfo[]>([])
	const [currentThreadId, setCurrentThreadId] = useState<string | null>(null)
	const [showModelSelector, setShowModelSelector] = useState(false)
	const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
	const [loggedInProviders, setLoggedInProviders] = useState<Set<string>>(
		new Set(),
	)

	// Sidebar state
	const [sidebarVisible, setSidebarVisible] = useState(true)

	// Right sidebar state
	const [rightSidebarVisible, setRightSidebarVisible] = useState(true)
	const [rightSidebarTab, setRightSidebarTab] = useState<RightSidebarTab>("files")

	// Tab state: multiple open files/threads + active tab
	const [openFiles, setOpenFiles] = useState<string[]>([])
	const [openThreadTabs, setOpenThreadTabs] = useState<string[]>([]) // thread IDs
	const [activeTab, setActiveTab] = useState<string>("chat") // "chat", "thread:<id>", file path, "diff:<path>"

	// Project state
	const [projectInfo, setProjectInfo] = useState<ProjectInfo | null>(null)
	const [enrichedProjects, setEnrichedProjects] = useState<EnrichedProject[]>([])
	const [unreadWorktrees, setUnreadWorktrees] = useState<Set<string>>(new Set())
	const [activeWorktrees, setActiveWorktrees] = useState<Set<string>>(new Set())
	const [prStatus, setPrStatus] = useState<{
		exists: boolean
		number?: number
		title?: string
		state?: string
		url?: string
		isDraft?: boolean
		checks?: "pending" | "passing" | "failing" | "none"
	} | null>(null)
	const [worktreeStatuses, setWorktreeStatuses] = useState<Map<string, "in_progress" | "in_review" | "done" | "archived">>(new Map())
	const projectInfoRef = useRef<ProjectInfo | null>(null)
	const notificationPrefRef = useRef<string>("off")

	// Keep ref in sync for use in event handler closure
	useEffect(() => {
		projectInfoRef.current = projectInfo
	}, [projectInfo])

	// Refresh PR status when project/branch changes, and poll every 30s
	useEffect(() => {
		loadPRStatus()
		const interval = setInterval(loadPRStatus, 30_000)
		return () => clearInterval(interval)
	}, [projectInfo?.rootPath, projectInfo?.gitBranch])

	// Refresh worktree statuses periodically (every 60s)
	useEffect(() => {
		if (enrichedProjects.length === 0) return
		const interval = setInterval(() => loadWorktreeStatuses(), 60_000)
		return () => clearInterval(interval)
	}, [enrichedProjects])

	// Sync dock badge count with unread worktrees
	useEffect(() => {
		window.api.setBadgeCount(unreadWorktrees.size)
	}, [unreadWorktrees])

	// Login dialog state
	const [loginState, setLoginState] = useState<{
		providerId: string
		stage: "auth" | "prompt" | "progress" | "success" | "error"
		url?: string
		instructions?: string
		promptMessage?: string
		promptPlaceholder?: string
		progressMessage?: string
		errorMessage?: string
	} | null>(null)

	// Pending dialogs
	const [pendingApproval, setPendingApproval] = useState<{
		toolCallId: string
		toolName: string
		args: unknown
		category: string | null
		categoryLabel: string | null
	} | null>(null)
	const [pendingQuestion, setPendingQuestion] = useState<{
		questionId: string
		question: string
		options?: Array<{ label: string; description?: string }>
	} | null>(null)
	const [pendingPlan, setPendingPlan] = useState<{
		planId: string
		title: string
		plan: string
	} | null>(null)
	const [tasks, setTasks] = useState<
		Array<{
			content: string
			status: "pending" | "in_progress" | "completed"
			activeForm: string
		}>
	>([])
	const [linkedIssues, setLinkedIssues] = useState<Record<string, { issueId: string; issueIdentifier: string; provider?: string }>>({})

	// Load linked issues map
	const loadLinkedIssues = useCallback(async () => {
		try {
			const result = (await window.api.invoke({ type: "getLinkedIssues" })) as Record<string, { issueId: string; issueIdentifier: string; provider?: string }>
			setLinkedIssues(result ?? {})
		} catch {
			// ignore
		}
	}, [])

	useEffect(() => {
		loadLinkedIssues()
	}, [loadLinkedIssues])

	// Subscribe to harness events
	useEffect(() => {
		const unsubscribe = window.api.onEvent((raw: unknown) => {
			const event = raw as HarnessEventPayload
			const worktreePath = (event as any).worktreePath as string | undefined
			const isActiveWorktree = !worktreePath || worktreePath === projectInfoRef.current?.rootPath

			switch (event.type) {
				case "agent_start":
					if (isActiveWorktree) dispatch({ type: "AGENT_START" })
					if (worktreePath) {
						setActiveWorktrees((prev) => new Set(prev).add(worktreePath))
					} else if (projectInfoRef.current?.rootPath) {
						setActiveWorktrees((prev) => new Set(prev).add(projectInfoRef.current!.rootPath))
					}
					break
				case "agent_end": {
					const endPath = worktreePath || projectInfoRef.current?.rootPath
					if (isActiveWorktree) {
						dispatch({ type: "AGENT_END" })
						loadThreads()
						loadPRStatus()
					}
					if (endPath) {
						setActiveWorktrees((prev) => {
							const next = new Set(prev)
							next.delete(endPath)
							return next
						})
						setUnreadWorktrees((prev) => new Set(prev).add(endPath))
					}
					const pref = notificationPrefRef.current
					if (pref === "bell" || pref === "both") {
						playCompletionSound()
					}
					break
				}
				case "thread_title_updated":
					loadThreads()
					break
				case "message_start":
					if (isActiveWorktree) dispatch({
						type: "MESSAGE_START",
						message: event.message as Message,
					})
					break
				case "message_update":
					if (isActiveWorktree) dispatch({
						type: "MESSAGE_UPDATE",
						message: event.message as Message,
					})
					break
				case "message_end":
					if (isActiveWorktree) {
						dispatch({
							type: "MESSAGE_END",
							message: event.message as Message,
						})
						window.api.invoke({ type: "getTokenUsage" }).then((usage) => {
							if (usage) setTokenUsage(usage as TokenUsage)
						}).catch(() => {})
					}
					break
				case "tool_start":
					if (isActiveWorktree) dispatch({
						type: "TOOL_START",
						id: event.toolCallId as string,
						name: event.toolName as string,
						args: event.args,
					})
					break
				case "tool_update":
					if (isActiveWorktree) dispatch({
						type: "TOOL_UPDATE",
						id: event.toolCallId as string,
						partialResult: event.partialResult,
					})
					break
				case "tool_end":
					if (isActiveWorktree) dispatch({
						type: "TOOL_END",
						id: event.toolCallId as string,
						result: event.result,
						isError: event.isError as boolean,
					})
					break
				case "shell_output":
					if (isActiveWorktree) dispatch({
						type: "SHELL_OUTPUT",
						id: event.toolCallId as string,
						output: event.output as string,
						stream: event.stream as "stdout" | "stderr",
					})
					break
				case "tool_approval_required":
					setPendingApproval({
						toolCallId: event.toolCallId as string,
						toolName: event.toolName as string,
						args: event.args,
						category: (event.category as string) ?? null,
						categoryLabel: (event.categoryLabel as string) ?? null,
					})
					break
				case "ask_question":
					setPendingQuestion({
						questionId: event.questionId as string,
						question: event.question as string,
						options: event.options as
							| Array<{ label: string; description?: string }>
							| undefined,
					})
					break
				case "plan_approval_required":
					setPendingPlan({
						planId: event.planId as string,
						title: event.title as string,
						plan: event.plan as string,
					})
					break
				case "plan_approved":
					setPendingPlan(null)
					break
				case "mode_changed":
					setModeId(event.modeId as string)
					break
				case "model_changed":
					setModelId(event.modelId as string)
					break
				case "thread_changed":
					setCurrentThreadId(event.threadId as string)
					loadMessages()
					loadThreads()
					window.api.invoke({ type: "getTokenUsage" }).then((usage) => {
						if (usage) setTokenUsage(usage as TokenUsage)
					}).catch(() => {})
					break
				case "thread_created": {
					const newThreadId = (event.thread as any)?.id
					if (newThreadId) {
						setCurrentThreadId(newThreadId)
						setOpenThreadTabs((prev) =>
							prev.includes(newThreadId) ? prev : [...prev, newThreadId],
						)
						setActiveTab(`thread:${newThreadId}`)
					}
					loadThreads()
					break
				}
				case "usage_update":
					if (isActiveWorktree) {
						window.api.invoke({ type: "getTokenUsage" }).then((usage) => {
							if (usage) setTokenUsage(usage as TokenUsage)
						}).catch(() => {})
					}
					break
				case "task_updated":
					setTasks(
						event.tasks as Array<{
							content: string
							status: "pending" | "in_progress" | "completed"
							activeForm: string
						}>,
					)
					break
				case "subagent_start":
					dispatch({
						type: "SUBAGENT_START",
						toolCallId: event.toolCallId as string,
						agentType: event.agentType as string,
						task: event.task as string,
						modelId: event.modelId as string | undefined,
					})
					break
				case "subagent_tool_start":
					dispatch({
						type: "SUBAGENT_TOOL_START",
						toolCallId: event.toolCallId as string,
						subToolName: event.subToolName as string,
						subToolArgs: event.subToolArgs,
					})
					break
				case "subagent_tool_end":
					dispatch({
						type: "SUBAGENT_TOOL_END",
						toolCallId: event.toolCallId as string,
						subToolName: event.subToolName as string,
						subToolResult: event.subToolResult,
						isError: event.isError as boolean,
					})
					break
				case "subagent_end":
					dispatch({
						type: "SUBAGENT_END",
						toolCallId: event.toolCallId as string,
						result: event.result as string,
						isError: event.isError as boolean,
						durationMs: event.durationMs as number,
					})
					break
				case "error": {
					const err = event.error as { message?: string }
					console.error("Harness error:", err?.message ?? event.error)
					break
				}
				case "shortcut": {
					const action = (event as { action?: string }).action
					if (action === "new_thread") handleNewThread()
					else if (action === "toggle_terminal")
						setRightSidebarVisible((v) => !v)
					else if (action === "toggle_sidebar")
						setSidebarVisible((v) => !v)
					else if (action === "toggle_right_sidebar")
						setRightSidebarVisible((v) => !v)
					else if (action === "focus_git") {
						setRightSidebarVisible(true)
						setRightSidebarTab("git")
					} else if (action === "open_project")
						handleOpenFolder()
					break
				}
				case "login_auth":
					setLoginState({
						providerId: event.providerId as string,
						stage: "auth",
						url: event.url as string,
						instructions: event.instructions as string | undefined,
					})
					break
				case "login_prompt":
					setLoginState((prev) => ({
						providerId: (event.providerId as string) ?? prev?.providerId ?? "",
						stage: "prompt",
						promptMessage: event.message as string,
						promptPlaceholder: event.placeholder as string | undefined,
					}))
					break
				case "login_progress":
					setLoginState((prev) => ({
						providerId: (event.providerId as string) ?? prev?.providerId ?? "",
						stage: "progress",
						progressMessage: event.message as string,
					}))
					break
				case "login_success": {
					const pid = (event.providerId as string) ?? ""
					setLoginState((prev) => ({
						providerId: pid || prev?.providerId || "",
						stage: "success",
					}))
					setModelId((event.modelId as string) ?? modelId)
					setIsAuthenticated(true)
					setLoggedInProviders((prev) => {
						const next = new Set(prev)
						next.add(pid)
						return next
					})
					break
				}
				case "login_error":
					setLoginState((prev) => ({
						providerId: (event.providerId as string) ?? prev?.providerId ?? "",
						stage: "error",
						errorMessage: event.error as string,
					}))
					break
				case "project_changed": {
					// The old harness is now destroyed — if it had an active agent,
					// move it from spinning to glowing (unread)
					const oldPath = projectInfoRef.current?.rootPath
					if (oldPath) {
						setActiveWorktrees((prev) => {
							if (!prev.has(oldPath)) return prev
							setUnreadWorktrees((up) => new Set(up).add(oldPath))
							const next = new Set(prev)
							next.delete(oldPath)
							return next
						})
					}
                    const proj = event.project as ProjectInfo
                    const resumeThreadId = event.currentThreadId as string | undefined
                    setProjectInfo(proj)
                    setOpenFiles([])
                    setTokenUsage({ promptTokens: 0, completionTokens: 0, totalTokens: 0 })
                    loadPRStatus()
                    // Fetch token usage from the new harness
                    window.api.invoke({ type: "getTokenUsage" }).then((usage) => {
                        if (usage) setTokenUsage(usage as TokenUsage)
                    }).catch(() => {})
                    if (resumeThreadId) {
                        // Fast path: session already had an active thread — restore it
                        setCurrentThreadId(resumeThreadId)
                        setOpenThreadTabs([resumeThreadId])
                        setActiveTab(`thread:${resumeThreadId}`)
                        loadMessages()
                        loadThreads()
                    } else {
                        // Slow path: new session, clear and load from scratch
                        dispatch({ type: "CLEAR" })
                        setCurrentThreadId(null)
                        setThreads([])
                        setOpenThreadTabs([])
                        setActiveTab("chat")
                        // Load threads and auto-open the most recent one
                        loadThreads().then(async (loaded) => {
                            if (loaded && loaded.length > 0) {
                                const recent = loaded[0]
                                await window.api.invoke({ type: "switchThread", threadId: recent.id })
                                setCurrentThreadId(recent.id)
                                setOpenThreadTabs([recent.id])
                                setActiveTab(`thread:${recent.id}`)
                            }
                        })
                    }
                    break
				}
			}
		})

		// Load initial state
		initializeApp()

		return unsubscribe
	}, [])

	// Keyboard shortcuts
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			const isMod = e.metaKey || e.ctrlKey
			// Cmd+` toggle right sidebar (terminal is pinned there)
			if (isMod && e.key === "`") {
				e.preventDefault()
				setRightSidebarVisible((v) => !v)
			}
			// Cmd+B toggle left sidebar
			if (isMod && e.key === "b") {
				e.preventDefault()
				setSidebarVisible((v) => !v)
			}
			// Cmd+Shift+E toggle right sidebar
			if (isMod && e.shiftKey && e.key === "E") {
				e.preventDefault()
				setRightSidebarVisible((v) => !v)
			}
			// Cmd+Shift+G focus git tab in right sidebar
			if (isMod && e.shiftKey && e.key === "G") {
				e.preventDefault()
				setRightSidebarVisible(true)
				setRightSidebarTab("git")
			}
			// Cmd+O open folder
			if (isMod && e.key === "o") {
				e.preventDefault()
				handleOpenFolder()
			}
			// Cmd+, open settings
			if (isMod && e.key === ",") {
				e.preventDefault()
				setActiveTab(activeTab === "settings" ? "chat" : "settings")
			}
			// Cmd+W close active file tab
			if (isMod && e.key === "w" && activeTab !== "chat") {
				e.preventDefault()
				handleCloseTab(activeTab)
			}
		}
		window.addEventListener("keydown", handleKeyDown)
		return () => window.removeEventListener("keydown", handleKeyDown)
	}, [activeTab])

	// Sync harness thread when active tab changes to a thread tab
	useEffect(() => {
		if (activeTab.startsWith("thread:")) {
			const threadId = activeTab.slice(7)
			if (threadId !== currentThreadId) {
				window.api.invoke({ type: "switchThread", threadId })
			}
		}
	}, [activeTab])

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
			}

			const state = (await window.api.invoke({ type: "getState" })) as {
				currentModelId?: string
				notifications?: string
				tasks?: Array<{
					content: string
					status: "pending" | "in_progress" | "completed"
					activeForm: string
				}>
			}
			if (state?.currentModelId) setModelId(state.currentModelId)
			if (state?.tasks) setTasks(state.tasks)
			if (state?.notifications) notificationPrefRef.current = state.notifications

			const usage = (await window.api.invoke({
				type: "getTokenUsage",
			})) as TokenUsage
			if (usage) setTokenUsage(usage)

			// Check if any provider is authenticated
			const loggedIn = (await window.api.invoke({
				type: "getLoggedInProviders",
			})) as string[]
			if (loggedIn?.length > 0) {
				setLoggedInProviders(new Set(loggedIn))
			}
			setIsAuthenticated(
				(loggedIn && loggedIn.length > 0) ||
					!!state?.currentModelId,
			)

			// Load project info
			try {
				const proj = (await window.api.invoke({
					type: "getProjectInfo",
				})) as ProjectInfo
				if (proj) setProjectInfo(proj)
			} catch {
				// ignore
			}

			// Load enriched projects
			await loadEnrichedProjects()

			await loadMessages()

			// Load PR status for current branch
			loadPRStatus()
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
			// Thread list fetch failed — will retry on next event
			return undefined
		}
	}

	async function loadEnrichedProjects() {
		try {
			const projects = (await window.api.invoke({
				type: "getRecentProjects",
			})) as EnrichedProject[]
			if (projects) {
				setEnrichedProjects(projects)
				loadWorktreeStatuses(projects)
			}
		} catch {
			// ignore
		}
	}

	async function loadPRStatus() {
		try {
			const result = (await window.api.invoke({ type: "getPRStatus" })) as {
				exists: boolean
				number?: number
				title?: string
				state?: string
				url?: string
				isDraft?: boolean
				checks?: "pending" | "passing" | "failing" | "none"
			}
			setPrStatus(result)
		} catch {
			setPrStatus(null)
		}
	}

	async function loadWorktreeStatuses(projects?: EnrichedProject[]) {
		const projectList = projects || enrichedProjects
		if (projectList.length === 0) return

		const statusMap = new Map<string, "in_progress" | "in_review" | "done" | "archived">()
		// Process each repo group
		for (const project of projectList) {
			if (project.isWorktree || project.worktrees.length === 0) continue
			try {
				const result = (await window.api.invoke({
					type: "getWorktreePRStatuses",
					repoPath: project.rootPath,
					worktrees: project.worktrees,
				})) as Record<string, { exists: boolean; state?: string }>
				for (const [wtPath, pr] of Object.entries(result)) {
					if (!pr.exists) {
						statusMap.set(wtPath, "in_progress")
					} else if (pr.state === "merged") {
						statusMap.set(wtPath, "done")
					} else if (pr.state === "open") {
						statusMap.set(wtPath, "in_review")
					} else if (pr.state === "closed") {
						statusMap.set(wtPath, "archived")
					} else {
						statusMap.set(wtPath, "in_progress")
					}
				}
			} catch {
				// ignore per-repo failures
			}
		}
		setWorktreeStatuses(statusMap)
	}

	const handleSend = useCallback(async (content: string) => {
		// Ensure AudioContext is created during this user gesture
		ensureAudioContext()

		let finalContent = content

		// Process slash commands
		if (content.startsWith("/")) {
			const spaceIndex = content.indexOf(" ")
			const commandName =
				spaceIndex === -1 ? content.slice(1) : content.slice(1, spaceIndex)
			const args =
				spaceIndex === -1
					? []
					: content
							.slice(spaceIndex + 1)
							.trim()
							.split(/\s+/)

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

		// Optimistically add the user message (harness doesn't emit message_start for user messages)
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
		// Open as tab if not already open
		setOpenThreadTabs((prev) =>
			prev.includes(threadId) ? prev : [...prev, threadId],
		)
		setActiveTab(`thread:${threadId}`)
	}, [])

	const handleNewThread = useCallback(async () => {
		const thread = (await window.api.invoke({ type: "createThread" })) as { id: string } | undefined
		dispatch({ type: "CLEAR" })
		// The thread_created event will set currentThreadId
		// Open it as a tab too
		if (thread?.id) {
			setOpenThreadTabs((prev) =>
				prev.includes(thread.id) ? prev : [...prev, thread.id],
			)
			setActiveTab(`thread:${thread.id}`)
		}
	}, [])

	const handleDeleteThread = useCallback(async (threadId: string) => {
		await window.api.invoke({ type: "deleteThread", threadId })
		// Close its tab if open
		setOpenThreadTabs((prev) => prev.filter((id) => id !== threadId))
		if (activeTab === `thread:${threadId}`) {
			setActiveTab("chat")
		}
		if (currentThreadId === threadId) {
			setCurrentThreadId(null)
			dispatch({ type: "CLEAR" })
		}
		loadThreads()
	}, [currentThreadId, activeTab])

	const handleApprove = useCallback(
		async (toolCallId: string) => {
			await window.api.invoke({ type: "approveToolCall", toolCallId })
			setPendingApproval(null)
		},
		[],
	)

	const handleDecline = useCallback(
		async (toolCallId: string) => {
			await window.api.invoke({ type: "declineToolCall", toolCallId })
			setPendingApproval(null)
		},
		[],
	)

	const handleAlwaysAllow = useCallback(
		async (toolCallId: string, category: string) => {
			await window.api.invoke({
				type: "approveToolCallAlwaysCategory",
				toolCallId,
				category,
			})
			setPendingApproval(null)
		},
		[],
	)

	const handleQuestionResponse = useCallback(
		async (questionId: string, answer: string) => {
			await window.api.invoke({
				type: "respondToQuestion",
				questionId,
				answer,
			})
			setPendingQuestion(null)
		},
		[],
	)

	const handlePlanResponse = useCallback(
		async (
			planId: string,
			response: { action: "approved" | "rejected"; feedback?: string },
		) => {
			await window.api.invoke({
				type: "respondToPlanApproval",
				planId,
				response,
			})
			setPendingPlan(null)
		},
		[],
	)

	const handleSwitchModel = useCallback(
		async (newModelId: string) => {
			await window.api.invoke({
				type: "switchModel",
				modelId: newModelId,
				scope: "global",
			})
			setShowModelSelector(false)
		},
		[],
	)

	const handleLogin = useCallback(async (providerId: string) => {
		setLoginState({ providerId, stage: "auth" })
		await window.api.invoke({ type: "login", providerId })
	}, [])

	const handleLoginSubmitCode = useCallback((code: string) => {
		window.api.respondToLoginPrompt(code)
	}, [])

	const handleLoginCancel = useCallback(() => {
		window.api.cancelLoginPrompt()
	}, [])

	const handleLoginClose = useCallback(() => {
		setLoginState(null)
	}, [])


	// File editor handlers
	const handleFileClick = useCallback((filePath: string) => {
		setOpenFiles((prev) =>
			prev.includes(filePath) ? prev : [...prev, filePath],
		)
		setActiveTab(filePath)
	}, [])

	const handleCloseTab = useCallback((tabId: string) => {
		if (tabId.startsWith("thread:")) {
			const threadId = tabId.slice(7)
			setOpenThreadTabs((prev) => {
				const next = prev.filter((id) => id !== threadId)
				setActiveTab((current) => {
					if (current !== tabId) return current
					// Switch to another open thread tab, or "chat"
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

	// Diff handler: opens a diff tab (prefixed with "diff:")
	const handleDiffClick = useCallback((filePath: string) => {
		const tabId = "diff:" + filePath
		setOpenFiles((prev) =>
			prev.includes(tabId) ? prev : [...prev, tabId],
		)
		setActiveTab(tabId)
	}, [])

	// Project handlers
    const handleSwitchProject = useCallback(async (switchPath: string) => {
		// Always clear unread when clicking a worktree
		setUnreadWorktrees((prev) => {
			if (!prev.has(switchPath)) return prev
			const next = new Set(prev)
			next.delete(switchPath)
			return next
		})
        if (switchPath === projectInfoRef.current?.rootPath) return
        // Clear active for the project we're switching TO
		setActiveWorktrees((prev) => {
			const next = new Set(prev)
			next.delete(switchPath)
			return next
		})
        await window.api.invoke({ type: "switchProject", path: switchPath })
	}, [])

	const handleOpenFolder = useCallback(async () => {
		try {
			const result = (await window.api.invoke({
				type: "openFolderDialog",
			})) as { path: string } | null
			if (result?.path) {
				await window.api.invoke({ type: "switchProject", path: result.path })
				await loadEnrichedProjects()
			}
		} catch {
			// user cancelled
		}
	}, [])

	const handleRemoveProject = useCallback(async (projectPath: string) => {
		await window.api.invoke({ type: "removeRecentProject", path: projectPath })
		loadEnrichedProjects()
	}, [])

	const handleStartWorkOnIssue = useCallback(async (issue: LinearIssue, workflowStates: WorkflowStates) => {
		const rootPath = projectInfoRef.current?.rootPath
		if (!rootPath) return

		// Save Linear credentials BEFORE switching projects (new session won't have them yet)
		const parentState = (await window.api.invoke({ type: "getState" })) as Record<string, unknown>
		const apiKey = (parentState?.linearApiKey as string) ?? ""
		const teamId = (parentState?.linearTeamId as string) ?? ""

		// Slugify: "ENG-123" + "Fix login bug" -> "eng-123-fix-login-bug"
		const slug = `${issue.identifier}-${issue.title}`
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "")
			.slice(0, 60)

		// Get the main repo path from enrichedProjects (worktrees can't create worktrees)
		const currentProject = enrichedProjects.find((p) => p.rootPath === rootPath)
		const mainRepoPath = currentProject?.isWorktree
			? currentProject.mainRepoPath ?? rootPath
			: rootPath

		// Create worktree with the issue-based branch name
		const result = (await window.api.invoke({
			type: "createWorktree",
			repoPath: mainRepoPath,
			branchName: slug,
		})) as { success: boolean; path?: string; error?: string }

		if (!result.success || !result.path) {
			console.error("Failed to create worktree:", result.error)
			return
		}

		// Switch to the new worktree
		dispatch({ type: "CLEAR" })
		setOpenThreadTabs([])
		setOpenFiles([])
		setActiveTab("chat")
		setThreads([])
		await window.api.invoke({ type: "switchProject", path: result.path })

		// Link the Linear issue to this worktree (passes parent credentials)
		await window.api.invoke({
			type: "linkLinearIssue",
			issueId: issue.id,
			issueIdentifier: issue.identifier,
			doneStateId: workflowStates.doneStateId,
			startedStateId: workflowStates.startedStateId,
			linearApiKey: apiKey,
			linearTeamId: teamId,
		})

		// Refresh linked issues
		await loadLinkedIssues()
	}, [loadLinkedIssues, enrichedProjects])

	const handleStartWorkOnGithubIssue = useCallback(async (issue: GitHubIssue) => {
		const rootPath = projectInfoRef.current?.rootPath
		if (!rootPath) return

		const parentState = (await window.api.invoke({ type: "getState" })) as Record<string, unknown>
		const token = (parentState?.githubToken as string) ?? ""
		const owner = (parentState?.githubOwner as string) ?? ""
		const repo = (parentState?.githubRepo as string) ?? ""

		// Slugify: "#123" + "Fix login bug" -> "123-fix-login-bug"
		const slug = `${issue.number}-${issue.title}`
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "")
			.slice(0, 60)

		const currentProject = enrichedProjects.find((p) => p.rootPath === rootPath)
		const mainRepoPath = currentProject?.isWorktree
			? currentProject.mainRepoPath ?? rootPath
			: rootPath

		const result = (await window.api.invoke({
			type: "createWorktree",
			repoPath: mainRepoPath,
			branchName: slug,
		})) as { success: boolean; path?: string; error?: string }

		if (!result.success || !result.path) {
			console.error("Failed to create worktree:", result.error)
			return
		}

		dispatch({ type: "CLEAR" })
		setOpenThreadTabs([])
		setOpenFiles([])
		setActiveTab("chat")
		setThreads([])
		await window.api.invoke({ type: "switchProject", path: result.path })

		await window.api.invoke({
			type: "linkGithubIssue",
			issueNumber: issue.number,
			issueTitle: issue.title,
			githubToken: token,
			owner,
			repo,
		})

		await loadLinkedIssues()
	}, [loadLinkedIssues, enrichedProjects])

	const handleDeleteWorktree = useCallback(async (worktreePath: string) => {
		// Find a sibling worktree or parent repo to switch to before deleting
		const isCurrentProject = projectInfoRef.current?.rootPath === worktreePath
		let switchTo: string | null = null
		if (isCurrentProject) {
			for (const p of enrichedProjects) {
				// Find the parent group that contains this worktree
				const parentPath = p.mainRepoPath || p.rootPath
				const siblings = p.worktrees?.filter((wt) => wt.path !== worktreePath) ?? []
				const isChild = p.worktrees?.some((wt) => wt.path === worktreePath)
				if (isChild) {
					switchTo = siblings.length > 0 ? siblings[0].path : parentPath
					break
				}
			}
		}

		const result = (await window.api.invoke({
			type: "deleteWorktree",
			worktreePath,
		})) as { success: boolean; error?: string }
		if (result.success) {
			if (switchTo) {
				await window.api.invoke({ type: "switchProject", path: switchTo })
			}
			await loadEnrichedProjects()
		}
	}, [enrichedProjects])

	const handleCreateWorktree = useCallback(async (repoPath: string) => {
		const result = (await window.api.invoke({
			type: "createWorktree",
			repoPath,
		})) as { success: boolean; path?: string; error?: string }
		if (result.success && result.path) {
			await window.api.invoke({ type: "switchProject", path: result.path })
			await loadEnrichedProjects()
		}
	}, [])

	const handleOpenModelSelector = useCallback(() => {
		setShowModelSelector(true)
	}, [])

	return (
		<div
			style={{
				display: "flex",
				height: "100vh",
				overflow: "hidden",
			}}
		>
			{/* Left sidebar: projects + threads */}
			<Sidebar
				threads={threads}
				currentThreadId={currentThreadId}
				loggedInProviders={loggedInProviders}
				projectName={projectInfo?.name ?? ""}
				sidebarVisible={sidebarVisible}
				enrichedProjects={enrichedProjects}
				activeProjectPath={projectInfo?.rootPath ?? null}
				isAgentActive={chat.isAgentActive}
				activeWorktrees={activeWorktrees}
				unreadWorktrees={unreadWorktrees}
				worktreeStatuses={worktreeStatuses}
				linkedIssues={linkedIssues}
				onSwitchThread={handleSwitchThread}
				onNewThread={handleNewThread}
				onDeleteThread={handleDeleteThread}
				onLogin={handleLogin}
				onSwitchProject={handleSwitchProject}
				onOpenFolder={handleOpenFolder}
				onRemoveProject={handleRemoveProject}
				onCreateWorktree={handleCreateWorktree}
				onDeleteWorktree={handleDeleteWorktree}
				onOpenSettings={() => setActiveTab("settings")}
				onOpenTasks={() => setActiveTab("tasks")}
				isSettingsActive={activeTab === "settings"}
				isTasksActive={activeTab === "tasks"}
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
				{/* Tab bar / title bar */}
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
					{/* Thread tabs */}
					{openThreadTabs.length === 0 ? (
						/* Fallback: no threads open */
						<button
							className="titlebar-no-drag"
							onClick={() => setActiveTab("chat")}
							style={{
								display: "flex",
								alignItems: "center",
								gap: 6,
								padding: "0 16px",
								fontSize: 11,
								fontWeight: 500,
								color: "var(--text)",
								background: "var(--bg)",
								borderBottom: "2px solid var(--accent)",
								cursor: "pointer",
							}}
						>
							New Thread
						</button>
					) : (
						openThreadTabs.map((threadId) => {
							const thread = threads.find((t) => t.id === threadId)
							const tabId = `thread:${threadId}`
							const isActive = activeTab === tabId
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
											setActiveTab(tabId)
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
											handleCloseTab(tabId)
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

					{/* Open file/diff tabs */}
					{openFiles.map((tabId) => {
						const isDiff = tabId.startsWith("diff:")
						const filePath = isDiff
							? tabId.slice(5)
							: tabId
						const fileName =
							filePath.split("/").pop() || filePath
						const isActive = activeTab === tabId
						return (
							<div
								key={tabId}
								style={{
									display: "flex",
									alignItems: "center",
									gap: 4,
									background: isActive
										? "var(--bg)"
										: "transparent",
									borderBottom: isActive
										? "2px solid var(--accent)"
										: "2px solid transparent",
								}}
							>
								<button
									className="titlebar-no-drag"
									onClick={() => setActiveTab(tabId)}
									style={{
										padding: "0 4px 0 12px",
										fontSize: 11,
										fontWeight: 500,
										color: isActive
											? "var(--text)"
											: "var(--muted)",
										cursor: "pointer",
										transition: "color 0.1s",
										display: "flex",
										alignItems: "center",
										gap: 4,
									}}
								>
									{isDiff && (
										<span
											style={{
												fontSize: 9,
												color: "var(--warning)",
												fontWeight: 700,
											}}
										>
											M
										</span>
									)}
									{fileName}
								</button>
								<button
									className="titlebar-no-drag"
									onClick={(e) => {
										e.stopPropagation()
										handleCloseTab(tabId)
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

					{/* Spacer (draggable) */}
					<div style={{ flex: 1 }} />

					{/* PR button — status-aware */}
					{projectInfo?.gitBranch && projectInfo.gitBranch !== "main" && projectInfo.gitBranch !== "master" && (() => {
						const pr = prStatus
						const hasOpenPR = pr?.exists && (pr.state === "open")
						const isMerged = pr?.exists && pr.state === "merged"

						// Determine label and color
						let label = "Create PR"
						let dotColor = ""
						let titleText = "Create PR from current branch"

						if (hasOpenPR) {
							label = `#${pr.number}`
							titleText = `${pr.title} — ${pr.url}`
							if (pr.checks === "passing") {
								dotColor = "var(--success)"
								label += " passing"
							} else if (pr.checks === "failing") {
								dotColor = "var(--error)"
								label += " failing"
							} else if (pr.checks === "pending") {
								dotColor = "var(--warning)"
								label += " pending"
							}
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
									<span style={{
										width: 6,
										height: 6,
										borderRadius: "50%",
										background: dotColor,
										flexShrink: 0,
									}} />
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

					{/* Right sidebar toggle */}
					<button
						className="titlebar-no-drag"
						onClick={() =>
							setRightSidebarVisible((v) => !v)
						}
						style={{
							display: "flex",
							alignItems: "center",
							padding: "0 10px",
							color: rightSidebarVisible
								? "var(--text)"
								: "var(--muted)",
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

				{isAuthenticated === false ? (
					<WelcomeScreen onLogin={handleLogin} />
				) : (
					<>
						{/* Chat view (visible for "chat" tab or thread tabs) */}
						<div
							onMouseDown={() => {
								const p = projectInfoRef.current?.rootPath
								if (p) {
									setUnreadWorktrees((prev) => {
										if (!prev.has(p)) return prev
										const next = new Set(prev)
										next.delete(p)
										return next
									})
								}
							}}
							style={{
								flex: 1,
								display:
									activeTab === "chat" || activeTab.startsWith("thread:")
										? "flex"
										: "none",
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
							/>
						</div>

						{/* Settings page */}
						{activeTab === "settings" && <Settings onClose={() => setActiveTab("chat")} />}

						{/* Task board */}
						{activeTab === "tasks" && <TaskBoard agentTasks={tasks} onClose={() => setActiveTab("chat")} onStartWork={handleStartWorkOnIssue} onStartWorkGithub={handleStartWorkOnGithubIssue} linkedIssues={linkedIssues} onSwitchToWorktree={handleSwitchProject} />}

						{/* File or diff editor (when a file/diff tab is active) */}
						{activeTab !== "chat" && activeTab !== "settings" && activeTab !== "tasks" && !activeTab.startsWith("thread:") &&
							(activeTab.startsWith("diff:") ? (
								<DiffEditor
									filePath={activeTab.slice(5)}
									onClose={() =>
										handleCloseTab(activeTab)
									}
									onOpenFile={handleFileClick}
								/>
							) : (
								<FileEditor
									filePath={activeTab}
									onClose={() =>
										handleCloseTab(activeTab)
									}
								/>
							))}

					</>
				)}

				{/* Status bar */}
				<StatusBar
					modeId={modeId}
					modelId={modelId}
					tokenUsage={tokenUsage}
					isAgentActive={chat.isAgentActive}
					projectName={projectInfo?.name}
					gitBranch={projectInfo?.gitBranch}
					onOpenModelSelector={handleOpenModelSelector}
				/>
			</div>

			{/* Right sidebar: Files + Git + Terminal */}
			<RightSidebar
				visible={rightSidebarVisible}
				activeTab={rightSidebarTab}
				onTabChange={setRightSidebarTab}
				projectName={projectInfo?.name ?? ""}
				projectPath={projectInfo?.rootPath ?? null}
				onFileClick={handleFileClick}
				onDiffClick={handleDiffClick}
				activeFilePath={openFiles.includes(activeTab) ? activeTab : null}
				activeDiffPath={activeTab.startsWith("diff:") ? activeTab.slice(5) : null}
			/>

			{/* Modal dialogs */}
			{pendingApproval && (
				<ToolApprovalDialog
					toolCallId={pendingApproval.toolCallId}
					toolName={pendingApproval.toolName}
					args={pendingApproval.args}
					category={pendingApproval.category}
					categoryLabel={pendingApproval.categoryLabel}
					onApprove={handleApprove}
					onDecline={handleDecline}
					onAlwaysAllow={handleAlwaysAllow}
				/>
			)}

			{pendingQuestion && (
				<AskQuestionDialog
					questionId={pendingQuestion.questionId}
					question={pendingQuestion.question}
					options={pendingQuestion.options}
					onRespond={handleQuestionResponse}
				/>
			)}

			{pendingPlan && (
				<PlanApproval
					planId={pendingPlan.planId}
					title={pendingPlan.title}
					plan={pendingPlan.plan}
					onRespond={handlePlanResponse}
				/>
			)}

			{showModelSelector && (
				<ModelSelector
					currentModelId={modelId}
					onSelect={handleSwitchModel}
					onClose={() => setShowModelSelector(false)}
				/>
			)}


			{loginState && (
				<LoginDialog
					providerId={loginState.providerId}
					stage={loginState.stage}
					url={loginState.url}
					instructions={loginState.instructions}
					promptMessage={loginState.promptMessage}
					promptPlaceholder={loginState.promptPlaceholder}
					progressMessage={loginState.progressMessage}
					errorMessage={loginState.errorMessage}
					onSubmitCode={handleLoginSubmitCode}
					onCancel={handleLoginCancel}
					onClose={handleLoginClose}
				/>
			)}
		</div>
	)
}
