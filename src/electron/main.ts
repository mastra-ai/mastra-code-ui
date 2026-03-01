import {
	app,
	BrowserWindow,
	ipcMain,
	shell,
	Notification,
	Menu,
	dialog,
	nativeImage,
} from "electron"
import * as path from "path"
import * as os from "os"
import * as fs from "fs"
import { fileURLToPath } from "url"
import * as pty from "node-pty"

import { Agent } from "@mastra/core/agent"
import { noopLogger } from "@mastra/core/logger"
import type { RequestContext } from "@mastra/core/request-context"
import { ModelRouterLanguageModel } from "@mastra/core/llm"
import type { LanguageModel as MastraLanguageModel } from "@mastra/core/llm"
import {
	Workspace,
	LocalFilesystem,
	LocalSandbox,
} from "@mastra/core/workspace"
import { LibSQLStore } from "@mastra/libsql"
import { Memory } from "@mastra/memory"
import { z } from "zod"
import { createAnthropic } from "@ai-sdk/anthropic"
import { createOpenAI } from "@ai-sdk/openai"

import { Harness } from "@mastra/core/harness"
import type { HarnessRequestContext } from "@mastra/core/harness"
import { Mastra } from "@mastra/core/mastra"
import {
	opencodeClaudeMaxProvider,
	setAuthStorage,
} from "../providers/claude-max.js"
import {
	openaiCodexProvider,
	setAuthStorage as setOpenAIAuthStorage,
} from "../providers/openai-codex.js"
import { AuthStorage } from "../auth/storage.js"
import { HookManager } from "../hooks/index.js"
import { MCPManager } from "../mcp/index.js"
import {
	detectProject,
	getDatabasePath,
	getAppDataDir,
} from "../utils/project.js"
import {
	getToolCategory,
	TOOL_CATEGORIES,
	YOLO_POLICIES,
} from "../permissions.js"
import type { ToolCategory } from "../permissions.js"
import { startGatewaySync } from "../utils/gateway-sync.js"
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
	requestSandboxAccessTool,
} from "../tools/index.js"
import { buildFullPrompt, type PromptContext } from "../prompts/index.js"

// Extracted modules
import type { WorktreeSession, AgentTiming } from "./ipc/types.js"
import { getAllHandlers } from "./ipc/index.js"
import { saveRecentProject } from "../utils/recent-projects.js"
import { sendDesktopNotification } from "./notifications.js"
import {
	ensureAuthenticatedModel,
	generateThreadTitle,
	deleteThread,
	setMainWindowRef,
} from "./helpers.js"

// =============================================================================
// Resolve __dirname for ESM
// =============================================================================
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// =============================================================================
// App state
// =============================================================================
let mainWindow: BrowserWindow | null = null

const sessions = new Map<string, WorktreeSession>()
let activeSessionPath: string = process.cwd()

function getActiveSession(): WorktreeSession {
	return sessions.get(activeSessionPath)!
}

// Per-session agent timing and token tracking for the Agent Dashboard
const sessionTimings = new Map<string, AgentTiming>()

// =============================================================================
// Gateway Sync
// =============================================================================
startGatewaySync(5 * 60 * 1000)

// =============================================================================
// Helpers
// =============================================================================
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

function collectSkillPaths(skillsDirs: string[]): string[] {
	const paths: string[] = []
	const seen = new Set<string>()
	for (const skillsDir of skillsDirs) {
		if (!fs.existsSync(skillsDir)) continue
		const resolved = fs.realpathSync(skillsDir)
		if (!seen.has(resolved)) {
			seen.add(resolved)
			paths.push(skillsDir)
		}
		try {
			const entries = fs.readdirSync(skillsDir, { withFileTypes: true })
			for (const entry of entries) {
				if (entry.isSymbolicLink()) {
					const linkPath = path.join(skillsDir, entry.name)
					const realPath = fs.realpathSync(linkPath)
					const stat = fs.statSync(realPath)
					if (stat.isDirectory()) {
						const realParent = path.dirname(realPath)
						if (!seen.has(realParent)) {
							seen.add(realParent)
							paths.push(realParent)
						}
					}
				}
			}
		} catch {
			// Ignore
		}
	}
	return paths
}

