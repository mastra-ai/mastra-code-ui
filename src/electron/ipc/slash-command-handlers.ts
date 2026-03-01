import type { IpcCommandHandler } from "./types.js"

const BUILTIN_COMMANDS = [
	{ name: "new", description: "Start a new thread", builtin: true },
	{ name: "clear", description: "Clear current conversation", builtin: true },
	{ name: "plan", description: "Switch to plan mode", builtin: true },
	{ name: "build", description: "Switch to build mode", builtin: true },
	{ name: "fast", description: "Switch to fast mode", builtin: true },
	{ name: "model", description: "Switch AI model", builtin: true },
	{ name: "thinking", description: "Toggle extended thinking", builtin: true },
	{ name: "settings", description: "Open settings", builtin: true },
	{
		name: "help",
		description: "Show keyboard shortcuts & tips",
		builtin: true,
	},
]

export function getSlashCommandHandlers(): Record<string, IpcCommandHandler> {
	return {
		getSlashCommands: async (_command, ctx) => {
			const { loadCustomCommands } =
				await import("../../utils/slash-command-loader.js")
			const custom = await loadCustomCommands(
				ctx.getActiveSession().projectRoot,
			)
			return [...BUILTIN_COMMANDS, ...custom]
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
