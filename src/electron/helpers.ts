import type { BrowserWindow } from "electron"
import { generateText } from "ai"
import type { LanguageModel } from "ai"
import type { AuthStorage } from "../auth/storage.js"
import type {
	DeleteThreadResult,
	MastraCodeHarness,
	MastraCodeResolveModel,
} from "./ipc/types.js"

export type ThreadDeletionHarness = Pick<
	MastraCodeHarness,
	"createThread" | "getCurrentThreadId"
> & {
	memory: Pick<MastraCodeHarness["memory"], "deleteThread">
}

let mainWindowRef: BrowserWindow | null = null

export function setMainWindowRef(win: BrowserWindow | null) {
	mainWindowRef = win
}

export async function ensureAuthenticatedModel(
	h: MastraCodeHarness,
	authStorage: AuthStorage,
) {
	const modelId = h.getCurrentModelId()
	if (!modelId) return
	const provider = modelId.split("/")[0]
	const authProviderId = provider === "openai" ? "openai-codex" : provider
	if (authStorage.isLoggedIn(authProviderId)) return

	const providerMapping: Array<{ authId: string; prefix: string }> = [
		{ authId: "openai-codex", prefix: "openai" },
		{ authId: "anthropic", prefix: "anthropic" },
	]
	for (const { authId, prefix } of providerMapping) {
		if (authStorage.isLoggedIn(authId)) {
			const fallback = authStorage.getDefaultModelForProvider(authId)
			if (fallback) {
				await h.switchModel({ modelId: fallback })
				console.log(
					`[model-auth] Switched from unauthenticated ${provider} to ${fallback}`,
				)
				return
			}
		}
	}
}

export async function generateThreadTitle(
	h: MastraCodeHarness,
	userMessage: string,
	resolveModel: MastraCodeResolveModel,
) {
	try {
		const modelId = h.getCurrentModelId()
		if (!modelId) return
		const model = resolveModel(modelId)
		const result = await generateText({
			model: model as LanguageModel,
			prompt: `Generate a very short title (5-8 words max) for a conversation that starts with this message. Return ONLY the title, no quotes or extra punctuation:\n\n${userMessage.slice(0, 500)}`,
		})
		const title = result.text?.trim()
		if (title) {
			await h.renameThread({ title })
			mainWindowRef?.webContents.send("harness:event", {
				type: "thread_title_updated",
				threadId: h.getCurrentThreadId(),
				title,
			})
		}
	} catch (err) {
		console.warn("Thread title generation failed:", err)
	}
}

export async function deleteThread(
	h: ThreadDeletionHarness,
	threadId: string,
): Promise<DeleteThreadResult> {
	const wasCurrentThread = h.getCurrentThreadId() === threadId
	await h.memory.deleteThread({ threadId })

	if (wasCurrentThread) {
		const thread = await h.createThread({ title: "New Thread" })
		return { deletedThreadId: threadId, currentThreadId: thread.id }
	}

	return { deletedThreadId: threadId, currentThreadId: h.getCurrentThreadId() }
}
