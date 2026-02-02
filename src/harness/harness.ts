import type { Agent } from "@mastra/core/agent"
import type { StorageThreadType } from "@mastra/core/memory"
import { RequestContext } from "@mastra/core/request-context"
import { Workspace } from "@mastra/core/workspace"
import type { WorkspaceConfig } from "@mastra/core/workspace"
import type { z } from "zod"
import type {
	HarnessConfig,
	HarnessEvent,
	HarnessEventListener,
	HarnessMessage,
	HarnessMessageContent,
	HarnessMode,
	HarnessRuntimeContext,
	HarnessSession,
	HarnessStateSchema,
	HarnessThread,
} from "./types"
import {
	AuthStorage,
	getOAuthProviders,
	type OAuthProviderInterface,
	type OAuthLoginCallbacks,
} from "../auth/index.js"
import { parseError, type ParsedError } from "../utils/errors.js"

// =============================================================================
// Harness Class
// =============================================================================

/**
 * The Harness orchestrates multiple agent modes, shared state, memory, and storage.
 * It's the core abstraction that a TUI (or other UI) controls.
 *
 * @example
 * ```ts
 * const harness = new Harness({
 *   id: "my-coding-agent",
 *   storage: new LibSQLStore({ url: "file:./data.db" }),
 *   stateSchema: z.object({
 *     activeModel: z.string(),
 *     thinkingLevel: z.enum(["off", "low", "medium", "high"]),
 *   }),
 *   initialState: {
 *     activeModel: "anthropic/claude-sonnet-4-20250514",
 *     thinkingLevel: "medium",
 *   },
 *   memory: new Memory({ storage }),
 *   modes: [
 *     {
 *       id: "plan",
 *       name: "Plan Mode",
 *       default: true,
 *       agent: (state) => new Agent({
 *         name: "Planner",
 *         model: state.activeModel,
 *         tools: { view: viewTool },
 *       }),
 *     },
 *     {
 *       id: "build",
 *       name: "Build Mode",
 *       agent: (state) => new Agent({
 *         name: "Builder",
 *         model: state.activeModel,
 *         tools: { view: viewTool, edit: editTool, bash: bashTool },
 *       }),
 *     },
 *   ],
 * })
 *
 * // TUI subscribes to events
 * harness.subscribe((event) => {
 *   if (event.type === "message_update") {
 *     renderMessage(event.message)
 *   }
 * })
 *
 * // TUI triggers actions
 * await harness.sendMessage("Hello!")
 * await harness.switchMode("build")
 * ```
 */
export class Harness<TState extends HarnessStateSchema = HarnessStateSchema> {
	readonly id: string

	private config: HarnessConfig<TState>
	private state: z.infer<TState>
	private currentModeId: string
	private currentThreadId: string | null = null
	private resourceId: string
	private listeners: HarnessEventListener[] = []
	private abortController: AbortController | null = null
	private currentRunId: string | null = null
	private currentOperationId: number = 0
	private followUpQueue: string[] = []
	private pendingApprovalToolCallId: string | null = null
	private workspace: Workspace | undefined = undefined
	private workspaceInitialized = false
	private hookManager: import("../hooks/index.js").HookManager | undefined
	private mcpManager: import("../mcp/index.js").MCPManager | undefined
	private pendingDeclineToolCallId: string | null = null
	private pendingQuestions = new Map<string, (answer: string) => void>()
	private pendingPlanApprovals = new Map<
		string,
		(result: { action: "approved" | "rejected"; feedback?: string }) => void
	>()
	private tokenUsage: {
		promptTokens: number
		completionTokens: number
		totalTokens: number
	} = {
		promptTokens: 0,
		completionTokens: 0,
		totalTokens: 0,
	}
	constructor(config: HarnessConfig<TState>) {
		this.id = config.id
		this.config = config
		this.resourceId = config.resourceId

		// Initialize state from schema defaults + initial state
		this.state = {
			...this.getSchemaDefaults(),
			...config.initialState,
		} as z.infer<TState>
		// Find default mode
		const defaultMode = config.modes.find((m) => m.default) ?? config.modes[0]
		if (!defaultMode) {
			throw new Error("Harness requires at least one agent mode")
		}
		this.currentModeId = defaultMode.id

		// Store pre-built workspace (config-based workspace is constructed in init())
		if (config.workspace instanceof Workspace) {
			this.workspace = config.workspace
		}

		// Store hook manager and MCP manager
		this.hookManager = config.hookManager
		this.mcpManager = config.mcpManager

		// Seed model from mode default or global last model if not set
		const currentModel = (this.state as any).currentModelId
		if (!currentModel) {
			const lastModelId = config.authStorage?.getLastModelId()
			const seedModel = lastModelId || defaultMode.defaultModelId
			if (seedModel) {
				this.setState({ currentModelId: seedModel } as Partial<z.infer<TState>>)
			}
		}
	}

	// ===========================================================================
	// Initialization
	// ===========================================================================
	/**
	 * Initialize the harness - loads persisted state.
	 * Must be called before using the harness.
	 *
	 * Note: Does NOT auto-select a thread. Call selectThread() or createThread() after init.
	 */
	async init(): Promise<void> {
		// Initialize storage
		await this.config.storage.init()

		// Load persisted state from storage (if we have a state storage mechanism)
		// For now, we use the initial state from config
		// TODO: Add state persistence via storage.getStore('agents') or custom domain

		// Initialize workspace if configured
		if (this.config.workspace && !this.workspaceInitialized) {
			try {
				// Construct workspace from config if not already a Workspace instance
				if (!this.workspace) {
					this.workspace = new Workspace(
						this.config.workspace as WorkspaceConfig,
					)
				}

				this.emit({
					type: "workspace_status_changed",
					status: "initializing",
				})

				await this.workspace.init()
				this.workspaceInitialized = true

				this.emit({
					type: "workspace_status_changed",
					status: "ready",
				})
				this.emit({
					type: "workspace_ready",
					workspaceId: this.workspace.id,
					workspaceName: this.workspace.name,
				})
			} catch (error) {
				const err = error instanceof Error ? error : new Error(String(error))
				console.warn("Workspace initialization failed:", err.message)
				this.workspace = undefined
				this.workspaceInitialized = false

				this.emit({
					type: "workspace_status_changed",
					status: "error",
					error: err,
				})
				this.emit({
					type: "workspace_error",
					error: err,
				})
			}
		}
	}

