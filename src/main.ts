/**
 * Main entry point for Mastra Code TUI.
 * Simplified and modularized version using extracted modules.
 */

import { z } from "zod"
import { LibSQLStore } from "@mastra/libsql"
import { Harness } from "./harness/harness.js"
import { MastraTUI } from "./tui/index.js"
import { AuthStorage } from "./auth/storage.js"
import { HookManager } from "./hooks/index.js"
import { MCPManager } from "./mcp/index.js"
import { detectProject, getDatabasePath } from "./utils/project.js"
import { startGatewaySync } from "./utils/gateway-sync.js"
import { setAuthStorage, setOpenAIAuthStorage } from "./providers/index.js"
import { setupConsoleInterceptor } from "./utils/console-interceptor.js"

// Import setup modules
import { createCodeAgent, getToolsets } from "./app/setup/agent.js"
import { 
    createMemory, 
    createInitialOMModelState, 
    createInitialOMThresholdState,
    syncOMModelState,
    syncOMThresholdState
} from "./app/setup/memory.js"
import { createWorkspace } from "./app/setup/workspace.js"
import { MODES } from "./app/config/modes.js"

// =============================================================================
// Configuration
// =============================================================================

// State schema for the harness
const stateSchema = z.object({
    projectPath: z.string().optional(),
    projectName: z.string().optional(),
    gitBranch: z.string().optional(),
    lastCommand: z.string().optional(),
    currentModelId: z.string().default(""),
    // Observational Memory model settings
    observerModelId: z.string().default("anthropic/claude-3-5-haiku-latest"),
    reflectorModelId: z.string().default("anthropic/claude-3-5-haiku-latest"),
    // Observational Memory threshold settings
    observationThreshold: z.number().default(30_000),
    reflectionThreshold: z.number().default(40_000),
    // Thinking level for extended thinking (Anthropic models)
    thinkingLevel: z.string().default("off"),
    // YOLO mode — auto-approve all tool calls
    yolo: z.boolean().default(true),
    // Todo list (persisted per-thread)
    todos: z
        .array(
            z.object({
                content: z.string(),
                status: z.enum(["pending", "in_progress", "completed"]),
                activeForm: z.string().optional(),
            }),
        )
        .default([]),
    // Active plan
    activePlan: z.object({
        title: z.string(),
        plan: z.string(),
        approvedAt: z.string(),
    }).nullable().optional(),
})

// =============================================================================
// Initialization
// =============================================================================

// Start Gateway Sync
startGatewaySync(5 * 60 * 1000) // Sync every 5 minutes

// Create Auth Storage
const authStorage = new AuthStorage()
setAuthStorage(authStorage)
setOpenAIAuthStorage(authStorage)

// Project Detection
const project = detectProject(process.cwd())
console.log(`Project: ${project.name}`)
console.log(`Resource ID: ${project.resourceId}`)
if (project.gitBranch) console.log(`Branch: ${project.gitBranch}`)
if (project.isWorktree) console.log(`Worktree of: ${project.mainRepoPath}`)
console.log()

// Create Storage
const databasePath = getDatabasePath()
const storage = new LibSQLStore({
    id: "mastra-code-storage",
    url: `file:${databasePath}`,
})

// Create OM state (kept in sync with harness)
const omModelState = createInitialOMModelState()
const omThresholdState = createInitialOMThresholdState()

// Create Memory
const memory = createMemory(storage, omModelState, omThresholdState, authStorage)

// Create Workspace
const workspace = createWorkspace(project.rootPath)

// Create Hook Manager
const hookManager = new HookManager(project.rootPath, "session-init")
if (hookManager.hasHooks()) {
    const hookConfig = hookManager.getConfig()
    const hookCount = Object.values(hookConfig).reduce(
        (sum, hooks) => sum + (hooks?.length ?? 0),
        0,
    )
    console.log(`Hooks: ${hookCount} hook(s) configured`)
}

// Create MCP Manager
const mcpManager = new MCPManager(project.rootPath)

// Create Agent
const codeAgent = createCodeAgent({
    workspace,
    memory,
    projectRoot: project.rootPath,
    mcpManager,
    stateSchema,
})

// Create Harness with modes from config
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
    modes: MODES.map(mode => ({
        ...mode,
        agent: codeAgent,
    })),
    authStorage,
})

// Keep OM state in sync with harness state changes
harness.subscribe((event) => {
    if (event.type === "om_model_changed") {
        const { role, modelId } = event as { type: string; role: string; modelId: string }
        if (role === "observer") omModelState.observerModelId = modelId
        if (role === "reflector") omModelState.reflectorModelId = modelId
    } else if (event.type === "thread_changed") {
        // Thread switch restores OM model IDs from metadata
        omModelState.observerModelId = harness.getObserverModelId()
        omModelState.reflectorModelId = harness.getReflectorModelId()
        // Keep hook manager session ID in sync
        hookManager.setSessionId((event as any).threadId)
    } else if (event.type === "thread_created") {
        hookManager.setSessionId((event as any).thread.id)
    } else if (event.type === "state_changed") {
        // Sync OM thresholds with harness state
        const state = harness.getState()
        syncOMModelState(omModelState, state)
        syncOMThresholdState(omThresholdState, state)
    }
})

// Create and configure TUI
const tui = new MastraTUI({
    harness,
    appName: "Mastra Code",
    version: "0.1.0", 
    inlineQuestions: true,
})

// Initialize MCP connections and run TUI
;(async () => {
    // Set up console interceptor to format errors nicely
    setupConsoleInterceptor(tui)
    
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