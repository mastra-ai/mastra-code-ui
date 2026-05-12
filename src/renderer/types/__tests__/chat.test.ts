import { describe, expect, it } from "vitest"
import { chatReducer, initialChatState } from "../chat"
import type { ChatState } from "../chat"
import type { Message } from "../ipc"

function createState(): ChatState {
	return {
		...initialChatState,
		messages: [],
		tools: new Map(),
		subagents: new Map(),
	}
}

function createAssistantMessage(content: Message["content"]): Message {
	return {
		id: "assistant-1",
		role: "assistant",
		content,
		createdAt: "2026-05-13T00:00:00.000Z",
	}
}

describe("chatReducer", () => {
	it("inserts assistant messages that start with thinking updates", () => {
		const message = createAssistantMessage([
			{ type: "thinking", thinking: "Checking the request" },
		])

		const state = chatReducer(createState(), {
			type: "MESSAGE_UPDATE",
			message,
		})

		expect(state.messages).toEqual([message])
		expect(state.streamingMessageId).toBe(message.id)
	})

	it("keeps reasoning-only assistant messages when the stream ends", () => {
		const message = createAssistantMessage([
			{ type: "thinking", thinking: "No visible text yet" },
		])

		const state = chatReducer(createState(), {
			type: "MESSAGE_END",
			message,
		})

		expect(state.messages).toEqual([message])
		expect(state.streamingMessageId).toBeNull()
	})
})
