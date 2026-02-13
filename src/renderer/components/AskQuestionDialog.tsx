import { useState, useEffect, useRef } from "react"

interface AskQuestionDialogProps {
	questionId: string
	question: string
	options?: Array<{ label: string; description?: string }>
	onRespond: (questionId: string, answer: string) => void
}

export function AskQuestionDialog({
	questionId,
	question,
	options,
	onRespond,
}: AskQuestionDialogProps) {
	const [freeText, setFreeText] = useState("")
	const inputRef = useRef<HTMLInputElement>(null)

	useEffect(() => {
		if (!options || options.length === 0) {
			inputRef.current?.focus()
		}
	}, [options])

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
						marginBottom: 12,
						color: "var(--text)",
					}}
				>
					{question}
				</div>

				{options && options.length > 0 ? (
					<div
						style={{
							display: "flex",
							flexDirection: "column",
							gap: 6,
						}}
					>
						{options.map((opt, i) => (
							<button
								key={i}
								onClick={() => onRespond(questionId, opt.label)}
								style={{
									padding: "8px 12px",
									background: "var(--bg-surface)",
									border: "1px solid var(--border)",
									borderRadius: 6,
									textAlign: "left",
									cursor: "pointer",
									color: "var(--text)",
									fontSize: 12,
								}}
							>
								<div style={{ fontWeight: 500 }}>{opt.label}</div>
								{opt.description && (
									<div
										style={{
											color: "var(--muted)",
											fontSize: 11,
											marginTop: 2,
										}}
									>
										{opt.description}
									</div>
								)}
							</button>
						))}
					</div>
				) : (
					<div style={{ display: "flex", gap: 8 }}>
						<input
							ref={inputRef}
							value={freeText}
							onChange={(e) => setFreeText(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && freeText.trim()) {
									onRespond(questionId, freeText.trim())
								}
							}}
							placeholder="Type your answer..."
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
								if (freeText.trim()) {
									onRespond(questionId, freeText.trim())
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
				)}
			</div>
		</div>
	)
}
