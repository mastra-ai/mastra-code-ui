import type { IpcCommandHandler } from "./types.js"

export function getSettingsHandlers(): Record<string, IpcCommandHandler> {
	return {
		setThinkingLevel: async (command, ctx) => {
			await ctx.getActiveSession().harness.setState({
				thinkingLevel: command.level as
					| "off"
					| "low"
					| "medium"
					| "high"
					| "xhigh",
			})
		},
		setNotifications: async (command, ctx) => {
			await ctx.getActiveSession().harness.setState({
				notifications: command.mode as "off" | "bell" | "system" | "both",
			})
		},
		setSmartEditing: async (command, ctx) => {
			await ctx
				.getActiveSession()
				.harness.setState({ smartEditing: command.enabled as boolean })
		},
		setObserverModel: async (command, ctx) => {
			await ctx
				.getActiveSession()
				.harness.switchObserverModel({ modelId: command.modelId as string })
		},
		setReflectorModel: async (command, ctx) => {
			await ctx
				.getActiveSession()
				.harness.switchReflectorModel({ modelId: command.modelId as string })
		},
		setState: async (command, ctx) => {
			const session = ctx.getActiveSession()
			const patch = command.patch as Record<string, unknown>

			// Split: electron-specific fields go to electronState, rest to harness
			const electronKeys = new Set([
				"linearApiKey",
				"linearTeamId",
				"linkedLinearIssueId",
				"linkedLinearIssueIdentifier",
				"linkedLinearDoneStateId",
				"githubToken",
				"githubOwner",
				"githubRepo",
				"githubUsername",
				"linkedGithubIssueNumber",
				"linkedGithubIssueTitle",
				"prInstructions",
				"defaultClonePath",
			])

			const electronPatch: Record<string, unknown> = {}
			const harnessPatch: Record<string, unknown> = {}
			for (const [key, value] of Object.entries(patch)) {
				if (electronKeys.has(key)) {
					electronPatch[key] = value
				} else {
					harnessPatch[key] = value
				}
			}

			if (Object.keys(electronPatch).length > 0) {
				session.electronState.setState(electronPatch as any)
			}
			if (Object.keys(harnessPatch).length > 0) {
				await session.harness.setState(harnessPatch)
			}
		},
	}
}
