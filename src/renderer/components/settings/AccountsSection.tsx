import { useState } from "react"
import { SectionHeader } from "./shared"
import { accountProviders } from "./constants"

interface AccountsSectionProps {
	loggedInProviders?: Set<string>
	onLogin?: (providerId: string) => void
	onApiKey?: (providerId: string, apiKey: string) => void
	onLogout?: (providerId: string) => void
}

export function AccountsSection({
	loggedInProviders,
	onLogin,
	onApiKey,
	onLogout,
}: AccountsSectionProps) {
	const [apiKeyInputs, setApiKeyInputs] = useState<Record<string, string>>({})
	const [showApiKeyFor, setShowApiKeyFor] = useState<string | null>(null)

	return (
		<>
			<SectionHeader title="Connected Providers" />
			<div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "8px 0" }}>
				{accountProviders.map((p) => {
					const connected = loggedInProviders?.has(p.id) ?? false
					return (
						<div
							key={p.id}
							style={{
								display: "flex",
								flexDirection: "column",
								background: "var(--bg-surface)",
								border: `1px solid ${connected ? "var(--border)" : "var(--border-muted)"}`,
								borderRadius: 8,
								overflow: "hidden",
							}}
						>
							<div
								style={{
									display: "flex",
									alignItems: "center",
									gap: 10,
									padding: "12px 14px",
								}}
							>
								{/* Status dot */}
								<span
									style={{
										width: 7,
										height: 7,
										borderRadius: "50%",
										background: connected ? "#4ade80" : "var(--border)",
										flexShrink: 0,
									}}
								/>
								<div style={{ flex: 1, minWidth: 0 }}>
									<div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>
										{p.name}
									</div>
									<div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>
										{p.description}
									</div>
								</div>
								<div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
									{connected ? (
										<button
											onClick={() => onLogout?.(p.id)}
											style={{
												padding: "5px 12px",
												background: "transparent",
												color: "var(--muted)",
												borderRadius: 5,
												cursor: "pointer",
												fontSize: 11,
												border: "1px solid var(--border)",
											}}
										>
											Disconnect
										</button>
									) : (
										<>
											{p.hasOAuth && (
												<button
													onClick={() => onLogin?.(p.id)}
													style={{
														padding: "5px 12px",
														background: "var(--accent)",
														color: "#fff",
														borderRadius: 5,
														cursor: "pointer",
														fontWeight: 500,
														fontSize: 11,
														border: "none",
													}}
												>
													Sign In
												</button>
											)}
											<button
												onClick={() => setShowApiKeyFor(showApiKeyFor === p.id ? null : p.id)}
												style={{
													padding: "5px 12px",
													background: showApiKeyFor === p.id ? "var(--bg-elevated)" : "transparent",
													color: "var(--muted)",
													borderRadius: 5,
													cursor: "pointer",
													fontSize: 11,
													border: "1px solid var(--border)",
												}}
											>
												API Key
											</button>
										</>
									)}
								</div>
							</div>
							{showApiKeyFor === p.id && !connected && (
								<div style={{ padding: "0 14px 12px", display: "flex", gap: 6 }}>
									<input
										type="password"
										value={apiKeyInputs[p.id] ?? ""}
										onChange={(e) => setApiKeyInputs((prev) => ({ ...prev, [p.id]: e.target.value }))}
										onKeyDown={(e) => {
											if (e.key === "Enter" && (apiKeyInputs[p.id] ?? "").trim()) {
												onApiKey?.(p.id, apiKeyInputs[p.id].trim())
												setApiKeyInputs((prev) => ({ ...prev, [p.id]: "" }))
												setShowApiKeyFor(null)
											}
										}}
										placeholder={p.apiKeyPlaceholder}
										autoFocus
										style={{
											flex: 1,
											padding: "6px 10px",
											background: "var(--bg-elevated)",
											border: "1px solid var(--border)",
											borderRadius: 5,
											color: "var(--text)",
											fontSize: 12,
											fontFamily: "inherit",
											outline: "none",
										}}
									/>
									<button
										onClick={() => {
											const key = (apiKeyInputs[p.id] ?? "").trim()
											if (!key) return
											onApiKey?.(p.id, key)
											setApiKeyInputs((prev) => ({ ...prev, [p.id]: "" }))
											setShowApiKeyFor(null)
										}}
										disabled={!(apiKeyInputs[p.id] ?? "").trim()}
										style={{
											padding: "6px 12px",
											background: (apiKeyInputs[p.id] ?? "").trim() ? "var(--accent)" : "var(--bg-elevated)",
											color: (apiKeyInputs[p.id] ?? "").trim() ? "#fff" : "var(--dim)",
											borderRadius: 5,
											cursor: (apiKeyInputs[p.id] ?? "").trim() ? "pointer" : "default",
											fontWeight: 500,
											fontSize: 11,
											border: "none",
										}}
									>
										Connect
									</button>
								</div>
							)}
						</div>
					)
				})}
			</div>
			<div
				style={{
					fontSize: 11,
					color: "var(--dim)",
					padding: "12px 0",
					lineHeight: 1.5,
				}}
			>
				You can also set API keys via environment variables
				(ANTHROPIC_API_KEY, OPENAI_API_KEY) or sign in with
				OAuth for subscription-based access.
			</div>
		</>
	)
}
