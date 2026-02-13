import { useState } from "react"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"

interface PlanApprovalProps {
	planId: string
	title: string
	plan: string
	onRespond: (
		planId: string,
		response: { action: "approved" | "rejected"; feedback?: string },
	) => void
}

export function PlanApproval({
	planId,
	title,
	plan,
	onRespond,
}: PlanApprovalProps) {
	const [feedback, setFeedback] = useState("")

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
					maxWidth: 700,
					width: "90%",
					maxHeight: "85vh",
					display: "flex",
					flexDirection: "column",
				}}
			>
				<div
					style={{
						fontSize: 16,
						fontWeight: 600,
						marginBottom: 12,
						color: "var(--text)",
						flexShrink: 0,
					}}
				>
					{title}
				</div>

				<div
					style={{
						flex: 1,
						overflowY: "auto",
						marginBottom: 16,
						padding: "12px 16px",
						background: "var(--bg)",
						borderRadius: 8,
						border: "1px solid var(--border-muted)",
						fontSize: 13,
						lineHeight: 1.6,
					}}
					className="markdown-body"
				>
					<Markdown remarkPlugins={[remarkGfm]}>{plan}</Markdown>
				</div>

				<div style={{ flexShrink: 0 }}>
					<input
						value={feedback}
						onChange={(e) => setFeedback(e.target.value)}
						placeholder="Optional feedback..."
						style={{
							width: "100%",
							padding: "8px 12px",
							background: "var(--bg-surface)",
							border: "1px solid var(--border)",
							borderRadius: 6,
							color: "var(--text)",
							fontSize: 12,
							fontFamily: "inherit",
							outline: "none",
							marginBottom: 12,
						}}
					/>
					<div
						style={{
							display: "flex",
							gap: 8,
							justifyContent: "flex-end",
						}}
					>
						<button
							onClick={() =>
								onRespond(planId, {
									action: "rejected",
									feedback: feedback || undefined,
								})
							}
							style={{
								padding: "8px 20px",
								background: "var(--bg-surface)",
								color: "var(--muted)",
								borderRadius: 6,
								border: "1px solid var(--border)",
								cursor: "pointer",
								fontSize: 12,
							}}
						>
							Reject
						</button>
						<button
							onClick={() =>
								onRespond(planId, {
									action: "approved",
									feedback: feedback || undefined,
								})
							}
							style={{
								padding: "8px 20px",
								background: "var(--success)",
								color: "#fff",
								borderRadius: 6,
								cursor: "pointer",
								fontWeight: 500,
								fontSize: 12,
							}}
						>
							Approve
						</button>
					</div>
				</div>
			</div>
		</div>
	)
}
