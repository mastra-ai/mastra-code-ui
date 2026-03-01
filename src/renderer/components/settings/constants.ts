export const notificationOptions: Array<{ value: string; label: string }> = [
	{ value: "off", label: "Off" },
	{ value: "bell", label: "Sound" },
	{ value: "system", label: "System" },
	{ value: "both", label: "Sound + System" },
]

export const thinkingOptions: Array<{ value: string; label: string }> = [
	{ value: "off", label: "Off" },
	{ value: "minimal", label: "Minimal" },
	{ value: "low", label: "Low" },
	{ value: "medium", label: "Medium" },
	{ value: "high", label: "High" },
]

export const policyOptions: Array<{ value: string; label: string }> = [
	{ value: "allow", label: "Allow" },
	{ value: "ask", label: "Ask" },
	{ value: "deny", label: "Deny" },
]

export const accountProviders = [
	{
		id: "anthropic",
		name: "Anthropic",
		description: "Claude models via subscription or API key",
		hasOAuth: true,
		apiKeyPlaceholder: "sk-ant-...",
	},
	{
		id: "openai-codex",
		name: "OpenAI",
		description: "GPT models via subscription or API key",
		hasOAuth: true,
		apiKeyPlaceholder: "sk-...",
	},
	{
		id: "google",
		name: "Google",
		description: "Gemini models via API key",
		hasOAuth: false,
		apiKeyPlaceholder: "AIza...",
	},
]
