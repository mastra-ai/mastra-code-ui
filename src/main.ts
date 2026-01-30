/**
 * Main entry point for Mastra Code TUI.
 * This is an example of how to wire up the Harness and TUI together.
 */
import { Agent } from "@mastra/core/agent"
import type { RequestContext } from "@mastra/core/request-context"
import { ModelRouterLanguageModel } from "@mastra/core/llm"
import { LibSQLStore } from "@mastra/libsql"
import { Memory } from "@mastra/memory"
import { z } from "zod"
import { Harness } from "./harness/harness.js"
import type { HarnessRuntimeContext } from "./harness/types.js"
import { MastraTUI } from "./tui/index.js"
import {
	opencodeClaudeMaxProvider,
	setAuthStorage,
} from "./providers/claude-max.js"
import {
	openaiCodexProvider,
	setAuthStorage as setOpenAIAuthStorage,
} from "./providers/openai-codex.js"
import { AuthStorage } from "./auth/storage.js"
import { detectProject, getDatabasePath } from "./utils/project.js"
import { startGatewaySync } from "./utils/gateway-sync.js"
import {
	createViewTool,
	createExecuteCommandTool,
	stringReplaceLspTool,
} from "./tools/index.js"

// =============================================================================
// Start Gateway Sync (keeps model registry up to date)
// =============================================================================

startGatewaySync(5 * 60 * 1000) // Sync every 5 minutes

// =============================================================================
// Create Auth Storage (shared with Claude Max provider and Harness)
// =============================================================================

const authStorage = new AuthStorage()
setAuthStorage(authStorage)
setOpenAIAuthStorage(authStorage)

// =============================================================================
// Project Detection
// =============================================================================

const project = detectProject(process.cwd())

console.log(`Project: ${project.name}`)
console.log(`Resource ID: ${project.resourceId}`)
if (project.gitBranch) console.log(`Branch: ${project.gitBranch}`)
if (project.isWorktree) console.log(`Worktree of: ${project.mainRepoPath}`)
console.log()

// =============================================================================
// Configuration
// =============================================================================
// Default OM model
const DEFAULT_OM_MODEL_ID = "google/gemini-2.5-flash"
// State schema for the harness
const stateSchema = z.object({
	projectPath: z.string().optional(),
	projectName: z.string().optional(),
	gitBranch: z.string().optional(),
	lastCommand: z.string().optional(),
	currentModelId: z.string().default(""),
	// Observational Memory model settings
	observerModelId: z.string().default(DEFAULT_OM_MODEL_ID),
	reflectorModelId: z.string().default(DEFAULT_OM_MODEL_ID),
	// Observational Memory threshold settings
	observationThreshold: z.number().default(30_000),
	reflectionThreshold: z.number().default(40_000),
	// Thinking level for extended thinking (Anthropic models)
	thinkingLevel: z.string().default("off"),
	// YOLO mode — auto-approve all tool calls
	yolo: z.boolean().default(true),
})

// =============================================================================
// Create Storage (shared across all projects)
// =============================================================================

const storage = new LibSQLStore({
	id: "mastra-code-storage",
	url: `file:${getDatabasePath()}`,
})
// =============================================================================
// Create Memory with Observational Memory support
// =============================================================================

// Default OM thresholds — per-thread overrides are loaded from thread metadata
const omObsThreshold = 30_000
const omRefThreshold = 60_000

/**
 * Dynamic model function for Observer agent.
 * Reads the observer model ID from harness state.
 */
function getObserverModel({
	requestContext,
}: {
	requestContext: RequestContext
}) {
	const harnessContext = requestContext.get("harness") as
		| HarnessRuntimeContext<typeof stateSchema>
		| undefined
	const modelId = harnessContext?.state?.observerModelId ?? DEFAULT_OM_MODEL_ID
	return new ModelRouterLanguageModel(modelId)
}

/**
 * Dynamic model function for Reflector agent.
 * Reads the reflector model ID from harness state.
 */
function getReflectorModel({
	requestContext,
}: {
	requestContext: RequestContext
}) {
	const harnessContext = requestContext.get("harness") as
		| HarnessRuntimeContext<typeof stateSchema>
		| undefined
	const modelId = harnessContext?.state?.reflectorModelId ?? DEFAULT_OM_MODEL_ID
	return new ModelRouterLanguageModel(modelId)
}

