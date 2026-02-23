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
import {
	Workspace,
	LocalFilesystem,
	LocalSandbox,
} from "@mastra/core/workspace"
import { LibSQLStore } from "@mastra/libsql"
import { Memory } from "@mastra/memory"
import { z } from "zod"
import { generateText } from "ai"
import { createAnthropic } from "@ai-sdk/anthropic"

import { Harness } from "@mastra/core/harness"
import type { HarnessRequestContext } from "@mastra/core/harness"
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
	todoWriteTool,
	todoCheckTool,
	askUserTool,
	submitPlanTool,
	requestSandboxAccessTool,
} from "../tools/index.js"
import { buildFullPrompt, type PromptContext } from "../prompts/index.js"

// =============================================================================
// Resolve __dirname for ESM
// =============================================================================
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// =============================================================================
// App state
// =============================================================================
let mainWindow: BrowserWindow | null = null

// Session map for worktree isolation — each worktree gets its own harness
interface WorktreeSession {
	harness: Harness<any>
	mcpManager: MCPManager
	resolveModel: (modelId: string) => any
	authStorage: AuthStorage
	projectRoot: string
	unsubscribe: (() => void) | null
	ptySessions: Map<string, pty.IPty>
}

const sessions = new Map<string, WorktreeSession>()
let activeSessionPath: string = process.cwd()

function getActiveSession(): WorktreeSession {
	return sessions.get(activeSessionPath)!
}

// Cached editor for "open in editor" feature
let detectedEditor: { cmd: string; gotoFlag: string } | null | undefined =
	undefined

// =============================================================================
// Desktop Notification Helper
// =============================================================================
function sendDesktopNotification(title: string, body: string) {
	const session = sessions.get(activeSessionPath)
	if (!session) return
	try {
		const state = session.harness.getState()
		const pref = (state as any)?.notifications ?? "off"
		if (pref === "system" || pref === "both") {
			new Notification({ title, body }).show()
		}
	} catch {
		// Non-critical
	}
}

// =============================================================================
// Editor Detection Helper
// =============================================================================
function detectEditor(): { cmd: string; gotoFlag: string } | null {
	if (detectedEditor !== undefined) return detectedEditor
	const { execSync } =
		require("child_process") as typeof import("child_process")
	const editors = [
		{ cmd: "cursor", gotoFlag: "--goto" },
		{ cmd: "code", gotoFlag: "--goto" },
		{ cmd: "subl", gotoFlag: "" },
	]
	for (const editor of editors) {
		try {
			execSync(`which ${editor.cmd}`, { stdio: "pipe" })
			detectedEditor = editor
			return editor
		} catch {
			// Not found
		}
	}
	detectedEditor = null
	return null
}

// =============================================================================
// Gateway Sync
// =============================================================================
startGatewaySync(5 * 60 * 1000)

// =============================================================================
// Recent Projects
// =============================================================================
function getRecentProjectsPath(): string {
	return path.join(getAppDataDir(), "recent-projects.json")
}

function loadRecentProjects(): Array<{
	name: string
	rootPath: string
	lastOpened: string
}> {
	try {
		const data = fs.readFileSync(getRecentProjectsPath(), "utf-8")
		return JSON.parse(data)
	} catch {
		return []
	}
}

function saveRecentProject(projectPath: string, name: string) {
	const projects = loadRecentProjects().filter(
		(p) => p.rootPath !== projectPath,
	)
	projects.unshift({
		name,
		rootPath: projectPath,
		lastOpened: new Date().toISOString(),
	})
	if (projects.length > 10) projects.length = 10
	const dir = path.dirname(getRecentProjectsPath())
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
	fs.writeFileSync(getRecentProjectsPath(), JSON.stringify(projects, null, 2))
}

