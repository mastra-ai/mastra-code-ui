/**
 * Main TUI class for Mastra Code.
 * Wires the Harness to pi-tui components for a full interactive experience.
 */

import {
	CombinedAutocompleteProvider,
	Container,
	Loader,
	Markdown,
	Spacer,
	Text,
	TUI,
	ProcessTerminal,
	type EditorTheme,
	type SlashCommand,
} from "@mariozechner/pi-tui"
import chalk from "chalk"
import type { Harness } from "../harness/harness.js"
import type {
	HarnessEvent,
	HarnessMessage,
	HarnessMessageContent,
	HarnessEventListener,
	TokenUsage,
} from "../harness/types.js"
import type { Workspace } from "@mastra/core/workspace"
import { detectProject, type ProjectInfo } from "../utils/project.js"
import { parseError } from "../utils/errors.js"
import {
	loadCustomCommands,
	type SlashCommandMetadata,
} from "../utils/slash-command-loader.js"
import { processSlashCommand } from "../utils/slash-command-processor.js"
import { extractSlashCommand } from "../utils/slash-command-extractor.js"
import { AssistantMessageComponent } from "./components/assistant-message.js"
import { CustomEditor } from "./components/custom-editor.js"
import { LoginDialogComponent } from "./components/login-dialog.js"

import {
	ModelSelectorComponent,
	type ModelItem,
} from "./components/model-selector.js"
import { ThreadSelectorComponent } from "./components/thread-selector.js"
import { OMMarkerComponent } from "./components/om-marker.js"
import { OMSettingsComponent } from "./components/om-settings.js"

import {
	OMProgressComponent,
	type OMProgressState,
	formatObservationStatus,
	formatReflectionStatus,
} from "./components/om-progress.js"
import { AskQuestionDialogComponent } from "./components/ask-question-dialog.js"
import { AskQuestionInlineComponent } from "./components/ask-question-inline.js"
import { PlanApprovalInlineComponent } from "./components/plan-approval-inline.js"
import { ToolApprovalDialogComponent } from "./components/tool-approval-dialog.js"
import {
	ToolExecutionComponentEnhanced,
	type ToolResult,
} from "./components/tool-execution-enhanced.js"
import type { IToolExecutionComponent } from "./components/tool-execution-interface.js"
import { SubagentExecutionComponent } from "./components/subagent-execution.js"
import {
	TodoProgressComponent,
	type TodoItem,
} from "./components/todo-progress.js"
import { UserMessageComponent } from "./components/user-message.js"
import {
	getEditorTheme,
	getMarkdownTheme,
	getTheme,
	fg,
	bold,
	getContrastText,
} from "./theme.js"

// =============================================================================
// Types
// =============================================================================

export interface MastraTUIOptions {
	/** The harness instance to control */
	harness: Harness<any>

	/**
	 * @deprecated Workspace is now obtained from the Harness.
	 * Configure workspace via HarnessConfig.workspace instead.
	 * Kept as fallback for backward compatibility.
	 */
	workspace?: Workspace

	/** Initial message to send on startup */
	initialMessage?: string

	/** Whether to show verbose startup info */
	verbose?: boolean

	/** App name for header */
	appName?: string

	/** App version for header */
	version?: string

	/** Use inline questions instead of dialog overlays */
	inlineQuestions?: boolean
}

// =============================================================================
// MastraTUI Class
// =============================================================================

export class MastraTUI {
	private harness: Harness<any>
	private options: MastraTUIOptions

	// TUI components
	private ui: TUI
	private chatContainer: Container
	private statusContainer: Container
	private editorContainer: Container
	private editor: CustomEditor
	private footer: Container

	// State tracking
	private isInitialized = false
	private loadingAnimation?: Loader
	private streamingComponent?: AssistantMessageComponent
	private streamingMessage?: HarnessMessage
	private pendingTools = new Map<string, IToolExecutionComponent>()
	private seenToolCallIds = new Set<string>() // Track all tool IDs seen during current stream (prevents duplicates)
	private allToolComponents: IToolExecutionComponent[] = [] // Track all tools for expand/collapse
	private pendingSubagents = new Map<string, SubagentExecutionComponent>() // Track active subagent tasks
	private toolOutputExpanded = false
	private hideThinkingBlock = true
	private pendingNewThread = false // True when we want a new thread but haven't created it yet
	private lastAskUserComponent?: IToolExecutionComponent // Track the most recent ask_user tool for inline question placement

	// Status line state
	private projectInfo: ProjectInfo
	private tokenUsage: TokenUsage = {
		promptTokens: 0,
		completionTokens: 0,
		totalTokens: 0,
	}
	private statusLine?: Text
	private memoryStatusLine?: Text
	private modelAuthStatus: { hasAuth: boolean; apiKeyEnvVar?: string } = {
		hasAuth: true,
	}

	// Observational Memory state
	private omProgress: OMProgressState = {
		status: "idle",
		pendingTokens: 0,
		threshold: 30000,
		thresholdPercent: 0,
		observationTokens: 0,
		reflectionThreshold: 40000,
		reflectionThresholdPercent: 0,
	}
	private omProgressComponent?: OMProgressComponent
	private todoProgress?: TodoProgressComponent

	// Autocomplete
	private autocompleteProvider?: CombinedAutocompleteProvider

	// Custom slash commands
	private customSlashCommands: SlashCommandMetadata[] = []

	// Pending images from clipboard paste
	private pendingImages: Array<{ data: string; mimeType: string }> = []

	// Workspace (for skills)
	private workspace?: Workspace

	// Active inline question component
	private activeInlineQuestion?: AskQuestionInlineComponent

	// Active inline plan approval component
	private activeInlinePlanApproval?: PlanApprovalInlineComponent
	private lastSubmitPlanComponent?: IToolExecutionComponent

	// Ctrl+C double-tap tracking
	private lastCtrlCTime = 0
	private static readonly DOUBLE_CTRL_C_MS = 500

	// Event handling
	private unsubscribe?: () => void

	private terminal: ProcessTerminal

	constructor(options: MastraTUIOptions) {
		this.harness = options.harness
		this.options = options
		this.workspace = options.workspace

		// Detect project info for status line
		this.projectInfo = detectProject(process.cwd())

		// Create terminal and TUI instance
		this.terminal = new ProcessTerminal()
		this.ui = new TUI(this.terminal)

		// Create containers
		this.chatContainer = new Container()
		this.statusContainer = new Container()
		this.editorContainer = new Container()
		this.footer = new Container()

		// Create editor with custom keybindings
		this.editor = new CustomEditor(this.ui, getEditorTheme())

		// Override editor input handling to check for active inline components
		const originalHandleInput = this.editor.handleInput.bind(this.editor)
		this.editor.handleInput = (data: string) => {
			// If there's an active plan approval, route input to it
			if (this.activeInlinePlanApproval) {
				this.activeInlinePlanApproval.handleInput(data)
				return
			}
			// If there's an active inline question, route input to it
			if (this.activeInlineQuestion) {
				this.activeInlineQuestion.handleInput(data)
				return
			}
			// Otherwise, handle normally
			originalHandleInput(data)
		}

		// Wire clipboard image paste
		this.editor.onImagePaste = (image) => {
			this.pendingImages.push(image)
			this.editor.insertTextAtCursor?.("[image] ")
			this.ui.requestRender()
		}

		this.setupKeyboardShortcuts()
	}

	/**
	 * Setup keyboard shortcuts for the custom editor.
	 */
	private setupKeyboardShortcuts(): void {
		// Ctrl+C - abort if running, clear input if idle, double-tap always exits
		this.editor.onAction("clear", () => {
			const now = Date.now()
			if (now - this.lastCtrlCTime < MastraTUI.DOUBLE_CTRL_C_MS) {
				// Double Ctrl+C → exit
				this.stop()
				process.exit(0)
			}
			this.lastCtrlCTime = now

			if (this.harness.isRunning()) {
				// Clean up active inline components on abort
				this.activeInlinePlanApproval = undefined
				this.activeInlineQuestion = undefined
				this.harness.abort()
			} else {
				this.editor.setText("")
				this.ui.requestRender()
			}
		})

		// Ctrl+D - exit when editor is empty
		this.editor.onCtrlD = () => {
			this.stop()
			process.exit(0)
		}

		// Ctrl+T - toggle thinking blocks visibility
		this.editor.onAction("toggleThinking", () => {
			this.hideThinkingBlock = !this.hideThinkingBlock
			this.ui.requestRender()
		})

		// Ctrl+E - expand/collapse tool outputs
		this.editor.onAction("expandTools", () => {
			this.toolOutputExpanded = !this.toolOutputExpanded
			for (const tool of this.allToolComponents) {
				tool.setExpanded(this.toolOutputExpanded)
			}
			this.ui.requestRender()
		})

		// Shift+Tab - cycle harness modes
		this.editor.onAction("cycleMode", async () => {
			// Block mode switching while plan approval is active
			if (this.activeInlinePlanApproval) {
				this.showInfo("Resolve the plan approval first")
				return
			}

			const modes = this.harness.getModes()
			if (modes.length <= 1) return

			const currentId = this.harness.getCurrentModeId()
			const currentIndex = modes.findIndex((m) => m.id === currentId)
			const nextIndex = (currentIndex + 1) % modes.length
			const nextMode = modes[nextIndex]
			await this.harness.switchMode(nextMode.id)
			// The mode_changed event handler will show the info message
			this.updateStatusLine()
		})

		// Ctrl+F - queue follow-up message while streaming
		this.editor.onAction("followUp", () => {
			const text = this.editor.getText().trim()
			if (!text) return
			if (!this.harness.isRunning()) return // Only relevant while streaming

			// Clear editor and add user message to chat
			this.editor.setText("")
			this.addUserMessage({
				id: `user-${Date.now()}`,
				role: "user",
				content: [{ type: "text", text }],
				createdAt: new Date(),
			})
			this.ui.requestRender()

			// Queue the follow-up
			this.harness.followUp(text).catch((error) => {
				this.showError(
					error instanceof Error ? error.message : "Follow-up failed",
				)
			})
		})
	}

	// ===========================================================================
	// Public API
	// ===========================================================================

