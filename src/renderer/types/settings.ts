export type NotificationMode = "off" | "bell" | "system" | "both"
export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high"

export interface SettingsState {
	notifications: NotificationMode
	yolo: boolean
	smartEditing: boolean
	thinkingLevel: ThinkingLevel
	observerModelId: string
	reflectorModelId: string
	observationThreshold: number
	reflectionThreshold: number
	prInstructions: string
	defaultClonePath: string
}

export interface PermissionCategory {
	label: string
	description: string
}

export interface PermissionData {
	rules: {
		categories: Record<string, string>
		tools: Record<string, string>
	}
	sessionGrants: string[]
	categories: Record<string, PermissionCategory>
}

export interface McpServerStatus {
	name: string
	connected: boolean
	toolCount: number
	toolNames: string[]
	error?: string
}

export interface SettingsProps {
	onClose?: () => void
	loggedInProviders?: Set<string>
	onLogin?: (providerId: string) => void
	onApiKey?: (providerId: string, apiKey: string) => void
	onLogout?: (providerId: string) => void
	initialSection?: string
	onSectionChange?: (section: string) => void
}