	/**
	 * Select the most recent thread, or create one if none exist.
	 * Convenience method for simple initialization.
	 */
	async selectOrCreateThread(): Promise<HarnessThread> {
		const threads = await this.listThreads()

		if (threads.length === 0) {
			const thread = await this.createThread()
			this.currentThreadId = thread.id
			return thread
		}

		// Use the most recently updated thread
		const sortedThreads = [...threads].sort(
			(a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
		)
		this.currentThreadId = sortedThreads[0].id

		// Load token usage and model ID for this thread
		await this.loadThreadMetadata()

		return sortedThreads[0]
	}

	/**
	 * Get the memory storage domain.
	 * Throws if storage doesn't have a memory domain.
	 */
	private async getMemoryStorage(): Promise<
		NonNullable<
			Awaited<ReturnType<typeof this.config.storage.getStore<"memory">>>
		>
	> {
		const memoryStorage = await this.config.storage.getStore("memory")
		if (!memoryStorage) {
			throw new Error("Storage does not have a memory domain configured")
		}
		return memoryStorage
	}

	// ===========================================================================
	// State Management
	// ===========================================================================

	/**
	 * Get current harness state (read-only snapshot).
	 */
	getState(): Readonly<z.infer<TState>> {
		return { ...this.state }
	}

	/**
	 * Update harness state. Validates against schema.
	 * Emits state_changed event.
	 */
	async setState(updates: Partial<z.infer<TState>>): Promise<void> {
		const changedKeys = Object.keys(updates)
		const newState = { ...this.state, ...updates }

		// Validate against schema
		const result = this.config.stateSchema.safeParse(newState)
		if (!result.success) {
			throw new Error(`Invalid state update: ${result.error.message}`)
		}

		this.state = result.data as z.infer<TState>

		// Persist specific state keys to thread metadata
		if ("todos" in updates) {
			// Only persist todos if they have items, otherwise remove from metadata
			if (Array.isArray(updates.todos) && updates.todos.length > 0) {
				this.persistThreadSetting("todos", updates.todos).catch(() => {})
			} else {
				// Remove todos from metadata when empty
				this.removeThreadSetting("todos").catch(() => {})
			}
		}

		this.emit({
			type: "state_changed",
			state: this.state,
			changedKeys,
		})
	}

	private getSchemaDefaults(): Partial<z.infer<TState>> {
		// Extract defaults from Zod schema
		const shape = this.config.stateSchema.shape
		const defaults: Record<string, unknown> = {}

		for (const [key, field] of Object.entries(shape)) {
			if (field instanceof Object && "_def" in field) {
				const def = (field as any)._def
				if (def.defaultValue !== undefined) {
					defaults[key] =
						typeof def.defaultValue === "function"
							? def.defaultValue()
							: def.defaultValue
				}
			}
		}

		return defaults as Partial<z.infer<TState>>
	}

	// ===========================================================================
	// Mode Management
	// ===========================================================================

	/**
	 * Get all available modes.
	 */
	getModes(): HarnessMode<TState>[] {
		return this.config.modes
	}

	/**
	 * Get the hook manager (if configured).
	 */
	getHookManager(): import("../hooks/index.js").HookManager | undefined {
		return this.hookManager
	}

	/**
	 * Get the MCP manager (if configured).
	 */
	getMcpManager(): import("../mcp/index.js").MCPManager | undefined {
		return this.mcpManager
	}

	/**
	 * Register a pending question resolver.
	 * Called by the ask_user tool to register a promise resolver
	 * that will be resolved when the user answers in the TUI.
	 */
	registerQuestion(
		questionId: string,
		resolve: (answer: string) => void,
	): void {
		this.pendingQuestions.set(questionId, resolve)
	}

	/**
	 * Resolve a pending question with the user's answer.
	 * Called by the TUI when the user selects an option or submits text.
	 */
	respondToQuestion(questionId: string, answer: string): void {
		const resolve = this.pendingQuestions.get(questionId)
		if (resolve) {
			this.pendingQuestions.delete(questionId)
			resolve(answer)
		}
	}

	/**
	 * Register a pending plan approval resolver.
	 * Called by the submit_plan tool to register a promise resolver.
	 */
	registerPlanApproval(
		planId: string,
		resolve: (result: {
			action: "approved" | "rejected"
			feedback?: string
		}) => void,
	): void {
		this.pendingPlanApprovals.set(planId, resolve)
	}

	/**
	 * Respond to a pending plan approval.
	 * On approval: switches to Build mode, then resolves the promise.
	 * On rejection: resolves with feedback (stays in Plan mode).
	 */
	async respondToPlanApproval(
		planId: string,
		response: { action: "approved" | "rejected"; feedback?: string },
	): Promise<void> {
		const resolve = this.pendingPlanApprovals.get(planId)
		if (!resolve) return

		this.pendingPlanApprovals.delete(planId)

		if (response.action === "approved") {
			await this.switchMode("build")
		}

		resolve(response)
	}

	/**
	 * Get current mode ID.
	 */
	getCurrentModeId(): string {
		return this.currentModeId
	}

	/**
	 * Get current mode configuration.
	 */
	getCurrentMode(): HarnessMode<TState> {
		const mode = this.config.modes.find((m) => m.id === this.currentModeId)
		if (!mode) {
			throw new Error(`Mode not found: ${this.currentModeId}`)
		}
		return mode
	}
	/**
	 * Switch to a different mode.
	 * Aborts any in-progress generation.
	 * Also switches to the mode's stored model (or its default).
	 */
	async switchMode(modeId: string): Promise<void> {
		const mode = this.config.modes.find((m) => m.id === modeId)
		if (!mode) {
			throw new Error(`Mode not found: ${modeId}`)
		}

		// Abort current operation if any
		this.abort()

		// Save current model to the outgoing mode before switching
		const currentModelId = this.getCurrentModelId()
		if (currentModelId) {
			await this.persistThreadSetting(
				`modeModelId_${this.currentModeId}`,
				currentModelId,
			)
		}

		const previousModeId = this.currentModeId
		this.currentModeId = modeId

		// Persist mode to thread metadata
		await this.persistThreadSetting("currentModeId", modeId)

		// Load the incoming mode's model
		const modeModelId = await this.loadModeModelId(modeId)
		if (modeModelId) {
			this.setState({ currentModelId: modeModelId } as Partial<z.infer<TState>>)
			this.emit({ type: "model_changed", modelId: modeModelId } as HarnessEvent)
		}

		this.emit({
			type: "mode_changed",
			modeId,
			previousModeId,
		})
	}

	/**
	 * Load the stored model ID for a specific mode.
	 * Falls back to: mode's defaultModelId → global last model → current model.
	 */
	private async loadModeModelId(modeId: string): Promise<string | null> {
		// 1. Check thread metadata for per-mode model
		if (this.currentThreadId) {
			try {
				const memoryStorage = await this.getMemoryStorage()
				const thread = await memoryStorage.getThreadById({
					threadId: this.currentThreadId,
				})
				const meta = thread?.metadata as Record<string, unknown> | undefined
				const stored = meta?.[`modeModelId_${modeId}`] as string | undefined
				if (stored) return stored
			} catch {
				// Fall through to defaults
			}
		}

		// 2. Fall back to mode's defaultModelId
		const mode = this.config.modes.find((m) => m.id === modeId)
		if (mode?.defaultModelId) return mode.defaultModelId

		// 3. Fall back to global last model
		const lastModelId = this.config.authStorage?.getLastModelId()
		if (lastModelId) return lastModelId

		// 4. Keep current model
		return null
	}
	/**
	 * Get the agent for the current mode.
	 * Resolves dynamic agent functions with current state.
	 */
	private getCurrentAgent(): Agent {
		const mode = this.getCurrentMode()
		if (typeof mode.agent === "function") {
			return mode.agent(this.state)
		}
		return mode.agent
	}

	/**
	 * Get the current model name/ID.
	 * Returns a short display name extracted from the model ID in state.
	 */
	getModelName(): string {
		const modelId = this.getCurrentModelId()
		if (modelId === "unknown") return modelId

		// Extract just the model name from "provider/model" format
		const parts = modelId.split("/")
		return parts[parts.length - 1] || modelId
	}

	/**
	 * Get the full model ID (e.g., "anthropic/claude-sonnet-4").
	 * Reads from harness state (set via switchModel()).
	 */
	getFullModelId(): string {
		return this.getCurrentModelId()
	}

	/**
	 * Check if the current model has authentication configured (env var or OAuth).
	 * Returns { hasAuth, apiKeyEnvVar } for the current model's provider.
	 */
	async getCurrentModelAuthStatus(): Promise<{
		hasAuth: boolean
		apiKeyEnvVar?: string
	}> {
		const modelId = this.getCurrentModelId()
		const provider = modelId.split("/")[0]
		if (!provider) return { hasAuth: true }

		// Check OAuth
		const providerToOAuthId: Record<string, string> = {
			anthropic: "anthropic",
			openai: "openai-codex",
		}
		const oauthId = providerToOAuthId[provider]
		if (oauthId && this.config.authStorage?.isLoggedIn(oauthId)) {
			return { hasAuth: true }
		}

		// Check env var via registry
		try {
			const { PROVIDER_REGISTRY } = await import("@mastra/core/llm")
			const registry = PROVIDER_REGISTRY as Record<
				string,
				{ apiKeyEnvVar?: string }
			>
			const providerConfig = registry[provider]
			const apiKeyEnvVar = providerConfig?.apiKeyEnvVar
			if (apiKeyEnvVar && process.env[apiKeyEnvVar]) {
				return { hasAuth: true }
			}
			return { hasAuth: false, apiKeyEnvVar: apiKeyEnvVar || undefined }
		} catch {
			return { hasAuth: true } // Can't check, assume OK
		}
	}

	/**
	 * Get list of available models from Mastra's provider registry.
	 * Returns models grouped by provider, with API key availability info.
	 */
	async getAvailableModels(): Promise<
		Array<{
			id: string
			provider: string
			modelName: string
			hasApiKey: boolean
			apiKeyEnvVar?: string
			useCount: number
		}>
	> {
		try {
			// Import from the public @mastra/core/llm export
			const { PROVIDER_REGISTRY } = await import("@mastra/core/llm")

			if (!PROVIDER_REGISTRY) {
				console.warn("Provider registry not available")
				return []
			}

			// PROVIDER_REGISTRY is a Proxy - use Object.keys to get providers
			// Cast to Record<string, any> to allow string indexing
			const registry = PROVIDER_REGISTRY as Record<
				string,
				{ models?: string[]; name?: string; apiKeyEnvVar?: string }
			>
			const providers = Object.keys(registry)
			const useCounts = this.config.authStorage?.getAllModelUseCounts() ?? {}
			const models: Array<{
				id: string
				provider: string
				modelName: string
				hasApiKey: boolean
				apiKeyEnvVar?: string
				useCount: number
			}> = []
			// Map model provider prefixes to OAuth provider IDs
			const providerToOAuthId: Record<string, string> = {
				anthropic: "anthropic",
				openai: "openai-codex",
			}

			for (const provider of providers) {
				const providerConfig = registry[provider]
				// Check if API key is available via env var OR OAuth
				const apiKeyEnvVar = providerConfig?.apiKeyEnvVar
				const hasEnvKey = apiKeyEnvVar ? !!process.env[apiKeyEnvVar] : false
				const oauthId = providerToOAuthId[provider]
				const hasOAuth = oauthId
					? (this.config.authStorage?.isLoggedIn(oauthId) ?? false)
					: false
				const hasApiKey = hasEnvKey || hasOAuth

				// Each provider config has a 'models' array
				if (providerConfig?.models && Array.isArray(providerConfig.models)) {
					for (const modelName of providerConfig.models) {
						const id = `${provider}/${modelName}`
						models.push({
							id,
							provider,
							modelName,
							hasApiKey,
							apiKeyEnvVar: apiKeyEnvVar || undefined,
							useCount: useCounts[id] ?? 0,
						})
					}
				}
			}

			return models
		} catch (error) {
			console.warn("Failed to load available models:", error)
			return []
		}
	}
	/**
	 * Switch to a different model at runtime.
	 * Updates the harness state which the dynamic model function reads.
	 * Also saves per-mode and as global "last model" for new threads.
	 * @param modelId Full model ID (e.g., "anthropic/claude-sonnet-4-20250514")
	 */
	async switchModel(modelId: string): Promise<void> {
		// Update state with new model ID
		// The dynamic model function in the agent will read this on next request
		this.setState({ currentModelId: modelId } as Partial<z.infer<TState>>)

		// Persist to thread metadata (both global and per-mode)
		await this.persistModelId(modelId)
		await this.persistThreadSetting(
			`modeModelId_${this.currentModeId}`,
			modelId,
		)

		// Save as global "last model" for new threads and bump ranking
		this.config.authStorage?.setLastModelId(modelId)
		this.config.authStorage?.incrementModelUseCount(modelId)

		// Emit event so TUI can update status line
		this.emit({
			type: "model_changed",
			modelId,
		} as HarnessEvent)
	}
	/**
	 * Get the current model ID from state.
	 * Returns empty string if no model is selected.
	 */
	getCurrentModelId(): string {
		const state = this.getState() as { currentModelId?: string }
		return state.currentModelId ?? ""
	}

	/**
	 * Check if a model is currently selected.
	 */
	hasModelSelected(): boolean {
		return this.getCurrentModelId() !== ""
	}

	// =========================================================================
	// Observational Memory Model Management
	// =========================================================================

	/**
	 * Get the current Observer model ID from state.
	 */
	getObserverModelId(): string {
		const state = this.getState() as { observerModelId?: string }
		return state.observerModelId ?? "google/gemini-2.5-flash"
	}

	/**
	 * Get the current Reflector model ID from state.
	 */
	getReflectorModelId(): string {
		const state = this.getState() as { reflectorModelId?: string }
		return state.reflectorModelId ?? "google/gemini-2.5-flash"
	}
	/**
	 * Switch the Observer model.
	 * @param modelId Full model ID (e.g., "google/gemini-2.5-flash")
	 */
	async switchObserverModel(modelId: string): Promise<void> {
		this.setState({ observerModelId: modelId } as Partial<z.infer<TState>>)
		await this.persistThreadSetting("observerModelId", modelId)

		this.emit({
			type: "om_model_changed",
			role: "observer",
			modelId,
		} as HarnessEvent)
	}

	/**
	 * Switch the Reflector model.
	 * @param modelId Full model ID (e.g., "google/gemini-2.5-flash")
	 */
	async switchReflectorModel(modelId: string): Promise<void> {
		this.setState({ reflectorModelId: modelId } as Partial<z.infer<TState>>)
		await this.persistThreadSetting("reflectorModelId", modelId)

		this.emit({
			type: "om_model_changed",
			role: "reflector",
			modelId,
		} as HarnessEvent)
	}
	/**
	 * Get YOLO mode state.
	 */
	getYoloMode(): boolean {
		return (this.state as any)?.yolo === true
	}
	/**
	 * Toggle YOLO mode (auto-approve all tool calls).
	 */
	setYoloMode(enabled: boolean): void {
		this.setState({ yolo: enabled } as Partial<z.infer<TState>>)
	}

	// =========================================================================
	// Thinking Level
	// =========================================================================

	/**
	 * Get the current thinking level.
	 */
	getThinkingLevel(): string {
		const state = this.getState() as { thinkingLevel?: string }
		return state.thinkingLevel ?? "off"
	}

	/**
	 * Set the thinking level and persist to thread metadata.
	 * @param level One of: "off", "minimal", "low", "medium", "high"
	 */
	async setThinkingLevel(level: string): Promise<void> {
		this.setState({ thinkingLevel: level } as Partial<z.infer<TState>>)
		await this.persistThreadSetting("thinkingLevel", level)
	}

	/**
	 * Build providerOptions for the current thinking level.
	 * Returns undefined if thinking is off or the model isn't Anthropic.
	 */
	buildThinkingProviderOptions():
		| Record<string, Record<string, unknown>>
		| undefined {
		const level = this.getThinkingLevel()
		if (level === "off") return undefined

		// Only apply thinking to Anthropic models
		const modelId = this.getCurrentModelId()
		if (!modelId.startsWith("anthropic/")) return undefined

		const budgetMap: Record<string, number> = {
			minimal: 1024,
			low: 4096,
			medium: 10240,
			high: 32768,
		}

		const budgetTokens = budgetMap[level]
		if (!budgetTokens) return undefined

		return {
			anthropic: {
				thinking: {
					type: "enabled",
					budgetTokens,
				},
			},
		}
	}

	// =========================================================================
	// OM Threshold Settings
	// =========================================================================

	/**
	 * Get the current observation threshold from state.
	 */
	getObservationThreshold(): number {
		const state = this.getState() as { observationThreshold?: number }
		return state.observationThreshold ?? 30_000
	}

	/**
	 * Get the current reflection threshold from state.
	 */
	getReflectionThreshold(): number {
		const state = this.getState() as { reflectionThreshold?: number }
		return state.reflectionThreshold ?? 40_000
	}

	/**
	 * Set the observation threshold and persist to thread metadata.
	 * Note: Takes effect on next restart since OM thresholds are set at construction time.
	 */
	async setObservationThreshold(value: number): Promise<void> {
		this.setState({ observationThreshold: value } as Partial<z.infer<TState>>)
		await this.persistThreadSetting("observationThreshold", value)
	}

	/**
	 * Set the reflection threshold and persist to thread metadata.
	 * Note: Takes effect on next restart since OM thresholds are set at construction time.
	 */
	async setReflectionThreshold(value: number): Promise<void> {
		this.setState({ reflectionThreshold: value } as Partial<z.infer<TState>>)
		await this.persistThreadSetting("reflectionThreshold", value)
	}

	/**
	 * Get current cumulative token usage for this thread.
	 */
	getTokenUsage(): {
		promptTokens: number
		completionTokens: number
		totalTokens: number
	} {
		return { ...this.tokenUsage }
	}

	/**
	 * Persist token usage to thread metadata.
	 */
	private async persistTokenUsage(): Promise<void> {
		if (!this.currentThreadId) return

		try {
			const memoryStorage = await this.getMemoryStorage()
			const thread = await memoryStorage.getThreadById({
				threadId: this.currentThreadId,
			})
			if (thread) {
				await memoryStorage.saveThread({
					thread: {
						...thread,
						metadata: {
							...thread.metadata,
							tokenUsage: this.tokenUsage,
						},
						updatedAt: new Date(),
					},
				})
			}
		} catch (error) {
			// Silently fail - token persistence is not critical
		}
	}
	/**
	 * Persist a key-value pair to the current thread's metadata.
	 */
	async persistThreadSetting(key: string, value: unknown): Promise<void> {
		if (!this.currentThreadId) return

		try {
			const memoryStorage = await this.getMemoryStorage()
			const thread = await memoryStorage.getThreadById({
				threadId: this.currentThreadId,
			})
			if (thread) {
				await memoryStorage.saveThread({
					thread: {
						...thread,
						metadata: {
							...thread.metadata,
							[key]: value,
						},
						updatedAt: new Date(),
					},
				})
			}
		} catch (error) {
			// Silently fail - settings persistence is not critical
		}
	}

	/**
	 * Remove a key from the current thread's metadata.
	 */
	private async removeThreadSetting(key: string): Promise<void> {
		if (!this.currentThreadId) return

		try {
			const memoryStorage = await this.getMemoryStorage()
			const thread = await memoryStorage.getThreadById({
				threadId: this.currentThreadId,
			})
			if (thread && thread.metadata) {
				const metadata = { ...thread.metadata }
				delete metadata[key]
				await memoryStorage.saveThread({
					thread: {
						...thread,
						metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
						updatedAt: new Date(),
					},
				})
			}
		} catch (error) {
			// Silently fail - settings removal is not critical
		}
	}

	private async persistModelId(modelId: string): Promise<void> {
		await this.persistThreadSetting("currentModelId", modelId)
	}
	/**
	 * Load token usage and model ID from thread metadata.
	 */
	private async loadThreadMetadata(): Promise<void> {
		if (!this.currentThreadId) {
			this.tokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
			return
		}

		try {
			const memoryStorage = await this.getMemoryStorage()
			const thread = await memoryStorage.getThreadById({
				threadId: this.currentThreadId,
			})

			// Load token usage
			const savedUsage = thread?.metadata?.tokenUsage as
				| typeof this.tokenUsage
				| undefined
			if (savedUsage) {
				this.tokenUsage = {
					promptTokens: savedUsage.promptTokens ?? 0,
					completionTokens: savedUsage.completionTokens ?? 0,
					totalTokens: savedUsage.totalTokens ?? 0,
				}
			} else {
				this.tokenUsage = {
					promptTokens: 0,
					completionTokens: 0,
					totalTokens: 0,
				}
			}
			// Load saved settings from thread metadata
			const meta = thread?.metadata as Record<string, unknown> | undefined
			const updates: Record<string, unknown> = {}

			// Prefer per-mode model ID, fall back to global currentModelId
			const modeModelKey = `modeModelId_${this.currentModeId}`
			if (meta?.[modeModelKey]) {
				updates.currentModelId = meta[modeModelKey]
			} else if (meta?.currentModelId) {
				updates.currentModelId = meta.currentModelId
			}

			if (meta?.observerModelId) updates.observerModelId = meta.observerModelId
			if (meta?.reflectorModelId)
				updates.reflectorModelId = meta.reflectorModelId
			if (meta?.observationThreshold)
				updates.observationThreshold = meta.observationThreshold
			if (meta?.reflectionThreshold)
				updates.reflectionThreshold = meta.reflectionThreshold
            if (meta?.thinkingLevel) updates.thinkingLevel = meta.thinkingLevel
            if (
                meta?.sandboxAllowedPaths &&
                Array.isArray(meta.sandboxAllowedPaths)
            ) {
                updates.sandboxAllowedPaths = meta.sandboxAllowedPaths
            }
            // Only load todos if they exist and have items
			if (meta?.todos && Array.isArray(meta.todos) && meta.todos.length > 0) {
				updates.todos = meta.todos
			}

			// Restore mode (must happen before model loading since model is per-mode)
			if (meta?.currentModeId) {
				const savedModeId = meta.currentModeId as string
				const modeExists = this.config.modes.some((m) => m.id === savedModeId)
				if (modeExists && savedModeId !== this.currentModeId) {
					this.currentModeId = savedModeId
					// Re-resolve the per-mode model key now that mode is restored
					const modeModelKey = `modeModelId_${savedModeId}`
					if (meta[modeModelKey]) {
						updates.currentModelId = meta[modeModelKey]
					}
					this.emit({
						type: "mode_changed",
						modeId: savedModeId,
						previousModeId:
							this.config.modes.find((m) => m.default)?.id ||
							this.config.modes[0].id,
					})
				}
			}

			if (Object.keys(updates).length > 0) {
				this.setState(updates as Partial<z.infer<TState>>)
			}

			// Load OM progress from storage record
			await this.loadOMProgress()
		} catch (error) {
			this.tokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
		}
	}

	/**
	 * Load Observational Memory progress from storage and emit an om_progress event.
	 * Called on thread load/switch so the TUI status line reflects current state.
	 * Also callable by the TUI after subscribing to ensure initial state is populated.
	 */
	async loadOMProgress(): Promise<void> {
		if (!this.currentThreadId) return

		try {
			const memoryStorage = await this.getMemoryStorage()
			const record = await memoryStorage.getObservationalMemory(
				this.currentThreadId,
				this.resourceId,
			)

			if (!record) return

			// Extract thresholds from the record's config
			const config = record.config as
				| {
						observationThreshold?: number | { min: number; max: number }
						reflectionThreshold?: number | { min: number; max: number }
				  }
				| undefined

			const getThreshold = (
				val: number | { min: number; max: number } | undefined,
				fallback: number,
			): number => {
				if (!val) return fallback
				if (typeof val === "number") return val
				return val.max
			}

			const observationThreshold = getThreshold(
				config?.observationThreshold,
				30_000,
			)
			const reflectionThreshold = getThreshold(
				config?.reflectionThreshold,
				40_000,
			)

			// pendingMessageTokens in DB is only updated after observation cycles.
			// If it's 0, estimate from unobserved messages in the thread.
			let pendingTokens = record.pendingMessageTokens ?? 0
			if (pendingTokens === 0 && this.currentThreadId) {
				try {
					const result = await memoryStorage.listMessages({
						threadId: this.currentThreadId,
						perPage: false,
					})
					if (result.messages.length > 0) {
						const lastObservedAt = (record as { lastObservedAt?: string })
							.lastObservedAt
						// Only count messages after the last observation
						const unobservedMessages = lastObservedAt
							? result.messages.filter((msg: { createdAt?: string | Date }) => {
									if (!msg.createdAt) return true
									return new Date(msg.createdAt) > new Date(lastObservedAt)
								})
							: result.messages

						// Estimate tokens from message content (~4 chars per token)
						const totalChars = unobservedMessages.reduce(
							(sum: number, msg: { content: unknown }) => {
								const content =
									typeof msg.content === "string"
										? msg.content
										: JSON.stringify(msg.content)
								return sum + content.length
							},
							0,
						)
						pendingTokens = Math.round(totalChars / 4)
					}
				} catch {
					// Can't estimate — use 0
				}
			}

			const observationTokens = record.observationTokenCount ?? 0

			const thresholdPercent =
				observationThreshold > 0
					? (pendingTokens / observationThreshold) * 100
					: 0
			const reflectionThresholdPercent =
				reflectionThreshold > 0
					? (observationTokens / reflectionThreshold) * 100
					: 0

			this.emit({
				type: "om_progress",
				pendingTokens,
				threshold: observationThreshold,
				thresholdPercent,
				observationTokens,
				reflectionThreshold,
				reflectionThresholdPercent,
			} as HarnessEvent)
		} catch {
			// OM not available or not initialized — that's fine
		}
	}

	// ===========================================================================
	// Thread Management
	// ===========================================================================

	/**
	 * Get current thread ID.
	 */
	getCurrentThreadId(): string | null {
		return this.currentThreadId
	}

	/**
	 * Get current resource ID.
	 */
	getResourceId(): string {
		return this.resourceId
	}

	/**
	 * Set the current resource ID (for switching between projects/resources).
	 */
	setResourceId(resourceId: string): void {
		this.resourceId = resourceId
		this.currentThreadId = null
	}

	/**
	 * Create a new thread.
	 * Uses the global "last model" if available, otherwise uses initial state.
	 */
	async createThread(title?: string): Promise<HarnessThread> {
		const now = new Date()
		const thread: HarnessThread = {
			id: this.generateId(),
			resourceId: this.resourceId,
			title: title || "New Thread",
			createdAt: now,
			updatedAt: now,
		}
		// Resolve model for this mode:
		// 1. Current in-memory model (already set by switchMode/switchModel)
		// 2. Current mode's defaultModelId
		// 3. Global "last model" (user's most recent choice across sessions)
		const currentStateModel = (this.state as any).currentModelId
		const currentMode = this.getCurrentMode()
		const lastModelId = this.config.authStorage?.getLastModelId()
		const modelId =
			currentStateModel || currentMode.defaultModelId || lastModelId

		// Build metadata with both global and per-mode model ID
		const metadata: Record<string, unknown> = {}
		if (modelId) {
			metadata.currentModelId = modelId
			metadata[`modeModelId_${this.currentModeId}`] = modelId
		}

		// Store project path for directory-aware thread filtering (worktrees, etc.)
		const projectPath = (this.state as any)?.projectPath
		if (projectPath) {
			metadata.projectPath = projectPath
		}

		// Persist thread to storage with model ID
		const memoryStorage = await this.getMemoryStorage()
		await memoryStorage.saveThread({
			thread: {
				id: thread.id,
				resourceId: thread.resourceId,
				title: thread.title!,
				createdAt: thread.createdAt,
				updatedAt: thread.updatedAt,
				metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
			},
		})

		// Also switch to this new thread
		this.currentThreadId = thread.id

		// Set the model in state (only if not already set)
		if (modelId && !currentStateModel) {
			this.setState({ currentModelId: modelId } as Partial<z.infer<TState>>)
		}

		// Reset token usage for new thread
		this.tokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }

		this.emit({ type: "thread_created", thread })

		return thread
	}
	/**
	 * Switch to a different thread.
	 */
	async switchThread(threadId: string): Promise<void> {
		// Abort current operation if any
		this.abort()

		// Verify thread exists
		const memoryStorage = await this.getMemoryStorage()
		const thread = await memoryStorage.getThreadById({ threadId })
		if (!thread) {
			throw new Error(`Thread not found: ${threadId}`)
		}

		const previousThreadId = this.currentThreadId
		this.currentThreadId = threadId

		// Load token usage and model ID for this thread
		await this.loadThreadMetadata()

		this.emit({
			type: "thread_changed",
			threadId,
			previousThreadId,
		})
	}

