import type { Agent } from "@mastra/core/agent"
import type { MastraMemory } from "@mastra/core/memory"
import type { MastraStorage } from "@mastra/core/storage"
import type {
	Workspace,
	WorkspaceConfig,
	WorkspaceStatus,
} from "@mastra/core/workspace"
import type { z } from "zod"
import type { AuthStorage } from "../auth/storage.js"
import type { HookManager } from "../hooks/index.js"

// =============================================================================
// Harness Configuration
// =============================================================================

/**
 * Configuration for a single agent mode within the harness.
 * Each mode represents a different "personality" or capability set.
 */
export interface HarnessMode<
	TState extends HarnessStateSchema = HarnessStateSchema,
> {
	/** Unique identifier for this mode (e.g., "plan", "build", "review") */
	id: string

	/** Human-readable name for display in TUI */
	name?: string

	/** Whether this is the default mode when harness starts */
	default?: boolean

	/**
	 * Default model ID for this mode (e.g., "anthropic/claude-sonnet-4-20250514").
	 * Used when no per-mode model has been explicitly selected.
	 * If not set, falls back to the global last model.
	 */
	defaultModelId?: string

	/** Hex color for the mode badge in the status line (e.g., "#7c3aed") */
	color?: string

	/**
	 * The agent for this mode.
	 * Can be a static Agent or a function that receives harness state.
	 */
	agent: Agent | ((state: z.infer<TState>) => Agent)
}

/**
 * Schema type for harness state - must be a Zod object schema.
 */
export type HarnessStateSchema = z.ZodObject<z.ZodRawShape>

/**
 * Configuration for creating a Harness instance.
 */
export interface HarnessConfig<
	TState extends HarnessStateSchema = HarnessStateSchema,
> {
	/** Unique identifier for this harness instance */
	id: string

	/**
	 * Resource ID for grouping threads (e.g., project identifier).
	 * Threads are scoped to this resource ID.
	 * Typically derived from git URL or project path.
	 */
	resourceId: string

	/** Storage backend for persistence (threads, messages, state) */
	storage: MastraStorage

	/** Zod schema defining the shape of harness state */
	stateSchema: TState

	/** Initial state values (must conform to schema) */
	initialState?: Partial<z.infer<TState>>

	/** Memory configuration (shared across all modes) */
	memory?: MastraMemory

	/** Available agent modes */
	modes: HarnessMode<TState>[]

	/**
	 * Callback when observational memory emits debug events.
	 * Used by TUI to show progress indicators.
	 */
	onObservationalMemoryEvent?: (event: ObservationalMemoryDebugEvent) => void

	/**
	 * Auth storage for OAuth credentials.
	 * If not provided, a default instance will be created.
	 */
	authStorage?: AuthStorage

	/**
	 * Optional callback to provide additional toolsets at stream time.
	 * Receives the current model ID and should return a toolsets object
	 * (or undefined) to pass to agent.stream().
	 *
	 * Use this to conditionally add provider-specific tools
	 * (e.g., Anthropic web search when using Claude models).
	 */
	getToolsets?: (
		modelId: string,
	) => Record<string, Record<string, unknown>> | undefined

	/**
	 * Workspace configuration.
	 * Accepts either a pre-constructed Workspace instance or a WorkspaceConfig
	 * to have the Harness construct one internally.
	 *
	 * When provided, the Harness manages the workspace lifecycle (init/destroy)
	 * and exposes it to agents via HarnessRuntimeContext.
	 *
	 * @example Pre-built workspace
	 * ```typescript
	 * const workspace = new Workspace({ skills: ['/skills'] });
	 * const harness = new Harness({ workspace, ... });
	 * ```
	 *
	 * @example Workspace config (Harness constructs it)
	 * ```typescript
	 * const harness = new Harness({
	 *   workspace: {
	 *     filesystem: new LocalFilesystem({ basePath: './data' }),
	 *     skills: ['/skills'],
	 *   },
	 *   ...
	 * });
	 * ```
	 */
	workspace?: Workspace | WorkspaceConfig

	/**
	 * Hook manager for lifecycle event interception.
	 * If provided, hooks fire at tool use, message send, stop, and session events.
	 */
	hookManager?: HookManager
}

