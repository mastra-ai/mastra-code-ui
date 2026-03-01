import type { BrowserWindow } from "electron"
import type * as pty from "node-pty"
import type { Harness } from "@mastra/core/harness"
import type { AuthStorage } from "../../auth/storage.js"
import type { MCPManager } from "../../mcp/index.js"

export interface WorktreeSession {
	harness: Harness<any>
	mcpManager: MCPManager
	resolveModel: (modelId: string) => any
	authStorage: AuthStorage
	projectRoot: string
	unsubscribe: (() => void) | null
	ptySessions: Map<string, pty.IPty>
}

export interface AgentTiming {
	startedAt: number | null
	totalDurationMs: number
	currentModelId: string | null
}

export type IpcCommandHandler = (
	command: any,
	ctx: HandlerContext,
) => Promise<any>

export interface HandlerContext {
	getActiveSession: () => WorktreeSession
	mainWindow: BrowserWindow | null
	sessions: Map<string, WorktreeSession>
	activeSessionPath: string
	setActiveSessionPath: (path: string) => void
	sessionTimings: Map<string, AgentTiming>
	cleanupSession: (path: string) => void
	bridgeAllEvents: (window: BrowserWindow) => void
	createHarness: (path: string) => Promise<{
		harness: Harness<any>
		mcpManager: MCPManager
		resolveModel: (modelId: string) => any
		authStorage: AuthStorage
	}>
	ensureAuthenticatedModel: (
		h: Harness<any>,
		authStorage: AuthStorage,
	) => Promise<void>
	generateThreadTitle: (
		h: Harness<any>,
		userMessage: string,
		resolveModel: (modelId: string) => any,
	) => Promise<void>
	deleteThread: (h: Harness<any>, threadId: string) => Promise<void>
}