	/**
	 * List threads. By default lists only current resource's threads.
	 * Pass `allResources: true` to list threads across all resources.
	 */
	async listThreads(options?: {
		allResources?: boolean
	}): Promise<HarnessThread[]> {
		const memoryStorage = await this.getMemoryStorage()
		const result = await memoryStorage.listThreads({
			perPage: options?.allResources ? false : undefined,
			filter: options?.allResources
				? undefined
				: {
						resourceId: this.resourceId,
					},
		})

		return result.threads.map((thread: StorageThreadType) => ({
			id: thread.id,
			resourceId: thread.resourceId,
			title: thread.title,
			createdAt: thread.createdAt,
			updatedAt: thread.updatedAt,
			metadata: thread.metadata,
		}))
	}

	// ===========================================================================
	// Message Handling
	// ===========================================================================

	/**
	 * Send a message to the current agent.
	 * Streams the response and emits events.
	 *
	 * Uses an operation ID to safely handle steer (abort + re-send):
	 * if a newer operation supersedes this one, events and cleanup are skipped.
	 */
	async sendMessage(
		content: string,
		options?: {
			images?: Array<{ data: string; mimeType: string }>
		},
	): Promise<void> {
		// Run UserPromptSubmit hooks (blocking)
		if (this.hookManager) {
			const hookResult = await this.hookManager.runUserPromptSubmit(content)
			for (const warning of hookResult.warnings) {
				this.emit({ type: "error", error: new Error(`[hook] ${warning}`) })
			}
			if (!hookResult.allowed) {
				this.emit({
					type: "error",
					error: new Error(
						`Message blocked by hook: ${hookResult.blockReason || "Policy violation"}`,
					),
				})
				return
			}
		}

		// Ensure we have a thread
		if (!this.currentThreadId) {
			const thread = await this.createThread()
			this.currentThreadId = thread.id
		}

		// Tag this operation so steer() can safely supersede it
		const operationId = ++this.currentOperationId

		// Create abort controller for this operation
		this.abortController = new AbortController()
		const agent = this.getCurrentAgent()

		this.emit({ type: "agent_start" })

		try {
			// Build request context for tools
			const requestContext = this.buildRequestContext()
			// Build provider options (e.g., thinking level for Anthropic)
			const providerOptions = this.buildThinkingProviderOptions()

			// Stream the response
			const streamOptions: Record<string, unknown> = {
				memory: {
					thread: this.currentThreadId,
					resource: this.resourceId,
				},
				abortSignal: this.abortController.signal,
				requestContext,
				maxSteps: 1000,
				modelSettings: {
					temperature: 1,
				},
			}
			if (providerOptions) {
				streamOptions.providerOptions = providerOptions
			}

			// Add provider-specific toolsets (e.g., Anthropic web search)
			if (this.config.getToolsets) {
				const modelId = this.getCurrentModelId()
				const toolsets = this.config.getToolsets(modelId)
				if (toolsets) {
					streamOptions.toolsets = toolsets
				}
			}

			// Build message input: multimodal if images present, string otherwise
			let messageInput: string | Record<string, unknown> = content
			if (options?.images?.length) {
				messageInput = {
					role: "user",
					content: [
						{ type: "text", text: content },
						...options.images.map((img) => ({
							type: "file",
							data: img.data,
							mediaType: img.mimeType,
						})),
					],
				}
			}

			const response = await agent.stream(
				messageInput as any,
				streamOptions as any,
			)
			// Process the stream
			const lastMessage = await this.processStream(response)

			// Check if agent has usage data after stream completes
			if ((agent as any).totalUsage || (agent as any).usage) {
				const usage = (agent as any).totalUsage || (agent as any).usage
				if (usage) {
					// Update cumulative token usage
					const promptTokens = usage.promptTokens ?? 0
					const completionTokens = usage.completionTokens ?? 0
					const totalTokens = promptTokens + completionTokens

					this.tokenUsage.promptTokens += promptTokens
					this.tokenUsage.completionTokens += completionTokens
					this.tokenUsage.totalTokens += totalTokens

					// Persist to thread metadata (fire and forget)
					this.persistTokenUsage().catch(() => {})

					this.emit({
						type: "usage_update",
						usage: {
							promptTokens,
							completionTokens,
							totalTokens,
						},
					})
				}
			}

			// Handle hook-blocked tool decline (queued during processStream)
			if (
				this.pendingDeclineToolCallId &&
				this.currentOperationId === operationId
			) {
				const toolCallId = this.pendingDeclineToolCallId
				this.pendingDeclineToolCallId = null
				await this.declineToolCall(toolCallId)
				return
			}

			// Handle YOLO auto-approval (queued during processStream to avoid race condition)
			if (
				this.pendingApprovalToolCallId &&
				this.currentOperationId === operationId
			) {
				const toolCallId = this.pendingApprovalToolCallId
				this.pendingApprovalToolCallId = null
				await this.approveToolCall(toolCallId)
				// After approval completes, the resumed stream has been fully processed
				// Don't emit agent_end here — approveToolCall's processStream will handle it
				return
			}

			// Run Stop hooks (blocking: exit 2 = agent keeps working)
			if (this.hookManager && this.currentOperationId === operationId) {
				const assistantText =
					lastMessage?.content
						?.filter(
							(c): c is { type: "text"; text: string } => c.type === "text",
						)
						.map((c) => c.text)
						.join("") || undefined

				const stopResult = await this.hookManager.runStop(
					assistantText,
					"complete",
				)
				for (const warning of stopResult.warnings) {
					this.emit({ type: "error", error: new Error(`[hook] ${warning}`) })
				}
				if (!stopResult.allowed) {
					// Hook says agent should keep working
					this.followUpQueue.unshift(
						stopResult.blockReason ||
							"A hook has requested that you continue working.",
					)
					return
				}
			}

			// Only emit completion if not superseded by steer
			if (this.currentOperationId === operationId) {
				this.emit({ type: "agent_end", reason: "complete" })
			}
		} catch (error) {
			// If superseded by steer, silently exit
			if (this.currentOperationId !== operationId) return

			if (error instanceof Error && error.name === "AbortError") {
				// Aborted - emit end event with aborted status
				this.emit({ type: "agent_end", reason: "aborted" })
			} else if (
				error instanceof Error &&
				error.message.match(/^Tool .+ not found$/)
			) {
				// Model hallucinated a tool name — recover by sending a corrective
				// follow-up so the agent can retry with the right tool
				const badTool = error.message
					.replace("Tool ", "")
					.replace(" not found", "")
				this.emit({
					type: "error",
					error: new Error(
						`Unknown tool "${badTool}". Shell commands must be run via execute_command.`,
					),
					retryable: true,
				})
				this.followUpQueue.push(
					`[System] Your previous tool call used "${badTool}" which is not a valid tool. ` +
						`Shell commands like git, npm, etc. must be run via the execute_command tool. ` +
						`Please retry with the correct tool name.`,
				)
				this.emit({ type: "agent_end", reason: "error" })
			} else {
				// Parse the error for better user feedback
				const parsed = parseError(error)
				this.emit({
					type: "error",
					error: parsed.originalError,
					errorType: parsed.type,
					retryable: parsed.retryable,
					retryDelay: parsed.retryDelay,
				})
				this.emit({ type: "agent_end", reason: "error" })
			}
		} finally {
			// Only clean up if this is still the current operation
			if (this.currentOperationId === operationId) {
				this.abortController = null
			}

			// Process follow-up queue after this operation completes
			if (
				this.currentOperationId === operationId &&
				this.followUpQueue.length > 0
			) {
				const next = this.followUpQueue.shift()!
				await this.sendMessage(next)
			}
		}
	}
	/**
	 * Get message history for the current thread.
	 */
	async getMessages(): Promise<HarnessMessage[]> {
		if (!this.currentThreadId) {
			return []
		}
		return this.getMessagesForThread(this.currentThreadId)
	}

