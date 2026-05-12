import type { IpcCommandHandler, HandlerContext } from "./types.js"
import {
	TOOL_CATEGORIES,
	DEFAULT_POLICIES,
	YOLO_POLICIES,
	type ToolCategory,
	type PermissionPolicy,
} from "../../permissions.js"

export function getHarnessHandlers(): Record<string, IpcCommandHandler> {
	return {
		sendMessage: async (command, ctx) => {
			const s = ctx.getActiveSession()
			const h = s.harness
			const content = command.content as string
			const images = command.images as
				| Array<{ mimeType: string; data: string }>
				| undefined
			const files = images?.map(({ mimeType, data }) => ({
				data,
				mediaType: mimeType,
			}))
			const threadBefore = h.getCurrentThreadId()
			h.sendMessage({
				content,
				...(files ? { files } : {}),
			})
				.then(async () => {
					const threadAfter = h.getCurrentThreadId()
					if (!threadAfter) return
					let needsTitle = threadAfter !== threadBefore
					if (!needsTitle) {
						try {
							const session = await h.getSession()
							const thread = session.threads.find((t) => t.id === threadAfter)
							const title = thread?.title ?? ""
							needsTitle =
								!title || title === "New Thread" || title === "Untitled"
						} catch {}
					}
					if (needsTitle) {
						ctx
							.generateThreadTitle(h, content, s.resolveModel)
							.catch((err) => console.warn("Title gen catch:", err))
					}
				})
				.catch((err: unknown) => {
					console.error("sendMessage error:", err)
				})
			return
		},
		abort: async (command, ctx) => {
			ctx.getActiveSession().harness.abort()
		},
		steer: async (command, ctx) => {
			await ctx
				.getActiveSession()
				.harness.steer({ content: command.content as string })
		},
		followUp: async (command, ctx) => {
			await ctx
				.getActiveSession()
				.harness.followUp({ content: command.content as string })
		},
		switchMode: async (command, ctx) => {
			await ctx
				.getActiveSession()
				.harness.switchMode({ modeId: command.modeId as string })
		},
		switchModel: async (command, ctx) => {
			await ctx.getActiveSession().harness.switchModel({
				modelId: command.modelId as string,
				scope: command.scope as "global" | "thread" | undefined,
				modeId: command.modeId as string | undefined,
			})
		},
		switchThread: async (command, ctx) => {
			await ctx
				.getActiveSession()
				.harness.switchThread({ threadId: command.threadId as string })
		},
		createThread: async (command, ctx) => {
			return await ctx
				.getActiveSession()
				.harness.createThread({ title: command.title as string | undefined })
		},
		renameThread: async (command, ctx) => {
			await ctx
				.getActiveSession()
				.harness.renameThread({ title: command.title as string })
		},
		deleteThread: async (command, ctx) => {
			return await ctx.deleteThread(
				ctx.getActiveSession().harness,
				command.threadId as string,
			)
		},
		getMessages: async (command, ctx) => {
			return await ctx
				.getActiveSession()
				.harness.listMessages({ limit: command.limit as number | undefined })
		},
		getModes: async (_command, ctx) => {
			return ctx
				.getActiveSession()
				.harness.listModes()
				.map((m) => ({
					id: m.id,
					name: m.name,
					color: m.color,
				}))
		},
		getState: async (_command, ctx) => {
			const session = ctx.getActiveSession()
			return {
				...session.harness.getState(),
				...session.electronState.getState(),
			}
		},
		getSession: async (_command, ctx) => {
			const h = ctx.getActiveSession().harness
			const session = await h.getSession()
			await h.loadOMProgress?.().catch(() => {})
			return session
		},
		listThreads: async (_command, ctx) => {
			return await ctx.getActiveSession().harness.listThreads()
		},
		getTokenUsage: async (_command, ctx) => {
			return ctx.getActiveSession().harness.getTokenUsage()
		},
		getOMProgress: async (_command, ctx) => {
			const ds = ctx.getActiveSession().harness.getDisplayState()
			return ds?.omProgress ?? null
		},
		isRunning: async (_command, ctx) => {
			return ctx.getActiveSession().harness.isRunning()
		},
		getCurrentModeId: async (_command, ctx) => {
			return ctx.getActiveSession().harness.getCurrentModeId()
		},
		getFullModelId: async (_command, ctx) => {
			return ctx.getActiveSession().harness.getFullModelId()
		},
		getAvailableModels: async (_command, ctx) => {
			const rawModels = await ctx
				.getActiveSession()
				.harness.listAvailableModels()
			return (rawModels ?? []).map((m) => ({
				id: m.id,
				name: m.modelName ?? m.id.split("/").pop(),
				provider: m.provider,
				hasAuth: m.hasApiKey,
			}))
		},
	}
}
