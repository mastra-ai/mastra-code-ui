import type { Message } from "./ipc"
import {
	getToolResultIsError,
	normalizeAskUserQuestion,
} from "../utils/askUser"

export type QuestionSelectionMode = "single_select" | "multi_select"

export type QuestionAnswer = string | string[]

export interface QuestionOption {
	label: string
	description?: string
}

export interface PendingQuestion {
	questionId: string
	toolCallId?: string
	question: string
	options?: QuestionOption[]
	selectionMode?: QuestionSelectionMode
	responseEnabled?: boolean
}

export interface ToolQuestionState extends PendingQuestion {
	answer?: QuestionAnswer
	responseStatus?: "waiting" | "submitted"
}

export type ToolState = {
	id: string
	name: string
	args: unknown
	result?: unknown
	isError?: boolean
	status: "pending" | "running" | "complete" | "error"
	shellOutput?: string
	question?: ToolQuestionState
}

export type SubagentState = {
	toolCallId: string
	agentType: string
	task: string
	modelId?: string
	tools: Array<{
		name: string
		args: unknown
		result?: unknown
		isError?: boolean
		status: "running" | "complete"
	}>
	result?: string
	isError?: boolean
	durationMs?: number
	status: "running" | "complete"
}

export type ChatState = {
	messages: Message[]
	isAgentActive: boolean
	agentStartedAt: number | null
	streamingMessageId: string | null
	tools: Map<string, ToolState>
	subagents: Map<string, SubagentState>
}