	/**
	 * Get message history for a specific thread.
	 */
	async getMessagesForThread(threadId: string): Promise<HarnessMessage[]> {
		const memoryStorage = await this.getMemoryStorage()
		const result = await memoryStorage.listMessages({
			threadId,
			perPage: false,
		})

		// Convert MastraDBMessage to HarnessMessage
		return result.messages.map((msg) => this.convertToHarnessMessage(msg))
	}

	/**
	 * Convert a Mastra DB message to a HarnessMessage.
	 */
	private convertToHarnessMessage(msg: {
		id: string
		role: "user" | "assistant" | "system"
		createdAt: Date
		content: {
			parts: Array<{
				type: string
				text?: string
				reasoning?: string
				toolCallId?: string
				toolName?: string
				args?: unknown
				result?: unknown
				isError?: boolean
				// Nested tool invocation structure from Mastra storage
				toolInvocation?: {
					state: string
					toolCallId: string
					toolName: string
					args?: unknown
					result?: unknown
					isError?: boolean
				}
				[key: string]: unknown
			}>
		}
	}): HarnessMessage {
		const content: HarnessMessageContent[] = []

		for (const part of msg.content.parts) {
			if (part.type.startsWith(`data-`)) {
				part
			}
			switch (part.type) {
				case "text":
					if (part.text) {
						content.push({ type: "text", text: part.text })
					}
					break
				case "reasoning":
					if (part.reasoning) {
						content.push({ type: "thinking", thinking: part.reasoning })
					}
					break
				case "tool-invocation":
					// Handle nested toolInvocation structure from Mastra storage
					if (part.toolInvocation) {
						const inv = part.toolInvocation
						// Add tool_call
						content.push({
							type: "tool_call",
							id: inv.toolCallId,
							name: inv.toolName,
							args: inv.args,
						})
						// If it has a result, add tool_result too
						if (inv.state === "result" && inv.result !== undefined) {
							content.push({
								type: "tool_result",
								id: inv.toolCallId,
								name: inv.toolName,
								result: inv.result,
								isError: inv.isError ?? false,
							})
						}
					}
					// Also handle flat structure
					else if (part.toolCallId && part.toolName) {
						content.push({
							type: "tool_call",
							id: part.toolCallId,
							name: part.toolName,
							args: part.args,
						})
					}
					break
				case "tool-call":
					if (part.toolCallId && part.toolName) {
						content.push({
							type: "tool_call",
							id: part.toolCallId,
							name: part.toolName,
							args: part.args,
						})
					}
					break
				case "tool-result":
					if (part.toolCallId && part.toolName) {
						content.push({
							type: "tool_result",
							id: part.toolCallId,
							name: part.toolName,
							result: part.result,
							isError: part.isError ?? false,
						})
					}
					break
				case "data-om-observation-start": {
					const data = (part as { data?: Record<string, unknown> }).data ?? {}
					content.push({
						type: "om_observation_start",
						tokensToObserve: (data.tokensToObserve as number) ?? 0,
						operationType:
							(data.operationType as "observation" | "reflection") ??
							"observation",
					})
					break
				}
				case "data-om-observation-end": {
					const data = (part as { data?: Record<string, unknown> }).data ?? {}
					content.push({
						type: "om_observation_end",
						tokensObserved: (data.tokensObserved as number) ?? 0,
						observationTokens: (data.observationTokens as number) ?? 0,
						durationMs: (data.durationMs as number) ?? 0,
						operationType:
							(data.operationType as "observation" | "reflection") ??
							"observation",
					})
					break
				}
				case "data-om-observation-failed": {
					const data = (part as { data?: Record<string, unknown> }).data ?? {}
					content.push({
						type: "om_observation_failed",
						error: (data.error as string) ?? "Unknown error",
						tokensAttempted: (data.tokensAttempted as number) ?? 0,
						operationType:
							(data.operationType as "observation" | "reflection") ??
							"observation",
					})
					break
				}
				// Skip other part types (step-start, data-om-progress, etc.)
			}
		}

		return {
			id: msg.id,
			role: msg.role,
			content,
			createdAt: msg.createdAt,
		}
	}