	/**
	 * Run the TUI. This is the main entry point.
	 */
	async run(): Promise<void> {
		await this.init()

		// Run SessionStart hooks (fire and forget)
		const hookMgr = this.harness.getHookManager?.()
		if (hookMgr) {
			hookMgr.runSessionStart().catch(() => {})
		}

		// Process initial message if provided
		if (this.options.initialMessage) {
			this.fireMessage(this.options.initialMessage)
		}

		// Main interactive loop — never blocks on streaming,
		// so the editor stays responsive for steer / follow-up.
		while (true) {
			const userInput = await this.getUserInput()
			if (!userInput.trim()) continue

			try {
				// Handle slash commands
				if (userInput.startsWith("/")) {
					const handled = await this.handleSlashCommand(userInput)
					if (handled) continue
				}

				// Create thread lazily on first message (may load last-used model)
				if (this.pendingNewThread) {
					await this.harness.createThread()
					this.pendingNewThread = false
					this.updateStatusLine()
				}

				// Check if a model is selected
				if (!this.harness.hasModelSelected()) {
					this.showInfo(
						"No model selected. Use /models to select a model, or /login to authenticate.",
					)
					continue
				}

				// Collect any pending images from clipboard paste
				const images =
					this.pendingImages.length > 0 ? [...this.pendingImages] : undefined
				this.pendingImages = []

				// Add user message to chat immediately
				this.addUserMessage({
					id: `user-${Date.now()}`,
					role: "user",
					content: [
						{ type: "text", text: userInput },
						...(images?.map((img) => ({
							type: "image" as const,
							data: img.data,
							mimeType: img.mimeType,
						})) ?? []),
					],
					createdAt: new Date(),
				})
				this.ui.requestRender()

				if (this.harness.isRunning()) {
					// Agent is streaming → steer (abort + resend)
					this.harness.steer(userInput).catch((error) => {
						this.showError(
							error instanceof Error ? error.message : "Steer failed",
						)
					})
				} else {
					// Normal send — fire and forget; events handle the rest
					this.fireMessage(userInput, images)
				}
			} catch (error) {
				this.showError(error instanceof Error ? error.message : "Unknown error")
			}
		}
	}

	/**
	 * Fire off a message without blocking the main loop.
	 * Errors are handled via harness events.
	 */
	private fireMessage(
		content: string,
		images?: Array<{ data: string; mimeType: string }>,
	): void {
		this.harness
			.sendMessage(content, images ? { images } : undefined)
			.catch((error) => {
				this.showError(error instanceof Error ? error.message : "Unknown error")
			})
	}

	/**
	 * Stop the TUI and clean up.
	 */
	stop(): void {
		// Run SessionEnd hooks (best-effort, don't await)
		const hookMgr = this.harness.getHookManager?.()
		if (hookMgr) {
			hookMgr.runSessionEnd().catch(() => {})
		}

		if (this.unsubscribe) {
			this.unsubscribe()
		}
		this.ui.stop()
	}

	// ===========================================================================
	// Initialization
	// ===========================================================================

	private async init(): Promise<void> {
		if (this.isInitialized) return

		// Initialize harness (but don't select thread yet)
		await this.harness.init()

		// Check for existing threads and prompt for resume
		await this.promptForThreadSelection()

		// Load initial token usage from harness (persisted from previous session)
		this.tokenUsage = this.harness.getTokenUsage()

		// Load custom slash commands
		await this.loadCustomSlashCommands()

		// Setup autocomplete
		this.setupAutocomplete()

		// Build UI layout
		this.buildLayout()

		// Setup key handlers
		this.setupKeyHandlers()

		// Setup editor submit handler
		this.setupEditorSubmitHandler()

		// Subscribe to harness events
		this.subscribeToHarness()

		// Load OM progress now that we're subscribed (the event during
		// thread selection fired before we were listening)
		await this.harness.loadOMProgress()

		// Sync OM thresholds from thread metadata (may differ from OM defaults)
		this.syncOMThresholdsFromHarness()

		// Start the UI
		this.ui.start()
		this.isInitialized = true

		// Set terminal title
		this.updateTerminalTitle()

		// Render existing messages
		await this.renderExistingMessages()

		// Render existing todos if any
		await this.renderExistingTodos()
	}

	/**
	 * Render existing todos from the harness state on startup
	 */
	private async renderExistingTodos(): Promise<void> {
		try {
			// Access the harness state using the public method
			const state = this.harness.getState() as { todos?: TodoItem[] }
			const todos = state.todos || []

			if (todos.length > 0 && this.todoProgress) {
				// Update the existing todo progress component
				this.todoProgress.updateTodos(todos)
				this.ui.requestRender()
			}
		} catch (error) {
			// Silently ignore todo rendering errors
		}
	}

