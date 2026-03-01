import * as path from "path"
import * as fs from "fs"
import type { IpcCommandHandler } from "./types.js"

export function getMcpHandlers(): Record<string, IpcCommandHandler> {
	return {
		getMcpStatuses: async (_command, ctx) => {
			return ctx.getActiveSession().mcpManager.getServerStatuses()
		},
		getMcpConfig: async (_command, ctx) => {
			return ctx.getActiveSession().mcpManager.getConfig()
		},
		getMcpConfigPaths: async (_command, ctx) => {
			return ctx.getActiveSession().mcpManager.getConfigPaths()
		},
		reloadMcp: async (_command, ctx) => {
			const mcpManager = ctx.getActiveSession().mcpManager
			await mcpManager.reload()
			return mcpManager.getServerStatuses()
		},
		addMcpServer: async (command, ctx) => {
			const mcpManager = ctx.getActiveSession().mcpManager
			const configPath =
				command.scope === "global"
					? mcpManager.getConfigPaths().global
					: mcpManager.getConfigPaths().project
			const existing = (() => {
				try {
					if (fs.existsSync(configPath)) {
						return JSON.parse(fs.readFileSync(configPath, "utf-8"))
					}
				} catch {}
				return {}
			})()
			if (!existing.mcpServers) existing.mcpServers = {}
			existing.mcpServers[command.serverName] = {
				command: command.serverCommand,
				args: command.serverArgs ?? [],
				env: command.serverEnv ?? undefined,
			}
			const dir = path.dirname(configPath)
			if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
			fs.writeFileSync(configPath, JSON.stringify(existing, null, 2))
			await mcpManager.reload()
			return mcpManager.getServerStatuses()
		},
		removeMcpServer: async (command, ctx) => {
			const mcpManager = ctx.getActiveSession().mcpManager
			for (const configPath of [
				mcpManager.getConfigPaths().project,
				mcpManager.getConfigPaths().global,
			]) {
				try {
					if (!fs.existsSync(configPath)) continue
					const cfg = JSON.parse(fs.readFileSync(configPath, "utf-8"))
					if (cfg.mcpServers?.[command.serverName]) {
						delete cfg.mcpServers[command.serverName]
						fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2))
					}
				} catch {}
			}
			await mcpManager.reload()
			return mcpManager.getServerStatuses()
		},
	}
}