export type ChatAction =
	| { type: "AGENT_START" }
	| { type: "AGENT_END" }
	| { type: "MESSAGE_START"; message: Message }
	| { type: "MESSAGE_UPDATE"; message: Message }
	| { type: "MESSAGE_END"; message: Message }
	| { type: "TOOL_START"; id: string; name: string; args: unknown }
	| { type: "TOOL_UPDATE"; id: string; partialResult: unknown }
	| { type: "TOOL_END"; id: string; result: unknown; isError: boolean }
	| { type: "ASK_QUESTION"; question: PendingQuestion }
	| { type: "QUESTION_RESPONSE"; questionId: string; answer: QuestionAnswer }
	| {
			type: "SHELL_OUTPUT"
			id: string
			output: string
			stream: "stdout" | "stderr"
	  }
	| {
			type: "SUBAGENT_START"
			toolCallId: string
			agentType: string
			task: string
			modelId?: string
	  }
	| {
			type: "SUBAGENT_TOOL_START"
			toolCallId: string
			subToolName: string
			subToolArgs: unknown
	  }
	| {
			type: "SUBAGENT_TOOL_END"
			toolCallId: string
			subToolName: string
			subToolResult: unknown
			isError: boolean
	  }
	| {
			type: "SUBAGENT_END"
			toolCallId: string
			result: string
			isError: boolean
			durationMs: number
	  }
	| { type: "SET_MESSAGES"; messages: Message[] }
	| { type: "CLEAR" }

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
	switch (action.type) {
		case "AGENT_START":
			return { ...state, isAgentActive: true, agentStartedAt: Date.now() }
		case "AGENT_END":
			return {
				...state,
				isAgentActive: false,
				streamingMessageId: null,
			}
		case "MESSAGE_START": {
			if (action.message.role === "user") {
				const lastMsg = state.messages[state.messages.length - 1]
				if (lastMsg?.role === "user") {
					return state
				}
			}
			if (state.messages.some((m) => m.id === action.message.id)) {
				return {
					...state,
					messages: state.messages.map((m) =>
						m.id === action.message.id ? action.message : m,
					),
					streamingMessageId:
						action.message.role === "assistant" ? action.message.id : null,
				}
			}
			return {
				...state,
				messages: [...state.messages, action.message],
				streamingMessageId:
					action.message.role === "assistant" ? action.message.id : null,
			}
		}
		case "MESSAGE_UPDATE": {
			const messageExists = state.messages.some(
				(m) => m.id === action.message.id,
			)
			const messages = messageExists
				? state.messages.map((m) =>
						m.id === action.message.id ? action.message : m,
					)
				: [...state.messages, action.message]
			return {
				...state,
				messages,
				streamingMessageId:
					action.message.role === "assistant"
						? action.message.id
						: state.streamingMessageId,
			}
		}
		case "MESSAGE_END": {
			const messageExists = state.messages.some(
				(m) => m.id === action.message.id,
			)
			const messages = messageExists
				? state.messages.map((m) =>
						m.id === action.message.id ? action.message : m,
					)
				: [...state.messages, action.message]
			return { ...state, messages, streamingMessageId: null }
		}
		case "TOOL_START": {
			const tools = new Map(state.tools)
			tools.set(action.id, {
				id: action.id,
				name: action.name,
				args: action.args,
				status: "running",
			})
			return { ...state, tools }
		}
		case "TOOL_UPDATE": {
			const tools = new Map(state.tools)
			const tool = tools.get(action.id)
			if (tool) {
				tools.set(action.id, { ...tool, result: action.partialResult })
			}
			return { ...state, tools }
		}
		case "TOOL_END": {
			const tools = new Map(state.tools)
			const tool = tools.get(action.id)
			if (tool) {
				const isError = getToolResultIsError(action.result, action.isError)
				tools.set(action.id, {
					...tool,
					result: action.result,
					isError,
					status: isError ? "error" : "complete",
				})
			}
			return { ...state, tools }
		}
		case "ASK_QUESTION": {
			const tools = new Map(state.tools)
			const matchingEntries = Array.from(tools.entries()).filter(([, tool]) => {
				if (tool.name !== "ask_user" || tool.status !== "running") {
					return false
				}
				if (tool.question) {
					return (
						tool.question.responseEnabled === false &&
						tool.question.question === action.question.question
					)
				}
				const args =
					tool.args && typeof tool.args === "object"
						? (tool.args as Record<string, unknown>)
						: null
				return (
					args !== null &&
					normalizeAskUserQuestion(args)?.question === action.question.question
				)
			})
			const [toolId, tool] = matchingEntries[matchingEntries.length - 1] ?? []
			if (toolId && tool) {
				tools.set(toolId, {
					...tool,
					question: {
						...tool.question,
						...action.question,
						responseEnabled: action.question.responseEnabled,
						responseStatus: "waiting",
					},
				})
			}
			return { ...state, tools }
		}
		case "QUESTION_RESPONSE": {
			const tools = new Map(state.tools)
			for (const [toolId, tool] of tools) {
				if (tool.question?.questionId !== action.questionId) continue
				tools.set(toolId, {
					...tool,
					question: {
						...tool.question,
						answer: action.answer,
						responseStatus: "submitted",
					},
				})
				break
			}
			return { ...state, tools }
		}
		case "SHELL_OUTPUT": {
			const tools = new Map(state.tools)
			const tool = tools.get(action.id)
			if (tool) {
				tools.set(action.id, {
					...tool,
					shellOutput: (tool.shellOutput ?? "") + action.output,
				})
			}
			return { ...state, tools }
		}
		case "SUBAGENT_START": {
			const subagents = new Map(state.subagents)
			subagents.set(action.toolCallId, {
				toolCallId: action.toolCallId,
				agentType: action.agentType,
				task: action.task,
				modelId: action.modelId,
				tools: [],
				status: "running",
			})
			return { ...state, subagents }
		}
		case "SUBAGENT_TOOL_START": {
			const subagents = new Map(state.subagents)
			const sa = subagents.get(action.toolCallId)
			if (sa) {
				subagents.set(action.toolCallId, {
					...sa,
					tools: [
						...sa.tools,
						{
							name: action.subToolName,
							args: action.subToolArgs,
							status: "running",
						},
					],
				})
			}
			return { ...state, subagents }
		}
		case "SUBAGENT_TOOL_END": {
			const subagents = new Map(state.subagents)
			const sa = subagents.get(action.toolCallId)
			if (sa) {
				const tools = sa.tools.map((t) =>
					t.name === action.subToolName && t.status === "running"
						? {
								...t,
								result: action.subToolResult,
								isError: action.isError,
								status: "complete" as const,
							}
						: t,
				)
				subagents.set(action.toolCallId, { ...sa, tools })
			}
			return { ...state, subagents }
		}
		case "SUBAGENT_END": {
			const subagents = new Map(state.subagents)
			const sa = subagents.get(action.toolCallId)
			if (sa) {
				subagents.set(action.toolCallId, {
					...sa,
					result: action.result,
					isError: action.isError,
					durationMs: action.durationMs,
					status: "complete",
				})
			}
			return { ...state, subagents }
		}
		case "SET_MESSAGES":
			return {
				...state,
				messages: action.messages,
				tools: new Map(),
				subagents: new Map(),
			}
		case "CLEAR":
			return {
				messages: [],
				isAgentActive: false,
				agentStartedAt: null,
				streamingMessageId: null,
				tools: new Map(),
				subagents: new Map(),
			}
		default:
			return state
	}
}

export const initialChatState: ChatState = {
	messages: [],
	isAgentActive: false,
	agentStartedAt: null,
	streamingMessageId: null,
	tools: new Map(),
	subagents: new Map(),
}