// =============================================================================
// Harness State
// =============================================================================

/**
 * Thread metadata stored in the harness.
 */
export interface HarnessThread {
	id: string
	resourceId: string
	title?: string
	createdAt: Date
	updatedAt: Date
	/** Token usage for this thread (persisted for status line) */
	tokenUsage?: TokenUsage
}

/**
 * Session info for the current harness instance.
 */
export interface HarnessSession {
	currentThreadId: string | null
	currentModeId: string
	threads: HarnessThread[]
}

// =============================================================================
// Events
// =============================================================================

/**
 * Token usage statistics from the model.
 */
export interface TokenUsage {
	promptTokens: number
	completionTokens: number
	totalTokens: number
}

/**
 * Events emitted by the harness that the TUI can subscribe to.
 */
export type HarnessEvent =
	| { type: "mode_changed"; modeId: string; previousModeId: string }
	| { type: "model_changed"; modelId: string }
	| {
			type: "thread_changed"
			threadId: string
			previousThreadId: string | null
	  }
	| { type: "thread_created"; thread: HarnessThread }
	| {
			type: "state_changed"
			state: Record<string, unknown>
			changedKeys: string[]
	  }
	| { type: "agent_start" }
	| { type: "agent_end"; reason?: "complete" | "aborted" | "error" }
	| { type: "message_start"; message: HarnessMessage }
	| { type: "message_update"; message: HarnessMessage }
	| { type: "message_end"; message: HarnessMessage }
	| { type: "tool_start"; toolCallId: string; toolName: string; args: unknown }
	| {
			type: "tool_approval_required"
			toolCallId: string
			toolName: string
			args: unknown
	  }
	| { type: "tool_update"; toolCallId: string; partialResult: unknown }
	| { type: "tool_end"; toolCallId: string; result: unknown; isError: boolean }
	| { type: "usage_update"; usage: TokenUsage }
	| {
			type: "error"
			error: Error
			errorType?: string
			retryable?: boolean
			retryDelay?: number
	  }
	// Observational Memory events
	| {
			type: "om_progress"
			pendingTokens: number
			threshold: number
			thresholdPercent: number
			observationTokens: number
			reflectionThreshold: number
			reflectionThresholdPercent: number
	  }
	| {
			type: "om_observation_start"
			cycleId: string
			operationType: "observation" | "reflection"
			tokensToObserve: number
	  }
	| {
			type: "om_observation_end"
			cycleId: string
			durationMs: number
			tokensObserved: number
			observationTokens: number
	  }
	| {
			type: "om_observation_failed"
			cycleId: string
			error: string
			durationMs: number
	  }
	| { type: "om_reflection_start"; cycleId: string; tokensToReflect: number }
	| {
			type: "om_reflection_end"
			cycleId: string
			durationMs: number
			compressedTokens: number
	  }
	| {
			type: "om_reflection_failed"
			cycleId: string
			error: string
			durationMs: number
	  }
	| {
			type: "om_model_changed"
			role: "observer" | "reflector"
			modelId: string
	  }
	| { type: "follow_up_queued"; count: number }
	// Workspace events
	| {
			type: "workspace_status_changed"
			status: WorkspaceStatus
			error?: Error
	  }
	| {
			type: "workspace_ready"
			workspaceId: string
			workspaceName: string
	  }
    | { type: "workspace_error"; error: Error }
    // Subagent / Task delegation events
    | {
            type: "subagent_start"
            toolCallId: string
            agentType: string
            task: string
      }
    | {
            type: "subagent_tool_start"
            toolCallId: string
            agentType: string
            subToolName: string
            subToolArgs: unknown
      }
    | {
            type: "subagent_tool_end"
            toolCallId: string
            agentType: string
            subToolName: string
            subToolResult: unknown
            isError: boolean
      }
    | {
            type: "subagent_text_delta"
            toolCallId: string
            agentType: string
            textDelta: string
      }
    | {
            type: "subagent_end"
            toolCallId: string
            agentType: string
            result: string
            isError: boolean
            durationMs: number
      }
    // Todo list events
    | {
            type: "todo_updated"
            todos: Array<{
                content: string
                status: "pending" | "in_progress" | "completed"
                activeForm: string
            }>
      }
    // Ask question events
    | {
            type: "ask_question"
            questionId: string
            question: string
            options?: Array<{ label: string; description?: string }>
      }