	// ===========================================================================
	// Control
	// ===========================================================================

	/**
	 * Abort the current operation (message generation, tool execution).
	 */
	abort(): void {
		if (this.abortController) {
			try {
				this.abortController.abort()
			} catch {}
			this.abortController = null
		}
	}
	/**
	 * Steer the agent mid-stream: aborts current run and sends a new message.
	 * The new message interrupts the agent after the current tool completes.
	 */
	async steer(content: string): Promise<void> {
		// Abort current operation if running
		this.abort()
		// Clear any pending follow-ups (steer overrides them)
		this.followUpQueue = []
		// Send the new message immediately
		await this.sendMessage(content)
	}

	/**
	 * Queue a follow-up message to be processed after the current operation completes.
	 * If not streaming, sends immediately.
	 */
	async followUp(content: string): Promise<void> {
		if (this.isRunning()) {
			this.followUpQueue.push(content)
			this.emit({
				type: "follow_up_queued",
				count: this.followUpQueue.length,
			})
		} else {
			await this.sendMessage(content)
		}
	}

	/**
	 * Get the number of queued follow-up messages.
	 */
	getFollowUpCount(): number {
		return this.followUpQueue.length
	}

	/**
	 * Check if an operation is currently in progress.
	 */
	isRunning(): boolean {
		return this.abortController !== null
	}

