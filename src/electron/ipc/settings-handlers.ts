import type { IpcCommandHandler } from "./types.js"

export function getSettingsHandlers(): Record<string, IpcCommandHandler> {
	return {
		setThinkingLevel: async (command, ctx) => {
			await ctx
				.getActiveSession()
				.harness.setState({ thinkingLevel: command.level })
		},
		setNotifications: async (command, ctx) => {
			await ctx
				.getActiveSession()
				.harness.setState({ notifications: command.mode })
		},
		setSmartEditing: async (command, ctx) => {
			await ctx
				.getActiveSession()
				.harness.setState({ smartEditing: command.enabled })
		},
		setObserverModel: async (command, ctx) => {
			await ctx
				.getActiveSession()
				.harness.switchObserverModel({ modelId: command.modelId })
		},
		setReflectorModel: async (command, ctx) => {
			await ctx
				.getActiveSession()
				.harness.switchReflectorModel({ modelId: command.modelId })
		},
		setState: async (command, ctx) => {
			await ctx.getActiveSession().harness.setState(command.patch)
		},
	}
}