// =============================================================================
// Create Harness (same logic as src/main.ts)
// =============================================================================
async function createHarness(projectPath: string) {
	const authStorage = new AuthStorage()
	setAuthStorage(authStorage)
	setOpenAIAuthStorage(authStorage)

	const project = detectProject(projectPath)

	const DEFAULT_OM_MODEL_ID = "google/gemini-2.5-flash"
	const stateSchema = z.object({
		projectPath: z.string().optional(),
		projectName: z.string().optional(),
		gitBranch: z.string().optional(),
		lastCommand: z.string().optional(),
		currentModelId: z.string().default(""),
		subagentModelId: z.string().optional(),
		observerModelId: z.string().default(DEFAULT_OM_MODEL_ID),
		reflectorModelId: z.string().default(DEFAULT_OM_MODEL_ID),
		observationThreshold: z.number().default(30_000),
		reflectionThreshold: z.number().default(40_000),
		thinkingLevel: z.string().default("off"),
		yolo: z.boolean().default(false),
		smartEditing: z.boolean().default(true),
		notifications: z.enum(["bell", "system", "both", "off"]).default("both"),
		tasks: z
			.array(
				z.object({
					content: z.string(),
					status: z.enum(["pending", "in_progress", "completed"]),
					activeForm: z.string(),
				}),
			)
			.default([]),
		linearApiKey: z.string().default(""),
		linearTeamId: z.string().default(""),
		linkedLinearIssueId: z.string().default(""),
		linkedLinearIssueIdentifier: z.string().default(""),
		linkedLinearDoneStateId: z.string().default(""),
		// GitHub Issues integration
		githubToken: z.string().default(""),
		githubOwner: z.string().default(""),
		githubRepo: z.string().default(""),
		githubUsername: z.string().default(""),
		linkedGithubIssueNumber: z.number().default(0),
		linkedGithubIssueTitle: z.string().default(""),
		prInstructions: z.string().default(""),
		sandboxAllowedPaths: z.array(z.string()).default([]),
		defaultClonePath: z
			.string()
			.default(path.join(os.homedir(), "mastra-code", "workspaces")),
		activePlan: z
			.object({
				title: z.string(),
				plan: z.string(),
				approvedAt: z.string(),
			})
			.nullable()
			.default(null),
	})

	const storage = new LibSQLStore({
		id: "mastra-code-storage",
		url: `file:${getDatabasePath()}`,
	})

	const DEFAULT_OBS_THRESHOLD = 40_000
	const DEFAULT_REF_THRESHOLD = 50_000

	const omState = {
		observerModelId: DEFAULT_OM_MODEL_ID,
		reflectorModelId: DEFAULT_OM_MODEL_ID,
		obsThreshold: DEFAULT_OBS_THRESHOLD,
		refThreshold: DEFAULT_REF_THRESHOLD,
	}

	function getObserverModel() {
		return resolveModel(omState.observerModelId)
	}

	function getReflectorModel() {
		return resolveModel(omState.reflectorModelId)
	}

	let cachedMemory: Memory | null = null
	let cachedMemoryKey: string | null = null

	function getDynamicMemory({
		requestContext,
	}: {
		requestContext: RequestContext
	}) {
		const ctx = requestContext.get("harness") as
			| HarnessRequestContext<typeof stateSchema>
			| undefined
		const state = ctx?.getState?.()
		const obsThreshold = state?.observationThreshold ?? omState.obsThreshold
		const refThreshold = state?.reflectionThreshold ?? omState.refThreshold
		const cacheKey = `${obsThreshold}:${refThreshold}`
		if (cachedMemory && cachedMemoryKey === cacheKey) return cachedMemory
		cachedMemory = new Memory({
			storage,
			options: {
				generateTitle: false,
				observationalMemory: {
					enabled: true,
					scope: "thread",
					observation: {
						bufferTokens: 1 / 5,
						bufferActivation: 3 / 4,
						model: getObserverModel,
						messageTokens: obsThreshold,
						blockAfter: 1.25,
						modelSettings: { maxOutputTokens: 60000 },
					},
					reflection: {
						bufferActivation: 1 / 3,
						blockAfter: 1,
						model: getReflectorModel,
						observationTokens: refThreshold,
						modelSettings: { maxOutputTokens: 60000 },
					},
				},
			},
		})
		cachedMemoryKey = cacheKey
		return cachedMemory
	}

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
			const cred = authStorage.get("anthropic")
			if (cred?.type === "api_key") {
				return createAnthropic({ apiKey: cred.key })(
					modelId.substring("anthropic/".length),
				)
			}
			return opencodeClaudeMaxProvider(modelId.substring("anthropic/".length))
		} else if (isOpenAIModel) {
			const cred = authStorage.get("openai-codex")
			if (cred?.type === "api_key") {
				return createOpenAI({ apiKey: cred.key })(
					modelId.substring("openai/".length),
				)
			}
			if (authStorage.isLoggedIn("openai-codex")) {
				return openaiCodexProvider(modelId.substring("openai/".length))
			}
			return new ModelRouterLanguageModel(modelId)
		} else {
			return new ModelRouterLanguageModel(modelId)
		}
	}

	function getDynamicModel({
		requestContext,
	}: {
		requestContext: RequestContext
	}) {
		const harnessContext = requestContext.get("harness") as
			| HarnessRequestContext<typeof stateSchema>
			| undefined
		const modelId = harnessContext?.state?.currentModelId
		if (!modelId) {
			throw new Error("No model selected. Use /models to select a model first.")
		}
		return resolveModel(modelId)
	}

	// Create tools
	const viewTool = createViewTool(project.rootPath)
	const executeCommandTool = createExecuteCommandTool(project.rootPath)
	const grepTool = createGrepTool(project.rootPath)
	const globTool = createGlobTool(project.rootPath)
	const writeFileTool = createWriteFileTool(project.rootPath)
	const webSearchTool = createWebSearchTool()
	const webExtractTool = createWebExtractTool()

	const subagentTool = createSubagentTool({
		tools: {
			view: viewTool,
			search_content: grepTool,
			find_files: globTool,
			string_replace_lsp: stringReplaceLspTool,
			write_file: writeFileTool,
			execute_command: executeCommandTool,
		},
		resolveModel,
	})

	const subagentToolReadOnly = createSubagentTool({
		tools: {
			view: viewTool,
			search_content: grepTool,
			find_files: globTool,
		},
		resolveModel,
		allowedAgentTypes: ["explore", "plan"],
	})

	// Skills
	const skillsDirs = [
		path.join(projectPath, ".mastracode", "skills"),
		path.join(projectPath, ".claude", "skills"),
		path.join(os.homedir(), ".mastracode", "skills"),
		path.join(os.homedir(), ".claude", "skills"),
	]
	const skillPaths = collectSkillPaths(skillsDirs)

	const workspace = new Workspace({
		id: "mastra-code-workspace",
		name: "Mastra Code Workspace",
		filesystem: new LocalFilesystem({
			basePath: project.rootPath,
			contained: false,
		}),
		sandbox: new LocalSandbox({
			workingDirectory: project.rootPath,
			env: process.env,
		}),
		...(skillPaths.length > 0 ? { skills: skillPaths } : {}),
		tools: { enabled: false },
	})

	const _mcpManager = new MCPManager(project.rootPath)

	const codeAgent = new Agent({
		id: "code-agent",
		name: "Code Agent",
		instructions: ({ requestContext }) => {
			const harnessContext = requestContext.get("harness") as
				| HarnessRequestContext<typeof stateSchema>
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
				modeId: modeId,
				currentDate: new Date().toISOString().split("T")[0],
				workingDir: state?.projectPath ?? project.rootPath,
				state: state,
			}
			return buildFullPrompt(promptCtx)
		},
		model: getDynamicModel,
		memory: getDynamicMemory,
		workspace: ({ requestContext }) => {
			const ctx = requestContext.get("harness") as
				| HarnessRequestContext<typeof stateSchema>
				| undefined
			const allowedPaths = ctx?.getState?.()?.sandboxAllowedPaths ?? []
			if (allowedPaths.length > 0) {
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
						contained: false,
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
				| HarnessRequestContext<typeof stateSchema>
				| undefined
			const modelId = harnessContext?.state?.currentModelId ?? ""
			const modeId = harnessContext?.modeId ?? "build"
			const isAnthropicModel = modelId.startsWith("anthropic/")

			const tools: Record<string, any> = {
				view: viewTool,
				search_content: grepTool,
				find_files: globTool,
				execute_command: executeCommandTool,
				subagent: modeId === "plan" ? subagentToolReadOnly : subagentTool,
				request_sandbox_access: requestSandboxAccessTool,
			}

			if (modeId !== "plan") {
				tools.string_replace_lsp = stringReplaceLspTool
				tools.ast_smart_edit = astSmartEditTool
				tools.write_file = writeFileTool
			}

			if (webSearchTool) {
				tools.web_search = webSearchTool
			}
			if (webExtractTool) {
				tools.web_extract = webExtractTool
			}

			const mcpTools = _mcpManager.getTools()
			Object.assign(tools, mcpTools)

			return tools
		},
	})

	const mastra = new Mastra({
		storage,
		logger: false,
	})
	codeAgent.__registerMastra(mastra)

	codeAgent.__setLogger(noopLogger)

	const anthropic = createAnthropic({})
	function getToolsets(
		modelId: string,
	): Record<string, Record<string, unknown>> | undefined {
		if (webSearchTool) return undefined
		if (!modelId.startsWith("anthropic/")) return undefined
		return {
			anthropic: {
				web_search: anthropic.tools.webSearch_20250305(),
			},
		}
	}

	const hookManager = new HookManager(project.rootPath, "session-init")

	const _harness = new Harness({
		id: "mastra-code",
		resourceId: project.resourceId,
		storage,
		stateSchema,
		initialState: {
			projectPath: project.rootPath,
			projectName: project.name,
			gitBranch: project.gitBranch,
		},
		resolveModel: resolveModel as (modelId: string) => MastraLanguageModel,
		workspace,
		toolCategoryResolver: (toolName: string) => getToolCategory(toolName),
		modes: [
			{
				id: "build",
				name: "Build",
				default: true,
				defaultModelId: "anthropic/claude-opus-4-6",
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
		modelAuthChecker: (provider: string) => {
			return authStorage.isLoggedIn(provider) || undefined
		},
		omConfig: {
			defaultObserverModelId: DEFAULT_OM_MODEL_ID,
			defaultReflectorModelId: DEFAULT_OM_MODEL_ID,
			defaultObservationThreshold: DEFAULT_OBS_THRESHOLD,
			defaultReflectionThreshold: DEFAULT_REF_THRESHOLD,
		},
	})

	// Sync OM state
	_harness.subscribe((event) => {
		if (event.type === "om_model_changed") {
			if (event.role === "observer") omState.observerModelId = event.modelId
			if (event.role === "reflector") omState.reflectorModelId = event.modelId
		} else if (event.type === "thread_changed") {
			storage
				.getThreadById({ threadId: event.threadId })
				.then((thread) => {
					const meta = thread?.metadata as Record<string, unknown> | undefined
					if (
						meta?.observerModelId &&
						typeof meta.observerModelId === "string"
					) {
						omState.observerModelId = meta.observerModelId
						_harness.setState({
							observerModelId: meta.observerModelId,
						})
					}
					if (
						meta?.reflectorModelId &&
						typeof meta.reflectorModelId === "string"
					) {
						omState.reflectorModelId = meta.reflectorModelId
						_harness.setState({
							reflectorModelId: meta.reflectorModelId,
						})
					}
				})
				.catch(() => {
					omState.observerModelId =
						_harness.getObserverModelId() ?? DEFAULT_OM_MODEL_ID
					omState.reflectorModelId =
						_harness.getReflectorModelId() ?? DEFAULT_OM_MODEL_ID
				})
			omState.obsThreshold =
				_harness.getState().observationThreshold ?? DEFAULT_OBS_THRESHOLD
			omState.refThreshold =
				_harness.getState().reflectionThreshold ?? DEFAULT_REF_THRESHOLD
			hookManager.setSessionId(event.threadId)
			_harness.loadOMProgress?.().catch(() => {})
		} else if (event.type === "thread_created") {
			hookManager.setSessionId(event.thread.id)
			_harness.loadOMProgress?.().catch(() => {})
		} else if (event.type === "agent_end") {
			_harness.loadOMProgress?.().catch(() => {})
		}
	})

	// Default to YOLO mode
	_harness.setState({ yolo: true })
	for (const [category, policy] of Object.entries(YOLO_POLICIES)) {
		_harness.setPermissionForCategory({
			category: category as ToolCategory,
			policy,
		})
	}

	return {
		harness: _harness,
		mcpManager: _mcpManager,
		resolveModel,
		authStorage,
	}
}

// =============================================================================
// IPC Handlers — thin dispatcher using handler registry
// =============================================================================
function registerIpcHandlers() {
	const handlers = getAllHandlers()

	ipcMain.handle("harness:command", async (_event, command) => {
		const handler = handlers[command.type]
		if (!handler) {
			console.warn("Unknown IPC command:", command.type)
			return null
		}
		return handler(command, {
			getActiveSession,
			mainWindow,
			sessions,
			activeSessionPath,
			setActiveSessionPath: (p: string) => {
				activeSessionPath = p
			},
			sessionTimings,
			cleanupSession,
			bridgeAllEvents,
			createHarness,
			ensureAuthenticatedModel,
			generateThreadTitle,
			deleteThread,
		})
	})
}

// =============================================================================
// Bridge Harness events to renderer (all sessions, tagged with worktreePath)
// =============================================================================
function bridgeAllEvents(window: BrowserWindow) {
	for (const [sessionPath, session] of sessions) {
		if (session.unsubscribe) {
			session.unsubscribe()
			session.unsubscribe = null
		}
		session.unsubscribe = session.harness.subscribe((event) => {
			if (window.isDestroyed()) return

			const serialized = { ...event } as Record<string, unknown>
			if (event.type === "error" && event.error instanceof Error) {
				serialized.error = {
					message: event.error.message,
					name: event.error.name,
					stack: event.error.stack,
				}
			}

			serialized.worktreePath = sessionPath

			// Track agent timing for the Agent Dashboard
			if (event.type === "agent_start") {
				const timing = sessionTimings.get(sessionPath) ?? {
					startedAt: null,
					totalDurationMs: 0,
					currentModelId: null,
				}
				timing.startedAt = Date.now()
				sessionTimings.set(sessionPath, timing)
			} else if (event.type === "agent_end") {
				const timing = sessionTimings.get(sessionPath)
				if (timing?.startedAt) {
					timing.totalDurationMs += Date.now() - timing.startedAt
					timing.startedAt = null
				}
			} else if (event.type === "model_changed") {
				const timing = sessionTimings.get(sessionPath) ?? {
					startedAt: null,
					totalDurationMs: 0,
					currentModelId: null,
				}
				timing.currentModelId = event.modelId as string
				sessionTimings.set(sessionPath, timing)
			}

			// Attach category info to tool approval events for the UI
			if (event.type === "tool_approval_required") {
				const category = getToolCategory(event.toolName)
				serialized.category = category
				serialized.categoryLabel = category
					? TOOL_CATEGORIES[category]?.label
					: null
			}

			// Desktop notifications for key events (only when window not focused)
			if (!window.isFocused()) {
				switch (event.type) {
					case "agent_end": {
						sendDesktopNotification(
							"Agent finished",
							"Your task is complete",
							sessions,
							activeSessionPath,
						)
						// Auto-transition linked Linear issue to "done" state
						;(async () => {
							try {
								const sessionState = session.harness.getState()
								const linkedIssueId = sessionState?.linkedLinearIssueId ?? ""
								const doneStateId = sessionState?.linkedLinearDoneStateId ?? ""
								const apiKey = sessionState?.linearApiKey ?? ""
								if (linkedIssueId && doneStateId && apiKey) {
									await fetch("https://api.linear.app/graphql", {
										method: "POST",
										headers: {
											"Content-Type": "application/json",
											Authorization: apiKey,
										},
										body: JSON.stringify({
											query: `mutation($id: String!, $stateId: String!) {
												issueUpdate(id: $id, input: { stateId: $stateId }) {
													success
												}
											}`,
											variables: { id: linkedIssueId, stateId: doneStateId },
										}),
									})
								}
							} catch (e: any) {
								console.warn("Failed to auto-update Linear issue:", e.message)
							}
						})()
						break
					}
					case "tool_approval_required":
						sendDesktopNotification(
							"Approval needed",
							`Tool: ${event.toolName}`,
							sessions,
							activeSessionPath,
						)
						break
					case "ask_question":
						sendDesktopNotification(
							"Question from agent",
							event.question,
							sessions,
							activeSessionPath,
						)
						break
					case "plan_approval_required":
						sendDesktopNotification(
							"Plan review",
							event.title,
							sessions,
							activeSessionPath,
						)
						break
					case "error":
						sendDesktopNotification(
							"Agent error",
							event.error?.message ?? "An error occurred",
							sessions,
							activeSessionPath,
						)
						break
				}
			}

			window.webContents.send("harness:event", serialized)
		})
	}
}

// =============================================================================
// Session cleanup
// =============================================================================
function cleanupSession(sessionPath: string) {
	const session = sessions.get(sessionPath)
	if (!session) return
	if (session.unsubscribe) session.unsubscribe()
	for (const [, ptySession] of session.ptySessions) {
		ptySession.kill()
	}
	session.ptySessions.clear()
	session.mcpManager.disconnect().catch(() => {})
	sessions.delete(sessionPath)
	sessionTimings.delete(sessionPath)
}

// =============================================================================
// Create Window
// =============================================================================
function createWindow() {
	const iconPath = path.join(__dirname, "../../resources/icon.png")
	const appIcon = nativeImage.createFromPath(iconPath)

	mainWindow = new BrowserWindow({
		width: 1200,
		height: 800,
		minWidth: 900,
		minHeight: 400,
		titleBarStyle: "hiddenInset",
		trafficLightPosition: { x: 12, y: 12 },
		backgroundColor: "#09090b",
		icon: appIcon,
		webPreferences: {
			preload: path.join(__dirname, "../preload/preload.cjs"),
			nodeIntegration: false,
			contextIsolation: true,
			sandbox: false,
		},
	})

	// Update mainWindowRef for helpers
	setMainWindowRef(mainWindow)

	if (process.platform === "darwin" && app.dock) {
		app.dock.setIcon(appIcon)
	}

	// Dock badge count (macOS)
	ipcMain.on("set-badge-count", (_event, count: number) => {
		if (process.platform === "darwin" && app.dock) {
			app.dock.setBadge(count > 0 ? String(count) : "")
		}
	})

	// Prevent links in the renderer from navigating the main window away from the app.
	const rendererOrigin = process.env.ELECTRON_RENDERER_URL || ""
	mainWindow.webContents.on("will-navigate", (event, url) => {
		if (rendererOrigin && url.startsWith(rendererOrigin)) return
		event.preventDefault()
		mainWindow?.webContents.send("open-url", url)
	})

	mainWindow.webContents.setWindowOpenHandler(({ url }) => {
		mainWindow?.webContents.send("open-url", url)
		return { action: "deny" }
	})

	// Dev or production
	if (process.env.ELECTRON_RENDERER_URL) {
		mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
	} else {
		mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"))
	}

	mainWindow.on("closed", () => {
		mainWindow = null
		setMainWindowRef(null)
	})
}

// =============================================================================
// App Menu
// =============================================================================
function setupMenu() {
	const template: Electron.MenuItemConstructorOptions[] = [
		{
			label: app.name,
			submenu: [
				{ role: "about" },
				{ type: "separator" },
				{ role: "services" },
				{ type: "separator" },
				{ role: "hide" },
				{ role: "hideOthers" },
				{ role: "unhide" },
				{ type: "separator" },
				{ role: "quit" },
			],
		},
		{
			label: "File",
			submenu: [
				{
					label: "New Thread",
					accelerator: "CmdOrCtrl+N",
					click: () => {
						mainWindow?.webContents.send("harness:event", {
							type: "shortcut",
							action: "new_thread",
						})
					},
				},
				{
					label: "Open Project...",
					accelerator: "CmdOrCtrl+O",
					click: () => {
						mainWindow?.webContents.send("harness:event", {
							type: "shortcut",
							action: "open_project",
						})
					},
				},
				{ type: "separator" },
				{ role: "close" },
			],
		},
		{
			label: "Edit",
			submenu: [
				{ role: "undo" },
				{ role: "redo" },
				{ type: "separator" },
				{ role: "cut" },
				{ role: "copy" },
				{ role: "paste" },
				{ role: "selectAll" },
			],
		},
		{
			label: "View",
			submenu: [
				{ role: "reload" },
				{ role: "forceReload" },
				{ role: "toggleDevTools" },
				{ type: "separator" },
				{ role: "resetZoom" },
				{ role: "zoomIn" },
				{ role: "zoomOut" },
				{ type: "separator" },
				{ role: "togglefullscreen" },
				{ type: "separator" },
				{
					label: "Toggle Sidebar",
					accelerator: "CmdOrCtrl+B",
					click: () => {
						mainWindow?.webContents.send("harness:event", {
							type: "shortcut",
							action: "toggle_sidebar",
						})
					},
				},
				{
					label: "Toggle Terminal",
					accelerator: "CmdOrCtrl+`",
					click: () => {
						mainWindow?.webContents.send("harness:event", {
							type: "shortcut",
							action: "toggle_terminal",
						})
					},
				},
				{
					label: "Toggle Explorer",
					accelerator: "CmdOrCtrl+Shift+E",
					click: () => {
						mainWindow?.webContents.send("harness:event", {
							type: "shortcut",
							action: "toggle_right_sidebar",
						})
					},
				},
				{
					label: "Git Changes",
					accelerator: "CmdOrCtrl+Shift+G",
					click: () => {
						mainWindow?.webContents.send("harness:event", {
							type: "shortcut",
							action: "focus_git",
						})
					},
				},
			],
		},
		{
			label: "Window",
			submenu: [
				{ role: "minimize" },
				{ role: "zoom" },
				{ type: "separator" },
				{ role: "front" },
			],
		},
	]
	Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// =============================================================================
// App Lifecycle
// =============================================================================
app.whenReady().then(async () => {
	// Determine project path
	const projectPath =
		process.argv.find(
			(a) =>
				!a.startsWith("-") && a !== process.argv[0] && a !== process.argv[1],
		) || process.cwd()
	activeSessionPath = projectPath

	// Create window and menu
	createWindow()
	setupMenu()

	// Create initial session
	const result = await createHarness(projectPath)
	const initialSession: WorktreeSession = {
		harness: result.harness,
		mcpManager: result.mcpManager,
		resolveModel: result.resolveModel,
		authStorage: result.authStorage,
		projectRoot: projectPath,
		unsubscribe: null,
		ptySessions: new Map(),
	}
	sessions.set(projectPath, initialSession)

	// Register IPC and bridge events
	registerIpcHandlers()
	if (mainWindow) bridgeAllEvents(mainWindow)

	// Initialize harness
	await initialSession.harness.init()
	await ensureAuthenticatedModel(
		initialSession.harness,
		initialSession.authStorage,
	)

	// Load OM progress for the current thread
	await initialSession.harness.loadOMProgress?.().catch(() => {})

	// Init MCP
	if (initialSession.mcpManager.hasServers()) {
		await initialSession.mcpManager.init()
	}

	// Redirect console noise to log file
	const logFile = path.join(getAppDataDir(), "debug.log")
	const logStream = fs.createWriteStream(logFile, { flags: "a" })
	const fmt = (a: unknown): string => {
		if (typeof a === "string") return a
		if (a instanceof Error) return `${a.name}: ${a.message}`
		try {
			return JSON.stringify(a)
		} catch {
			return String(a)
		}
	}
	console.error = (...args: unknown[]) => {
		logStream.write(
			`[ERROR] ${new Date().toISOString()} ${args.map(fmt).join(" ")}\n`,
		)
	}
	console.warn = (...args: unknown[]) => {
		logStream.write(
			`[WARN] ${new Date().toISOString()} ${args.map(fmt).join(" ")}\n`,
		)
	}

	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow()
	})
})

app.on("window-all-closed", async () => {
	for (const sessionPath of [...sessions.keys()]) {
		cleanupSession(sessionPath)
	}
	app.quit()
})

// =============================================================================
// UPSTREAM TRACKING NOTES
// =============================================================================
// The following features exist in this codebase but are NOT part of the published
// @mastra/core Harness API. They should be proposed upstream:
//
// 1. Harness.deleteThread(threadId) — Delete a thread and clear if current.
//    Currently mocked above (switches away but doesn't delete from storage).
//
// 2. HarnessConfig.hookManager — Lifecycle hooks for tool use, message send,
//    stop, and session events. Currently managed externally.
//
// 3. HarnessConfig.mcpManager — MCP server management. Currently managed externally.
//
// 4. HarnessConfig.getToolsets — Dynamic toolset injection at stream time
//    (e.g., Anthropic web search). Currently not wired through harness.
// =============================================================================
