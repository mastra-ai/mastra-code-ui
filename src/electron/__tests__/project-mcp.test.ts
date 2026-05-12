import { beforeEach, describe, expect, it, vi } from "vitest"
import { getProjectHandlers } from "../ipc/project-handlers.js"
import type {
	HandlerContext,
	HarnessRuntime,
	WorktreeSession,
} from "../ipc/types.js"

const projectMocks = vi.hoisted(() => ({
	detectProject: vi.fn(),
	saveRecentProject: vi.fn(),
	loadRecentProjects: vi.fn(() => []),
	removeRecentProject: vi.fn(),
}))

vi.mock("../../utils/project.js", () => ({
	detectProject: projectMocks.detectProject,
}))

vi.mock("../../utils/recent-projects.js", () => ({
	loadRecentProjects: projectMocks.loadRecentProjects,
	saveRecentProject: projectMocks.saveRecentProject,
	removeRecentProject: projectMocks.removeRecentProject,
}))

type McpManagerStub = WorktreeSession["mcpManager"]

function createMcpManager(hasServers: boolean) {
	return {
		hasServers: vi.fn(() => hasServers),
		init: vi.fn(async () => undefined),
		disconnect: vi.fn(async () => undefined),
		reload: vi.fn(async () => undefined),
		getServerStatuses: vi.fn(() => []),
		getConfig: vi.fn(() => ({})),
		getConfigPaths: vi.fn(() => ({
			project: "/tmp/project/.mastra/mcp.json",
			global: "/tmp/global/mcp.json",
			claude: "/tmp/claude/settings.json",
		})),
		getTools: vi.fn(() => ({})),
		initInBackground: vi.fn(async () => ({
			connected: [],
			failed: [],
			skipped: [],
			totalTools: 0,
		})),
	} as unknown as McpManagerStub
}

function createRuntime(mcpManager: McpManagerStub) {
	const harness = {
		init: vi.fn(async () => undefined),
		loadOMProgress: vi.fn(async () => undefined),
		getState: vi.fn(() => ({ projectName: "Test Project" })),
		getCurrentThreadId: vi.fn(() => "thread-1"),
	} as unknown as WorktreeSession["harness"]

	return {
		harness,
		mcpManager,
		browserManager: {},
		resolveModel: vi.fn(),
		authStorage: {},
		electronState: {},
	} as unknown as HarnessRuntime
}

function createContext(runtime: HarnessRuntime) {
	const sessions = new Map<string, WorktreeSession>()
	return {
		getActiveSession: vi.fn(),
		mainWindow: null,
		sessions,
		activeSessionPath: "/tmp/original",
		setActiveSessionPath: vi.fn(),
		sessionTimings: new Map(),
		cleanupSession: vi.fn(),
		bridgeAllEvents: vi.fn(),
		createHarness: vi.fn(async () => runtime),
		ensureAuthenticatedModel: vi.fn(async () => undefined),
		generateThreadTitle: vi.fn(),
		deleteThread: vi.fn(),
	} as unknown as HandlerContext
}

describe("project MCP session initialization", () => {
	beforeEach(() => {
		projectMocks.detectProject.mockReset()
		projectMocks.detectProject.mockReturnValue({
			name: "Test Project",
			rootPath: "/tmp/new-project",
			gitBranch: "main",
			isWorktree: false,
		})
		projectMocks.saveRecentProject.mockReset()
		projectMocks.loadRecentProjects.mockReset()
		projectMocks.loadRecentProjects.mockReturnValue([])
		projectMocks.removeRecentProject.mockReset()
	})

	it("initializes MCP when switching to a new project with configured servers", async () => {
		const mcpManager = createMcpManager(true)
		const runtime = createRuntime(mcpManager)
		const ctx = createContext(runtime)
		const handlers = getProjectHandlers()

		const result = await handlers.switchProject(
			{ type: "switchProject", path: "/tmp/new-project" },
			ctx,
		)

		expect(ctx.createHarness).toHaveBeenCalledWith("/tmp/new-project")
		expect(runtime.harness.init).toHaveBeenCalled()
		expect(ctx.ensureAuthenticatedModel).toHaveBeenCalledWith(
			runtime.harness,
			runtime.authStorage,
		)
		expect(runtime.harness.loadOMProgress).toHaveBeenCalled()
		expect(mcpManager.hasServers).toHaveBeenCalled()
		expect(mcpManager.init).toHaveBeenCalledTimes(1)
		expect(ctx.sessions.get("/tmp/new-project")?.mcpManager).toBe(mcpManager)
		expect(projectMocks.saveRecentProject).toHaveBeenCalledWith(
			"/tmp/new-project",
			"Test Project",
		)
		expect(result).toEqual({
			project: {
				name: "Test Project",
				rootPath: "/tmp/new-project",
				gitBranch: "main",
				isWorktree: false,
			},
		})
	})

	it("does not initialize MCP when the new project has no configured servers", async () => {
		const mcpManager = createMcpManager(false)
		const runtime = createRuntime(mcpManager)
		const ctx = createContext(runtime)
		const handlers = getProjectHandlers()

		await handlers.switchProject(
			{ type: "switchProject", path: "/tmp/new-project" },
			ctx,
		)

		expect(mcpManager.hasServers).toHaveBeenCalled()
		expect(mcpManager.init).not.toHaveBeenCalled()
	})
})
