import type { IpcCommandHandler } from "./types.js"

export function getSlashCommandHandlers(): Record<string, IpcCommandHandler> {
	return {
		getSlashCommands: async (_command, ctx) => {
			const { loadCustomCommands } =
				await import("../../utils/slash-command-loader.js")
			return await loadCustomCommands(ctx.getActiveSession().projectRoot)
		},
		processSlashCommand: async (command, ctx) => {
			const { loadCustomCommands } =
				await import("../../utils/slash-command-loader.js")
			const { processSlashCommand } =
				await import("../../utils/slash-command-processor.js")
			const projectRoot = ctx.getActiveSession().projectRoot
			const commands = await loadCustomCommands(projectRoot)
			const cmd = commands.find(
				(c: { name: string }) => c.name === command.commandName,
			)
			if (!cmd) throw new Error(`Unknown command: /${command.commandName}`)
			return await processSlashCommand(cmd, command.args ?? [], projectRoot)
		},
	}
}
