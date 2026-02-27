import { useState } from "react"

interface WelcomeScreenProps {
	onLogin: (providerId: string) => void
	onApiKey: (providerId: string, apiKey: string) => void
	onSkip: () => void
}

interface Provider {
	id: string
	name: string
	description: string
	models: string
	hasOAuth: boolean
	apiKeyPlaceholder: string
	apiKeyHint: string
}

const providers: Provider[] = [
	{
		id: "anthropic",
		name: "Anthropic",
		description: "Claude Pro / Max subscription or API key",
		models: "Claude Opus 4.6, Sonnet 4.5, Haiku",
		hasOAuth: true,
		apiKeyPlaceholder: "sk-ant-...",
		apiKeyHint: "console.anthropic.com",
	},
	{
		id: "openai-codex",
		name: "OpenAI",
		description: "ChatGPT Plus / Pro subscription or API key",
		models: "GPT-5.2 Codex, o3, o4-mini",
		hasOAuth: true,
		apiKeyPlaceholder: "sk-...",
		apiKeyHint: "platform.openai.com",
	},
	{
		id: "google",
		name: "Google",
		description: "Gemini API key",
		models: "Gemini 2.5 Flash, Gemini 2.5 Pro",
		hasOAuth: false,
		apiKeyPlaceholder: "AIza...",
		apiKeyHint: "aistudio.google.com",
	},
]

function ProviderCard({
	provider,
	onLogin,
	onApiKey,
}: {
	provider: Provider
	onLogin: (id: string) => void
	onApiKey: (id: string, key: string) => void
}) {
	const [showApiKey, setShowApiKey] = useState(false)
	const [apiKey, setApiKey] = useState("")
	const [submitting, setSubmitting] = useState(false)

	const handleSubmitKey = () => {
		if (!apiKey.trim()) return
		setSubmitting(true)
		onApiKey(provider.id, apiKey.trim())
	}

	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				background: "var(--bg-surface)",
				border: "1px solid var(--border)",
				borderRadius: 10,
				overflow: "hidden",
				transition: "border-color 0.15s",
			}}
		>
			{/* Provider info + action buttons */}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 12,
					padding: "14px 16px",
				}}
			>
				<div style={{ flex: 1, minWidth: 0 }}>
					<div
						style={{
							fontSize: 14,
							fontWeight: 600,
							color: "var(--text)",
						}}
					>
						{provider.name}
					</div>
					<div
						style={{
							fontSize: 11,
							color: "var(--muted)",
							marginTop: 2,
						}}
					>
						{provider.models}
					</div>
				</div>

				<div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
					{provider.hasOAuth && (
						<button
							onClick={() => onLogin(provider.id)}
							style={{
								padding: "6px 14px",
								background: "var(--accent)",
								color: "#fff",
								borderRadius: 6,
								cursor: "pointer",
								fontWeight: 500,
								fontSize: 12,
								border: "none",
							}}
						>
							Sign In
						</button>
					)}
					<button
						onClick={() => setShowApiKey((v) => !v)}
						style={{
							padding: "6px 14px",
							background: showApiKey ? "var(--bg-elevated)" : "transparent",
							color: "var(--muted)",
							borderRadius: 6,
							cursor: "pointer",
							fontWeight: 500,
							fontSize: 12,
							border: "1px solid var(--border)",
						}}
					>
						API Key
					</button>
				</div>
			</div>

			{/* API key entry (expandable) */}
			{showApiKey && (
				<div
					style={{
						padding: "0 16px 14px",
						display: "flex",
						gap: 8,
						alignItems: "center",
					}}
				>
					<input
						type="password"
						value={apiKey}
						onChange={(e) => setApiKey(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter" && apiKey.trim()) handleSubmitKey()
						}}
						placeholder={provider.apiKeyPlaceholder}
						autoFocus
						style={{
							flex: 1,
							padding: "7px 10px",
							background: "var(--bg-elevated)",
							border: "1px solid var(--border)",
							borderRadius: 6,
							color: "var(--text)",
							fontSize: 12,
							fontFamily: "inherit",
							outline: "none",
						}}
					/>
					<button
						onClick={handleSubmitKey}
						disabled={!apiKey.trim() || submitting}
						style={{
							padding: "7px 14px",
							background: apiKey.trim() ? "var(--accent)" : "var(--bg-elevated)",
							color: apiKey.trim() ? "#fff" : "var(--dim)",
							borderRadius: 6,
							cursor: apiKey.trim() ? "pointer" : "default",
							fontWeight: 500,
							fontSize: 12,
							border: "none",
							opacity: submitting ? 0.6 : 1,
						}}
					>
						{submitting ? "..." : "Connect"}
					</button>
				</div>
			)}
		</div>
	)
}

export function WelcomeScreen({ onLogin, onApiKey, onSkip }: WelcomeScreenProps) {
	return (
		<div
			style={{
				flex: 1,
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				justifyContent: "center",
				padding: 40,
				gap: 28,
			}}
		>
			<div style={{ textAlign: "center", maxWidth: 480 }}>
				<div
					style={{
						fontSize: 28,
						fontWeight: 700,
						color: "var(--text)",
						marginBottom: 8,
					}}
				>
					Mastra Code
				</div>
				<div
					style={{
						fontSize: 14,
						color: "var(--muted)",
						lineHeight: 1.6,
					}}
				>
					AI-powered coding assistant. Connect a provider to get started.
				</div>
			</div>

			<div
				style={{
					display: "flex",
					flexDirection: "column",
					gap: 10,
					width: "100%",
					maxWidth: 440,
				}}
			>
				{providers.map((p) => (
					<ProviderCard
						key={p.id}
						provider={p}
						onLogin={onLogin}
						onApiKey={onApiKey}
					/>
				))}
			</div>

			<button
				onClick={onSkip}
				style={{
					fontSize: 12,
					color: "var(--dim)",
					background: "transparent",
					border: "none",
					cursor: "pointer",
					padding: "8px 16px",
					borderRadius: 6,
				}}
				onMouseEnter={(e) => {
					e.currentTarget.style.color = "var(--muted)"
				}}
				onMouseLeave={(e) => {
					e.currentTarget.style.color = "var(--dim)"
				}}
			>
				Skip — use shared models without login
			</button>
		</div>
	)
}
