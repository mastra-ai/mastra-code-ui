import { useState, useCallback, useReducer, useEffect, useRef, useMemo } from "react"
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
import { FileEditor, type FileEditorHandle } from "./components/FileEditor"
import { DiffEditor } from "./components/DiffEditor"
import { AgentDashboard } from "./components/AgentDashboard"
import { CommandPalette, type CommandItem } from "./components/CommandPalette"
import { QuickFileOpen } from "./components/QuickFileOpen"
import { BrowserView } from "./components/BrowserView"
import type { EnrichedProject } from "./components/ProjectList"
import type {
	HarnessEventPayload,
	Message,
	TokenUsage,
	ThreadInfo,
	OMProgressState,
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
			// Skip if we already have a message with this ID (the harness emits
			// message_start on every text-start chunk, so multi-step agentic
			// turns fire it multiple times for the same message)
			if (state.messages.some((m) => m.id === action.message.id)) {
				return {
					...state,
					// Still update the message content (it may have new content blocks)
					messages: state.messages.map((m) =>
						m.id === action.message.id ? action.message : m,
					),
					streamingMessageId:
						action.message.role === "assistant" ? action.message.id : null,
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
	const [settingsSection, setSettingsSection] = useState<string | undefined>(undefined)
	const [dirtyFiles, setDirtyFiles] = useState<Set<string>>(new Set()) // file tabs with unsaved changes
	const [pendingCloseTab, setPendingCloseTab] = useState<string | null>(null) // tab waiting for unsaved-changes confirmation
	const fileEditorRef = useRef<FileEditorHandle>(null)

	// Command palette & quick file open state
	const [showCommandPalette, setShowCommandPalette] = useState(false)
	const [showQuickFileOpen, setShowQuickFileOpen] = useState(false)

	// Clone repo modal state
	const [showCloneModal, setShowCloneModal] = useState(false)
	const [cloneUrl, setCloneUrl] = useState("")
	const [cloneDest, setCloneDest] = useState("")
	const [cloning, setCloning] = useState(false)

	// Project state
	const [projectInfo, setProjectInfo] = useState<ProjectInfo | null>(null)
	const [enrichedProjects, setEnrichedProjects] = useState<EnrichedProject[]>([])
	const [unreadWorktrees, setUnreadWorktrees] = useState<Set<string>>(new Set())
	const [activeWorktrees, setActiveWorktrees] = useState<Set<string>>(new Set())
	const [projectSwitching, setProjectSwitching] = useState(false)
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
	const notificationPrefRef = useRef<string>("both")

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
					window.api.invoke({ type: "getOMProgress" }).then((progress) => {
						setOMProgress((progress as OMProgressState) ?? null)
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
				case "om_status":
				case "om_observation_start":
				case "om_observation_end":
				case "om_observation_failed":
				case "om_reflection_start":
				case "om_reflection_end":
				case "om_reflection_failed":
				case "om_buffering_start":
				case "om_buffering_end":
				case "om_buffering_failed":
				case "om_activation":
					if (isActiveWorktree) {
						window.api.invoke({ type: "getOMProgress" }).then((progress) => {
							setOMProgress((progress as OMProgressState) ?? null)
						}).catch(() => {})
					}
					break
				case "om_model_changed":
					if (isActiveWorktree) {
						const role = event.role as string
						const mid = event.modelId as string
						if (role && mid) {
							setOMModelIds((prev) => ({
								...prev,
								[role === "observer" ? "observer" : "reflector"]: mid,
							}))
						}
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
					const errorText = err?.message ?? String(event.error ?? "Unknown error")
					console.error("Harness error:", errorText)
					dispatch({
						type: "MESSAGE_START",
						message: {
							id: `error-${Date.now()}`,
							role: "assistant",
							content: [{ type: "text", text: errorText }],
							createdAt: new Date().toISOString(),
							stopReason: "error",
							errorMessage: errorText,
						},
					})
					dispatch({ type: "AGENT_END" })
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
					else if (action === "command_palette")
						setShowCommandPalette((v) => !v)
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
					console.log("[AUTH] login_success event, providerId:", pid, "modelId:", event.modelId)
					setLoginState((prev) => ({
						providerId: pid || prev?.providerId || "",
						stage: "success",
					}))
					setModelId((event.modelId as string) ?? modelId)
					setIsAuthenticated(true)
					setLoggedInProviders((prev) => {
						const next = new Set(prev)
						next.add(pid)
						console.log("[AUTH] loggedInProviders updated:", [...next])
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
                    setProjectSwitching(false)
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

		// Listen for URLs intercepted by the main process (clicked links in chat, etc.)
		const unsubscribeUrl = window.api.onOpenUrl((url: string) => {
			handleBrowserOpenRef.current(url)
		})

		return () => {
			unsubscribe()
			unsubscribeUrl()
		}
	}, [])

	// Keyboard shortcuts
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			const isMod = e.metaKey || e.ctrlKey
			// Cmd+K toggle command palette
			if (isMod && e.key === "k") {
				e.preventDefault()
				setShowCommandPalette((v) => !v)
				return
			}
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
			// Cmd+P quick file opener
			if (isMod && e.key === "p") {
				e.preventDefault()
				setShowQuickFileOpen((v) => !v)
			}
			// Cmd+1 through Cmd+9 workspace switcher
			if (isMod && !e.shiftKey && !e.altKey && e.key >= "1" && e.key <= "9") {
				e.preventDefault()
				const index = parseInt(e.key) - 1
				if (index < enrichedProjects.length) {
					handleSwitchProject(enrichedProjects[index].rootPath)
				}
			}
			// Cmd+Alt+Up/Down workspace cycling
			if (isMod && e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
				e.preventDefault()
				if (enrichedProjects.length > 1 && projectInfo?.rootPath) {
					const currentIdx = enrichedProjects.findIndex((p) => p.rootPath === projectInfo.rootPath)
					if (currentIdx !== -1) {
						const delta = e.key === "ArrowDown" ? 1 : -1
						const nextIdx = (currentIdx + delta + enrichedProjects.length) % enrichedProjects.length
						handleSwitchProject(enrichedProjects[nextIdx].rootPath)
					}
				}
			}
		}
		window.addEventListener("keydown", handleKeyDown)
		return () => window.removeEventListener("keydown", handleKeyDown)
	}, [activeTab, enrichedProjects, projectInfo])

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
                if (session.currentThreadId) {
                    setOpenThreadTabs([session.currentThreadId])
                    setActiveTab(`thread:${session.currentThreadId}`)
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
			if (state?.notifications) notificationPrefRef.current = state.notifications
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

			// Fetch initial OM progress
			window.api.invoke({ type: "getOMProgress" }).then((progress) => {
				setOMProgress((progress as OMProgressState) ?? null)
			}).catch(() => {})

			// Check if any provider is authenticated
			const loggedIn = (await window.api.invoke({
				type: "getLoggedInProviders",
			})) as string[]
			console.log("[AUTH] getLoggedInProviders result:", loggedIn)
			console.log("[AUTH] state?.currentModelId:", state?.currentModelId)
			if (loggedIn?.length > 0) {
				setLoggedInProviders(new Set(loggedIn))
			}
			setIsAuthenticated(loggedIn && loggedIn.length > 0)

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

	const handleApiKey = useCallback(async (providerId: string, apiKey: string) => {
		try {
			await window.api.invoke({ type: "setApiKey", providerId, apiKey })
		} catch (err) {
			console.error("Failed to set API key:", err)
		}
	}, [])

	const handleSkipLogin = useCallback(async () => {
		// Set a gateway model and bypass login
		await window.api.invoke({
			type: "switchModel",
			modelId: "google/gemini-2.5-flash",
			scope: "global",
		})
		setModelId("google/gemini-2.5-flash")
		setIsAuthenticated(true)
	}, [])

	const handleLoginSubmitCode = useCallback((code: string) => {
		window.api.respondToLoginPrompt(code)
	}, [])

	const handleLogout = useCallback(async (providerId: string) => {
		await window.api.invoke({ type: "logout", providerId })
		setLoggedInProviders((prev) => {
			const next = new Set(prev)
			next.delete(providerId)
			return next
		})
	}, [])

	const handleLoginCancel = useCallback(() => {
		window.api.cancelLoginPrompt()
	}, [])

	const handleLoginClose = useCallback(() => {
		setLoginState(null)
	}, [])


	// Track dirty state per file tab
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

	// File editor handlers
	const handleFileClick = useCallback((filePath: string) => {
		setOpenFiles((prev) =>
			prev.includes(filePath) ? prev : [...prev, filePath],
		)
		setActiveTab(filePath)
	}, [])

	const forceCloseTab = useCallback((tabId: string) => {
		// Clear dirty state for file tabs
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

	const handleCloseTab = useCallback((tabId: string) => {
		// Check for unsaved changes in file editor tabs (not diff or thread tabs)
		if (!tabId.startsWith("thread:") && !tabId.startsWith("diff:") && dirtyFiles.has(tabId)) {
			setPendingCloseTab(tabId)
			return
		}
		forceCloseTab(tabId)
	}, [dirtyFiles, forceCloseTab])

	// Diff handler: opens a diff tab (prefixed with "diff:")
	const handleDiffClick = useCallback((filePath: string) => {
		const tabId = "diff:" + filePath
		setOpenFiles((prev) =>
			prev.includes(tabId) ? prev : [...prev, tabId],
		)
		setActiveTab(tabId)
	}, [])

	// Browser handler: opens a browser tab (prefixed with "browser:")
	const handleBrowserOpenRef = useRef<(url: string) => void>(() => {})
	const handleBrowserOpen = useCallback((url: string) => {
		const tabId = "browser:" + url
		// If there's already a browser tab open, reuse it
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
        setProjectSwitching(true)
        await window.api.invoke({ type: "switchProject", path: switchPath })
	}, [])

	const handleOpenFolder = useCallback(async () => {
		try {
			const result = (await window.api.invoke({
				type: "openFolderDialog",
			})) as { path: string } | null
			if (result?.path) {
				setProjectSwitching(true)
				await window.api.invoke({ type: "switchProject", path: result.path })
				await loadEnrichedProjects()
			}
		} catch {
			// user cancelled
		}
	}, [])

	const handleShowCloneModal = useCallback(async () => {
		setShowCloneModal(true)
		setCloneUrl("")
		try {
			const st = (await window.api.invoke({ type: "getState" })) as { defaultClonePath?: string }
			setCloneDest(st?.defaultClonePath || "")
		} catch {
			setCloneDest("")
		}
	}, [])

	const handleBrowseCloneDest = useCallback(async () => {
		try {
			const result = (await window.api.invoke({
				type: "browseFolder",
				title: "Choose clone destination",
				defaultPath: cloneDest || undefined,
			})) as { path?: string; cancelled?: boolean }
			if (result?.path) setCloneDest(result.path)
		} catch {
			// user cancelled
		}
	}, [cloneDest])

	const handleCloneSubmit = useCallback(async () => {
		if (!cloneUrl.trim() || !cloneDest.trim() || cloning) return
		setCloning(true)
		try {
			const result = (await window.api.invoke({
				type: "cloneRepository",
				url: cloneUrl.trim(),
				dest: cloneDest.trim(),
			})) as { path?: string; cancelled?: boolean }
			if (result?.path) {
				setProjectSwitching(true)
				await window.api.invoke({ type: "switchProject", path: result.path })
				await loadEnrichedProjects()
			}
			setShowCloneModal(false)
			setCloneUrl("")
			setCloneDest("")
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err)
			console.error("[CLONE]", msg)
		} finally {
			setCloning(false)
		}
	}, [cloneUrl, cloneDest, cloning])

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
		setProjectSwitching(true)
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
		setProjectSwitching(true)
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
				setProjectSwitching(true)
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
			setProjectSwitching(true)
			await window.api.invoke({ type: "switchProject", path: result.path })
			await loadEnrichedProjects()
		}
	}, [])

	const handleOpenModelSelector = useCallback(() => {
		setShowModelSelector(true)
	}, [])

	const handleToggleThinking = useCallback(async () => {
		const newLevel = thinkingLevel === "off" ? "medium" : "off"
		setThinkingLevel(newLevel)
		await window.api.invoke({ type: "setThinkingLevel", level: newLevel })
	}, [thinkingLevel])

	const handleTogglePlanning = useCallback(async () => {
		const newMode = modeId === "plan" ? "build" : "plan"
		await window.api.invoke({ type: "switchMode", modeId: newMode })
	}, [modeId])

	// Command palette items
	const commandPaletteItems = useMemo((): CommandItem[] => {
		const close = () => setShowCommandPalette(false)
		const items: CommandItem[] = []

		// Navigation
		items.push({ id: "settings", label: "Open Settings", group: "Navigation", shortcut: "\u2318,", action: () => { setActiveTab("settings"); close() } })
		items.push({ id: "tasks", label: "Open Task Board", group: "Navigation", action: () => { setActiveTab("tasks"); close() } })
		items.push({ id: "agents", label: "Open Agent Dashboard", group: "Navigation", action: () => { setActiveTab("agents"); close() } })
		items.push({ id: "focus-git", label: "Focus Git Panel", group: "Navigation", shortcut: "\u2318\u21e7G", action: () => { setRightSidebarVisible(true); setRightSidebarTab("git"); close() } })
		items.push({ id: "focus-files", label: "Focus File Tree", group: "Navigation", action: () => { setRightSidebarVisible(true); setRightSidebarTab("files"); close() } })
		items.push({ id: "focus-context", label: "Focus Context Panel", group: "Navigation", action: () => { setRightSidebarVisible(true); setRightSidebarTab("context"); close() } })

		// Actions
		items.push({ id: "search-files", label: "Search Files", group: "Actions", shortcut: "\u2318P", action: () => { setShowQuickFileOpen(true); close() } })
		items.push({ id: "new-thread", label: "New Thread", group: "Actions", action: () => { handleNewThread(); close() } })
		items.push({ id: "switch-model", label: "Switch Model", group: "Actions", action: () => { setShowModelSelector(true); close() } })
		items.push({ id: "open-folder", label: "Open Folder", group: "Actions", shortcut: "\u2318O", action: () => { handleOpenFolder(); close() } })
		items.push({ id: "clone-repo", label: "Clone from URL", group: "Actions", action: () => { handleShowCloneModal(); close() } })
		items.push({ id: "toggle-left-sidebar", label: "Toggle Left Sidebar", group: "Actions", shortcut: "\u2318B", action: () => { setSidebarVisible((v) => !v); close() } })
		items.push({ id: "toggle-right-sidebar", label: "Toggle Right Sidebar", group: "Actions", shortcut: "\u2318`", action: () => { setRightSidebarVisible((v) => !v); close() } })
		items.push({ id: "open-browser", label: "Open Browser", group: "Actions", action: () => { handleBrowserOpen("about:blank"); close() } })
		items.push({ id: "toggle-thinking", label: thinkingLevel === "off" ? "Enable Thinking" : "Disable Thinking", group: "Actions", action: () => { handleToggleThinking(); close() } })
		items.push({ id: "toggle-planning", label: modeId === "plan" ? "Switch to Build Mode" : "Switch to Plan Mode", group: "Actions", action: () => { handleTogglePlanning(); close() } })

		// Open tabs
		for (const threadId of openThreadTabs) {
			const thread = threads.find((t) => t.id === threadId)
			items.push({
				id: `tab-thread-${threadId}`,
				label: thread?.title || "New Thread",
				group: "Open Tabs",
				action: () => { setActiveTab(`thread:${threadId}`); close() },
			})
		}
		for (const fileTab of openFiles) {
			const name = fileTab.split("/").pop() || fileTab
			items.push({
				id: `tab-file-${fileTab}`,
				label: name,
				description: fileTab,
				group: "Open Tabs",
				action: () => { setActiveTab(fileTab); close() },
			})
		}

		// Workspaces
		for (const project of enrichedProjects) {
			items.push({
				id: `project-${project.rootPath}`,
				label: project.name,
				description: project.gitBranch || "",
				group: "Workspaces",
				action: () => { handleSwitchProject(project.rootPath); close() },
			})
		}

		return items
	}, [openThreadTabs, openFiles, threads, enrichedProjects, modeId, thinkingLevel])

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
				onCloneRepo={handleShowCloneModal}
				onRemoveProject={handleRemoveProject}
				onCreateWorktree={handleCreateWorktree}
				onDeleteWorktree={handleDeleteWorktree}
				onOpenSettings={() => setActiveTab("settings")}
				onOpenAccounts={() => {
					setActiveTab("settings")
					setSettingsSection("accounts")
				}}
				onOpenTasks={() => setActiveTab("tasks")}
				onOpenAgents={() => setActiveTab("agents")}
				isSettingsActive={activeTab === "settings"}
				isTasksActive={activeTab === "tasks"}
				isAgentsActive={activeTab === "agents"}
				activeAgentCount={activeWorktrees.size}
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
								color: activeTab === "chat" || activeTab.startsWith("thread:") ? "var(--text)" : "var(--muted)",
								background: activeTab === "chat" || activeTab.startsWith("thread:") ? "var(--bg)" : "transparent",
								borderBottom: activeTab === "chat" || activeTab.startsWith("thread:") ? "2px solid var(--accent)" : "2px solid transparent",
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

					{/* Open file/diff/browser tabs */}
					{openFiles.map((tabId) => {
						const isDiff = tabId.startsWith("diff:")
						const isBrowser = tabId.startsWith("browser:")
						const filePath = isDiff
							? tabId.slice(5)
							: isBrowser
								? tabId.slice(8)
								: tabId
						const fileName = isBrowser
							? (() => { try { return new URL(filePath).host || "Browser" } catch { return "Browser" } })()
							: filePath.split("/").pop() || filePath
						const isActive = activeTab === tabId
						const isDirtyTab = dirtyFiles.has(tabId)
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
									{isBrowser && (
										<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
											<circle cx="12" cy="12" r="10" />
											<line x1="2" y1="12" x2="22" y2="12" />
											<path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
										</svg>
									)}
									{fileName}
									{isDirtyTab && (
										<span
											style={{
												width: 6,
												height: 6,
												borderRadius: "50%",
												background: "var(--text)",
												flexShrink: 0,
											}}
										/>
									)}
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

				{isAuthenticated === null ? (
					/* Loading state while checking auth */
					<div
						style={{
							flex: 1,
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
						}}
					>
						<div
							style={{
								width: 24,
								height: 24,
								border: "2px solid var(--border)",
								borderTopColor: "var(--accent)",
								borderRadius: "50%",
								animation: "spin 0.8s linear infinite",
							}}
						/>
						<style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
					</div>
				) : isAuthenticated === false ? (
					<WelcomeScreen onLogin={handleLogin} onApiKey={handleApiKey} onSkip={handleSkipLogin} />
				) : enrichedProjects.length === 0 && (activeTab === "chat" || activeTab.startsWith("thread:")) ? (
					/* Onboarding: no projects yet */
					<div
						style={{
							flex: 1,
							display: "flex",
							flexDirection: "column",
							alignItems: "center",
							justifyContent: "center",
							padding: 40,
							gap: 24,
						}}
					>
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
								onClick={handleOpenFolder}
								style={{
									display: "flex",
									alignItems: "center",
									gap: 10,
									padding: "12px 28px",
									background: "var(--accent)",
									color: "#fff",
									borderRadius: 8,
									cursor: "pointer",
									fontWeight: 600,
									fontSize: 14,
									border: "none",
									transition: "opacity 0.15s",
								}}
								onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.85" }}
								onMouseLeave={(e) => { e.currentTarget.style.opacity = "1" }}
							>
								<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
									<path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
								</svg>
								Open Folder
							</button>
							<button
								onClick={handleShowCloneModal}
								style={{
									display: "flex",
									alignItems: "center",
									gap: 10,
									padding: "12px 28px",
									background: "transparent",
									color: "var(--text)",
									borderRadius: 8,
									cursor: "pointer",
									fontWeight: 600,
									fontSize: 14,
									border: "1px solid var(--border)",
									transition: "opacity 0.15s",
								}}
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
							or press <kbd style={{
								padding: "2px 6px",
								background: "var(--bg-elevated)",
								border: "1px solid var(--border)",
								borderRadius: 4,
								fontSize: 11,
								fontFamily: "inherit",
							}}>&#8984;O</kbd> anytime
						</div>
					</div>
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
						{activeTab === "settings" && (
							<Settings
								onClose={() => setActiveTab("chat")}
								loggedInProviders={loggedInProviders}
								onLogin={handleLogin}
								onApiKey={handleApiKey}
								onLogout={handleLogout}
								initialSection={settingsSection}
								onSectionChange={(s) => setSettingsSection(s)}
							/>
						)}

						{/* Task board */}
						{activeTab === "tasks" && <TaskBoard agentTasks={tasks} onClose={() => setActiveTab("chat")} onStartWork={handleStartWorkOnIssue} onStartWorkGithub={handleStartWorkOnGithubIssue} linkedIssues={linkedIssues} onSwitchToWorktree={handleSwitchProject} />}

						{/* Agent dashboard */}
						{activeTab === "agents" && (
							<AgentDashboard
								onClose={() => setActiveTab("chat")}
								onSwitchToAgent={handleSwitchProject}
							/>
						)}

						{/* File, diff, or browser editor (when a file/diff/browser tab is active) */}
						{activeTab !== "chat" && activeTab !== "settings" && activeTab !== "tasks" && activeTab !== "agents" && !activeTab.startsWith("thread:") &&
							(activeTab.startsWith("browser:") ? (
								<BrowserView
									url={activeTab.slice(8)}
									onNavigate={(newUrl) => {
										const oldTab = activeTab
										const newTab = `browser:${newUrl}`
										if (oldTab !== newTab) {
											setOpenFiles((prev) =>
												prev.map((f) => (f === oldTab ? newTab : f)),
											)
											setActiveTab(newTab)
										}
									}}
									onClose={() => handleCloseTab(activeTab)}
								/>
							) : activeTab.startsWith("diff:") ? (
								<DiffEditor
									filePath={activeTab.slice(5)}
									onClose={() =>
										handleCloseTab(activeTab)
									}
									onOpenFile={handleFileClick}
								/>
							) : (
								<FileEditor
									ref={fileEditorRef}
									filePath={activeTab}
									onClose={() =>
										handleCloseTab(activeTab)
									}
									onDirtyChange={(dirty) => handleDirtyChange(activeTab, dirty)}
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
					omProgress={omProgress}
					omModelIds={omModelIds}
					loggedInProviders={loggedInProviders}
					onOpenOMSettings={() => {
						setActiveTab("settings")
						setSettingsSection("memory")
					}}
					thinkingEnabled={thinkingLevel !== "off"}
					onToggleThinking={handleToggleThinking}
					planningEnabled={modeId === "plan"}
					onTogglePlanning={handleTogglePlanning}
				/>
			</div>

			{/* Right sidebar: Files + Git + Terminal — hidden when no projects */}
			<RightSidebar
				visible={rightSidebarVisible && enrichedProjects.length > 0}
				activeTab={rightSidebarTab}
				onTabChange={setRightSidebarTab}
				projectName={projectInfo?.name ?? ""}
				projectPath={projectInfo?.rootPath ?? null}
				onFileClick={handleFileClick}
				onDiffClick={handleDiffClick}
				activeFilePath={openFiles.includes(activeTab) ? activeTab : null}
				activeDiffPath={activeTab.startsWith("diff:") ? activeTab.slice(5) : null}
				loading={projectSwitching}
				onOpenBrowser={handleBrowserOpen}
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

			{/* Clone from URL modal */}
			{showCloneModal && (
				<div
					style={{
						position: "fixed",
						inset: 0,
						background: "rgba(0,0,0,0.5)",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						zIndex: 1000,
					}}
					onClick={(e) => { if (e.target === e.currentTarget && !cloning) { setShowCloneModal(false) } }}
				>
					<div
						style={{
							background: "var(--bg-surface)",
							border: "1px solid var(--border)",
							borderRadius: 12,
							padding: 24,
							width: 480,
							maxWidth: "90vw",
							display: "flex",
							flexDirection: "column",
							gap: 16,
						}}
					>
						<div style={{ fontSize: 16, fontWeight: 600, color: "var(--text)" }}>
							Clone from URL
						</div>

						<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
							<label style={{ fontSize: 12, fontWeight: 500, color: "var(--muted)" }}>Git URL</label>
							<input
								type="text"
								value={cloneUrl}
								onChange={(e) => setCloneUrl(e.target.value)}
								placeholder="https://github.com/user/repo.git"
								autoFocus
								disabled={cloning}
								style={{
									padding: "10px 12px",
									background: "var(--bg-elevated)",
									border: "1px solid var(--border)",
									borderRadius: 8,
									color: "var(--text)",
									fontSize: 13,
									fontFamily: "inherit",
									outline: "none",
								}}
							/>
						</div>

						<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
							<label style={{ fontSize: 12, fontWeight: 500, color: "var(--muted)" }}>Clone location</label>
							<div style={{ display: "flex", gap: 8 }}>
								<input
									type="text"
									value={cloneDest}
									onChange={(e) => setCloneDest(e.target.value)}
									placeholder="/path/to/directory"
									disabled={cloning}
									style={{
										flex: 1,
										padding: "10px 12px",
										background: "var(--bg-elevated)",
										border: "1px solid var(--border)",
										borderRadius: 8,
										color: "var(--text)",
										fontSize: 13,
										fontFamily: "inherit",
										outline: "none",
									}}
								/>
								<button
									onClick={handleBrowseCloneDest}
									disabled={cloning}
									style={{
										padding: "10px 16px",
										background: "var(--bg-elevated)",
										color: "var(--text)",
										border: "1px solid var(--border)",
										borderRadius: 8,
										cursor: "pointer",
										fontSize: 13,
										fontWeight: 500,
										whiteSpace: "nowrap",
									}}
								>
									Browse...
								</button>
							</div>
						</div>

						<div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
							<button
								onClick={() => { setShowCloneModal(false); setCloneUrl(""); setCloneDest("") }}
								disabled={cloning}
								style={{
									padding: "8px 16px",
									background: "transparent",
									color: "var(--muted)",
									border: "1px solid var(--border)",
									borderRadius: 8,
									cursor: "pointer",
									fontSize: 13,
								}}
							>
								Cancel
							</button>
							<button
								onClick={handleCloneSubmit}
								disabled={!cloneUrl.trim() || !cloneDest.trim() || cloning}
								style={{
									padding: "8px 20px",
									background: cloneUrl.trim() && cloneDest.trim() ? "var(--accent)" : "var(--bg-elevated)",
									color: cloneUrl.trim() && cloneDest.trim() ? "#fff" : "var(--dim)",
									border: "none",
									borderRadius: 8,
									cursor: cloneUrl.trim() && cloneDest.trim() && !cloning ? "pointer" : "default",
									fontSize: 13,
									fontWeight: 600,
									opacity: cloning ? 0.6 : 1,
								}}
							>
								{cloning ? "Cloning..." : "Clone repository"}
							</button>
						</div>
					</div>
				</div>
			)}

			{showModelSelector && (
				<ModelSelector
					currentModelId={modelId}
					onSelect={handleSwitchModel}
					onClose={() => setShowModelSelector(false)}
				/>
			)}

			{showCommandPalette && (
				<CommandPalette
					commands={commandPaletteItems}
					onClose={() => setShowCommandPalette(false)}
				/>
			)}

			{showQuickFileOpen && (
				<QuickFileOpen
					onSelect={(filePath) => {
						handleFileClick(filePath)
						setShowQuickFileOpen(false)
					}}
					onClose={() => setShowQuickFileOpen(false)}
				/>
			)}

			{pendingCloseTab && (
				<div
					style={{
						position: "fixed",
						inset: 0,
						zIndex: 9999,
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						background: "rgba(0, 0, 0, 0.5)",
					}}
					onClick={() => setPendingCloseTab(null)}
				>
					<div
						onClick={(e) => e.stopPropagation()}
						style={{
							background: "var(--bg-surface)",
							border: "1px solid var(--border)",
							borderRadius: 8,
							padding: "20px 24px",
							maxWidth: 360,
							width: "100%",
							display: "flex",
							flexDirection: "column",
							gap: 16,
						}}
					>
						<div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
							Unsaved Changes
						</div>
						<div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
							This file has unsaved changes. Do you want to save before closing?
						</div>
						<div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
							<button
								onClick={() => {
									const tabId = pendingCloseTab
									setPendingCloseTab(null)
									forceCloseTab(tabId)
								}}
								style={{
									fontSize: 12,
									padding: "6px 14px",
									borderRadius: 4,
									border: "1px solid var(--border)",
									background: "transparent",
									color: "var(--error)",
									cursor: "pointer",
									fontWeight: 500,
								}}
							>
								Discard
							</button>
							<button
								onClick={() => setPendingCloseTab(null)}
								style={{
									fontSize: 12,
									padding: "6px 14px",
									borderRadius: 4,
									border: "1px solid var(--border)",
									background: "transparent",
									color: "var(--muted)",
									cursor: "pointer",
									fontWeight: 500,
								}}
							>
								Cancel
							</button>
							<button
								onClick={async () => {
									const tabId = pendingCloseTab
									setPendingCloseTab(null)
									await fileEditorRef.current?.save()
									forceCloseTab(tabId)
								}}
								style={{
									fontSize: 12,
									padding: "6px 14px",
									borderRadius: 4,
									border: "1px solid var(--border)",
									background: "var(--accent)",
									color: "var(--bg)",
									cursor: "pointer",
									fontWeight: 500,
								}}
							>
								Save & Close
							</button>
						</div>
					</div>
				</div>
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
