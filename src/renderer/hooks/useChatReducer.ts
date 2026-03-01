import { useReducer } from "react"
import { chatReducer, initialChatState } from "../types/chat"

export function useChatReducer() {
	return useReducer(chatReducer, initialChatState)
}