function removeRecentProject(projectPath: string) {
	const projects = loadRecentProjects().filter(
		(p) => p.rootPath !== projectPath,
	)
	fs.writeFileSync(getRecentProjectsPath(), JSON.stringify(projects, null, 2))
}

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
		notifications: z.enum(["bell", "system", "both", "off"]).default("off"),
		todos: z
			.array(
				z.object({
					content: z.string(),
					status: z.enum(["pending", "in_progress", "completed"]),
					activeForm: z.string(),
				}),
			)
			.default([]),
		sandboxAllowedPaths: z.array(z.string()).default([]),
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
			return opencodeClaudeMaxProvider(modelId.substring("anthropic/".length))
		} else if (isOpenAIModel && authStorage.isLoggedIn("openai-codex")) {
			return openaiCodexProvider(modelId.substring("openai/".length))
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
			todo_write: todoWriteTool,
			todo_check: todoCheckTool,
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
				todo_write: todoWriteTool,
				todo_check: todoCheckTool,
				ask_user: askUserTool,
				request_sandbox_access: requestSandboxAccessTool,
			}

			if (modeId !== "plan") {
				tools.string_replace_lsp = stringReplaceLspTool
				tools.ast_smart_edit = astSmartEditTool
				tools.write_file = writeFileTool
			}

			if (modeId === "plan") {
				tools.submit_plan = submitPlanTool
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
		resolveModel: resolveModel as any,
		workspace,
		// NOTE: hookManager, mcpManager, getToolsets, and authStorage are managed
		// externally — the published Harness does not support these in config.
		// See upstream tracking notes at bottom of file.
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
	})

	// Sync OM state
	_harness.subscribe((event) => {
		if (event.type === "om_model_changed") {
			const e = event as { type: string; role: string; modelId: string }
			if (e.role === "observer") omState.observerModelId = e.modelId
			if (e.role === "reflector") omState.reflectorModelId = e.modelId
		} else if (event.type === "thread_changed") {
			omState.observerModelId =
				_harness.getObserverModelId() ?? DEFAULT_OM_MODEL_ID
			omState.reflectorModelId =
				_harness.getReflectorModelId() ?? DEFAULT_OM_MODEL_ID
			omState.obsThreshold =
				_harness.getState().observationThreshold ?? DEFAULT_OBS_THRESHOLD
			omState.refThreshold =
				_harness.getState().reflectionThreshold ?? DEFAULT_REF_THRESHOLD
			hookManager.setSessionId((event as any).threadId)
		} else if (event.type === "thread_created") {
			hookManager.setSessionId((event as any).thread.id)
		}
	})

	return {
		harness: _harness,
		mcpManager: _mcpManager,
		resolveModel,
		authStorage,
	}
}

// =============================================================================
// Title Generation
// =============================================================================
async function generateThreadTitle(
	h: Harness<any>,
	userMessage: string,
	resolveModel: (modelId: string) => any,
) {
	try {
		const modelId = h.getCurrentModelId()
		if (!modelId) return
		const model = resolveModel(modelId)
		const result = await generateText({
			model: model as any,
			prompt: `Generate a very short title (5-8 words max) for a conversation that starts with this message. Return ONLY the title, no quotes or extra punctuation:\n\n${userMessage.slice(0, 500)}`,
		})
		const title = result.text?.trim()
		if (title) {
			await h.renameThread(title)
			// Notify renderer so it can refresh the thread list
			mainWindow?.webContents.send("harness:event", {
				type: "thread_title_updated",
				threadId: h.getCurrentThreadId(),
				title,
			})
		}
	} catch {
		// Title generation is non-critical
	}
}

// =============================================================================
// Harness helpers for functionality not yet in published @mastra/core
// =============================================================================

/**
 * TODO [UPSTREAM]: deleteThread is not yet part of the published Harness API.
 * This mock implementation calls storage directly.
 * Propose adding Harness.deleteThread(threadId) to @mastra/core.
 */
async function deleteThread(h: Harness<any>, threadId: string): Promise<void> {
	// Access storage via getSession to verify thread exists, then delete via
	// the storage layer directly. The Harness doesn't expose storage publicly,
	// so we use a workaround: switch away from the thread if it's current,
	// then the thread will no longer be referenced.
	const currentThreadId = h.getCurrentThreadId()
	if (currentThreadId === threadId) {
		// Create a new thread so we're not on the deleted one
		await h.createThread("New Thread")
	}
	// NOTE: Actual storage deletion requires upstream Harness.deleteThread().
	// For now we just ensure the UI moves away from the deleted thread.
	// The thread data remains in storage until upstream support is added.
}

