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

import { createMastraCode, type MastraCodeConfig } from "mastracode"

import {
	createNavigateBrowserTool,
	createComputerUseTool,
} from "../tools/index.js"
import { executeSubagent } from "../agents/subagents/execute.js"
import { exploreSubagent } from "../agents/subagents/explore.js"
import { planSubagent } from "../agents/subagents/plan.js"
import { getAppDataDir } from "../utils/project.js"
import {
	getToolCategory,
	TOOL_CATEGORIES,
	YOLO_POLICIES,
} from "../permissions.js"
import type { ToolCategory } from "../permissions.js"

import { PlaywrightBrowserManager } from "../browser/playwright-manager.js"
import {
	createSharedAuthStorage,
	migrateUiAuthToMastracodeRuntimeAuth,
} from "./auth-storage.js"

// Extracted modules
import { ElectronStateManager } from "./electron-state.js"
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
let initialSessionReady: Promise<void> | null = null
let ipcHandlersRegistered = false

const defaultSubagents = [
	exploreSubagent,
	planSubagent,
	executeSubagent,
] satisfies NonNullable<MastraCodeConfig["subagents"]>

function getActiveSession(): WorktreeSession {
	const session = sessions.get(activeSessionPath)
	if (!session) {
		throw new Error(`Session not initialized for ${activeSessionPath}`)
	}
	return session
}

// Per-session agent timing and token tracking for the Agent Dashboard
const sessionTimings = new Map<string, AgentTiming>()

// =============================================================================
// Helpers
// =============================================================================

// =============================================================================
// Create Harness via createMastraCode
// =============================================================================
async function createHarness(projectPath: string) {
	const browserManager = new PlaywrightBrowserManager()
	const navigateBrowserTool = createNavigateBrowserTool(browserManager)
	const computerUseTool = createComputerUseTool(browserManager)

	// `mastracode` owns resolveModel() and reads OAuth credentials from its own
	// app-data auth.json. Migrate before creating it so startup env loading sees
	// credentials that were previously written by the Electron dev app.
	migrateUiAuthToMastracodeRuntimeAuth()

	const { harness, mcpManager, hookManager, resolveModel, storageWarning } =
		await createMastraCode({
			cwd: projectPath,
			subagents: defaultSubagents,
			extraTools: {
				"navigate-browser": navigateBrowserTool,
				computer: computerUseTool,
			} as unknown as MastraCodeConfig["extraTools"],
		})

	if (!mcpManager) {
		throw new Error("MCP manager was not initialized")
	}

	if (storageWarning) {
		console.warn("[storage]", storageWarning)
	}

	// Use our local AuthStorage class for Electron-only helpers, but point it at
	// the installed mastracode runtime auth file so /login and resolveModel()
	// share the same credentials.
	const authStorage = createSharedAuthStorage()
	const electronState = new ElectronStateManager()

	// Hook manager session tracking + OM progress loading
	harness.subscribe((event: any) => {
		if (event.type === "thread_changed") {
			// Close browser when switching threads — browser state is conversation-specific
			browserManager.close().catch(() => {})
			hookManager?.setSessionId(event.threadId)
			harness.loadOMProgress?.().catch(() => {})
		} else if (event.type === "thread_created") {
			hookManager?.setSessionId(event.thread.id)
			harness.loadOMProgress?.().catch(() => {})
		} else if (event.type === "agent_end") {
			harness.loadOMProgress?.().catch(() => {})
		}
	})

	// Default to YOLO mode
	await harness.setState({ yolo: true })
	for (const [category, policy] of Object.entries(YOLO_POLICIES)) {
		harness.setPermissionForCategory({
			category: category as ToolCategory,
			policy,
		})
	}

	return {
		harness,
		mcpManager,
		browserManager,
		resolveModel,
		authStorage,
		electronState,
	}
}

// =============================================================================
// IPC Handlers — thin dispatcher using handler registry
// =============================================================================
function registerIpcHandlers() {
	if (ipcHandlersRegistered) return
	ipcHandlersRegistered = true
	const handlers = getAllHandlers()

	ipcMain.handle("harness:command", async (_event, command) => {
		if (!sessions.has(activeSessionPath) && initialSessionReady) {
			await initialSessionReady
		}

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
								const eState = session.electronState.getState()
								const linkedIssueId = eState.linkedLinearIssueId
								const doneStateId = eState.linkedLinearDoneStateId
								const apiKey = eState.linearApiKey
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
	session.mcpManager?.disconnect().catch(() => {})
	session.browserManager?.close().catch(() => {})
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

	// Register IPC before loading the renderer. The renderer calls
	// harness:command on mount, while session creation can take time after
	// dependency upgrades.
	registerIpcHandlers()

	initialSessionReady = (async () => {
		// Create initial session
		const result = await createHarness(projectPath)
		const initialSession: WorktreeSession = {
			harness: result.harness,
			mcpManager: result.mcpManager,
			browserManager: result.browserManager,
			resolveModel: result.resolveModel,
			authStorage: result.authStorage,
			electronState: result.electronState,
			projectRoot: projectPath,
			unsubscribe: null,
			ptySessions: new Map(),
		}
		sessions.set(projectPath, initialSession)

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
		if (initialSession.mcpManager?.hasServers()) {
			await initialSession.mcpManager.init()
		}
	})()

	// Create window and menu after the IPC handler exists.
	createWindow()
	setupMenu()
	await initialSessionReady

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
