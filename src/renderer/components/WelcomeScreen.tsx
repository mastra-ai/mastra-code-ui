interface WelcomeScreenProps {
	onLogin: (providerId: string) => void
}

const providers = [
	{
		id: "anthropic",
		name: "Anthropic",
		description: "Claude Pro / Max subscription",
		models: "Claude Opus 4.6, Sonnet 4.5, Haiku",
	},
	{
		id: "openai-codex",
		name: "OpenAI",
		description: "ChatGPT Plus / Pro subscription",
		models: "GPT-5.2 Codex, o3, o4-mini",
	},
]

export function WelcomeScreen({ onLogin }: WelcomeScreenProps) {
	return (
		<div
			style={{
				flex: 1,
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				justifyContent: "center",
				padding: 40,
				gap: 32,
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
					AI-powered coding assistant. Sign in with a provider to get
					started.
				</div>
			</div>

			<div
				style={{
					display: "flex",
					flexDirection: "column",
					gap: 12,
					width: "100%",
					maxWidth: 400,
				}}
			>
				{providers.map((p) => (
					<button
						key={p.id}
						onClick={() => onLogin(p.id)}
						style={{
							display: "flex",
							flexDirection: "column",
							gap: 4,
							padding: "16px 20px",
							background: "var(--bg-surface)",
							border: "1px solid var(--border)",
							borderRadius: 10,
							cursor: "pointer",
							textAlign: "left",
							transition: "border-color 0.15s, background 0.15s",
						}}
						onMouseEnter={(e) => {
							e.currentTarget.style.borderColor = "var(--accent)"
							e.currentTarget.style.background =
								"var(--bg-elevated)"
						}}
						onMouseLeave={(e) => {
							e.currentTarget.style.borderColor = "var(--border)"
							e.currentTarget.style.background =
								"var(--bg-surface)"
						}}
					>
						<div
							style={{
								fontSize: 15,
								fontWeight: 600,
								color: "var(--text)",
							}}
						>
							{p.name}
						</div>
						<div
							style={{
								fontSize: 12,
								color: "var(--muted)",
							}}
						>
							{p.description}
						</div>
						<div
							style={{
								fontSize: 11,
								color: "var(--dim)",
								marginTop: 2,
							}}
						>
							{p.models}
						</div>
					</button>
				))}
			</div>

			<div
				style={{
					fontSize: 11,
					color: "var(--dim)",
					textAlign: "center",
					lineHeight: 1.6,
					maxWidth: 360,
				}}
			>
				You can also set API keys via environment variables
				(ANTHROPIC_API_KEY, OPENAI_API_KEY) to skip OAuth login.
			</div>
		</div>
	)
}