	/**
	 * Prompt user to continue existing thread or start new one.
	 * This runs before the TUI is fully initialized.
	 */
	private async promptForThreadSelection(): Promise<void> {
		const threads = await this.harness.listThreads()

		if (threads.length === 0) {
			// No existing threads - defer creation until first message
			this.pendingNewThread = true
			return
		}

		// Get current project path from harness state
		const currentPath = (this.harness.getState() as any)?.projectPath as
			| string
			| undefined

		// Sort by most recent
		const sortedThreads = [...threads].sort(
			(a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
		)

		// Prefer the most recent thread from the current directory.
		// Fall back to the overall most recent thread if no directory match
		// (handles old threads without projectPath metadata).
		let mostRecent: (typeof sortedThreads)[0]
		let isDirectoryMatch = false
		if (currentPath) {
			const dirThread = sortedThreads.find(
				(t) => t.metadata?.projectPath === currentPath,
			)
			if (dirThread) {
				mostRecent = dirThread
				isDirectoryMatch = true
			} else {
				mostRecent = sortedThreads[0]
			}
		} else {
			mostRecent = sortedThreads[0]
		}

		// If the thread is tagged with this directory, auto-resume it
		if (isDirectoryMatch) {
			await this.harness.switchThread(mostRecent.id)
			return
		}

		// Get first user message for preview
		const messages = await this.harness.getMessagesForThread(mostRecent.id)
		const firstUserMessage = messages.find((m) => m.role === "user")
		const previewText = firstUserMessage
			? this.truncatePreview(this.extractTextContent(firstUserMessage))
			: null

		// Format the time ago
		const timeAgo = this.formatTimeAgo(mostRecent.updatedAt)
		const shortId = mostRecent.id.slice(-6)
		const displayName = `${mostRecent.resourceId}/${shortId}`
		const threadPath = mostRecent.metadata?.projectPath as string | undefined

		// Show prompt in terminal (before TUI takes over)
		console.log(fg("dim", "─".repeat(60)))
		console.log()
		console.log(fg("accent", "  Found existing conversation:"))
		console.log(`  ${displayName} ${fg("dim", `(${timeAgo})`)}`)
		if (threadPath) {
			console.log(`  ${fg("dim", threadPath)}`)
		}
		if (previewText) {
			console.log(`  ${fg("muted", `"${previewText}"`)}`)
		}
		console.log()

		// Simple y/n prompt
		const answer = await this.promptYesNo("  Continue this conversation?", true)

		if (answer) {
			// Resume the existing thread
			await this.harness.switchThread(mostRecent.id)
		} else {
			// Defer new thread creation until first message
			this.pendingNewThread = true
		}

		// Clear the prompt lines
		console.log()
	}

	/**
	 * Simple yes/no prompt that works before TUI is initialized.
	 */
	private async promptYesNo(
		question: string,
		defaultYes: boolean,
	): Promise<boolean> {
		const hint = defaultYes ? "[Y/n]" : "[y/N]"
		process.stdout.write(`${question} ${fg("dim", hint)} `)

		// If not a TTY (piped input), use default
		if (!process.stdin.isTTY) {
			console.log(defaultYes ? "yes" : "no")
			return defaultYes
		}

		return new Promise((resolve) => {
			const stdin = process.stdin
			const wasRaw = stdin.isRaw

			stdin.setRawMode(true)
			stdin.resume()
			stdin.setEncoding("utf8")

			const onData = (key: string) => {
				stdin.setRawMode(wasRaw ?? false)
				stdin.pause()
				stdin.removeListener("data", onData)

				// Handle the input
				const char = key.toLowerCase()

				if (char === "\r" || char === "\n" || char === " ") {
					// Enter/space = use default
					console.log(defaultYes ? "yes" : "no")
					resolve(defaultYes)
				} else if (char === "y") {
					console.log("yes")
					resolve(true)
				} else if (char === "n") {
					console.log("no")
					resolve(false)
				} else if (char === "\x03") {
					// Ctrl+C
					console.log()
					process.exit(0)
				} else {
					// Invalid input, use default
					console.log(defaultYes ? "yes" : "no")
					resolve(defaultYes)
				}
			}

			stdin.on("data", onData)
		})
	}

	/**
	 * Format a date as a relative time string.
	 */
	private formatTimeAgo(date: Date): string {
		const now = new Date()
		const diffMs = now.getTime() - date.getTime()
		const diffMins = Math.floor(diffMs / 60000)
		const diffHours = Math.floor(diffMs / 3600000)
		const diffDays = Math.floor(diffMs / 86400000)

		if (diffMins < 1) return "just now"
		if (diffMins < 60)
			return `${diffMins} minute${diffMins !== 1 ? "s" : ""} ago`
		if (diffHours < 24)
			return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`
		if (diffDays === 1) return "1 day ago"
		if (diffDays < 7) return `${diffDays} days ago`

		return date.toLocaleDateString()
	}

	/**
	 * Extract text content from a harness message.
	 */
	private extractTextContent(message: HarnessMessage): string {
		return message.content
			.filter((c): c is { type: "text"; text: string } => c.type === "text")
			.map((c) => c.text)
			.join(" ")
			.trim()
	}

	/**
	 * Truncate text for preview display.
	 */
	private truncatePreview(text: string, maxLength = 50): string {
		if (text.length <= maxLength) return text
		return text.slice(0, maxLength - 3) + "..."
	}

	private buildLayout(): void {
		// Add header
		const appName = this.options.appName || "Mastra Code"
		const version = this.options.version || "0.1.0"

		const logo = bold(fg("accent", appName)) + fg("dim", ` v${version}`)

		const instructions = [
			`${fg("muted", "Ctrl+C")} interrupt/clear  ${fg("muted", "Ctrl+C×2")} exit`,
			`${fg("muted", "Enter")} while working → steer  ${fg("muted", "Ctrl+F")} → queue follow-up`,
			`${fg("muted", "/")} commands  ${fg("muted", "Ctrl+T")} thinking  ${fg("muted", "Ctrl+E")} tools${this.harness.getModes().length > 1 ? `  ${fg("muted", "⇧Tab")} mode` : ""}`,
		].join("\n")

		this.ui.addChild(new Spacer(1))
		this.ui.addChild(
			new Text(
				`${logo}
${instructions}`,
				1,
				0,
			),
		)
		this.ui.addChild(new Spacer(1))

		// Add main containers
		this.ui.addChild(this.chatContainer)
		this.ui.addChild(this.statusContainer)
		// Todo progress (between status and editor, visible only when todos exist)
		this.todoProgress = new TodoProgressComponent()
		this.ui.addChild(this.todoProgress)
		this.ui.addChild(this.editorContainer)
		this.editorContainer.addChild(this.editor)

		// Add footer with two-line status
		this.statusLine = new Text("", 1, 0)
		this.memoryStatusLine = new Text("", 1, 0)
		this.footer.addChild(this.statusLine)
		this.footer.addChild(this.memoryStatusLine)
		this.ui.addChild(this.footer)
		this.updateStatusLine()
		this.refreshModelAuthStatus()

		// Set focus to editor
		this.ui.setFocus(this.editor)
	}

	/**
	 * Update the two-line status bar.
	 * Line 1: Agent/model info — mode │ model │ thinking
	 * Line 2: Memory info — msg threshold │ obs threshold
	 */
	private updateStatusLine(): void {
		if (!this.statusLine) return

		// --- Line 1: Agent / Model ---
		const agentParts: string[] = []
		const termWidth = process.stdout.columns || 80

		// Project path with git branch (only on wider terminals)
		if (termWidth >= 80) {
			const homedir = process.env.HOME || process.env.USERPROFILE || ""
			let displayPath = this.projectInfo.rootPath
			if (homedir && displayPath.startsWith(homedir)) {
				displayPath = "~" + displayPath.slice(homedir.length)
			}
			if (this.projectInfo.gitBranch) {
				agentParts.push(`${displayPath} (${this.projectInfo.gitBranch})`)
			} else {
				agentParts.push(displayPath)
			}
		}

		// Current mode badge (only show when >1 mode)
		let modeBadge = ""
		const modes = this.harness.getModes()
		if (modes.length > 1) {
			const currentMode = this.harness.getCurrentMode()
			const modeName = currentMode?.name || currentMode?.id || "unknown"
			if (currentMode?.color) {
				const textColor = getContrastText(currentMode.color)
				modeBadge =
					chalk.bgHex(currentMode.color).hex(textColor).bold(` ${modeName} `) +
					" "
			} else {
				agentParts.push(modeName)
			}
		}

		// Full model ID (provider/model) with auth warning
		const modelId = this.harness.getFullModelId()
		if (!this.modelAuthStatus.hasAuth) {
			const envVar = this.modelAuthStatus.apiKeyEnvVar
			agentParts.push(
				modelId +
					fg("error", " ✗") +
					fg("muted", envVar ? ` (${envVar})` : " (no key)"),
			)
		} else {
			agentParts.push(modelId)
		}

		// Token usage (only show if > 0)
		if (this.tokenUsage.totalTokens > 0) {
			const formatNumber = (n: number) => n.toLocaleString()
			agentParts.push(
				`[${formatNumber(this.tokenUsage.promptTokens)}/${formatNumber(this.tokenUsage.completionTokens)}]`,
			)
		}

		// Thinking level (only show for Anthropic models when not "off")
		const thinkingLevel = this.harness.getThinkingLevel()
		if (thinkingLevel !== "off" && modelId.startsWith("anthropic/")) {
			agentParts.push(`think: ${thinkingLevel}`)
		}

		this.statusLine.setText(modeBadge + fg("dim", agentParts.join(" │ ")))

		// --- Line 2: Memory ---
		if (this.memoryStatusLine) {
			const memParts: string[] = []
			memParts.push(formatObservationStatus(this.omProgress))
			memParts.push(formatReflectionStatus(this.omProgress))
			this.memoryStatusLine.setText(fg("dim", memParts.join(" │ ")))
		}

		this.ui.requestRender()
	}

	private async refreshModelAuthStatus(): Promise<void> {
		this.modelAuthStatus = await this.harness.getCurrentModelAuthStatus()
		this.updateStatusLine()
	}

	private setupAutocomplete(): void {
		const slashCommands: SlashCommand[] = [
			{ name: "new", description: "Start a new thread" },
			{ name: "threads", description: "Switch between threads" },
			{ name: "models", description: "Switch model" },
			{ name: "om", description: "Configure Observational Memory models" },
			{ name: "think", description: "Set thinking level (Anthropic)" },
			{ name: "login", description: "Login with OAuth provider" },
			{ name: "skills", description: "List available skills" },
			{ name: "cost", description: "Show token usage and estimated costs" },
			{ name: "logout", description: "Logout from OAuth provider" },
			{ name: "hooks", description: "Show/reload configured hooks" },
			{ name: "mcp", description: "Show/reload MCP server connections" },
			{
				name: "thread:tag-dir",
				description: "Tag current thread with this directory",
			},
			{ name: "exit", description: "Exit the TUI" },
			{ name: "help", description: "Show available commands" },
		]

		// Only show /mode if there's more than one mode
		const modes = this.harness.getModes()
		if (modes.length > 1) {
			slashCommands.push({ name: "mode", description: "Switch agent mode" })
		}

		// Add custom slash commands to the list
		for (const customCmd of this.customSlashCommands) {
			// Prefix with extra / to distinguish from built-in commands (//command-name)
			slashCommands.push({
				name: `/${customCmd.name}`,
				description: customCmd.description || `Custom: ${customCmd.name}`,
			})
		}

		this.autocompleteProvider = new CombinedAutocompleteProvider(
			slashCommands,
			process.cwd(),
		)
		this.editor.setAutocompleteProvider(this.autocompleteProvider)
	}

	/**
	 * Load custom slash commands from all sources:
	 * - Global: ~/.opencode/command and ~/.mastra/commands
	 * - Local: .opencode/command and .mastra/commands
	 */
	private async loadCustomSlashCommands(): Promise<void> {
		try {
			// Load from all sources (global and local)
			const globalCommands = await loadCustomCommands()
			const localCommands = await loadCustomCommands(process.cwd())

			// Merge commands, with local taking precedence over global for same names
			const commandMap = new Map<string, SlashCommandMetadata>()

			// Add global commands first
			for (const cmd of globalCommands) {
				commandMap.set(cmd.name, cmd)
			}

			// Add local commands (will override global if same name)
			for (const cmd of localCommands) {
				commandMap.set(cmd.name, cmd)
			}

			this.customSlashCommands = Array.from(commandMap.values())
		} catch {
			this.customSlashCommands = []
		}
	}

	private setupKeyHandlers(): void {
		// Handle Ctrl+C via process signal (backup for when editor doesn't capture it)
		process.on("SIGINT", () => {
			const now = Date.now()
			if (now - this.lastCtrlCTime < MastraTUI.DOUBLE_CTRL_C_MS) {
				this.stop()
				process.exit(0)
			}
			this.lastCtrlCTime = now
			this.harness.abort()
		})

		// Use onDebug callback for Shift+Ctrl+D
		this.ui.onDebug = () => {
			// Toggle debug mode or show debug info
			// Currently unused - could add debug panel in future
		}
	}

	private setupEditorSubmitHandler(): void {
		// The editor's onSubmit is handled via getUserInput promise
	}

	private subscribeToHarness(): void {
		const listener: HarnessEventListener = async (event) => {
			await this.handleEvent(event)
		}
		this.unsubscribe = this.harness.subscribe(listener)
	}

	private updateTerminalTitle(): void {
		const appName = this.options.appName || "Mastra Code"
		const cwd = process.cwd().split("/").pop() || ""
		this.ui.terminal.setTitle(`${appName} - ${cwd}`)
	}

	// ===========================================================================
	// Event Handling
	// ===========================================================================

	private async handleEvent(event: HarnessEvent): Promise<void> {
		switch (event.type) {
			case "agent_start":
				this.handleAgentStart()
				break

			case "agent_end":
				if (event.reason === "aborted") {
					this.handleAgentAborted()
				} else if (event.reason === "error") {
					this.handleAgentError()
				} else {
					this.handleAgentEnd()
				}
				break

			case "message_start":
				this.handleMessageStart(event.message)
				break

			case "message_update":
				this.handleMessageUpdate(event.message)
				break

			case "message_end":
				this.handleMessageEnd(event.message)
				break

			case "tool_start":
				this.handleToolStart(event.toolCallId, event.toolName, event.args)
				break

			case "tool_approval_required":
				await this.handleToolApprovalRequired(
					event.toolCallId,
					event.toolName,
					event.args,
				)
				break

			case "tool_update":
				this.handleToolUpdate(event.toolCallId, event.partialResult)
				break

			case "tool_end":
				this.handleToolEnd(event.toolCallId, event.result, event.isError)
				break

			case "error":
				this.showFormattedError(event)
				break

			case "mode_changed": {
				const mode = this.harness.getModes().find((m) => m.id === event.modeId)
				this.showInfo(`Mode: ${mode?.name || event.modeId}`)
				await this.refreshModelAuthStatus()
				break
			}

			case "model_changed":
				// Update status line to reflect new model and auth status
				await this.refreshModelAuthStatus()
				break

			case "thread_changed": {
				this.showInfo(`Switched to thread: ${event.threadId}`)
				this.resetStatusLineState()
				await this.renderExistingMessages()
				await this.harness.loadOMProgress()
				this.syncOMThresholdsFromHarness()
				this.tokenUsage = this.harness.getTokenUsage()
				this.updateStatusLine()
				// Restore todos from thread state
				const threadState = this.harness.getState() as {
					todos?: TodoItem[]
				}
				if (this.todoProgress) {
					this.todoProgress.updateTodos(threadState.todos ?? [])
					this.ui.requestRender()
				}
				break
			}

			case "thread_created":
				this.showInfo(`Created thread: ${event.thread.id}`)
				break

			case "usage_update":
				this.handleUsageUpdate(event.usage)
				break

			// Observational Memory events
			case "om_progress":
				this.handleOMProgress(event)
				break

			case "om_observation_start":
				this.handleOMObservationStart(event.cycleId, event.tokensToObserve)
				break

			case "om_observation_end":
				this.handleOMObservationEnd(
					event.cycleId,
					event.durationMs,
					event.tokensObserved,
					event.observationTokens,
				)
				break

			case "om_observation_failed":
				this.handleOMFailed(event.cycleId, event.error, "observation")
				break

			case "om_reflection_start":
				this.handleOMReflectionStart(event.cycleId, event.tokensToReflect)
				break

			case "om_reflection_end":
				this.handleOMReflectionEnd(
					event.cycleId,
					event.durationMs,
					event.compressedTokens,
				)
				break

			case "om_reflection_failed":
				this.handleOMFailed(event.cycleId, event.error, "reflection")
				break

			case "follow_up_queued":
				this.showInfo(`Follow-up queued (${event.count} pending)`)
				break

			case "workspace_ready":
				// Workspace initialized successfully - silent unless verbose
				break

			case "workspace_error":
				this.showError(`Workspace: ${event.error.message}`)
				break

			case "workspace_status_changed":
				if (event.status === "error" && event.error) {
					this.showError(`Workspace: ${event.error.message}`)
				}
				break

			// Subagent / Task delegation events
			case "subagent_start":
				this.handleSubagentStart(event.toolCallId, event.agentType, event.task)
				break

			case "subagent_tool_start":
				this.handleSubagentToolStart(
					event.toolCallId,
					event.subToolName,
					event.subToolArgs,
				)
				break

			case "subagent_tool_end":
				this.handleSubagentToolEnd(
					event.toolCallId,
					event.subToolName,
					event.subToolResult,
					event.isError,
				)
				break

			case "subagent_text_delta":
				// Text deltas are streamed but we don't render them incrementally
				// (the final result is shown via tool_end for the parent tool call)
				break

			case "subagent_end":
				this.handleSubagentEnd(
					event.toolCallId,
					event.isError,
					event.durationMs,
					event.result,
				)
				break

			case "todo_updated":
				if (this.todoProgress) {
					this.todoProgress.updateTodos(event.todos as TodoItem[])
					this.ui.requestRender()
				}
				break

			case "ask_question":
				await this.handleAskQuestion(
					event.questionId,
					event.question,
					event.options,
				)
				break

			case "plan_approval_required":
				await this.handlePlanApproval(event.planId, event.title, event.plan)
				break
		}
	}

	private handleUsageUpdate(usage: TokenUsage): void {
		// Accumulate token usage
		this.tokenUsage.promptTokens += usage.promptTokens
		this.tokenUsage.completionTokens += usage.completionTokens
		this.tokenUsage.totalTokens += usage.totalTokens
		this.updateStatusLine()
	}

	// ===========================================================================
	// Status Line Reset
	// ===========================================================================

	/**
	 * Sync omProgress thresholds from harness state (thread metadata).
	 * Called after thread load to pick up per-thread threshold overrides.
	 */
	private syncOMThresholdsFromHarness(): void {
		const obsThreshold = this.harness.getObservationThreshold()
		const refThreshold = this.harness.getReflectionThreshold()
		this.omProgress.threshold = obsThreshold
		this.omProgress.thresholdPercent =
			obsThreshold > 0
				? (this.omProgress.pendingTokens / obsThreshold) * 100
				: 0
		this.omProgress.reflectionThreshold = refThreshold
		this.omProgress.reflectionThresholdPercent =
			refThreshold > 0
				? (this.omProgress.observationTokens / refThreshold) * 100
				: 0
		this.updateStatusLine()
	}

	private resetStatusLineState(): void {
		this.omProgress = {
			status: "idle",
			pendingTokens: 0,
			threshold: this.omProgress.threshold,
			thresholdPercent: 0,
			observationTokens: 0,
			reflectionThreshold: this.omProgress.reflectionThreshold,
			reflectionThresholdPercent: 0,
		}
		this.tokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
		this.updateStatusLine()
	}

	// ===========================================================================
	// Observational Memory Event Handlers
	// ===========================================================================

	/**
	 * Add an OM marker to the chat container, inserting it *before* the
	 * current streaming component so it doesn't get pushed down as text
	 * streams in.  Falls back to a normal append when nothing is streaming.
	 */
	private addOMMarkerToChat(marker: OMMarkerComponent): void {
		if (this.streamingComponent) {
			const idx = this.chatContainer.children.indexOf(this.streamingComponent)
			if (idx >= 0) {
				this.chatContainer.children.splice(idx, 0, marker)
				this.chatContainer.invalidate()
				return
			}
		}
		this.chatContainer.addChild(marker)
	}

	private handleOMProgress(event: {
		pendingTokens: number
		threshold: number
		thresholdPercent: number
		observationTokens: number
		reflectionThreshold: number
		reflectionThresholdPercent: number
	}): void {
		// Don't let a pre-observation progress event overwrite the post-observation reset
		if (
			this.omProgress.status === "observing" ||
			this.omProgress.status === "reflecting"
		) {
			// Only update thresholds and observation tokens, not pending counts
			this.omProgress.threshold = event.threshold
			this.omProgress.observationTokens = event.observationTokens
			this.omProgress.reflectionThreshold =
				event.reflectionThreshold ?? this.omProgress.reflectionThreshold
			this.omProgress.reflectionThresholdPercent =
				event.reflectionThresholdPercent ??
				this.omProgress.reflectionThresholdPercent
			this.updateStatusLine()
			return
		}
		this.omProgress.pendingTokens = event.pendingTokens
		this.omProgress.threshold = event.threshold
		this.omProgress.thresholdPercent = event.thresholdPercent
		this.omProgress.observationTokens = event.observationTokens
		this.omProgress.reflectionThreshold =
			event.reflectionThreshold ?? this.omProgress.reflectionThreshold
		this.omProgress.reflectionThresholdPercent =
			event.reflectionThresholdPercent ??
			this.omProgress.reflectionThresholdPercent
		this.updateStatusLine()
	}

	private formatTokensShort(tokens: number): string {
		if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}k`
		return String(tokens)
	}

	private handleOMObservationStart(
		cycleId: string,
		tokensToObserve: number,
	): void {
		this.omProgress.status = "observing"
		this.omProgress.cycleId = cycleId
		this.omProgress.startTime = Date.now()
		const tokens =
			tokensToObserve > 0
				? ` ~${this.formatTokensShort(tokensToObserve)} tokens`
				: ""
		this.updateLoaderText(`Observing${tokens}...`)
		this.ui.requestRender()
		this.updateStatusLine()
	}

	private handleOMObservationEnd(
		_cycleId: string,
		durationMs: number,
		tokensObserved: number,
		observationTokens: number,
	): void {
		this.omProgress.status = "idle"
		this.omProgress.cycleId = undefined
		this.omProgress.startTime = undefined
		this.omProgress.observationTokens = observationTokens
		// Messages have been observed — reset pending tokens
		this.omProgress.pendingTokens = 0
		this.omProgress.thresholdPercent = 0
		// Show success marker in chat history
		this.addOMMarkerToChat(
			new OMMarkerComponent({
				type: "om_observation_end",
				tokensObserved,
				observationTokens,
				durationMs,
				operationType: "observation",
			}),
		)
		// Revert spinner to "Working..."
		this.updateLoaderText("Working...")
		this.ui.requestRender()
		this.updateStatusLine()
	}

	private handleOMReflectionStart(
		cycleId: string,
		tokensToReflect: number,
	): void {
		this.omProgress.status = "reflecting"
		this.omProgress.cycleId = cycleId
		this.omProgress.startTime = Date.now()
		const tokens =
			tokensToReflect > 0
				? ` ~${this.formatTokensShort(tokensToReflect)} tokens`
				: ""
		this.updateLoaderText(`Reflecting${tokens}...`)
		this.ui.requestRender()
		this.updateStatusLine()
	}

	private handleOMReflectionEnd(
		_cycleId: string,
		durationMs: number,
		compressedTokens: number,
	): void {
		// Capture the pre-compression observation tokens for the marker display
		const preCompressionTokens = this.omProgress.observationTokens
		this.omProgress.status = "idle"
		this.omProgress.cycleId = undefined
		this.omProgress.startTime = undefined
		// Observations were compressed — update token count
		this.omProgress.observationTokens = compressedTokens
		this.omProgress.reflectionThresholdPercent =
			this.omProgress.reflectionThreshold > 0
				? (compressedTokens / this.omProgress.reflectionThreshold) * 100
				: 0
		// Show success marker in chat history
		this.addOMMarkerToChat(
			new OMMarkerComponent({
				type: "om_observation_end",
				tokensObserved: preCompressionTokens,
				observationTokens: compressedTokens,
				durationMs,
				operationType: "reflection",
			}),
		)
		// Revert spinner to "Working..."
		this.updateLoaderText("Working...")
		this.ui.requestRender()
		this.updateStatusLine()
	}

	private handleOMFailed(
		_cycleId: string,
		error: string,
		operation: "observation" | "reflection",
	): void {
		this.omProgress.status = "idle"
		this.omProgress.cycleId = undefined
		this.omProgress.startTime = undefined
		// Show failure marker in chat history
		this.addOMMarkerToChat(
			new OMMarkerComponent({
				type: "om_observation_failed",
				error,
				operationType: operation,
			}),
		)
		// Revert spinner to "Working..."
		this.updateLoaderText("Working...")
		this.ui.requestRender()
		this.updateStatusLine()
	}

	/** Update the loading animation text (e.g., "Working..." → "Observing...") */
	private updateLoaderText(text: string): void {
		if (this.loadingAnimation) {
			this.loadingAnimation.stop()
		}
		this.statusContainer.clear()
		this.loadingAnimation = new Loader(
			this.ui,
			(spinner) => fg("accent", spinner),
			(text) => fg("muted", text),
			text,
		)
		this.statusContainer.addChild(this.loadingAnimation)
	}

	private handleAgentStart(): void {
		// Clear any existing loader or done message
		if (this.loadingAnimation) {
			this.loadingAnimation.stop()
		}
		this.statusContainer.clear()

		// Show loading animation
		this.loadingAnimation = new Loader(
			this.ui,
			(spinner) => fg("accent", spinner),
			(text) => fg("muted", text),
			"Working...",
		)
		this.statusContainer.addChild(this.loadingAnimation)
		this.ui.requestRender()
	}

	private handleAgentEnd(): void {
		if (this.loadingAnimation) {
			this.loadingAnimation.stop()
			this.loadingAnimation = undefined
		}
		this.statusContainer.clear()
		this.ui.requestRender()

		if (this.streamingComponent) {
			this.streamingComponent = undefined
			this.streamingMessage = undefined
		}

		this.pendingTools.clear()
		// Keep allToolComponents so Ctrl+E continues to work after agent completes
	}

	private handleAgentAborted(): void {
		if (this.loadingAnimation) {
			this.loadingAnimation.stop()
			this.loadingAnimation = undefined
		}
		this.statusContainer.clear()

		// Show "Interrupted" indicator
		this.statusContainer.addChild(
			new Text(fg("warning", "⚠ Interrupted"), 0, 0),
		)
		this.ui.requestRender()

		if (this.streamingComponent) {
			this.streamingComponent = undefined
			this.streamingMessage = undefined
		}

		this.pendingTools.clear()
		// Keep allToolComponents so Ctrl+E continues to work after interruption
	}

	private handleAgentError(): void {
		if (this.loadingAnimation) {
			this.loadingAnimation.stop()
			this.loadingAnimation = undefined
		}
		this.statusContainer.clear()

		// Show "Error" indicator
		this.statusContainer.addChild(new Text(fg("error", "✗ Error"), 0, 0))
		this.ui.requestRender()

		if (this.streamingComponent) {
			this.streamingComponent = undefined
			this.streamingMessage = undefined
		}

		this.pendingTools.clear()
		// Keep allToolComponents so Ctrl+E continues to work after errors
	}

	private handleMessageStart(message: HarnessMessage): void {
		if (message.role === "user") {
			this.addUserMessage(message)
		} else if (message.role === "assistant") {
			// Clear tool component references when starting a new assistant message
			this.lastAskUserComponent = undefined
			this.lastSubmitPlanComponent = undefined

			if (!this.streamingComponent) {
				this.streamingComponent = new AssistantMessageComponent(
					undefined,
					this.hideThinkingBlock,
					getMarkdownTheme(),
				)
				this.chatContainer.addChild(this.streamingComponent)
				this.streamingMessage = message
				const trailingParts = this.getTrailingContentParts(message)
				this.streamingComponent.updateContent({
					...message,
					content: trailingParts,
				})
			}
			this.ui.requestRender()
		}
	}

	private handleMessageUpdate(message: HarnessMessage): void {
		if (!this.streamingComponent || message.role !== "assistant") return

		this.streamingMessage = message

		// Check for new tool calls
		for (const content of message.content) {
			if (content.type === "tool_call") {
				if (!this.seenToolCallIds.has(content.id)) {
					this.seenToolCallIds.add(content.id)
					this.chatContainer.addChild(new Text("", 0, 0))
					const component = new ToolExecutionComponentEnhanced(
						content.name,
						content.args,
						{ showImages: false, collapsedByDefault: !this.toolOutputExpanded },
						this.ui,
					)
					component.setExpanded(this.toolOutputExpanded)
					this.chatContainer.addChild(component)
					this.pendingTools.set(content.id, component)
					this.allToolComponents.push(component)

					this.streamingComponent = new AssistantMessageComponent(
						undefined,
						this.hideThinkingBlock,
						getMarkdownTheme(),
					)
					this.chatContainer.addChild(this.streamingComponent)
				} else {
					const component = this.pendingTools.get(content.id)
					if (component) {
						component.updateArgs(content.args)
					}
				}
			}
		}

		const trailingParts = this.getTrailingContentParts(message)
		this.streamingComponent.updateContent({
			...message,
			content: trailingParts,
		})

		this.ui.requestRender()
	}

	/**
	 * Get content parts after the last tool_call/tool_result in the message.
	 * These are the parts that should be rendered in the current streaming component.
	 */
	private getTrailingContentParts(
		message: HarnessMessage,
	): HarnessMessage["content"] {
		let lastToolIndex = -1
		for (let i = message.content.length - 1; i >= 0; i--) {
			const c = message.content[i]
			if (c.type === "tool_call" || c.type === "tool_result") {
				lastToolIndex = i
				break
			}
		}
		if (lastToolIndex === -1) {
			// No tool calls — return all content
			return message.content
		}
		// Return everything after the last tool-related part
		return message.content.slice(lastToolIndex + 1)
	}

	private handleMessageEnd(message: HarnessMessage): void {
		if (message.role === "user") return

		if (this.streamingComponent && message.role === "assistant") {
			this.streamingMessage = message
			const trailingParts = this.getTrailingContentParts(message)
			this.streamingComponent.updateContent({
				...message,
				content: trailingParts,
			})

			if (message.stopReason === "aborted" || message.stopReason === "error") {
				const errorMessage = message.errorMessage || "Operation aborted"
				for (const [, component] of this.pendingTools) {
					component.updateResult({
						content: [{ type: "text", text: errorMessage }],
						isError: true,
					})
				}
				this.pendingTools.clear()
			}

			this.streamingComponent = undefined
			this.streamingMessage = undefined
			this.seenToolCallIds.clear()
		}
		this.ui.requestRender()
	}

	private handleToolStart(
		toolCallId: string,
		toolName: string,
		args: unknown,
	): void {
		if (!this.seenToolCallIds.has(toolCallId)) {
			this.seenToolCallIds.add(toolCallId)

			// Skip creating the regular tool component for subagent calls
			// The SubagentExecutionComponent will handle all the rendering
			if (toolName === "subagent") {
				return
			}

			this.chatContainer.addChild(new Text("", 0, 0))
			const component = new ToolExecutionComponentEnhanced(
				toolName,
				args,
				{ showImages: false, collapsedByDefault: !this.toolOutputExpanded },
				this.ui,
			)
			component.setExpanded(this.toolOutputExpanded)
			this.chatContainer.addChild(component)
			this.pendingTools.set(toolCallId, component)
			this.allToolComponents.push(component)

			// Track ask_user tool components for inline question placement
			if (toolName === "ask_user") {
				this.lastAskUserComponent = component
			}

			// Track submit_plan tool components for inline plan approval placement
			if (toolName === "submit_plan") {
				this.lastSubmitPlanComponent = component
			}

			// Create a new post-tool AssistantMessageComponent so pre-tool text is preserved
			this.streamingComponent = new AssistantMessageComponent(
				undefined,
				this.hideThinkingBlock,
				getMarkdownTheme(),
			)
			this.chatContainer.addChild(this.streamingComponent)

			this.ui.requestRender()
		}
	}

	private handleToolUpdate(toolCallId: string, partialResult: unknown): void {
		const component = this.pendingTools.get(toolCallId)
		if (component) {
			const result: ToolResult = {
				content: [{ type: "text", text: this.formatToolResult(partialResult) }],
				isError: false,
			}
			component.updateResult(result, true)
			this.ui.requestRender()
		}
	}

	/**
	 * Handle a tool that requires user approval before execution.
	 */
	private async handleToolApprovalRequired(
		toolCallId: string,
		toolName: string,
		args: unknown,
	): Promise<void> {
		return new Promise((resolve) => {
			const dialog = new ToolApprovalDialogComponent({
				toolCallId,
				toolName,
				args,
				onApprove: async () => {
					this.ui.hideOverlay()
					this.showInfo(`Approved: ${toolName}`)
					try {
						await this.harness.approveToolCall(toolCallId)
					} catch (error) {
						this.showError(
							error instanceof Error ? error.message : "Failed to approve tool",
						)
					}
					resolve()
				},
				onDecline: async () => {
					this.ui.hideOverlay()
					this.showInfo(`Declined: ${toolName}`)
					try {
						await this.harness.declineToolCall(toolCallId)
					} catch (error) {
						this.showError(
							error instanceof Error ? error.message : "Failed to decline tool",
						)
					}
					resolve()
				},
			})

			this.ui.showOverlay(dialog, {
				width: "80%",
				anchor: "center",
			})
			dialog.focused = true
		})
	}

	/**
	 * Handle an ask_question event from the ask_user tool.
	 * Shows a dialog overlay and resolves the tool's pending promise.
	 */
	private async handleAskQuestion(
		questionId: string,
		question: string,
		options?: Array<{ label: string; description?: string }>,
	): Promise<void> {
		return new Promise((resolve) => {
			if (this.options.inlineQuestions) {
				// Inline mode: Add question component to chat
				const questionComponent = new AskQuestionInlineComponent(
					{
						question,
						options,
						onSubmit: (answer) => {
							this.activeInlineQuestion = undefined
							this.harness.respondToQuestion(questionId, answer)
							resolve()
						},
						onCancel: () => {
							this.activeInlineQuestion = undefined
							this.harness.respondToQuestion(questionId, "(skipped)")
							resolve()
						},
					},
					this.ui,
				)

				// Store as active question
				this.activeInlineQuestion = questionComponent

				// Insert the question right after the ask_user tool component
				if (this.lastAskUserComponent) {
					// Find the position of the ask_user component
					const children = [...this.chatContainer.children]
					// Since lastAskUserComponent extends Container, it should be in children
					const askUserIndex = children.indexOf(
						this.lastAskUserComponent as any,
					)

					if (askUserIndex >= 0) {
						// Debug: Log the positioning

						// Clear and rebuild with question in the right place
						this.chatContainer.clear()

						// Add all children up to and including the ask_user tool
						for (let i = 0; i <= askUserIndex; i++) {
							this.chatContainer.addChild(children[i])
						}

						// Add the question component with spacing
						this.chatContainer.addChild(new Spacer(1))
						this.chatContainer.addChild(questionComponent)
						this.chatContainer.addChild(new Spacer(1))

						// Add remaining children
						for (let i = askUserIndex + 1; i < children.length; i++) {
							this.chatContainer.addChild(children[i])
						}
					} else {
						// Fallback: add at the end
						this.chatContainer.addChild(new Spacer(1))
						this.chatContainer.addChild(questionComponent)
						this.chatContainer.addChild(new Spacer(1))
					}
				} else {
					// Fallback: add at the end if no ask_user component tracked
					this.chatContainer.addChild(new Spacer(1))
					this.chatContainer.addChild(questionComponent)
					this.chatContainer.addChild(new Spacer(1))
				}

				this.ui.requestRender()

				// Ensure the chat scrolls to show the question
				this.chatContainer.invalidate()

				// Focus the question component
				questionComponent.focused = true
			} else {
				// Dialog mode: Show overlay
				const dialog = new AskQuestionDialogComponent({
					question,
					options,
					onSubmit: (answer) => {
						this.ui.hideOverlay()
						this.harness.respondToQuestion(questionId, answer)
						resolve()
					},
					onCancel: () => {
						this.ui.hideOverlay()
						this.harness.respondToQuestion(questionId, "(skipped)")
						resolve()
					},
				})
				this.ui.showOverlay(dialog, { width: "70%", anchor: "center" })
				dialog.focused = true
			}
		})
	}

	/**
	 * Handle a plan_approval_required event from the submit_plan tool.
	 * Shows the plan inline with Approve/Reject/Request Changes options.
	 */
	private async handlePlanApproval(
		planId: string,
		title: string,
		plan: string,
	): Promise<void> {
		return new Promise((resolve) => {
			const approvalComponent = new PlanApprovalInlineComponent(
				{
					planId,
					title,
					plan,
					onApprove: async () => {
						this.activeInlinePlanApproval = undefined
						// Store the approved plan in harness state
						await this.harness.setState({
							activePlan: {
								title,
								plan,
								approvedAt: new Date().toISOString(),
							},
						})
						this.harness.respondToPlanApproval(planId, { action: "approved" })
						this.updateStatusLine()
						resolve()
					},
					onReject: async (feedback?: string) => {
						this.activeInlinePlanApproval = undefined
						this.harness.respondToPlanApproval(planId, {
							action: "rejected",
							feedback,
						})
						resolve()
					},
				},
				this.ui,
			)

			// Store as active plan approval
			this.activeInlinePlanApproval = approvalComponent

			// Insert after the submit_plan tool component (same pattern as ask_user)
			if (this.lastSubmitPlanComponent) {
				const children = [...this.chatContainer.children]
				const submitPlanIndex = children.indexOf(
					this.lastSubmitPlanComponent as any,
				)

				if (submitPlanIndex >= 0) {
					this.chatContainer.clear()
					for (let i = 0; i <= submitPlanIndex; i++) {
						this.chatContainer.addChild(children[i])
					}
					this.chatContainer.addChild(new Spacer(1))
					this.chatContainer.addChild(approvalComponent)
					this.chatContainer.addChild(new Spacer(1))
					for (let i = submitPlanIndex + 1; i < children.length; i++) {
						this.chatContainer.addChild(children[i])
					}
				} else {
					this.chatContainer.addChild(new Spacer(1))
					this.chatContainer.addChild(approvalComponent)
					this.chatContainer.addChild(new Spacer(1))
				}
			} else {
				this.chatContainer.addChild(new Spacer(1))
				this.chatContainer.addChild(approvalComponent)
				this.chatContainer.addChild(new Spacer(1))
			}

			this.ui.requestRender()
			this.chatContainer.invalidate()
			approvalComponent.focused = true
		})
	}

	private handleToolEnd(
		toolCallId: string,
		result: unknown,
		isError: boolean,
	): void {
		// If this is a subagent tool, store the result in the SubagentExecutionComponent
		const subagentComponent = this.pendingSubagents.get(toolCallId)
		if (subagentComponent) {
			// The final result is available here
			const resultText = this.formatToolResult(result)
			// We'll need to wait for subagent_end to set this
			// Store it temporarily
			;(subagentComponent as any)._pendingResult = resultText
		}

		const component = this.pendingTools.get(toolCallId)
		if (component) {
			const toolResult: ToolResult = {
				content: [{ type: "text", text: this.formatToolResult(result) }],
				isError,
			}
			component.updateResult(toolResult, false)

			// Check if this was a todo_write tool and update the todo display
			const toolName = (component as any).toolName || ""
			if (toolName === "todo_write" && !isError) {
				this.handleTodoUpdate(result)
			}

			this.pendingTools.delete(toolCallId)
			this.ui.requestRender()
		}
	}

	/**
	 * Format a tool result for display.
	 * Handles objects, strings, and other types.
	 */
	private formatToolResult(result: unknown): string {
		if (result === null || result === undefined) {
			return ""
		}
		if (typeof result === "string") {
			return result
		}
		if (typeof result === "object") {
			try {
				return JSON.stringify(result, null, 2)
			} catch {
				return String(result)
			}
		}
		return String(result)
	}

	/**
	 * Handle todo updates from todo_write tool
	 */
	private handleTodoUpdate(result: unknown): void {
		// Parse the result to extract todos
		if (result && typeof result === "object" && "todos" in result) {
			const todoResult = result as { todos: TodoItem[] }
			if (this.todoProgress) {
				this.todoProgress.updateTodos(todoResult.todos)
				this.ui.requestRender()
			}
		}
	}

	// ===========================================================================
	// Subagent Events
	// ===========================================================================

	private handleSubagentStart(
		toolCallId: string,
		agentType: string,
		task: string,
	): void {
		// Create a dedicated rendering component for this subagent run
		const component = new SubagentExecutionComponent(agentType, task, this.ui)
		this.pendingSubagents.set(toolCallId, component)
		this.chatContainer.addChild(component)

		// Don't create a new AssistantMessageComponent here - it will be created
		// when the next text delta arrives after the subagent completes

		this.ui.requestRender()
	}

	private handleSubagentToolStart(
		toolCallId: string,
		subToolName: string,
		subToolArgs: unknown,
	): void {
		const component = this.pendingSubagents.get(toolCallId)
		if (component) {
			component.addToolStart(subToolName, subToolArgs)
			this.ui.requestRender()
		}
	}

	private handleSubagentToolEnd(
		toolCallId: string,
		subToolName: string,
		subToolResult: unknown,
		isError: boolean,
	): void {
		const component = this.pendingSubagents.get(toolCallId)
		if (component) {
			component.addToolEnd(subToolName, subToolResult, isError)
			this.ui.requestRender()
		}
	}

	private handleSubagentEnd(
		toolCallId: string,
		isError: boolean,
		durationMs: number,
		result?: string,
	): void {
		const component = this.pendingSubagents.get(toolCallId)
		if (component) {
			component.finish(isError, durationMs, result)
			this.pendingSubagents.delete(toolCallId)
			this.allToolComponents.push(component as any) // Add to tool components for keyboard nav
			this.ui.requestRender()
		}
	}

	// ===========================================================================
	// User Input
	// ===========================================================================

	private getUserInput(): Promise<string> {
		return new Promise((resolve) => {
			this.editor.onSubmit = (text: string) => {
				this.editor.setText("")
				resolve(text)
			}
		})
	}

	// ===========================================================================
	// Thread Selector
	// ===========================================================================

	private async showThreadSelector(): Promise<void> {
		const threads = await this.harness.listThreads({ allResources: true })
		const currentId = this.pendingNewThread
			? null
			: this.harness.getCurrentThreadId()
		const currentResourceId = this.harness.getResourceId()

		if (threads.length === 0) {
			this.showInfo("No threads yet. Send a message to create one.")
			return
		}

		return new Promise((resolve) => {
			const selector = new ThreadSelectorComponent({
				tui: this.ui,
				threads,
				currentThreadId: currentId,
				currentResourceId,
				getMessagePreview: async (threadId: string) => {
					const messages = await this.harness.getMessagesForThread(threadId)
					const firstUserMessage = messages.find((m) => m.role === "user")
					if (firstUserMessage) {
						const text = this.extractTextContent(firstUserMessage)
						return this.truncatePreview(text)
					}
					return null
				},
				onSelect: async (thread) => {
					this.ui.hideOverlay()

					if (thread.id === currentId) {
						resolve()
						return
					}

					// If thread is from a different resource, switch resource first
					if (thread.resourceId !== currentResourceId) {
						this.harness.setResourceId(thread.resourceId)
					}

					await this.harness.switchThread(thread.id)
					this.pendingNewThread = false

					// Clear chat and render existing messages
					this.chatContainer.clear()
					this.allToolComponents = []
					this.pendingTools.clear()
					await this.renderExistingMessages()
					this.updateStatusLine()

					this.showInfo(`Switched to: ${thread.title || thread.id}`)
					resolve()
				},
				onCancel: () => {
					this.ui.hideOverlay()
					resolve()
				},
			})

			this.ui.showOverlay(selector, {
				width: "80%",
				maxHeight: "60%",
				anchor: "center",
			})
			selector.focused = true
		})
	}

	// ===========================================================================
	// Thread Tagging
	// ===========================================================================

	private async tagThreadWithDir(): Promise<void> {
		const threadId = this.harness.getCurrentThreadId()
		if (!threadId && this.pendingNewThread) {
			this.showInfo("No active thread yet — send a message first.")
			return
		}
		if (!threadId) {
			this.showInfo("No active thread.")
			return
		}

		const projectPath = (this.harness.getState() as any)?.projectPath as
			| string
			| undefined
		if (!projectPath) {
			this.showInfo("Could not detect current project path.")
			return
		}

		const dirName = projectPath.split("/").pop() || projectPath

		return new Promise<void>((resolve) => {
			const questionComponent = new AskQuestionInlineComponent(
				{
					question: `Tag this thread with directory "${dirName}"?\n  ${fg("dim", projectPath)}`,
					options: [{ label: "Yes" }, { label: "No" }],
					formatResult: (answer) =>
						answer === "Yes"
							? `Tagged thread with: ${dirName}`
							: `Thread not tagged`,
					onSubmit: async (answer) => {
						this.activeInlineQuestion = undefined
						if (answer.toLowerCase().startsWith("y")) {
							await this.harness.persistThreadSetting(
								"projectPath",
								projectPath,
							)
						}
						resolve()
					},
					onCancel: () => {
						this.activeInlineQuestion = undefined
						resolve()
					},
				},
				this.ui,
			)

			this.activeInlineQuestion = questionComponent
			this.chatContainer.addChild(new Spacer(1))
			this.chatContainer.addChild(questionComponent)
			this.chatContainer.addChild(new Spacer(1))
			this.ui.requestRender()
			this.chatContainer.invalidate()
		})
	}

	// ===========================================================================
	// Skills List
	// ===========================================================================

	/**
	 * Get the workspace, preferring harness-owned workspace over the direct option.
	 */
	private getResolvedWorkspace(): Workspace | undefined {
		return this.harness.getWorkspace() ?? this.workspace
	}

	private async showSkillsList(): Promise<void> {
		const workspace = this.getResolvedWorkspace()
		if (!workspace?.skills) {
			this.showInfo(
				"No skills configured.\n\n" +
					"Add skills to any of these locations:\n" +
					"  .mastracode/skills/   (project-local)\n" +
					"  .claude/skills/       (project-local)\n" +
					"  ~/.mastracode/skills/ (global)\n" +
					"  ~/.claude/skills/     (global)\n\n" +
					"Each skill is a folder with a SKILL.md file.\n" +
					"Install skills: npx add-skill <github-url>",
			)
			return
		}

		try {
			const skills = await workspace.skills!.list()

			if (skills.length === 0) {
				this.showInfo(
					"No skills found in configured directories.\n\n" +
						"Each skill needs a SKILL.md file with YAML frontmatter.\n" +
						"Install skills: npx add-skill <github-url>",
				)
				return
			}

			const skillLines = skills.map((skill) => {
				const desc = skill.description
					? ` - ${skill.description.length > 60 ? skill.description.slice(0, 57) + "..." : skill.description}`
					: ""
				return `  ${skill.name}${desc}`
			})

			this.showInfo(
				`Skills (${skills.length}):\n${skillLines.join("\n")}\n\n` +
					"Skills are automatically activated by the agent when relevant.",
			)
		} catch (error) {
			this.showError(
				`Failed to list skills: ${error instanceof Error ? error.message : String(error)}`,
			)
		}
	}

	// ===========================================================================
	// Model Selector
	// ===========================================================================

	private async showModelSelector(): Promise<void> {
		// Get available models from harness
		const availableModels = await this.harness.getAvailableModels()

		if (availableModels.length === 0) {
			this.showInfo("No models available. Check your Mastra configuration.")
			return
		}

		// Get current model from harness state (not from agent config)
		const currentModelId = this.harness.getCurrentModelId()

		// Create model selector
		return new Promise((resolve) => {
			const selector = new ModelSelectorComponent({
				tui: this.ui,
				models: availableModels,
				currentModelId,
				onSelect: async (model: ModelItem) => {
					this.ui.hideOverlay()

					// Switch model via harness (updates state, which dynamic model function reads)
					await this.harness.switchModel(model.id)

					this.showInfo(`Switched to: ${model.id}`)
					this.updateStatusLine()
					resolve()
				},
				onCancel: () => {
					this.ui.hideOverlay()
					resolve()
				},
			})

			// Show as overlay
			this.ui.showOverlay(selector, {
				width: "80%",
				maxHeight: "60%",
				anchor: "center",
			})
			selector.focused = true
		})
	}

	// ===========================================================================
	// Observational Memory Settings
	// ===========================================================================

	private async showOMSettings(): Promise<void> {
		// Get available models for the model submenus
		const availableModels = await this.harness.getAvailableModels()
		const modelOptions = availableModels.map((m) => ({
			id: m.id,
			label: m.id,
		}))

		const config = {
			observerModelId: this.harness.getObserverModelId(),
			reflectorModelId: this.harness.getReflectorModelId(),
			observationThreshold: this.harness.getObservationThreshold(),
			reflectionThreshold: this.harness.getReflectionThreshold(),
		}

		return new Promise<void>((resolve) => {
			const settings = new OMSettingsComponent(
				config,
				{
					onObserverModelChange: async (modelId) => {
						await this.harness.switchObserverModel(modelId)
						this.showInfo(`Observer model → ${modelId}`)
					},
					onReflectorModelChange: async (modelId) => {
						await this.harness.switchReflectorModel(modelId)
						this.showInfo(`Reflector model → ${modelId}`)
					},
					onObservationThresholdChange: (value) => {
						this.harness.setObservationThreshold(value)
						this.omProgress.threshold = value
						this.omProgress.thresholdPercent =
							value > 0 ? (this.omProgress.pendingTokens / value) * 100 : 0
						this.updateStatusLine()
					},
					onReflectionThresholdChange: (value) => {
						this.harness.setReflectionThreshold(value)
						this.omProgress.reflectionThreshold = value
						this.omProgress.reflectionThresholdPercent =
							value > 0 ? (this.omProgress.observationTokens / value) * 100 : 0
						this.updateStatusLine()
					},
					onClose: () => {
						this.ui.hideOverlay()
						this.updateStatusLine()
						resolve()
					},
				},
				modelOptions,
				this.ui,
			)

			this.ui.showOverlay(settings, {
				width: "80%",
				maxHeight: "70%",
				anchor: "center",
			})
			settings.focused = true
		})
	}

	// ===========================================================================
	// Thinking Settings
	// ===========================================================================

	private async showThinkingSettings(): Promise<void> {
		const currentLevel = this.harness.getThinkingLevel()

		const levels = [
			{ label: "Off", description: "No extended thinking", id: "off" },
			{ label: "Minimal", description: "~1k budget tokens", id: "minimal" },
			{ label: "Low", description: "~4k budget tokens", id: "low" },
			{ label: "Medium", description: "~10k budget tokens", id: "medium" },
			{ label: "High", description: "~32k budget tokens", id: "high" },
		]

		const currentLabel =
			levels.find((l) => l.id === currentLevel)?.label ?? "Off"

		return new Promise<void>((resolve) => {
			const questionComponent = new AskQuestionInlineComponent(
				{
					question: `Set thinking level (currently: ${currentLabel})`,
					options: levels.map((l) => ({
						label: l.label,
						description: l.description,
					})),
					formatResult: (answer) =>
						`Thinking level: ${currentLabel} → ${answer}`,
					onSubmit: async (answer) => {
						this.activeInlineQuestion = undefined
						const level = levels.find((l) => l.label === answer)
						if (level) {
							await this.harness.setThinkingLevel(level.id)
							this.updateStatusLine()
						}
						resolve()
					},
					onCancel: () => {
						this.activeInlineQuestion = undefined
						resolve()
					},
				},
				this.ui,
			)

			this.activeInlineQuestion = questionComponent
			this.chatContainer.addChild(new Spacer(1))
			this.chatContainer.addChild(questionComponent)
			this.chatContainer.addChild(new Spacer(1))
			this.ui.requestRender()
			this.chatContainer.invalidate()
		})
	}

	// ===========================================================================
	// Login Selector
	// ===========================================================================

	private async showLoginSelector(mode: "login" | "logout"): Promise<void> {
		const allProviders = this.harness.getOAuthProviders()
		const loggedInIds = this.harness.getLoggedInProviders()

		if (mode === "logout") {
			if (loggedInIds.length === 0) {
				this.showInfo("No OAuth providers logged in. Use /login first.")
				return
			}
		}

		const providers =
			mode === "logout"
				? allProviders.filter((p) => loggedInIds.includes(p.id))
				: allProviders

		if (providers.length === 0) {
			this.showInfo("No OAuth providers available.")
			return
		}

		const action = mode === "login" ? "Log in to" : "Log out from"

		return new Promise<void>((resolve) => {
			const questionComponent = new AskQuestionInlineComponent(
				{
					question: `${action} which provider?`,
					options: providers.map((p) => ({
						label: p.name,
						description: loggedInIds.includes(p.id) ? "(logged in)" : "",
					})),
					formatResult: (answer) =>
						mode === "login"
							? `Logging in to ${answer}…`
							: `Logged out from ${answer}`,
					onSubmit: async (answer) => {
						this.activeInlineQuestion = undefined
						const provider = providers.find((p) => p.name === answer)
						if (provider) {
							if (mode === "login") {
								await this.performLogin(provider.id)
							} else {
								this.harness.logout(provider.id)
								this.showInfo(`Logged out from ${provider.name}`)
							}
						}
						resolve()
					},
					onCancel: () => {
						this.activeInlineQuestion = undefined
						resolve()
					},
				},
				this.ui,
			)

			this.activeInlineQuestion = questionComponent
			this.chatContainer.addChild(new Spacer(1))
			this.chatContainer.addChild(questionComponent)
			this.chatContainer.addChild(new Spacer(1))
			this.ui.requestRender()
			this.chatContainer.invalidate()
		})
	}

	private async performLogin(providerId: string): Promise<void> {
		const provider = this.harness
			.getOAuthProviders()
			.find((p) => p.id === providerId)
		const providerName = provider?.name || providerId

		return new Promise((resolve) => {
			const dialog = new LoginDialogComponent(
				this.ui,
				providerId,
				(success, message) => {
					this.ui.hideOverlay()
					if (success) {
						this.showInfo(`Successfully logged in to ${providerName}`)
					} else if (message) {
						this.showInfo(message)
					}
					resolve()
				},
			)

			// Show as overlay - same size as model selector
			this.ui.showOverlay(dialog, {
				width: "80%",
				maxHeight: "60%",
				anchor: "center",
			})
			dialog.focused = true

			// Start the login flow via harness
			this.harness
				.login(providerId, {
					onAuth: (info: { url: string; instructions?: string }) => {
						dialog.showAuth(info.url, info.instructions)
					},
					onPrompt: async (prompt: {
						message: string
						placeholder?: string
					}) => {
						return dialog.showPrompt(prompt.message, prompt.placeholder)
					},
					onProgress: (message: string) => {
						dialog.showProgress(message)
					},
					signal: dialog.signal,
				})
				.then(async () => {
					this.ui.hideOverlay()

					// Auto-switch to the provider's default model
					const defaultModel = this.harness
						.getAuthStorage()
						.getDefaultModelForProvider(providerId as any)
					if (defaultModel) {
						await this.harness.switchModel(defaultModel)
						this.updateStatusLine()
						this.showInfo(
							`Logged in to ${providerName} - switched to ${defaultModel}`,
						)
					} else {
						this.showInfo(`Successfully logged in to ${providerName}`)
					}

					resolve()
				})
				.catch((error: Error) => {
					this.ui.hideOverlay()
					if (error.message !== "Login cancelled") {
						this.showError(`Failed to login: ${error.message}`)
					}
					resolve()
				})
		})
	}

	// ===========================================================================
	// Cost Tracking
	// ===========================================================================

	private async showCostBreakdown(): Promise<void> {
		// Format the breakdown
		const formatNumber = (n: number) => n.toLocaleString()

		// Get OM token usage if available
		let omTokensText = ""
		if (this.omProgress.observationTokens > 0) {
			omTokensText = `
  Memory:     ${formatNumber(this.omProgress.observationTokens)} tokens`
		}

		this.showInfo(`Token Usage (Current Thread):
  Input:      ${formatNumber(this.tokenUsage.promptTokens)} tokens
  Output:     ${formatNumber(this.tokenUsage.completionTokens)} tokens${omTokensText}
  ─────────────────────────────────────────
  Total:      ${formatNumber(this.tokenUsage.totalTokens)} tokens
  
  Note: For cost estimates, check your provider's pricing page.`)
	}

	// ===========================================================================
	// Slash Commands
	// ===========================================================================

    private async handleSlashCommand(input: string): Promise<boolean> {
        const trimmedInput = input.trim()

        // Strip all leading slashes to get the raw command content
        // User may type /command or //command, and pi-tui may or may not strip one /
        const withoutSlashes = trimmedInput.replace(/^\/+/, "")
        const customCommandName = withoutSlashes.split(" ")[0]
        const customArgs = withoutSlashes
            .slice(customCommandName.length)
            .trim()
            .split(" ")
            .filter(Boolean)

        // Check for custom command match first
        const customCommand = this.customSlashCommands.find(
            (cmd) => cmd.name === customCommandName,
        )
        if (customCommand) {
            await this.handleCustomSlashCommand(customCommand, customArgs)
            return true
        }

        const [command, ...args] = withoutSlashes.split(" ")

		switch (command) {
			case "new": {
				// Defer thread creation until first message
				this.pendingNewThread = true
				this.chatContainer.clear()
				this.pendingTools.clear()
				this.allToolComponents = []
				this.resetStatusLineState()
				this.ui.requestRender()
				this.showInfo("Ready for new conversation")
				return true
			}

			case "threads": {
				await this.showThreadSelector()
				return true
			}

			case "skills": {
				await this.showSkillsList()
				return true
			}

			case "thread:tag-dir": {
				await this.tagThreadWithDir()
				return true
			}

			case "mode": {
				const modes = this.harness.getModes()
				if (modes.length <= 1) {
					this.showInfo("Only one mode available")
					return true
				}
				if (args[0]) {
					await this.harness.switchMode(args[0])
				} else {
					const currentMode = this.harness.getCurrentMode()
					const modeList = modes
						.map(
							(m) =>
								`  ${m.id === currentMode?.id ? "* " : "  "}${m.id}${m.name ? ` - ${m.name}` : ""}`,
						)
						.join("\n")
					this.showInfo(`Modes:
${modeList}`)
				}
				return true
			}

			case "models": {
				await this.showModelSelector()
				return true
			}

			case "om": {
				await this.showOMSettings()
				return true
			}

			case "think": {
				await this.showThinkingSettings()
				return true
			}

			case "yolo": {
				const current = this.harness.getYoloMode()
				this.harness.setYoloMode(!current)
				this.showInfo(
					!current
						? "YOLO mode ON — tools auto-approved"
						: "YOLO mode OFF — tools require approval",
				)
				this.updateStatusLine()
				return true
			}

			case "login": {
				await this.showLoginSelector("login")
				return true
			}

			case "logout": {
				await this.showLoginSelector("logout")
				return true
			}

			case "cost": {
				await this.showCostBreakdown()
				return true
			}

			case "exit":
				this.stop()
				process.exit(0)

			case "help": {
				const modes = this.harness.getModes()
				const modeHelp =
					modes.length > 1 ? "\n/mode     - Switch or list modes" : ""

				// Build custom commands help
				let customCommandsHelp = ""
				if (this.customSlashCommands.length > 0) {
					customCommandsHelp =
						"\n\nCustom commands (use // prefix):\n" +
						this.customSlashCommands
							.map(
								(cmd) =>
									`  //${cmd.name.padEnd(8)} - ${cmd.description || "No description"}`,
							)
							.join("\n")
				}

				this.showInfo(`Available commands:
  /new       - Start a new thread
  /threads       - Switch between threads
  /thread:tag-dir - Tag thread with current directory
  /skills        - List available skills
  /models    - Switch model
  /om       - Configure Observational Memory
  /think    - Set thinking level (Anthropic)
  /yolo     - Toggle YOLO mode (auto-approve tools)
  /cost     - Show token usage and estimated costs
  /hooks    - Show/reload configured hooks
  /mcp      - Show/reload MCP server connections
  /login    - Login with OAuth provider
  /logout   - Logout from OAuth provider${modeHelp}
  /exit     - Exit the TUI
  /help     - Show this help${customCommandsHelp}

Keyboard shortcuts:
  Ctrl+C    - Interrupt agent / clear input
  Ctrl+C×2  - Exit process (double-tap)
  Ctrl+D    - Exit (when editor is empty)
  Enter     - While working: steer (interrupt + redirect)
  Ctrl+F    - While working: queue follow-up message
  Shift+Tab - Cycle agent modes
  Ctrl+T    - Toggle thinking blocks
  Ctrl+E    - Expand/collapse tool outputs`)
				return true
			}

			case "hooks": {
				const hm = this.harness.getHookManager?.()
				if (!hm) {
					this.showInfo("Hooks system not initialized.")
					return true
				}

				const subcommand = args[0]
				if (subcommand === "reload") {
					hm.reload()
					this.showInfo("Hooks config reloaded.")
					return true
				}

				const paths = hm.getConfigPaths()

				if (!hm.hasHooks()) {
					this.showInfo(
						`No hooks configured.\n\n` +
							`Add hooks to:\n` +
							`  ${paths.project} (project)\n` +
							`  ${paths.global} (global)\n\n` +
							`Example hooks.json:\n` +
							`  {\n` +
							`    "PreToolUse": [{\n` +
							`      "type": "command",\n` +
							`      "command": "echo 'tool called'",\n` +
							`      "matcher": { "tool_name": "execute_command" }\n` +
							`    }]\n` +
							`  }`,
					)
					return true
				}

				const hookConfig = hm.getConfig()
				const lines: string[] = [`Hooks Configuration:`]
				lines.push(`  Project: ${paths.project}`)
				lines.push(`  Global:  ${paths.global}`)
				lines.push("")

				const eventNames = [
					"PreToolUse",
					"PostToolUse",
					"Stop",
					"UserPromptSubmit",
					"SessionStart",
					"SessionEnd",
				] as const

				for (const event of eventNames) {
					const hooks = hookConfig[event]
					if (hooks && hooks.length > 0) {
						lines.push(
							`  ${event} (${hooks.length} hook${hooks.length > 1 ? "s" : ""}):`,
						)
						for (const hook of hooks) {
							const matcherStr = hook.matcher?.tool_name
								? ` [tool: ${hook.matcher.tool_name}]`
								: ""
							const desc = hook.description ? ` - ${hook.description}` : ""
							lines.push(`    ${hook.command}${matcherStr}${desc}`)
						}
					}
				}

				lines.push("")
				lines.push(`  /hooks reload - Reload config from disk`)

				this.showInfo(lines.join("\n"))
				return true
			}

			case "mcp": {
				const mm = this.harness.getMcpManager?.()
				if (!mm) {
					this.showInfo("MCP system not initialized.")
					return true
				}

				const subcommand = args[0]
				if (subcommand === "reload") {
					this.showInfo("MCP: Reconnecting to servers...")
					try {
						await mm.reload()
						const statuses = mm.getServerStatuses()
						const connected = statuses.filter((s) => s.connected)
						const totalTools = connected.reduce(
							(sum, s) => sum + s.toolCount,
							0,
						)
						this.showInfo(
							`MCP: Reloaded. ${connected.length} server(s) connected, ${totalTools} tool(s).`,
						)
					} catch (error) {
						this.showError(
							`MCP reload failed: ${error instanceof Error ? error.message : String(error)}`,
						)
					}
					return true
				}

				const paths = mm.getConfigPaths()

				if (!mm.hasServers()) {
					this.showInfo(
						`No MCP servers configured.\n\n` +
							`Add servers to:\n` +
							`  ${paths.project} (project)\n` +
							`  ${paths.global} (global)\n` +
							`  ${paths.claude} (Claude Code compat)\n\n` +
							`Example mcp.json:\n` +
							`  {\n` +
							`    "mcpServers": {\n` +
							`      "filesystem": {\n` +
							`        "command": "npx",\n` +
							`        "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path"],\n` +
							`        "env": {}\n` +
							`      }\n` +
							`    }\n` +
							`  }`,
					)
					return true
				}

				const statuses = mm.getServerStatuses()
				const lines: string[] = [`MCP Servers:`]
				lines.push(`  Project: ${paths.project}`)
				lines.push(`  Global:  ${paths.global}`)
				lines.push(`  Claude:  ${paths.claude}`)
				lines.push("")

				for (const status of statuses) {
					const icon = status.connected ? "\u2713" : "\u2717"
					const state = status.connected
						? "connected"
						: `error: ${status.error}`
					lines.push(`  ${icon} ${status.name} (${state})`)
					if (status.toolNames.length > 0) {
						for (const toolName of status.toolNames) {
							lines.push(`      - ${toolName}`)
						}
					}
				}

				lines.push("")
				lines.push(`  /mcp reload - Disconnect and reconnect all servers`)

				this.showInfo(lines.join("\n"))
				return true
			}

            default:
                this.showError(`Unknown command: ${command}`)
                return true
		}
	}

	/**
	 * Handle a custom slash command by processing its template and adding to context
	 */
	private async handleCustomSlashCommand(
		command: SlashCommandMetadata,
		args: string[],
	): Promise<void> {
		try {
			// Process the command template
			const processedContent = await processSlashCommand(
				command,
				args,
				process.cwd(),
			)

			// Add the processed content as a system message / context
			if (processedContent.trim()) {
				// Show what was processed
				this.showInfo(`Executed //${command.name}`)

				// Add the content to the conversation as a user message
				// This allows the agent to see and act on the command output
				await this.harness.sendMessage(processedContent)
			} else {
				this.showInfo(`Executed //${command.name} (no output)`)
			}
		} catch (error) {
			this.showError(
				`Error executing //${command.name}: ${error instanceof Error ? error.message : String(error)}`,
			)
		}
	}

	// ===========================================================================
	// Message Rendering
	// ===========================================================================

	private addUserMessage(message: HarnessMessage): void {
		const textContent = message.content
			.filter((c) => c.type === "text")
			.map((c) => (c as { type: "text"; text: string }).text)
			.join("\n")

		const imageCount = message.content.filter((c) => c.type === "image").length

		// Strip [image] markers from text since we show count separately
		const displayText =
			imageCount > 0
				? textContent.replace(/\[image\]\s*/g, "").trim()
				: textContent.trim()
		const prefix =
			imageCount > 0 ? `[${imageCount} image${imageCount > 1 ? "s" : ""}] ` : ""

		if (displayText || prefix) {
			this.chatContainer.addChild(
				new UserMessageComponent(prefix + displayText),
			)
		}
	}

	private async renderExistingMessages(): Promise<void> {
		this.chatContainer.clear()
		this.pendingTools.clear()
		this.allToolComponents = []

		const messages = await this.harness.getMessages()

		for (const message of messages) {
			if (message.role === "user") {
				this.addUserMessage(message)
			} else if (message.role === "assistant") {
				// Render content in order - interleaving text and tool calls
				// Accumulate text/thinking until we hit a tool call, then render both
				let accumulatedContent: HarnessMessageContent[] = []

				for (const content of message.content) {
					if (content.type === "text" || content.type === "thinking") {
						accumulatedContent.push(content)
					} else if (content.type === "tool_call") {
						// Render accumulated text first if any
						if (accumulatedContent.length > 0) {
							const textMessage: HarnessMessage = {
								...message,
								content: accumulatedContent,
							}
							const textComponent = new AssistantMessageComponent(
								textMessage,
								this.hideThinkingBlock,
								getMarkdownTheme(),
							)
							this.chatContainer.addChild(textComponent)
							accumulatedContent = []
						}

						// Render the tool call
						const toolComponent = new ToolExecutionComponentEnhanced(
							content.name,
							content.args,
							{
								showImages: false,
								collapsedByDefault: !this.toolOutputExpanded,
							},
							this.ui,
						)

						// Find matching tool result
						const toolResult = message.content.find(
							(c) => c.type === "tool_result" && c.id === content.id,
						)
						if (toolResult && toolResult.type === "tool_result") {
							toolComponent.updateResult(
								{
									content: [
										{
											type: "text",
											text: this.formatToolResult(toolResult.result),
										},
									],
									isError: toolResult.isError,
								},
								false,
							)
						}

						this.chatContainer.addChild(toolComponent)
						this.allToolComponents.push(toolComponent) // Track for expand/collapse
					} else if (
						content.type === "om_observation_start" ||
						content.type === "om_observation_end" ||
						content.type === "om_observation_failed"
					) {
						// Skip start markers in history — only show completed/failed results
						if (content.type === "om_observation_start") continue

						// Render accumulated text first if any
						if (accumulatedContent.length > 0) {
							const textMessage: HarnessMessage = {
								...message,
								content: accumulatedContent,
							}
							const textComponent = new AssistantMessageComponent(
								textMessage,
								this.hideThinkingBlock,
								getMarkdownTheme(),
							)
							this.chatContainer.addChild(textComponent)
							accumulatedContent = []
						}

						// Render OM marker (end or failed only)
						this.chatContainer.addChild(new OMMarkerComponent(content))
					}
					// Skip tool_result - it's handled with tool_call above
				}

				// Render any remaining text after the last tool call
				if (accumulatedContent.length > 0) {
					const textMessage: HarnessMessage = {
						...message,
						content: accumulatedContent,
					}
					const textComponent = new AssistantMessageComponent(
						textMessage,
						this.hideThinkingBlock,
						getMarkdownTheme(),
					)
					this.chatContainer.addChild(textComponent)
				}
			}
		}

		this.ui.requestRender()
	}

	// ===========================================================================
	// UI Helpers
	// ===========================================================================

	private showError(message: string): void {
		this.chatContainer.addChild(new Spacer(1))
		this.chatContainer.addChild(
			new Text(fg("error", `Error: ${message}`), 1, 0),
		)
		this.ui.requestRender()
	}

	/**
	 * Show a formatted error with helpful context based on error type.
	 */
	showFormattedError(
		event:
			| {
					error: Error
					errorType?: string
					retryable?: boolean
					retryDelay?: number
			  }
			| Error,
	): void {
		const error = "error" in event ? event.error : event
		const parsed = parseError(error)

		this.chatContainer.addChild(new Spacer(1))

		// Check if this is a tool validation error
		const errorMessage = error.message || String(error)
		const isValidationError =
			errorMessage.toLowerCase().includes("validation failed") ||
			errorMessage.toLowerCase().includes("required parameter") ||
			errorMessage.includes("Required")

		if (isValidationError) {
			// Show a simplified message for validation errors
			this.chatContainer.addChild(
				new Text(
					fg("error", "Tool validation error - see details above"),
					1,
					0,
				),
			)
			this.chatContainer.addChild(
				new Text(
					fg(
						"muted",
						"  Check the tool execution box for specific parameter requirements",
					),
					1,
					0,
				),
			)
		} else {
			// Show the main error message
			let errorText = `Error: ${parsed.message}`

			// Add retry info if applicable
			const retryable =
				"retryable" in event ? event.retryable : parsed.retryable
			const retryDelay =
				"retryDelay" in event ? event.retryDelay : parsed.retryDelay
			if (retryable && retryDelay) {
				const seconds = Math.ceil(retryDelay / 1000)
				errorText += fg("muted", ` (retry in ${seconds}s)`)
			}

			this.chatContainer.addChild(new Text(fg("error", errorText), 1, 0))

			// Add helpful hints based on error type
			const hint = this.getErrorHint(parsed.type)
			if (hint) {
				this.chatContainer.addChild(
					new Text(fg("muted", `  Hint: ${hint}`), 1, 0),
				)
			}
		}

		this.ui.requestRender()
	}

	/**
	 * Get a helpful hint based on error type.
	 */
	private getErrorHint(errorType: string): string | null {
		switch (errorType) {
			case "auth":
				return "Use /login to authenticate with a provider"
			case "model_not_found":
				return "Use /models to select a different model"
			case "context_length":
				return "Use /new to start a fresh conversation"
			case "rate_limit":
				return "Wait a moment and try again"
			case "network":
				return "Check your internet connection"
			default:
				return null
		}
	}

	private showInfo(message: string): void {
		this.chatContainer.addChild(new Spacer(1))
		this.chatContainer.addChild(new Text(fg("muted", message), 1, 0))
		this.ui.requestRender()
	}
}
