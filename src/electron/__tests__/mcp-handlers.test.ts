import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { dirname, join } from "path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { getMcpHandlers } from "../ipc/mcp-handlers.js"
import type { HandlerContext, WorktreeSession } from "../ipc/types.js"

type McpManagerStub = WorktreeSession["mcpManager"]

const tempDirs: string[] = []

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true })
	}
})

function makeTempDir() {
	const dir = mkdtempSync(join(tmpdir(), "mastra-code-ui-mcp-"))
	tempDirs.push(dir)
	return dir
}

function createMcpManager(overrides: Partial<McpManagerStub> = {}) {
	const dir = makeTempDir()
	const project = join(dir, "project", "mcp.json")
	const global = join(dir, "global", "mcp.json")
	const statuses = [
		{ name: "fs", connected: true, toolCount: 1, toolNames: ["fs_read"] },
	]
	const manager = {
		getServerStatuses: vi.fn(() => statuses),
		getConfig: vi.fn(() => ({
			mcpServers: { fs: { command: "npx", args: ["-y", "mcp-fs"] } },
		})),
		getConfigPaths: vi.fn(() => ({
			project,
			global,
			claude: join(dir, "claude.json"),
		})),
		reload: vi.fn(async () => undefined),
		init: vi.fn(async () => undefined),
		initInBackground: vi.fn(async () => ({
			connected: statuses,
			failed: [],
			skipped: [],
			totalTools: 1,
		})),
		disconnect: vi.fn(async () => undefined),
		hasServers: vi.fn(() => true),
		getTools: vi.fn(() => ({})),
		...overrides,
	}
	return manager as unknown as McpManagerStub
}

function createContext(mcpManager = createMcpManager()) {
	const session = {
		mcpManager,
		projectRoot: "/tmp/project",
		ptySessions: new Map(),
		unsubscribe: null,
	} as unknown as WorktreeSession

	return {
		getActiveSession: () => session,
		mainWindow: null,
		sessions: new Map([["/tmp/project", session]]),
		activeSessionPath: "/tmp/project",
		setActiveSessionPath: vi.fn(),
		sessionTimings: new Map(),
		cleanupSession: vi.fn(),
		bridgeAllEvents: vi.fn(),
		createHarness: vi.fn(),
		ensureAuthenticatedModel: vi.fn(),
		generateThreadTitle: vi.fn(),
		deleteThread: vi.fn(),
	} as unknown as HandlerContext
}

describe("MCP IPC handlers", () => {
	it("returns MCP server statuses from the active session", async () => {
		const mcpManager = createMcpManager()
		const handlers = getMcpHandlers()

		const result = await handlers.getMcpStatuses(
			{ type: "getMcpStatuses" },
			createContext(mcpManager),
		)

		expect(mcpManager.getServerStatuses).toHaveBeenCalled()
		expect(result).toEqual([
			{ name: "fs", connected: true, toolCount: 1, toolNames: ["fs_read"] },
		])
	})

	it("reloads MCP before returning updated statuses", async () => {
		const mcpManager = createMcpManager()
		const handlers = getMcpHandlers()

		await handlers.reloadMcp({ type: "reloadMcp" }, createContext(mcpManager))

		expect(mcpManager.reload).toHaveBeenCalledTimes(1)
		expect(mcpManager.getServerStatuses).toHaveBeenCalled()
	})

	it("adds a project-scoped MCP server config and reloads", async () => {
		const mcpManager = createMcpManager()
		const handlers = getMcpHandlers()

		await handlers.addMcpServer(
			{
				type: "addMcpServer",
				scope: "project",
				serverName: "filesystem",
				serverCommand: "npx",
				serverArgs: ["-y", "@modelcontextprotocol/server-filesystem"],
				serverEnv: { ROOT: "/tmp/project" },
			},
			createContext(mcpManager),
		)

		const { project } = mcpManager.getConfigPaths()
		const written = JSON.parse(readFileSync(project, "utf-8")) as {
			mcpServers?: Record<string, unknown>
		}
		expect(written.mcpServers?.filesystem).toEqual({
			command: "npx",
			args: ["-y", "@modelcontextprotocol/server-filesystem"],
			env: { ROOT: "/tmp/project" },
		})
		expect(mcpManager.reload).toHaveBeenCalledTimes(1)
	})

	it("removes an MCP server from project and global config files before reloading", async () => {
		const mcpManager = createMcpManager()
		const { project, global } = mcpManager.getConfigPaths()
		mkdirSync(dirname(project), { recursive: true })
		mkdirSync(dirname(global), { recursive: true })
		writeFileSync(
			project,
			JSON.stringify({
				mcpServers: { fs: { command: "npx" }, keep: { command: "node" } },
			}),
		)
		writeFileSync(
			global,
			JSON.stringify({ mcpServers: { fs: { command: "uvx" } } }),
		)
		const handlers = getMcpHandlers()

		await handlers.removeMcpServer(
			{ type: "removeMcpServer", serverName: "fs" },
			createContext(mcpManager),
		)

		const projectConfig = JSON.parse(readFileSync(project, "utf-8")) as {
			mcpServers?: Record<string, unknown>
		}
		const globalConfig = JSON.parse(readFileSync(global, "utf-8")) as {
			mcpServers?: Record<string, unknown>
		}
		expect(projectConfig.mcpServers).toEqual({ keep: { command: "node" } })
		expect(globalConfig.mcpServers).toEqual({})
		expect(mcpManager.reload).toHaveBeenCalledTimes(1)
	})
})
