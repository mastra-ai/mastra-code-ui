/**
 * Main entry point for Mastra Code TUI.
 * This is an example of how to wire up the Harness and TUI together.
 */
import { Agent } from "@mastra/core/agent"
import type { RequestContext } from "@mastra/core/request-context"
import { ModelRouterLanguageModel } from "@mastra/core/llm"
import {
	Workspace,
	LocalFilesystem,
	LocalSandbox,
} from "@mastra/core/workspace"
import { LibSQLStore } from "@mastra/libsql"
import { Memory } from "@mastra/memory"
import { z } from "zod"
import * as path from "path"
import * as os from "os"
import * as fs from "fs"
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
import { HookManager } from "./hooks/index.js"
import { MCPManager } from "./mcp/index.js"
import { detectProject, getDatabasePath } from "./utils/project.js"
import { startGatewaySync } from "./utils/gateway-sync.js"
import {
	createViewTool,
	createExecuteCommandTool,
	stringReplaceLspTool,
	astSmartEditTool,
	createWebSearchTool,
	createWebExtractTool,
	createGrepTool,
	createGlobTool,
	createWriteFileTool,
	createSubagentTool,
	todoWriteTool,
	todoCheckTool,
	askUserTool,
	submitPlanTool,
} from "./tools/index.js"
import { buildFullPrompt, type PromptContext } from "./prompts/index.js"
import { createAnthropic } from "@ai-sdk/anthropic"

// =============================================================================
// Start Gateway Sync (keeps model registry up to date)
// =============================================================================

startGatewaySync(5 * 60 * 1000) // Sync every 5 minutes

// =============================================================================
// Helpers
// =============================================================================

/** Find the deepest common ancestor directory for a list of absolute paths. */
function findCommonAncestor(paths: string[]): string {
	if (paths.length === 0) return "/"
	if (paths.length === 1) return paths[0]
	const split = paths.map((p) => path.resolve(p).split(path.sep))
	const minLen = Math.min(...split.map((s) => s.length))
	const common: string[] = []
	for (let i = 0; i < minLen; i++) {
		const seg = split[0][i]
		if (split.every((s) => s[i] === seg)) {
			common.push(seg)
		} else {
			break
		}
	}
	return common.length <= 1 ? path.sep : common.join(path.sep)
}

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
// Default OM model - using gemini-2.5-flash for efficiency
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
	// Smart editing mode — use AST-based analysis for code edits
	smartEditing: z.boolean().default(true),
	// Todo list (persisted per-thread)
	todos: z
		.array(
			z.object({
				content: z.string(),
				status: z.enum(["pending", "in_progress", "completed"]),
				activeForm: z.string(),
			}),
		)
		.default([]),
	// Sandbox allowed paths (per-thread, absolute paths allowed in addition to project root)
	sandboxAllowedPaths: z.array(z.string()).default([]),
	// Active plan (set when a plan is approved in Plan mode)
	activePlan: z
		.object({
			title: z.string(),
			plan: z.string(),
			approvedAt: z.string(),
		})
		.nullable()
		.default(null),
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

// Mutable OM model state — updated by harness event listeners, read by OM model
// functions. We use this instead of requestContext because Mastra's OM system
// does NOT propagate requestContext to observer/reflector agent.generate() calls.
const omModelState = {
	observerModelId: DEFAULT_OM_MODEL_ID,
	reflectorModelId: DEFAULT_OM_MODEL_ID,
}

/**
 * Dynamic model function for Observer agent.
 * Reads from module-level omModelState (kept in sync by harness events).
 */
function getObserverModel() {
	return resolveModel(omModelState.observerModelId)
}

/**
 * Dynamic model function for Reflector agent.
 * Reads from module-level omModelState (kept in sync by harness events).
 */