const memory = new Memory({
	storage,
	options: {
		observationalMemory: {
			enabled: true,
			scope: "thread",
			observation: {
				model: getObserverModel,
				messageTokens: omObsThreshold,
			},
			reflection: {
				model: getReflectorModel,
				observationTokens: omRefThreshold,
			},
		},
	},
})

// =============================================================================
// Create Agent
// =============================================================================
// Create tools with project root
const viewTool = createViewTool(project.rootPath)
const executeCommandTool = createExecuteCommandTool(project.rootPath)
/**
 * Dynamic model function that reads the current model from harness state.
 * This allows runtime model switching via the /models picker.
 *
 * - For anthropic/* models: Uses Claude Max OAuth provider (opencode auth)
 * - For openai/* models with OAuth: Uses OpenAI Codex OAuth provider
 * - For all other providers: Uses Mastra's model router (models.dev gateway)
 */
function getDynamicModel({
	requestContext,
}: {
	requestContext: RequestContext
}) {
	// Get harness context from requestContext
	const harnessContext = requestContext.get("harness") as
		| HarnessRuntimeContext<typeof stateSchema>
		| undefined

	// Get model ID from harness state
	const modelId = harnessContext?.state?.currentModelId
	if (!modelId) {
		throw new Error("No model selected. Use /models to select a model first.")
	}

	// Check provider prefix
	const isAnthropicModel = modelId.startsWith("anthropic/")
	const isOpenAIModel = modelId.startsWith("openai/")

	if (isAnthropicModel) {
		// Use Claude Max OAuth provider for Anthropic models
		return opencodeClaudeMaxProvider(modelId.substring(`anthropic/`.length))
	} else if (isOpenAIModel && authStorage.isLoggedIn("openai-codex")) {
		// Use OpenAI Codex OAuth provider if logged in
		return openaiCodexProvider(modelId.substring(`openai/`.length))
	} else {
		// Use Mastra's model router for all other providers
		// This routes through models.dev gateway with proper API key resolution
		return new ModelRouterLanguageModel(modelId)
	}
}

// Create agent with dynamic model (uses opencode auth)
const codeAgent = new Agent({
	id: "code-agent",
	name: "Code Agent",
	instructions: `You are a helpful coding assistant. You help users with their coding tasks.

You have access to tools to:
- View files and directories (view tool)
- Execute shell commands (execute_command tool)
- Edit files with string replacement (string_replace_lsp tool)

When the user asks you to do something:
1. Use your tools to understand the codebase
2. Make changes using the appropriate tools
3. Verify your changes worked

Be concise but thorough. Always use tools rather than just explaining what you would do.
You are interacting with the user via a terminal UI, remember that and keep your responses short enough that they don't need to scroll their terminal every time you respond.`,
	model: getDynamicModel,
	memory,
	tools: {
		view: viewTool,
		execute_command: executeCommandTool,
		string_replace_lsp: stringReplaceLspTool,
	},
})

// =============================================================================
// Create Harness
// =============================================================================
const harness = new Harness({
	id: "mastra-code",
	resourceId: project.resourceId,
	storage,
	stateSchema,
	initialState: {
		projectPath: project.rootPath,
		projectName: project.name,
		gitBranch: project.gitBranch,
	},
	modes: [
		{
			id: "build",
			name: "Build",
			default: true,
			defaultModelId: "anthropic/claude-opus-4-5",
			color: "#7c3aed",
			agent: codeAgent,
		},
		{
			id: "plan",
			name: "Plan",
			defaultModelId: "openai/gpt-5.2-codex",
			color: "#2563eb",
			agent: codeAgent,
		},
		{
			id: "fast",
			name: "Fast",
			defaultModelId: "cerebras/zai-glm-4.7",
			color: "#059669",
			agent: codeAgent,
		},
	],
	authStorage, // Share auth storage with Claude Max provider
})

// =============================================================================
// Create and Run TUI
// =============================================================================
const tui = new MastraTUI({
	harness,
	appName: "Mastra Code",
	version: "0.1.0",
})

// Run the TUI
tui.run().catch((error) => {
	console.error("Fatal error:", error)
	process.exit(1)
})
