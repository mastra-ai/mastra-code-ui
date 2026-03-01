import * as fs from "fs"
import type { IpcCommandHandler } from "./types.js"
import { estimateTokenCost } from "../../utils/cost.js"

export function getDashboardHandlers(): Record<string, IpcCommandHandler> {
	return {
		getAgentDashboardData: async (_command, ctx) => {
			const agents: Array<{
				worktreePath: string
				projectName: string
				gitBranch: string
				isActive: boolean
				currentTask: string | null
				linkedIssue: {
					id: string
					identifier: string
					provider: string
				} | null
				tokenUsage: {
					promptTokens: number
					completionTokens: number
					totalTokens: number
				}
				estimatedCost: number
				modelId: string | null
				startedAt: number | null
				totalDurationMs: number
				isCurrentSession: boolean
			}> = []

			for (const [wtPath, session] of ctx.sessions.entries()) {
				if (!fs.existsSync(wtPath)) {
					ctx.cleanupSession(wtPath)
					continue
				}
				try {
					const state = session.harness.getState?.() as
						| Record<string, unknown>
						| undefined
					const timing = ctx.sessionTimings.get(wtPath) ?? {
						startedAt: null,
						totalDurationMs: 0,
						currentModelId: null,
					}
					const tokens = session.harness.getTokenUsage?.() ?? {
						promptTokens: 0,
						completionTokens: 0,
						totalTokens: 0,
					}
					const isRunning = timing.startedAt !== null

					const tasks =
						(state?.tasks as
							| Array<{
									content: string
									status: string
									activeForm: string
							  }>
							| undefined) ?? []
					const activeTask = tasks.find((t) => t.status === "in_progress")

					let linkedIssue = null
					const linearIssueId = (state?.linkedLinearIssueId as string) ?? ""
					const linearIdentifier =
						(state?.linkedLinearIssueIdentifier as string) ?? ""
					if (linearIssueId && linearIdentifier) {
						linkedIssue = {
							id: linearIssueId,
							identifier: linearIdentifier,
							provider: "linear",
						}
					}
					const ghIssue = (state?.linkedGithubIssueNumber as number) ?? 0
					if (ghIssue > 0 && !linkedIssue) {
						linkedIssue = {
							id: `gh-${ghIssue}`,
							identifier: `#${ghIssue}`,
							provider: "github",
						}
					}

					const modelId =
						timing.currentModelId ?? (state?.currentModelId as string) ?? null

					agents.push({
						worktreePath: wtPath,
						projectName:
							(state?.projectName as string) ??
							require("path").basename(wtPath),
						gitBranch: (state?.gitBranch as string) ?? "",
						isActive: isRunning,
						currentTask: activeTask?.activeForm ?? activeTask?.content ?? null,
						linkedIssue,
						tokenUsage: tokens,
						estimatedCost: estimateTokenCost(
							modelId,
							tokens.promptTokens,
							tokens.completionTokens,
						),
						modelId,
						startedAt: timing.startedAt,
						totalDurationMs:
							timing.totalDurationMs +
							(timing.startedAt ? Date.now() - timing.startedAt : 0),
						isCurrentSession: wtPath === ctx.activeSessionPath,
					})
				} catch {
					// Skip sessions that fail
				}
			}

			let totalPrompt = 0
			let totalCompletion = 0
			let totalCost = 0
			for (const agent of agents) {
				totalPrompt += agent.tokenUsage.promptTokens
				totalCompletion += agent.tokenUsage.completionTokens
				totalCost += agent.estimatedCost
			}

			return {
				agents,
				totals: {
					promptTokens: totalPrompt,
					completionTokens: totalCompletion,
					totalTokens: totalPrompt + totalCompletion,
					estimatedCost: totalCost,
					activeCount: agents.filter((a) => a.isActive).length,
					totalCount: agents.length,
				},
			}
		},
	}
}