/**
 * Listener function for harness events.
 */
export type HarnessEventListener = (event: HarnessEvent) => void | Promise<void>

// =============================================================================
// Messages
// =============================================================================

/**
 * Simplified message type for TUI consumption.
 * Maps from Mastra's internal message format.
 */
export interface HarnessMessage {
	id: string
	role: "user" | "assistant" | "system"
	content: HarnessMessageContent[]
	createdAt: Date
	/** For assistant messages */
	stopReason?: "complete" | "tool_use" | "aborted" | "error"
	errorMessage?: string
}

export type HarnessMessageContent =
	| { type: "text"; text: string }
	| { type: "thinking"; thinking: string }
	| { type: "tool_call"; id: string; name: string; args: unknown }
	| {
			type: "tool_result"
			id: string
			name: string
			result: unknown
			isError: boolean
	  }
	| { type: "image"; data: string; mimeType: string }
	| {
			type: "om_observation_start"
			tokensToObserve: number
			operationType?: "observation" | "reflection"
	  }
	| {
			type: "om_observation_end"
			tokensObserved: number
			observationTokens: number
			durationMs: number
			operationType?: "observation" | "reflection"
	  }
	| {
			type: "om_observation_failed"
			error: string
			tokensAttempted?: number
			operationType?: "observation" | "reflection"
	  }

// =============================================================================
// Observational Memory
// =============================================================================

/**
 * Debug events from observational memory.
 * Used by TUI to show progress indicators.
 */
export type ObservationalMemoryDebugEvent =
	| {
			type: "observation_triggered"
			pendingTokens: number
			threshold: number
	  }
	| {
			type: "observation_complete"
			observationTokens: number
			duration: number
	  }
	| {
			type: "reflection_triggered"
			observationTokens: number
			threshold: number
	  }
	| {
			type: "reflection_complete"
			compressedTokens: number
			duration: number
	  }
	| {
			type: "tokens_accumulated"
			pendingTokens: number
			threshold: number
	  }

// =============================================================================
// Runtime Context
// =============================================================================

/**
 * Context available to tools via Mastra's runtimeContext.
 * Tools can access harness state and methods through this.
 */
export interface HarnessRuntimeContext<
    TState extends HarnessStateSchema = HarnessStateSchema,
> {
    /** The harness instance ID */
    harnessId: string

    /** Current harness state (read-only snapshot) */
    state: z.infer<TState>

    /** Get the current harness state (live, not snapshot) */
    getState: () => z.infer<TState>

    /** Update harness state */
    setState: (updates: Partial<z.infer<TState>>) => Promise<void>

    /** Current thread ID */
    threadId: string | null

    /** Current resource ID */
    resourceId: string

    /** Current mode ID */
    modeId: string

    /** Abort signal for the current operation */
    abortSignal?: AbortSignal

    /** Workspace instance (if configured on the Harness) */
    workspace?: Workspace

    /** Emit a harness event (used by tools like task to forward subagent events) */
    emitEvent?: (event: HarnessEvent) => void

    /** Register a pending question resolver (used by ask_user tool) */
    registerQuestion?: (questionId: string, resolve: (answer: string) => void) => void
}
