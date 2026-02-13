import { useState, useEffect, useRef } from "react"

interface LoginDialogProps {
	providerId: string
	stage: "auth" | "prompt" | "progress" | "success" | "error"
	url?: string
	instructions?: string
	promptMessage?: string
	promptPlaceholder?: string
	progressMessage?: string
	errorMessage?: string
	onSubmitCode: (code: string) => void
	onCancel: () => void
	onClose: () => void
}

export function LoginDialog({
	providerId,
	stage,
	url,
	instructions,
	promptMessage,
	promptPlaceholder,
	progressMessage,
	errorMessage,
	onSubmitCode,
	onCancel,
	onClose,
}: LoginDialogProps) {
	const [code, setCode] = useState("")
	const inputRef = useRef<HTMLInputElement>(null)

	useEffect(() => {
		if (stage === "prompt") {
			inputRef.current?.focus()
		}
	}, [stage])

	useEffect(() => {
		const handleKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				if (stage === "prompt") {
					onCancel()
				} else {
					onClose()
				}
			}
		}
		window.addEventListener("keydown", handleKey)
		return () => window.removeEventListener("keydown", handleKey)
	}, [stage, onCancel, onClose])

	const providerName =
		providerId === "anthropic"
			? "Anthropic (Claude Pro/Max)"
			: providerId === "openai-codex"
				? "ChatGPT Plus/Pro (Codex)"
				: providerId

	return (
		<div
			style={{
				position: "fixed",
				inset: 0,
				background: "rgba(0, 0, 0, 0.6)",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				zIndex: 100,
			}}
		>
			<div
				style={{
					background: "var(--bg-elevated)",
					border: "1px solid var(--border)",
					borderRadius: 12,
					padding: 24,
					maxWidth: 500,
					width: "90%",
				}}
			>
				<div
					style={{
						fontSize: 14,
						fontWeight: 600,
						marginBottom: 16,
						color: "var(--text)",
					}}
				>
					Login to {providerName}
				</div>

				{/* Auth stage — browser opened, waiting */}
				{stage === "auth" && (
					<div>
						<div
							style={{
								color: "var(--muted)",
								fontSize: 12,
								marginBottom: 12,
								lineHeight: 1.6,
							}}
						>
							{instructions ||
								"A browser window has been opened. Please complete the authorization flow there."}
						</div>
						{url && (
							<div
								style={{
									fontSize: 11,
									color: "var(--dim)",
									wordBreak: "break-all",
									marginBottom: 12,
								}}
							>
								If the browser didn't open, visit:{" "}
								<a
									href={url}
									style={{ color: "var(--accent)" }}
									onClick={(e) => {
										e.preventDefault()
										window.api.invoke({
											type: "openExternal",
											url,
										})
									}}
								>
									{url.length > 80 ? url.slice(0, 80) + "..." : url}
								</a>
							</div>
						)}
						<div
							style={{
								display: "flex",
								alignItems: "center",
								gap: 8,
								color: "var(--accent)",
								fontSize: 12,
							}}
						>
							<span
								style={{
									width: 6,
									height: 6,
									borderRadius: "50%",
									background: "var(--accent)",
									animation: "pulse 1.5s ease-in-out infinite",
								}}
							/>
							Waiting for authorization...
						</div>
					</div>
				)}

				{/* Prompt stage — user needs to paste code */}
				{stage === "prompt" && (
					<div>
						<div
							style={{
								color: "var(--text)",
								fontSize: 12,
								marginBottom: 8,
							}}
						>
							{promptMessage || "Paste the authorization code:"}
						</div>
						<div style={{ display: "flex", gap: 8 }}>
							<input
								ref={inputRef}
								value={code}
								onChange={(e) => setCode(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter" && code.trim()) {
										onSubmitCode(code.trim())
										setCode("")
									}
								}}
								placeholder={promptPlaceholder || "Paste code here..."}
								style={{
									flex: 1,
									padding: "8px 12px",
									background: "var(--bg-surface)",
									border: "1px solid var(--border)",
									borderRadius: 6,
									color: "var(--text)",
									fontSize: 13,
									fontFamily: "inherit",
									outline: "none",
								}}
							/>
							<button
								onClick={() => {
									if (code.trim()) {
										onSubmitCode(code.trim())
										setCode("")
									}
								}}
								style={{
									padding: "8px 16px",
									background: "var(--accent)",
									color: "#fff",
									borderRadius: 6,
									cursor: "pointer",
									fontWeight: 500,
									fontSize: 12,
								}}
							>
								Submit
							</button>
						</div>
					</div>
				)}

				{/* Progress stage */}
				{stage === "progress" && (
					<div
						style={{
							display: "flex",
							alignItems: "center",
							gap: 8,
							color: "var(--muted)",
							fontSize: 12,
						}}
					>
						<span
							style={{
								width: 6,
								height: 6,
								borderRadius: "50%",
								background: "var(--accent)",
								animation: "pulse 1.5s ease-in-out infinite",
							}}
						/>
						{progressMessage || "Processing..."}
					</div>
				)}

				{/* Success stage */}
				{stage === "success" && (
					<div>
						<div
							style={{
								color: "var(--success)",
								fontSize: 13,
								marginBottom: 12,
							}}
						>
							Successfully logged in!
						</div>
						<button
							onClick={onClose}
							style={{
								padding: "6px 16px",
								background: "var(--accent)",
								color: "#fff",
								borderRadius: 6,
								cursor: "pointer",
								fontWeight: 500,
								fontSize: 12,
							}}
						>
							Close
						</button>
					</div>
				)}

				{/* Error stage */}
				{stage === "error" && (
					<div>
						<div
							style={{
								color: "var(--error)",
								fontSize: 13,
								marginBottom: 12,
							}}
						>
							{errorMessage || "Login failed"}
						</div>
						<button
							onClick={onClose}
							style={{
								padding: "6px 16px",
								background: "var(--bg-surface)",
								color: "var(--muted)",
								borderRadius: 6,
								border: "1px solid var(--border)",
								cursor: "pointer",
								fontSize: 12,
							}}
						>
							Close
						</button>
					</div>
				)}

				{/* Cancel button (always available except success) */}
				{stage !== "success" && stage !== "error" && (
					<div style={{ marginTop: 16, textAlign: "right" }}>
						<button
							onClick={() => {
								onCancel()
								onClose()
							}}
							style={{
								padding: "6px 16px",
								background: "var(--bg-surface)",
								color: "var(--muted)",
								borderRadius: 6,
								border: "1px solid var(--border)",
								cursor: "pointer",
								fontSize: 12,
							}}
						>
							Cancel (Esc)
						</button>
					</div>
				)}

				<style>{`
					@keyframes pulse {
						0%, 100% { opacity: 0.3; }
						50% { opacity: 1; }
					}
				`}</style>
			</div>
		</div>
	)
}
