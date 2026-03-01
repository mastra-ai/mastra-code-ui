import type { IpcCommandHandler } from "./types.js"
import { getHarnessHandlers } from "./harness-handlers.js"
import { getPermissionHandlers } from "./permission-handlers.js"
import { getSettingsHandlers } from "./settings-handlers.js"
import { getGitHandlers } from "./git-handlers.js"
import { getFileHandlers } from "./file-handlers.js"
import { getPtyHandlers } from "./pty-handlers.js"
import { getProjectHandlers } from "./project-handlers.js"
import { getAuthHandlers } from "./auth-handlers.js"
import { getIntegrationHandlers } from "./integration-handlers.js"
import { getContextHandlers } from "./context-handlers.js"
import { getDashboardHandlers } from "./dashboard-handlers.js"
import { getMcpHandlers } from "./mcp-handlers.js"
import { getSlashCommandHandlers } from "./slash-command-handlers.js"

export type {
	HandlerContext,
	IpcCommandHandler,
	WorktreeSession,
	AgentTiming,
} from "./types.js"

export function getAllHandlers(): Record<string, IpcCommandHandler> {
	return {
		...getHarnessHandlers(),
		...getPermissionHandlers(),
		...getSettingsHandlers(),
		...getGitHandlers(),
		...getFileHandlers(),
		...getPtyHandlers(),
		...getProjectHandlers(),
		...getAuthHandlers(),
		...getIntegrationHandlers(),
		...getContextHandlers(),
		...getDashboardHandlers(),
		...getMcpHandlers(),
		...getSlashCommandHandlers(),
	}
}