	/**
	 * Get the current run ID (for tool approval flows).
	 */
	getCurrentRunId(): string | null {
		return this.currentRunId
	}

	/**
	 * Approve a pending tool call and resume execution.
	 * Used when the agent requires tool approval.
	 */
	async approveToolCall(toolCallId?: string): Promise<void> {
		if (!this.currentRunId) {
			throw new Error("No active run to approve tool call for")
		}

		const agent = this.getCurrentAgent()
		this.abortController = new AbortController()

		try {
			const response = await agent.approveToolCall({
				runId: this.currentRunId,
				toolCallId,
				memory: this.currentThreadId
					? {
							thread: this.currentThreadId,
							resource: this.resourceId,
						}
					: undefined,
				abortSignal: this.abortController.signal,
				requestContext: this.buildRequestContext(),
			})

			// Process the resumed stream
			await this.processStream(response)

			// Check if agent has usage data after stream completes
			if ((agent as any).totalUsage || (agent as any).usage) {
				const usage = (agent as any).totalUsage || (agent as any).usage
				if (usage) {
					// Update cumulative token usage
					const promptTokens = usage.promptTokens ?? 0
					const completionTokens = usage.completionTokens ?? 0
					const totalTokens = promptTokens + completionTokens

					this.tokenUsage.promptTokens += promptTokens
					this.tokenUsage.completionTokens += completionTokens
					this.tokenUsage.totalTokens += totalTokens

					// Persist to thread metadata (fire and forget)
					this.persistTokenUsage().catch(() => {})

					this.emit({
						type: "usage_update",
						usage: {
							promptTokens,
							completionTokens,
							totalTokens,
						},
					})
				}
			}

			// Check if agent has usage data after stream completes
			if ((agent as any).totalUsage || (agent as any).usage) {
				const usage = (agent as any).totalUsage || (agent as any).usage
				if (usage) {
					// Update cumulative token usage
					const promptTokens = usage.promptTokens ?? 0
					const completionTokens = usage.completionTokens ?? 0
					const totalTokens = promptTokens + completionTokens

					this.tokenUsage.promptTokens += promptTokens
					this.tokenUsage.completionTokens += completionTokens
					this.tokenUsage.totalTokens += totalTokens

					// Persist to thread metadata (fire and forget)
					this.persistTokenUsage().catch(() => {})

					this.emit({
						type: "usage_update",
						usage: {
							promptTokens,
							completionTokens,
							totalTokens,
						},
					})
				}
			}

			// Handle chained YOLO approvals (if another tool-call-approval was queued)
			if (this.pendingApprovalToolCallId) {
				const nextToolCallId = this.pendingApprovalToolCallId
				this.pendingApprovalToolCallId = null
				await this.approveToolCall(nextToolCallId)
			}
		} finally {
			this.abortController = null
		}
	}

