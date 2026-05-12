import type { BrowserWindow } from "electron"
import type * as pty from "node-pty"
import type { createMastraCode } from "mastracode"
import type { AuthStorage } from "../../auth/storage.js"
import type { ElectronStateManager } from "../electron-state.js"
import type { PlaywrightBrowserManager } from "../../browser/playwright-manager.js"

export type MastraCodeRuntime = Awaited<ReturnType<typeof createMastraCode>>
export type MastraCodeHarness = MastraCodeRuntime["harness"]
export type MastraCodeMcpManager = NonNullable<MastraCodeRuntime["mcpManager"]>
export type MastraCodeResolveModel = MastraCodeRuntime["resolveModel"]

export interface HarnessRuntime {
	harness: MastraCodeHarness
	mcpManager: MastraCodeMcpManager
	browserManager: PlaywrightBrowserManager
	resolveModel: MastraCodeResolveModel
	authStorage: AuthStorage
	electronState: ElectronStateManager
}

export interface WorktreeSession {
	harness: MastraCodeHarness
	mcpManager: MastraCodeMcpManager
	browserManager: PlaywrightBrowserManager
	resolveModel: MastraCodeResolveModel
	authStorage: AuthStorage
	electronState: ElectronStateManager
	projectRoot: string
	unsubscribe: (() => void) | null
	ptySessions: Map<string, pty.IPty>
}

export interface AgentTiming {
	startedAt: number | null
	totalDurationMs: number
	currentModelId: string | null
}

export type IpcCommand = Readonly<{ type: string } & Record<string, unknown>>

export type IpcCommandHandler = (
	command: IpcCommand,
	ctx: HandlerContext,
) => Promise<unknown>

export type DeleteThreadResult = {
	deletedThreadId: string
	currentThreadId: string | null
}

export interface HandlerContext {
	getActiveSession: () => WorktreeSession
	mainWindow: BrowserWindow | null
	sessions: Map<string, WorktreeSession>
	activeSessionPath: string
	setActiveSessionPath: (path: string) => void
	sessionTimings: Map<string, AgentTiming>
	cleanupSession: (path: string) => void
	bridgeAllEvents: (window: BrowserWindow) => void
	createHarness: (path: string) => Promise<HarnessRuntime>
	ensureAuthenticatedModel: (
		h: MastraCodeHarness,
		authStorage: AuthStorage,
	) => Promise<void>
	generateThreadTitle: (
		h: MastraCodeHarness,
		userMessage: string,
		resolveModel: MastraCodeResolveModel,
	) => Promise<void>
	deleteThread: (
		h: MastraCodeHarness,
		threadId: string,
	) => Promise<DeleteThreadResult>
}