function getReflectorModel() {
	return resolveModel(omModelState.reflectorModelId)
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
const grepTool = createGrepTool(project.rootPath)
const globTool = createGlobTool(project.rootPath)
const writeFileTool = createWriteFileTool(project.rootPath)
const webSearchTool = createWebSearchTool()
const webExtractTool = createWebExtractTool()
/**
 * Resolve a model ID to the correct provider instance.
 * Shared by the main agent, observer, and reflector.
 *
 * - For anthropic/* models: Uses Claude Max OAuth provider (opencode auth)
 * - For openai/* models with OAuth: Uses OpenAI Codex OAuth provider
 * - For moonshotai/* models: Uses Moonshot AI Anthropic-compatible endpoint
 * - For all other providers: Uses Mastra's model router (models.dev gateway)
 */
function resolveModel(modelId: string) {
	const isAnthropicModel = modelId.startsWith("anthropic/")
	const isOpenAIModel = modelId.startsWith("openai/")
	const isMoonshotModel = modelId.startsWith("moonshotai/")

	if (isMoonshotModel) {
		if (!process.env.MOONSHOT_AI_API_KEY) {
			throw new Error(`Need MOONSHOT_AI_API_KEY`)
		}
		return createAnthropic({
			apiKey: process.env.MOONSHOT_AI_API_KEY!,
			baseURL: "https://api.moonshot.ai/anthropic/v1",
			name: "moonshotai.anthropicv1",
		})(modelId.substring("moonshotai/".length))
	} else if (isAnthropicModel) {
		return opencodeClaudeMaxProvider(modelId.substring(`anthropic/`.length))
	} else if (isOpenAIModel && authStorage.isLoggedIn("openai-codex")) {
		return openaiCodexProvider(modelId.substring(`openai/`.length))
	} else {
		return new ModelRouterLanguageModel(modelId)
	}
}

/**
 * Dynamic model function that reads the current model from harness state.
 * This allows runtime model switching via the /models picker.
 */
function getDynamicModel({
	requestContext,
}: {
	requestContext: RequestContext
}) {
	const harnessContext = requestContext.get("harness") as
		| HarnessRuntimeContext<typeof stateSchema>
		| undefined

	const modelId = harnessContext?.state?.currentModelId
	if (!modelId) {
		throw new Error("No model selected. Use /models to select a model first.")
	}

	return resolveModel(modelId)
}

// =============================================================================
// Create Subagent Tool (subagent delegation)
// =============================================================================

// The subagent tool needs tools and resolveModel to spawn subagents.
// We pass all tools that subagents might need based on their type.
const subagentTool = createSubagentTool({
	tools: {
		// Read-only tools (for explore, plan)
		view: viewTool,
		search_content: grepTool,
		find_files: globTool,
		// Write tools (for execute)
		string_replace_lsp: stringReplaceLspTool,
		write_file: writeFileTool,
		execute_command: executeCommandTool,
		// Task tracking (for execute)
		todo_write: todoWriteTool,
		todo_check: todoCheckTool,
	},
	resolveModel,
})

// =============================================================================
// Create Workspace with Skills
// =============================================================================

// We support multiple skill locations for compatibility:
// 1. Project-local: .mastracode/skills (project-specific mastra-code skills)
// 2. Project-local: .claude/skills (Claude Code compatible skills)
// 3. Global: ~/.mastracode/skills (user-wide mastra-code skills)
// 4. Global: ~/.claude/skills (user-wide Claude Code skills)

const mastraCodeLocalSkillsPath = path.join(
	process.cwd(),
	".mastracode",
	"skills",
)
const claudeLocalSkillsPath = path.join(process.cwd(), ".claude", "skills")
const mastraCodeGlobalSkillsPath = path.join(
	os.homedir(),
	".mastracode",
	"skills",
)
const claudeGlobalSkillsPath = path.join(os.homedir(), ".claude", "skills")

// Mastra's LocalSkillSource.readdir uses Node's Dirent.isDirectory() which
// returns false for symlinks. Tools like `npx skills add` install skills as
// symlinks, so we need to resolve them. For each symlinked skill directory,
// we add the real (resolved) parent path as an additional skill scan path.
function collectSkillPaths(skillsDirs: string[]): string[] {
	const paths: string[] = []
	const seen = new Set<string>()

	for (const skillsDir of skillsDirs) {
		if (!fs.existsSync(skillsDir)) continue

		// Always add the directory itself
		const resolved = fs.realpathSync(skillsDir)
		if (!seen.has(resolved)) {
			seen.add(resolved)
			paths.push(skillsDir)
		}

		// Check for symlinked skill subdirectories and add their real parents
		try {
			const entries = fs.readdirSync(skillsDir, { withFileTypes: true })
			for (const entry of entries) {
				if (entry.isSymbolicLink()) {
					const linkPath = path.join(skillsDir, entry.name)
					const realPath = fs.realpathSync(linkPath)
					const stat = fs.statSync(realPath)
					if (stat.isDirectory()) {
						// Add the real parent directory as a skill path
						// so Mastra discovers it as a regular directory
						const realParent = path.dirname(realPath)
						if (!seen.has(realParent)) {
							seen.add(realParent)
							paths.push(realParent)
						}
					}
				}
			}
		} catch {
			// Ignore errors during symlink resolution
		}
	}

	return paths
}

const skillPaths = collectSkillPaths([
	mastraCodeLocalSkillsPath,
	claudeLocalSkillsPath,
	mastraCodeGlobalSkillsPath,
	claudeGlobalSkillsPath,
])

// Create workspace with filesystem, sandbox, and skills.
// Disable auto-injected mastra_workspace_* tools — we have our own custom tools
// (view, write_file, string_replace_lsp, search_content, find_files, execute_command)
// that properly respect sandboxAllowedPaths.
const workspace = new Workspace({
	id: "mastra-code-workspace",
	name: "Mastra Code Workspace",
	filesystem: new LocalFilesystem({
		basePath: project.rootPath,
	}),
	sandbox: new LocalSandbox({
		workingDirectory: project.rootPath,
		env: process.env,
	}),
	...(skillPaths.length > 0 ? { skills: skillPaths } : {}),
	tools: { enabled: false },
})

if (skillPaths.length > 0) {
	console.log(`Skills loaded from:`)
	for (const p of skillPaths) {
		console.log(`  - ${p}`)
	}
}

// Create agent with dynamic model, dynamic prompt, and full toolset
const codeAgent = new Agent({
	id: "code-agent",
	name: "Code Agent",
	instructions: ({ requestContext }) => {
		const harnessContext = requestContext.get("harness") as
			| HarnessRuntimeContext<typeof stateSchema>
			| undefined
		const state = harnessContext?.state
		const modeId = harnessContext?.modeId ?? "build"

		const promptCtx: PromptContext = {
			projectPath: state?.projectPath ?? project.rootPath,
			projectName: state?.projectName ?? project.name,
			gitBranch: state?.gitBranch ?? project.gitBranch,
			platform: process.platform,
			date: new Date().toISOString().split("T")[0],
			mode: modeId,
			activePlan: state?.activePlan ?? null,
			// Add missing fields for PromptContext
			modeId: modeId,
			currentDate: new Date().toISOString().split("T")[0],
			workingDir: state?.projectPath ?? project.rootPath,
			state: state,
		}

		return buildFullPrompt(promptCtx)
	},
	model: getDynamicModel,
	memory,
	workspace: ({ requestContext }) => {
		const ctx = requestContext.get("harness") as
			| HarnessRuntimeContext<typeof stateSchema>
			| undefined
		const allowedPaths = ctx?.getState?.()?.sandboxAllowedPaths ?? []
		if (allowedPaths.length > 0) {
			// Create expanded workspace that covers the project root + all allowed paths
			const allPaths = [
				project.rootPath,
				...allowedPaths.map((p: string) => path.resolve(p)),
			]
			const commonRoot = findCommonAncestor(allPaths)
			return new Workspace({
				id: "mastra-code-workspace-expanded",
				name: "Mastra Code Workspace (Expanded)",
				filesystem: new LocalFilesystem({
					basePath: commonRoot,
				}),
				sandbox: new LocalSandbox({
					workingDirectory: project.rootPath,
					env: process.env,
				}),
				...(skillPaths.length > 0 ? { skills: skillPaths } : {}),
				tools: { enabled: false },
			})
		}
		return ctx?.workspace ?? workspace
	},
	tools: ({ requestContext }) => {
		const harnessContext = requestContext.get("harness") as
			| HarnessRuntimeContext<typeof stateSchema>
			| undefined
		const modelId = harnessContext?.state?.currentModelId ?? ""
		const modeId = harnessContext?.modeId ?? "build"
		const isAnthropicModel = modelId.startsWith("anthropic/")

		// Build tool set based on mode
		// NOTE: Tool names "grep" and "glob" are reserved by Anthropic's OAuth
		// validation (they match Claude Code's internal tools). We use
		// "search_content" and "find_files" to avoid the collision.
		const tools: Record<string, any> = {
			// Read-only tools — always available
			view: viewTool,
			search_content: grepTool,
			find_files: globTool,
			// Subagent delegation — always available
			subagent: subagentTool,
			// Todo tracking — always available (planning tool, not a write tool)
			todo_write: todoWriteTool,
			todo_check: todoCheckTool,
			// User interaction — always available
			ask_user: askUserTool,
		}

		// Write tools — NOT available in plan mode
		if (modeId !== "plan") {
			tools.string_replace_lsp = stringReplaceLspTool
			tools.ast_smart_edit = astSmartEditTool
			tools.write_file = writeFileTool
			tools.execute_command = executeCommandTool
		}

		// Plan submission — only available in plan mode
		if (modeId === "plan") {
			tools.submit_plan = submitPlanTool
		}

		// Web tools — conditional on model/API keys
		if (!isAnthropicModel && webSearchTool) {
			tools.web_search = webSearchTool
		}
		if (webExtractTool) {
			tools.web_extract = webExtractTool
		}

		// MCP server tools — injected from connected servers
		const mcpTools = mcpManager.getTools()
		Object.assign(tools, mcpTools)

		return tools
	},
})

// =============================================================================
// Anthropic Provider Tools (web search & fetch - zero implementation needed)
// =============================================================================
const anthropic = createAnthropic({})

function getToolsets(
	modelId: string,
): Record<string, Record<string, unknown>> | undefined {
	const isAnthropicModel = modelId.startsWith("anthropic/")
	if (!isAnthropicModel) return undefined

	return {
		anthropic: {
			web_search: anthropic.tools.webSearch_20250305(),
		},
	}
}

// =============================================================================
// Create Hook Manager
// =============================================================================
const hookManager = new HookManager(project.rootPath, "session-init")

if (hookManager.hasHooks()) {
	const hookConfig = hookManager.getConfig()
	const hookCount = Object.values(hookConfig).reduce(
		(sum, hooks) => sum + (hooks?.length ?? 0),
		0,
	)
	console.log(`Hooks: ${hookCount} hook(s) configured`)
}

// =============================================================================
// Create MCP Manager
// =============================================================================
const mcpManager = new MCPManager(project.rootPath)

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
	getToolsets,
	workspace,
	hookManager,
	mcpManager,
	modes: [
		{
			id: "build",
			name: "Build",
			default: true,
			defaultModelId: "anthropic/claude-opus-4-5",
            color: "#7f45e0",
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

// Keep omModelState in sync with harness state changes.
// We listen for both explicit model changes and thread switches (which restore
// persisted OM model preferences from thread metadata).
harness.subscribe((event) => {
	if (event.type === "om_model_changed") {
		const { role, modelId } = event as {
			type: string
			role: string
			modelId: string
		}
		if (role === "observer") omModelState.observerModelId = modelId
		if (role === "reflector") omModelState.reflectorModelId = modelId
	} else if (event.type === "thread_changed") {
		// Thread switch restores OM model IDs from metadata — re-read from harness state
		omModelState.observerModelId = harness.getObserverModelId()
		omModelState.reflectorModelId = harness.getReflectorModelId()
		// Keep hook manager session ID in sync
		hookManager.setSessionId((event as any).threadId)
	} else if (event.type === "thread_created") {
		hookManager.setSessionId((event as any).thread.id)
	}
})

// =============================================================================
// Create and Run TUI
// =============================================================================
const tui = new MastraTUI({
	harness,
	appName: "Mastra Code",
	version: "0.1.0",
	inlineQuestions: true,
})

// Initialize MCP connections, then run the TUI
;(async () => {
	if (mcpManager.hasServers()) {
		await mcpManager.init()
		const statuses = mcpManager.getServerStatuses()
		const connected = statuses.filter((s) => s.connected)
		const failed = statuses.filter((s) => !s.connected)
		const totalTools = connected.reduce((sum, s) => sum + s.toolCount, 0)
		console.log(
			`MCP: ${connected.length} server(s) connected, ${totalTools} tool(s)`,
		)
		for (const s of failed) {
			console.log(`MCP: Failed to connect to "${s.name}": ${s.error}`)
		}
	}

	tui.run().catch((error) => {
		console.error("Fatal error:", error)
		process.exit(1)
	})
})()

// Clean up MCP connections on exit
process.on("beforeExit", async () => {
	await mcpManager.disconnect()
})