	/**
	 * Decline a pending tool call and resume execution.
	 * The agent will be informed that the tool call was rejected.
	 */
	async declineToolCall(toolCallId?: string): Promise<void> {
		if (!this.currentRunId) {
			throw new Error("No active run to decline tool call for")
		}

		const agent = this.getCurrentAgent()
		this.abortController = new AbortController()

		try {
			const response = await agent.declineToolCall({
				runId: this.currentRunId,
				toolCallId,
				memory: this.currentThreadId
					? {
							thread: this.currentThreadId,
							resource: this.resourceId,
						}
					: undefined,
				abortSignal: this.abortController.signal,
				requestContext: this.buildRequestContext(),
			})

			// Process the resumed stream
			await this.processStream(response)
		} finally {
			this.abortController = null
		}
	}

	/**
	 * Process a stream response (shared between sendMessage and tool approval).
	 */
	private async processStream(response: {
		fullStream: AsyncIterable<any>
	}): Promise<HarnessMessage> {
		let currentMessage: HarnessMessage = {
			id: this.generateId(),
			role: "assistant",
			content: [],
			createdAt: new Date(),
		}

		const textContentById = new Map<string, { index: number; text: string }>()
		const thinkingContentById = new Map<
			string,
			{ index: number; text: string }
		>()
		for await (const chunk of response.fullStream) {
			if ("runId" in chunk && chunk.runId) {
				this.currentRunId = chunk.runId
			}
			switch (chunk.type) {
				case "text-start": {
					const textIndex = currentMessage.content.length
					currentMessage.content.push({ type: "text", text: "" })
					textContentById.set(chunk.payload.id, { index: textIndex, text: "" })
					this.emit({ type: "message_start", message: { ...currentMessage } })
					break
				}

				case "text-delta": {
					const textState = textContentById.get(chunk.payload.id)
					if (textState) {
						textState.text += chunk.payload.text
						const textContent = currentMessage.content[textState.index]
						if (textContent && textContent.type === "text") {
							textContent.text = textState.text
						}
						this.emit({
							type: "message_update",
							message: { ...currentMessage },
						})
					}
					break
				}

				case "reasoning-start": {
					const thinkingIndex = currentMessage.content.length
					currentMessage.content.push({ type: "thinking", thinking: "" })
					thinkingContentById.set(chunk.payload.id, {
						index: thinkingIndex,
						text: "",
					})
					this.emit({ type: "message_update", message: { ...currentMessage } })
					break
				}

				case "reasoning-delta": {
					const thinkingState = thinkingContentById.get(chunk.payload.id)
					if (thinkingState) {
						thinkingState.text += chunk.payload.text
						const thinkingContent = currentMessage.content[thinkingState.index]
						if (thinkingContent && thinkingContent.type === "thinking") {
							thinkingContent.thinking = thinkingState.text
						}
						this.emit({
							type: "message_update",
							message: { ...currentMessage },
						})
					}
					break
				}

				case "tool-call": {
					const toolCall = chunk.payload
					currentMessage.content.push({
						type: "tool_call",
						id: toolCall.toolCallId,
						name: toolCall.toolName,
						args: toolCall.args,
					})
					this.emit({
						type: "tool_start",
						toolCallId: toolCall.toolCallId,
						toolName: toolCall.toolName,
						args: toolCall.args,
					})
					this.emit({ type: "message_update", message: { ...currentMessage } })
					break
				}

				case "tool-result": {
					const toolResult = chunk.payload
					currentMessage.content.push({
						type: "tool_result",
						id: toolResult.toolCallId,
						name: toolResult.toolName,
						result: toolResult.result,
						isError: toolResult.isError ?? false,
					})
					this.emit({
						type: "tool_end",
						toolCallId: toolResult.toolCallId,
						result: toolResult.result,
						isError: toolResult.isError ?? false,
					})
					this.emit({ type: "message_update", message: { ...currentMessage } })

					// PostToolUse hooks (fire and forget)
					if (this.hookManager) {
						const toolCall = currentMessage.content.find(
							(c) => c.type === "tool_call" && c.id === toolResult.toolCallId,
						)
						if (toolCall && toolCall.type === "tool_call") {
							this.hookManager
								.runPostToolUse(
									toolCall.name,
									toolCall.args,
									toolResult.result,
									toolResult.isError ?? false,
								)
								.catch(() => {})
						}
					}
					break
				}

				case "tool-error": {
					const toolError = chunk.payload
					this.emit({
						type: "tool_end",
						toolCallId: toolError.toolCallId,
						result: toolError.error,
						isError: true,
					})
					break
				}
				case "tool-call-approval": {
					const toolCallId = chunk.payload.toolCallId
					const toolName = chunk.payload.toolName
					const toolArgs = chunk.payload.args

					// Run PreToolUse hooks BEFORE YOLO decision
					let hookBlocked = false
					if (this.hookManager) {
						const hookResult = await this.hookManager.runPreToolUse(
							toolName,
							toolArgs,
						)
						for (const warning of hookResult.warnings) {
							this.emit({
								type: "error",
								error: new Error(`[hook] ${warning}`),
							})
						}
						if (!hookResult.allowed) {
							hookBlocked = true
							this.emit({
								type: "tool_end",
								toolCallId,
								result: `Blocked by hook: ${hookResult.blockReason || "Policy violation"}`,
								isError: true,
							})
							// Queue decline for after stream finishes (same pattern as pendingApproval)
							this.pendingDeclineToolCallId = toolCallId
						}
					}

					if (!hookBlocked) {
						// Check YOLO mode — auto-approve if enabled
						const isYolo = (this.state as any)?.yolo === true
						if (isYolo) {
							// Queue for approval after stream finishes (don't call from inside processStream
							// — the workflow snapshot may not be saved yet, causing "No snapshot found" errors)
							this.pendingApprovalToolCallId = toolCallId
						} else {
							// Tool requires user approval before execution
							this.emit({
								type: "tool_approval_required",
								toolCallId,
								toolName,
								args: toolArgs,
							})
						}
					}
					break
				}

				case "error": {
					this.emit({
						type: "error",
						error:
							chunk.payload.error instanceof Error
								? chunk.payload.error
								: new Error(String(chunk.payload.error)),
					})
					break
				}
				case "step-finish": {
					// Extract usage from step-finish payload
					const usage = chunk.payload?.output?.usage
					if (usage) {
						const promptTokens = usage.promptTokens ?? 0
						const completionTokens = usage.completionTokens ?? 0
						const totalTokens = promptTokens + completionTokens

						// Update cumulative token usage
						this.tokenUsage.promptTokens += promptTokens
						this.tokenUsage.completionTokens += completionTokens
						this.tokenUsage.totalTokens += totalTokens

						// Persist to thread metadata (fire and forget)
						this.persistTokenUsage().catch(() => {})

						this.emit({
							type: "usage_update",
							usage: {
								promptTokens,
								completionTokens,
								totalTokens,
							},
						})
					}
					break
				}
				case "finish": {
					const finishReason = chunk.payload.stepResult?.reason
					if (finishReason === "stop" || finishReason === "end-turn") {
						currentMessage.stopReason = "complete"
					} else if (finishReason === "tool-calls") {
						currentMessage.stopReason = "tool_use"
					} else {
						currentMessage.stopReason = "complete"
					}
					break
				}

				// Observational Memory data parts
				// NOTE: OM data parts arrive as { type, data: { ... } } — NOT { type, payload }
				case "data-om-progress": {
					const payload = (chunk as any).data as Record<string, any> | undefined
					if (payload && payload.pendingTokens !== undefined) {
						this.emit({
							type: "om_progress",
							pendingTokens: payload.pendingTokens,
							threshold: payload.messageTokens ?? payload.threshold ?? 0,
							thresholdPercent:
								payload.messageTokensPercent ?? payload.thresholdPercent ?? 0,
							observationTokens: payload.observationTokens ?? 0,
							reflectionThreshold:
								payload.observationTokensThreshold ??
								payload.reflectionThreshold ??
								0,
							reflectionThresholdPercent:
								payload.observationTokensPercent ??
								payload.reflectionThresholdPercent ??
								0,
						})
					}
					break
				}

				case "data-om-observation-start": {
					const payload = (chunk as any).data as Record<string, any> | undefined
					if (payload && payload.cycleId) {
						if (payload.operationType === "observation") {
							this.emit({
								type: "om_observation_start",
								cycleId: payload.cycleId,
								operationType: payload.operationType,
								tokensToObserve: payload.tokensToObserve ?? 0,
							})
						} else if (payload.operationType === "reflection") {
							this.emit({
								type: "om_reflection_start",
								cycleId: payload.cycleId,
								tokensToReflect: payload.tokensToObserve ?? 0,
							})
						}
					}
					break
				}

				case "data-om-observation-end": {
					const payload = (chunk as any).data as Record<string, any> | undefined
					if (payload && payload.cycleId) {
						// Check if this is a reflection end (has compressedTokens) or observation end
						if (payload.compressedTokens !== undefined) {
							this.emit({
								type: "om_reflection_end",
								cycleId: payload.cycleId,
								durationMs: payload.durationMs ?? 0,
								compressedTokens: payload.compressedTokens,
							})
						} else {
							this.emit({
								type: "om_observation_end",
								cycleId: payload.cycleId,
								durationMs: payload.durationMs ?? 0,
								tokensObserved: payload.tokensObserved ?? 0,
								observationTokens: payload.observationTokens ?? 0,
							})
						}
					}
					break
				}

				case "data-om-observation-failed": {
					const payload = (chunk as any).data as Record<string, any> | undefined
					if (payload) {
						if (payload.operationType === "reflection") {
							this.emit({
								type: "om_reflection_failed",
								cycleId: payload.cycleId ?? "unknown",
								error: payload.error ?? "Unknown error",
								durationMs: payload.durationMs ?? 0,
							})
						} else {
							this.emit({
								type: "om_observation_failed",
								cycleId: payload.cycleId ?? "unknown",
								error: payload.error ?? "Unknown error",
								durationMs: payload.durationMs ?? 0,
							})
						}
					}
					break
				}
				default:
					break
			}
		}

		this.emit({ type: "message_end", message: currentMessage })
		return currentMessage
	}

