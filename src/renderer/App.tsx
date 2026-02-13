import { useState, useCallback, useReducer, useEffect } from "react"
import { Sidebar } from "./components/Sidebar"
import { ChatView } from "./components/ChatView"
import { StatusBar } from "./components/StatusBar"
import { EditorInput } from "./components/EditorInput"
import { ToolApprovalDialog } from "./components/ToolApprovalDialog"
import { AskQuestionDialog } from "./components/AskQuestionDialog"
import { PlanApproval } from "./components/PlanApproval"
import { ModelSelector } from "./components/ModelSelector"
import { LoginDialog } from "./components/LoginDialog"
import { WelcomeScreen } from "./components/WelcomeScreen"
import { TerminalPanel } from "./components/TerminalPanel"
import { ResizeHandle } from "./components/ResizeHandle"
import { ProjectSwitcher } from "./components/ProjectSwitcher"
import type { SidebarTab } from "./components/SidebarTabs"
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
			return { ...state, isAgentActive: true }
		case "AGENT_END":
			return {
				...state,
				isAgentActive: false,
				streamingMessageId: null,
			}
		case "MESSAGE_START":
			return {
				...state,
				messages: [...state.messages, action.message],
				streamingMessageId:
					action.message.role === "assistant" ? action.message.id : null,
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
	const [sidebarTab, setSidebarTab] = useState<SidebarTab>("threads")
	const [sidebarVisible, setSidebarVisible] = useState(true)

	// Terminal state
	const [terminalVisible, setTerminalVisible] = useState(false)
	const [terminalHeight, setTerminalHeight] = useState(250)

	// Project state
	const [projectInfo, setProjectInfo] = useState<ProjectInfo | null>(null)
	const [showProjectSwitcher, setShowProjectSwitcher] = useState(false)

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
	const [todos, setTodos] = useState<
		Array<{
			content: string
			status: "pending" | "in_progress" | "completed"
			activeForm: string
		}>
	>([])

	// Subscribe to harness events
	useEffect(() => {
		const unsubscribe = window.api.onEvent((raw: unknown) => {
			const event = raw as HarnessEventPayload
			switch (event.type) {
				case "agent_start":
					dispatch({ type: "AGENT_START" })
					break
				case "agent_end":
					dispatch({ type: "AGENT_END" })
					break
				case "message_start":
					dispatch({
						type: "MESSAGE_START",
						message: event.message as Message,
					})
					break
				case "message_update":
					dispatch({
						type: "MESSAGE_UPDATE",
						message: event.message as Message,
					})
					break
				case "message_end":
					dispatch({
						type: "MESSAGE_END",
						message: event.message as Message,
					})
					break
				case "tool_start":
					dispatch({
						type: "TOOL_START",
						id: event.toolCallId as string,
						name: event.toolName as string,
						args: event.args,
					})
					break
				case "tool_update":
					dispatch({
						type: "TOOL_UPDATE",
						id: event.toolCallId as string,
						partialResult: event.partialResult,
					})
					break
				case "tool_end":
					dispatch({
						type: "TOOL_END",
						id: event.toolCallId as string,
						result: event.result,
						isError: event.isError as boolean,
					})
					break
				case "shell_output":
					dispatch({
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
					break
				case "thread_created":
					loadThreads()
					break
				case "usage_update":
					setTokenUsage(event.usage as TokenUsage)
					break
				case "todo_updated":
					setTodos(
						event.todos as Array<{
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
						setTerminalVisible((v) => !v)
					else if (action === "toggle_sidebar")
						setSidebarVisible((v) => !v)
					else if (action === "focus_git") {
						setSidebarVisible(true)
						setSidebarTab("git")
					} else if (action === "open_project")
						setShowProjectSwitcher(true)
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
					const proj = event.project as ProjectInfo
					setProjectInfo(proj)
					dispatch({ type: "CLEAR" })
					setCurrentThreadId(null)
					setThreads([])
					loadThreads()
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
			// Cmd+` toggle terminal
			if (isMod && e.key === "`") {
				e.preventDefault()
				setTerminalVisible((v) => !v)
			}
			// Cmd+B toggle sidebar
			if (isMod && e.key === "b") {
				e.preventDefault()
				setSidebarVisible((v) => !v)
			}
			// Cmd+Shift+G focus git tab
			if (isMod && e.shiftKey && e.key === "G") {
				e.preventDefault()
				setSidebarVisible(true)
				setSidebarTab("git")
			}
			// Cmd+O open project
			if (isMod && e.key === "o") {
				e.preventDefault()
				setShowProjectSwitcher(true)
			}
		}
		window.addEventListener("keydown", handleKeyDown)
		return () => window.removeEventListener("keydown", handleKeyDown)
	}, [])

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
				todos?: Array<{
					content: string
					status: "pending" | "in_progress" | "completed"
					activeForm: string
				}>
			}
			if (state?.currentModelId) setModelId(state.currentModelId)
			if (state?.todos) setTodos(state.todos)

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

			await loadMessages()
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

	async function loadThreads() {
		try {
			const list = (await window.api.invoke({
				type: "listThreads",
			})) as ThreadInfo[]
			if (list) setThreads(list)
		} catch {
			// ignore
		}
	}

	const handleSend = useCallback(async (content: string) => {
		await window.api.invoke({ type: "sendMessage", content })
	}, [])

	const handleAbort = useCallback(async () => {
		await window.api.invoke({ type: "abort" })
	}, [])

	const handleSwitchMode = useCallback(async (newModeId: string) => {
		await window.api.invoke({ type: "switchMode", modeId: newModeId })
	}, [])

	const handleSwitchThread = useCallback(async (threadId: string) => {
		await window.api.invoke({ type: "switchThread", threadId })
	}, [])

	const handleNewThread = useCallback(async () => {
		await window.api.invoke({ type: "createThread" })
		dispatch({ type: "CLEAR" })
	}, [])

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

	const handleTerminalResize = useCallback((deltaY: number) => {
		setTerminalHeight((h) => Math.max(100, Math.min(600, h + deltaY)))
	}, [])

	return (
		<div
			style={{
				display: "flex",
				height: "100vh",
				overflow: "hidden",
			}}
		>
			<Sidebar
				threads={threads}
				currentThreadId={currentThreadId}
				modeId={modeId}
				loggedInProviders={loggedInProviders}
				activeTab={sidebarTab}
				projectName={projectInfo?.name ?? ""}
				sidebarVisible={sidebarVisible}
				onSwitchThread={handleSwitchThread}
				onNewThread={handleNewThread}
				onSwitchMode={handleSwitchMode}
				onOpenModelSelector={() => setShowModelSelector(true)}
				onLogin={handleLogin}
				onTabChange={setSidebarTab}
				onOpenProjectSwitcher={() => setShowProjectSwitcher(true)}
			/>

			<div
				style={{
					flex: 1,
					display: "flex",
					flexDirection: "column",
					overflow: "hidden",
				}}
			>
				{/* Title bar drag region */}
				<div
					className="titlebar-drag"
					style={{
						height: 38,
						borderBottom: "1px solid var(--border-muted)",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						color: "var(--muted)",
						fontSize: 12,
						flexShrink: 0,
					}}
				>
					{projectInfo?.name ?? "Mastra Code"}
				</div>

				{isAuthenticated === false ? (
					<WelcomeScreen onLogin={handleLogin} />
				) : (
					<>
						{/* Chat area */}
						<ChatView
							messages={chat.messages}
							tools={chat.tools}
							subagents={chat.subagents}
							isAgentActive={chat.isAgentActive}
							streamingMessageId={chat.streamingMessageId}
							todos={todos}
						/>

						{/* Input area */}
						<EditorInput
							onSend={handleSend}
							onAbort={handleAbort}
							isAgentActive={chat.isAgentActive}
							modeId={modeId}
						/>

						{/* Terminal resize handle + panel */}
						{terminalVisible && (
							<ResizeHandle onResize={handleTerminalResize} />
						)}
						<TerminalPanel
							height={terminalHeight}
							isVisible={terminalVisible}
						/>
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
					terminalVisible={terminalVisible}
					onToggleTerminal={() => setTerminalVisible((v) => !v)}
				/>
			</div>

			{/* Modal dialogs */}
			{pendingApproval && (
				<ToolApprovalDialog
					toolCallId={pendingApproval.toolCallId}
					toolName={pendingApproval.toolName}
					args={pendingApproval.args}
					onApprove={handleApprove}
					onDecline={handleDecline}
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

			{showProjectSwitcher && (
				<ProjectSwitcher
					currentProject={projectInfo}
					onClose={() => setShowProjectSwitcher(false)}
				/>
			)}
		</div>
	)
}
