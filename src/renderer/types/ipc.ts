import type { ElectronAPI } from "../../electron/preload"

declare global {
	interface Window {
		api: ElectronAPI
	}
}

export type HarnessEventType =
	| "mode_changed"
	| "model_changed"
	| "thread_changed"
	| "thread_created"
	| "state_changed"
	| "agent_start"
	| "agent_end"
	| "message_start"
	| "message_update"
	| "message_end"
	| "tool_start"
	| "tool_approval_required"
	| "tool_update"
	| "tool_end"
	| "tool_input_start"
	| "tool_input_delta"
	| "tool_input_end"
	| "shell_output"
	| "usage_update"
	| "error"
	| "om_status"
	| "om_observation_start"
	| "om_observation_end"
	| "om_observation_failed"
	| "om_reflection_start"
	| "om_reflection_end"
	| "om_reflection_failed"
	| "om_model_changed"
	| "om_buffering_start"
	| "om_buffering_end"
	| "om_buffering_failed"
	| "om_activation"
	| "follow_up_queued"
	| "workspace_status_changed"
	| "workspace_ready"
	| "workspace_error"
	| "subagent_start"
	| "subagent_tool_start"
	| "subagent_tool_end"
	| "subagent_text_delta"
	| "subagent_end"
	| "subagent_model_changed"
	| "task_updated"
	| "ask_question"
	| "sandbox_access_request"
	| "plan_approval_required"
	| "plan_approved"
	| "shortcut"
	| "login_auth"
	| "login_prompt"
	| "login_progress"
	| "login_success"
	| "login_error"
	| "pty_output"
	| "pty_exit"
	| "project_changed"
	| "thread_title_updated"
	| "display_state_changed"

export interface HarnessEventPayload {
	type: HarnessEventType
	[key: string]: unknown
}

export interface TokenUsage {
	promptTokens: number
	completionTokens: number
	totalTokens: number
}

export type OMStatus = "idle" | "observing" | "reflecting"
export type OMBufferedStatus = "idle" | "running" | "complete"

export interface OMProgressState {
	status: OMStatus
	pendingTokens: number
	threshold: number
	thresholdPercent: number
	observationTokens: number
	reflectionThreshold: number
	reflectionThresholdPercent: number
	buffered: {
		observations: {
			status: OMBufferedStatus
			chunks: number
			messageTokens: number
			projectedMessageRemoval: number
			observationTokens: number
		}
		reflection: {
			status: OMBufferedStatus
			inputObservationTokens: number
			observationTokens: number
		}
	}
	generationCount: number
	stepNumber: number
	preReflectionTokens: number
}

export interface MessageContent {
	type: "text" | "thinking" | "tool_call" | "tool_result" | "image"
	[key: string]: unknown
}

export interface Message {
	id: string
	role: "user" | "assistant" | "system"
	content: MessageContent[]
	createdAt: string
	stopReason?: "complete" | "tool_use" | "aborted" | "error"
	errorMessage?: string
}

export interface ThreadInfo {
	id: string
	resourceId: string
	title?: string
	createdAt: string
	updatedAt: string
	tokenUsage?: TokenUsage
}