// =============================================================================
// IPC Handlers
// =============================================================================
function registerIpcHandlers() {
	ipcMain.handle("harness:command", async (_event, command) => {
		const s = getActiveSession()
		const h = s.harness
		const resolveModel = s.resolveModel
		const authStorage = s.authStorage
		const projectRoot = s.projectRoot

		switch (command.type) {
			case "sendMessage": {
				const threadBefore = h.getCurrentThreadId()
				await h.sendMessage(
					command.content,
					command.images ? { images: command.images } : undefined,
				)
				// Auto-generate title for new threads (Mastra core skips this
				// because the harness pre-creates threads before streaming)
				const threadAfter = h.getCurrentThreadId()
				if (threadAfter && threadAfter !== threadBefore) {
					generateThreadTitle(h, command.content, resolveModel).catch(() => {})
				}
				return
			}
			case "abort":
				h.abort()
				return
			case "steer":
				await h.steer(command.content)
				return
			case "followUp":
				await h.followUp(command.content)
				return
			case "switchMode":
				await h.switchMode(command.modeId)
				return
			case "switchModel":
				await h.switchModel(command.modelId, command.scope, command.modeId)
				return
			case "switchThread":
				await h.switchThread(command.threadId)
				return
			case "createThread":
				return await h.createThread(command.title)
			case "renameThread":
				await h.renameThread(command.title)
				return
			case "deleteThread":
				// TODO [UPSTREAM]: Harness.deleteThread() not yet in published @mastra/core.
				// Mocked here by calling storage directly. Propose upstream addition.
				await deleteThread(h, command.threadId)
				return
			case "approveToolCall":
				h.resolveToolApprovalDecision("approve")
				return
			case "declineToolCall":
				h.resolveToolApprovalDecision("decline")
				return
			case "respondToQuestion":
				h.respondToQuestion(command.questionId, command.answer)
				return
			case "respondToPlanApproval":
				await h.respondToPlanApproval(command.planId, command.response)
				return
			case "setYoloMode":
				await h.setState({ yolo: command.enabled })
				return
			case "setThinkingLevel":
				await h.setState({ thinkingLevel: command.level })
				return
			case "getAvailableModels":
				return await h.getAvailableModels()
			case "getSlashCommands": {
				const { loadCustomCommands } =
					await import("../utils/slash-command-loader.js")
				return await loadCustomCommands(projectRoot)
			}
			case "processSlashCommand": {
				const { loadCustomCommands } =
					await import("../utils/slash-command-loader.js")
				const { processSlashCommand } =
					await import("../utils/slash-command-processor.js")
				const commands = await loadCustomCommands(projectRoot)
				const cmd = commands.find(
					(c: { name: string }) => c.name === command.commandName,
				)
				if (!cmd) throw new Error(`Unknown command: /${command.commandName}`)
				return await processSlashCommand(cmd, command.args ?? [], projectRoot)
			}
			case "getMessages":
				return await h.getMessages({ limit: command.limit })
			case "getModes":
				return h.getModes().map((m) => ({
					id: m.id,
					name: m.name,
					color: m.color,
				}))
			case "getState":
				return h.getState()
			case "getSession":
				return await h.getSession()
			case "listThreads":
				return await h.listThreads()
			case "getTokenUsage":
				return h.getTokenUsage()
			case "login": {
				// Auth is managed externally via AuthStorage, not on the Harness.
				const loginAbort = new AbortController()

				let pendingPromptResolve: ((value: string) => void) | null = null
				let pendingPromptReject: ((reason: Error) => void) | null = null

				const promptHandler = (
					_ev: Electron.IpcMainEvent,
					response: { answer: string } | { cancelled: true },
				) => {
					if ("cancelled" in response) {
						pendingPromptReject?.(new Error("Login cancelled"))
					} else {
						pendingPromptResolve?.(response.answer)
					}
					pendingPromptResolve = null
					pendingPromptReject = null
				}
				ipcMain.on("login:prompt-response", promptHandler)

				try {
					await authStorage.login(command.providerId, {
						onAuth: (info: any) => {
							shell.openExternal(info.url)
							mainWindow?.webContents.send("harness:event", {
								type: "login_auth",
								providerId: command.providerId,
								url: info.url,
								instructions: info.instructions,
							})
						},
						onPrompt: (prompt: any) => {
							return new Promise<string>((resolve, reject) => {
								pendingPromptResolve = resolve
								pendingPromptReject = reject
								mainWindow?.webContents.send("harness:event", {
									type: "login_prompt",
									providerId: command.providerId,
									message: prompt.message,
									placeholder: prompt.placeholder,
								})
							})
						},
						onProgress: (message: string) => {
							mainWindow?.webContents.send("harness:event", {
								type: "login_progress",
								providerId: command.providerId,
								message,
							})
						},
						onManualCodeInput: () => {
							return new Promise<string>((resolve, reject) => {
								pendingPromptResolve = resolve
								pendingPromptReject = reject
								mainWindow?.webContents.send("harness:event", {
									type: "login_prompt",
									providerId: command.providerId,
									message: "Paste the authorization code here:",
									placeholder: "Authorization code",
								})
							})
						},
						signal: loginAbort.signal,
					})

					const defaultModel = authStorage.getDefaultModelForProvider(
						command.providerId,
					)
					if (defaultModel) {
						await h.switchModel(defaultModel)
					}
					mainWindow?.webContents.send("harness:event", {
						type: "login_success",
						providerId: command.providerId,
						modelId: h.getFullModelId(),
					})
				} catch (err: any) {
					mainWindow?.webContents.send("harness:event", {
						type: "login_error",
						providerId: command.providerId,
						error: err?.message ?? String(err),
					})
				} finally {
					ipcMain.removeListener("login:prompt-response", promptHandler)
				}
				return
			}
			case "getLoggedInProviders":
				return authStorage
					.list()
					.filter((p: string) => authStorage.isLoggedIn(p))
			case "openExternal":
				shell.openExternal(command.url as string)
				return
			case "openInEditor": {
				const filePath = path.resolve(projectRoot, command.filePath as string)
				const line = (command.line as number) ?? 1
				const editor = detectEditor()
				if (editor) {
					const { execSync: exec } =
						require("child_process") as typeof import("child_process")
					try {
						if (editor.gotoFlag) {
							// cursor/code style: --goto file:line
							exec(`"${editor.cmd}" ${editor.gotoFlag} "${filePath}:${line}"`, {
								stdio: "pipe",
							})
						} else {
							// subl style: file:line
							exec(`"${editor.cmd}" "${filePath}:${line}"`, { stdio: "pipe" })
						}
					} catch {
						shell.openPath(filePath)
					}
				} else {
					shell.openPath(filePath)
				}
				return
			}
			case "logout":
				authStorage.logout(command.providerId)
				return
			case "isRunning":
				return h.isRunning()
			case "getCurrentModeId":
				return h.getCurrentModeId()
			case "getFullModelId":
				return h.getFullModelId()

			// =================================================================
			// File System
			// =================================================================
			case "listDirectory": {
				const dirPath = path.resolve(
					projectRoot,
					(command.path as string) || ".",
				)
				const entries = fs.readdirSync(dirPath, { withFileTypes: true })
				return entries
					.filter((e) => !e.name.startsWith("."))
					.map((e) => ({
						name: e.name,
						path: path.join((command.path as string) || ".", e.name),
						isDirectory: e.isDirectory(),
						isSymlink: e.isSymbolicLink(),
					}))
					.sort((a, b) => {
						if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
						return a.name.localeCompare(b.name)
					})
			}

			// =================================================================
			// Git
			// =================================================================
			case "gitStatus": {
				const { execSync } = require("child_process")
				try {
					const status = execSync("git status --porcelain=v1 -uall", {
						cwd: projectRoot,
						encoding: "utf-8",
						maxBuffer: 5 * 1024 * 1024,
					}) as string
					const branch = (
						execSync("git rev-parse --abbrev-ref HEAD", {
							cwd: projectRoot,
							encoding: "utf-8",
						}) as string
					).trim()
					const files = status
						.split("\n")
						.filter(Boolean)
						.map((line: string) => ({
							status: line.substring(0, 2),
							path: line.substring(3),
							staged: line[0] !== " " && line[0] !== "?",
							unstaged: line[1] !== " ",
							untracked: line.startsWith("??"),
						}))
					return { branch, files, clean: files.length === 0 }
				} catch {
					return {
						branch: null,
						files: [],
						clean: true,
						error: "Not a git repo",
					}
				}
			}
			case "gitDiff": {
				const { execSync } = require("child_process")
				const args = command.staged ? ["diff", "--cached"] : ["diff"]
				if (command.file) args.push("--", command.file as string)
				try {
					const diff = execSync(`git ${args.join(" ")}`, {
						cwd: projectRoot,
						encoding: "utf-8",
						maxBuffer: 5 * 1024 * 1024,
					}) as string
					return { diff }
				} catch {
					return { diff: "" }
				}
			}

			// =================================================================
			// PTY Terminal
			// =================================================================
			case "ptyCreate": {
				const shellPath = process.env.SHELL || "/bin/zsh"
				const sessionId = `pty-${Date.now()}-${Math.random().toString(36).slice(2)}`
				let ptyProcess: pty.IPty
				try {
					ptyProcess = pty.spawn(shellPath, [], {
						name: "xterm-256color",
						cols: (command.cols as number) || 80,
						rows: (command.rows as number) || 24,
						cwd: (command.cwd as string) || projectRoot,
						env: { ...process.env, TERM: "xterm-256color" } as Record<
							string,
							string
						>,
					})
				} catch (err) {
					throw err
				}
				s.ptySessions.set(sessionId, ptyProcess)
				ptyProcess.onData((data: string) => {
					mainWindow?.webContents.send("harness:event", {
						type: "pty_output",
						sessionId,
						data,
					})
				})
				ptyProcess.onExit(
					({ exitCode, signal }: { exitCode: number; signal?: number }) => {
						mainWindow?.webContents.send("harness:event", {
							type: "pty_exit",
							sessionId,
							exitCode,
							signal,
						})
						s.ptySessions.delete(sessionId)
					},
				)
				return { sessionId }
			}
			case "ptyWrite": {
				const ptySession = s.ptySessions.get(command.sessionId as string)
				if (ptySession) ptySession.write(command.data as string)
				return
			}
			case "ptyResize": {
				const ptySession = s.ptySessions.get(command.sessionId as string)
				if (ptySession)
					ptySession.resize(command.cols as number, command.rows as number)
				return
			}
			case "ptyDestroy": {
				const ptySession = s.ptySessions.get(command.sessionId as string)
				if (ptySession) {
					ptySession.kill()
					s.ptySessions.delete(command.sessionId as string)
				}
				return
			}

			// =================================================================
			// Project Management
			// =================================================================
			case "getProjectInfo": {
				const project = detectProject(projectRoot)
				return {
					name: project.name,
					rootPath: project.rootPath,
					gitBranch: project.gitBranch,
					isWorktree: project.isWorktree,
				}
			}
			case "getRecentProjects": {
				const { execSync } = require("child_process")
				const projects = loadRecentProjects()
				return projects.map((p) => {
					let gitBranch: string | undefined
					let isWorktree = false
					let mainRepoPath: string | undefined
					const worktrees: Array<{ path: string; branch: string }> = []
					try {
						const info = detectProject(p.rootPath)
						gitBranch = info.gitBranch
						isWorktree = info.isWorktree
						mainRepoPath = info.mainRepoPath
						const repoPath = info.mainRepoPath || p.rootPath
						const output = execSync("git worktree list --porcelain", {
							cwd: repoPath,
							encoding: "utf-8",
							stdio: ["pipe", "pipe", "pipe"],
						}) as string
						const blocks = output.split("\n\n").filter(Boolean)
						for (const block of blocks) {
							const lines = block.split("\n")
							const wt: Record<string, string | boolean> = {}
							for (const line of lines) {
								if (line.startsWith("worktree ")) wt.path = line.slice(9)
								else if (line.startsWith("branch "))
									wt.branch = (line.slice(7) as string).replace(
										"refs/heads/",
										"",
									)
								else if (line === "bare") wt.isBare = true
							}
							if (wt.path && !wt.isBare && wt.path !== repoPath) {
								worktrees.push({
									path: wt.path as string,
									branch: (wt.branch as string) || "detached",
								})
							}
						}
					} catch {
						// not a git repo or worktree detection failed
					}
					return { ...p, gitBranch, isWorktree, mainRepoPath, worktrees }
				})
			}
			case "removeRecentProject": {
				removeRecentProject(command.path as string)
				return { success: true }
			}
			case "createWorktree": {
				const { execSync } = require("child_process")
				const repoPath = command.repoPath as string

				// Get existing worktree branch names to avoid collisions
				const usedNames = new Set<string>()
				try {
					const output = execSync("git worktree list --porcelain", {
						cwd: repoPath,
						encoding: "utf-8",
						stdio: ["pipe", "pipe", "pipe"],
					}) as string
					for (const block of output.split("\n\n").filter(Boolean)) {
						for (const line of block.split("\n")) {
							if (line.startsWith("branch ")) {
								usedNames.add(line.slice(7).replace("refs/heads/", ""))
							}
						}
					}
				} catch {
					// not a git repo
					return { success: false, error: "Not a git repository" }
				}

				// Pick a random flower name not already in use
				const flowerNames = [
					"acacia",
					"aconite",
					"agapanthus",
					"alchemilla",
					"allium",
					"aloe",
					"alstroemeria",
					"amaranth",
					"amaryllis",
					"anemone",
					"angelica",
					"anise",
					"anthurium",
					"aster",
					"astilbe",
					"azalea",
					"banksia",
					"begonia",
					"bellflower",
					"bergamot",
					"bluebell",
					"bougainvillea",
					"buttercup",
					"calendula",
					"camellia",
					"campanula",
					"candytuft",
					"carnation",
					"celosia",
					"chamomile",
					"chrysanthemum",
					"clematis",
					"clover",
					"columbine",
					"coneflower",
					"coral",
					"coreopsis",
					"cornflower",
					"cosmos",
					"crocus",
					"cyclamen",
					"daffodil",
					"dahlia",
					"daisy",
					"dandelion",
					"daphne",
					"delphinium",
					"dianthus",
					"echinacea",
					"edelweiss",
					"elderflower",
					"eucalyptus",
					"evening",
					"fennel",
					"fern",
					"feverfew",
					"flax",
					"forget",
					"forsythia",
					"foxglove",
					"freesia",
					"fuchsia",
					"gardenia",
					"gentian",
					"geranium",
					"gerbera",
					"gladiolus",
					"goldenrod",
					"hawthorne",
					"heather",
					"hellebore",
					"hemlock",
					"hibiscus",
					"holly",
					"hollyhock",
					"honeysuckle",
					"hyacinth",
					"hydrangea",
					"hyssop",
					"impatiens",
					"iris",
					"ivy",
					"jasmine",
					"juniper",
					"kalmia",
					"lantana",
					"larkspur",
					"laurel",
					"lavender",
					"lilac",
					"lily",
					"linden",
					"lobelia",
					"lotus",
					"lupin",
					"magnolia",
					"mallow",
					"marigold",
					"meadow",
					"mint",
					"moonflower",
					"myrtle",
					"narcissus",
					"nasturtium",
					"nettle",
					"nightshade",
					"oleander",
					"orchid",
					"oregano",
					"osmanthus",
					"pansy",
					"passionflower",
					"peony",
					"periwinkle",
					"petunia",
					"phlox",
					"plumeria",
					"poppy",
					"primrose",
					"protea",
					"ranunculus",
					"rhododendron",
					"rose",
					"rosemary",
					"rudbeckia",
					"rue",
					"saffron",
					"sage",
					"sakura",
					"salvia",
					"snapdragon",
					"snowdrop",
					"sorrel",
					"stargazer",
					"statice",
					"stephanotis",
					"stock",
					"sunflower",
					"sweetpea",
					"tansy",
					"thistle",
					"thyme",
					"trillium",
					"tuberose",
					"tulip",
					"valerian",
					"verbena",
					"veronica",
					"viburnum",
					"viola",
					"violet",
					"wisteria",
					"yarrow",
					"yucca",
					"zinnia",
				]
				const available = flowerNames.filter((n) => !usedNames.has(n))
				if (available.length === 0) {
					return { success: false, error: "No available workspace names" }
				}
				const branchName =
					available[Math.floor(Math.random() * available.length)]

				// Create worktree under ~/mastra-code/workspaces/<repoName>/<flower>
				const repoName = path.basename(repoPath)
				const workspacesDir = path.join(
					os.homedir(),
					"mastra-code",
					"workspaces",
					repoName,
				)
				const worktreePath = path.join(workspacesDir, branchName)

				try {
					if (!fs.existsSync(workspacesDir)) {
						fs.mkdirSync(workspacesDir, { recursive: true })
					}
					execSync(`git worktree add "${worktreePath}" -b "${branchName}"`, {
						cwd: repoPath,
						encoding: "utf-8",
						stdio: ["pipe", "pipe", "pipe"],
					})
					return { success: true, path: worktreePath, branch: branchName }
				} catch (e: any) {
					const msg =
						e.stderr?.trim() || e.message || "Failed to create worktree"
					return { success: false, error: msg }
				}
			}
			case "readFileContents": {
				const filePath = path.resolve(
					projectRoot,
					(command.path as string) || "",
				)
				if (!filePath.startsWith(projectRoot)) {
					throw new Error("Access denied: path outside project root")
				}
				const stat = fs.statSync(filePath)
				if (stat.isDirectory()) {
					throw new Error("Cannot read a directory as a file")
				}
				if (stat.size > 5 * 1024 * 1024) {
					throw new Error("File too large to display (>5MB)")
				}
				const content = fs.readFileSync(filePath, "utf-8")
				const ext = path.extname(filePath).slice(1)
				return {
					content,
					path: command.path as string,
					fileName: path.basename(filePath),
					extension: ext,
					size: stat.size,
					lineCount: content.split("\n").length,
				}
			}
			case "writeFileContents": {
				const filePath = path.resolve(
					projectRoot,
					(command.path as string) || "",
				)
				if (!filePath.startsWith(projectRoot)) {
					throw new Error("Access denied: path outside project root")
				}
				fs.writeFileSync(filePath, command.content as string, "utf-8")
				return { success: true }
			}
			case "openFolderDialog": {
				const result = await dialog.showOpenDialog(mainWindow!, {
					properties: ["openDirectory"],
					title: "Open Project",
				})
				if (result.canceled || !result.filePaths[0]) return { cancelled: true }
				return { path: result.filePaths[0] }
			}
			case "switchProject": {
				const newPath = command.path as string

				// If we already have a session for this path, just switch to it
				if (sessions.has(newPath)) {
					activeSessionPath = newPath
					if (mainWindow) bridgeAllEvents(mainWindow)
				} else {
					// Create a new session (old session stays alive in background)
					const result2 = await createHarness(newPath)
					const newSession: WorktreeSession = {
						harness: result2.harness,
						mcpManager: result2.mcpManager,
						resolveModel: result2.resolveModel,
						authStorage: result2.authStorage,
						projectRoot: newPath,
						unsubscribe: null,
						ptySessions: new Map(),
					}
					sessions.set(newPath, newSession)
					activeSessionPath = newPath
					if (mainWindow) bridgeAllEvents(mainWindow)
					// Initialize
					await newSession.harness.init()
					if (newSession.mcpManager.hasServers())
						await newSession.mcpManager.init()
				}

				// Save to recent projects
				const project = detectProject(newPath)
				saveRecentProject(newPath, project.name)
				// Notify renderer
				mainWindow?.webContents.send("harness:event", {
					type: "project_changed",
					project: {
						name: project.name,
						rootPath: project.rootPath,
						gitBranch: project.gitBranch,
						isWorktree: project.isWorktree,
					},
				})
				return { project }
			}

			default:
				console.warn("Unknown IPC command:", command.type)
				return null
		}
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

			// Serialize Error objects for IPC (structured clone doesn't handle them)
			const serialized = { ...event } as Record<string, unknown>
			if (event.type === "error" && (event as any).error instanceof Error) {
				const err = (event as any).error
				serialized.error = {
					message: err.message,
					name: err.name,
					stack: err.stack,
				}
			}

			// Tag with worktree path so the renderer can route events
			serialized.worktreePath = sessionPath

			// Desktop notifications for key events (only when window not focused)
			if (!window.isFocused()) {
				switch (event.type) {
					case "agent_end":
						sendDesktopNotification("Agent finished", "Your task is complete")
						break
					case "tool_approval_required":
						sendDesktopNotification(
							"Approval needed",
							`Tool: ${(event as any).toolName}`,
						)
						break
					case "ask_question":
						sendDesktopNotification(
							"Question from agent",
							String((event as any).question ?? ""),
						)
						break
					case "plan_approval_required":
						sendDesktopNotification(
							"Plan review",
							String((event as any).title ?? ""),
						)
						break
					case "error":
						sendDesktopNotification(
							"Agent error",
							String((serialized.error as any)?.message ?? "An error occurred"),
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

	if (process.platform === "darwin" && app.dock) {
		app.dock.setIcon(appIcon)
	}

	// Dock badge count (macOS)
	ipcMain.on("set-badge-count", (_event, count: number) => {
		if (process.platform === "darwin" && app.dock) {
			app.dock.setBadge(count > 0 ? String(count) : "")
		}
	})

	// Dev or production
	if (process.env.ELECTRON_RENDERER_URL) {
		mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
	} else {
		mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"))
	}

	mainWindow.on("closed", () => {
		mainWindow = null
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
	// Clean up all worktree sessions
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
