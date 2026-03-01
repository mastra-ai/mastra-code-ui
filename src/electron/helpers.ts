import type { BrowserWindow } from "electron"
import { generateText } from "ai"
import type { Harness } from "@mastra/core/harness"
import type { AuthStorage } from "../auth/storage.js"

let mainWindowRef: BrowserWindow | null = null

export function setMainWindowRef(win: BrowserWindow | null) {
	mainWindowRef = win
}

export async function ensureAuthenticatedModel(
	h: Harness<any>,
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
	h: Harness<any>,
	userMessage: string,
	resolveModel: (modelId: string) => any,
) {
	try {
		const modelId = h.getCurrentModelId()
		if (!modelId) return
		const model = resolveModel(modelId)
		const result = await generateText({
			model: model as any,
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
	h: Harness<any>,
	threadId: string,
): Promise<void> {
	const currentThreadId = h.getCurrentThreadId()
	if (currentThreadId === threadId) {
		await h.createThread({ title: "New Thread" })
	}
}