	// ===========================================================================
	// Event System
	// ===========================================================================

	/**
	 * Subscribe to harness events.
	 * Returns an unsubscribe function.
	 */
	subscribe(listener: HarnessEventListener): () => void {
		this.listeners.push(listener)
		return () => {
			const index = this.listeners.indexOf(listener)
			if (index !== -1) {
				this.listeners.splice(index, 1)
			}
		}
	}

	private emit(event: HarnessEvent): void {
		for (const listener of this.listeners) {
			try {
				const result = listener(event)
				if (result instanceof Promise) {
					result.catch((err) => {
						console.error("Error in harness event listener:", err)
					})
				}
			} catch (err) {
				console.error("Error in harness event listener:", err)
			}
		}
	}

	// ===========================================================================
	// Runtime Context
	// ===========================================================================

	/**
	 * Build request context for agent execution.
	 * Tools can access harness state via requestContext.get('harness').
	 */
	private buildRequestContext(): RequestContext {
		const harnessContext: HarnessRuntimeContext<TState> = {
			harnessId: this.id,
			state: this.getState(),
			getState: () => this.getState(),
			setState: (updates) => this.setState(updates),
			threadId: this.currentThreadId,
			resourceId: this.resourceId,
			modeId: this.currentModeId,
			abortSignal: this.abortController?.signal,
			workspace: this.workspace,
			emitEvent: (event) => this.emit(event),
			registerQuestion: (questionId, resolve) =>
				this.registerQuestion(questionId, resolve),
			registerPlanApproval: (planId, resolve) =>
				this.registerPlanApproval(planId, resolve),
		}
		return new RequestContext([["harness", harnessContext]])
	}

	// ===========================================================================
	// Session Info
	// ===========================================================================

	/**
	 * Get current session info (for TUI display).
	 */
	async getSession(): Promise<HarnessSession> {
		return {
			currentThreadId: this.currentThreadId,
			currentModeId: this.currentModeId,
			threads: await this.listThreads(),
		}
	}
	// ===========================================================================
	// Authentication
	// ===========================================================================

	/**
	 * Get the auth storage instance.
	 * Creates a default instance if not provided in config.
	 */
	getAuthStorage(): AuthStorage {
		if (!this.config.authStorage) {
			this.config.authStorage = new AuthStorage()
		}
		return this.config.authStorage
	}

	/**
	 * Get all available OAuth providers.
	 */
	getOAuthProviders(): OAuthProviderInterface[] {
		return getOAuthProviders()
	}

	/**
	 * Check if a provider is logged in (has OAuth credentials).
	 */
	isLoggedIn(providerId: string): boolean {
		return this.getAuthStorage().isLoggedIn(providerId)
	}

	/**
	 * Check if a provider has any credentials (OAuth or API key).
	 */
	hasCredentials(providerId: string): boolean {
		return this.getAuthStorage().has(providerId)
	}

	/**
	 * Get all logged-in provider IDs.
	 */
	getLoggedInProviders(): string[] {
		const providers = this.getOAuthProviders()
		return providers.filter((p) => this.isLoggedIn(p.id)).map((p) => p.id)
	}

	/**
	 * Perform OAuth login for a provider.
	 */
	async login(
		providerId: string,
		callbacks: OAuthLoginCallbacks,
	): Promise<void> {
		await this.getAuthStorage().login(providerId, callbacks)
	}

	/**
	 * Logout from a provider.
	 */
	logout(providerId: string): void {
		this.getAuthStorage().logout(providerId)
	}

	/**
	 * Get API key for a provider (from OAuth credentials or env).
	 * Auto-refreshes OAuth tokens if needed.
	 */
	async getApiKey(providerId: string): Promise<string | undefined> {
		return this.getAuthStorage().getApiKey(providerId)
	}

	// ===========================================================================
	// Workspace
	// ===========================================================================

	/**
	 * Get the workspace instance (if configured and initialized).
	 * Returns undefined if no workspace was configured or if init failed.
	 */
	getWorkspace(): Workspace | undefined {
		return this.workspace
	}

	/**
	 * Check if a workspace is configured (regardless of init status).
	 */
	hasWorkspace(): boolean {
		return this.config.workspace !== undefined
	}

	/**
	 * Check if the workspace is initialized and ready.
	 */
	isWorkspaceReady(): boolean {
		return this.workspaceInitialized && this.workspace !== undefined
	}

	/**
	 * Destroy the workspace and clean up resources.
	 * Can be called during harness shutdown for proper cleanup.
	 */
	async destroyWorkspace(): Promise<void> {
		if (this.workspace && this.workspaceInitialized) {
			try {
				this.emit({
					type: "workspace_status_changed",
					status: "destroying",
				})
				await this.workspace.destroy()
				this.emit({
					type: "workspace_status_changed",
					status: "destroyed",
				})
			} catch (error) {
				console.warn("Workspace destroy failed:", error)
			} finally {
				this.workspaceInitialized = false
			}
		}
	}

	// ===========================================================================
	// Utilities
	// ===========================================================================

	private generateId(): string {
		return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
	}
}
