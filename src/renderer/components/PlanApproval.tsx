import { useState } from "react"
import { Streamdown } from "streamdown"
import remarkGfm from "remark-gfm"
import remarkBreaks from "remark-breaks"
import { MermaidBlock } from "./MermaidBlock"
import { CodeBlock } from "./CodeBlock"

const planRemarkPlugins = [remarkGfm, remarkBreaks]

const reactNodeToString = (node: React.ReactNode): string => {
	if (typeof node === "string") return node
	if (typeof node === "number") return String(node)
	if (Array.isArray(node)) return node.map(reactNodeToString).join("")
	return ""
}

const planMarkdownComponents = {
	pre: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
	code: ({
		className,
		children,
		...props
	}: React.HTMLAttributes<HTMLElement>) => {
		const lang = /language-(\w+)/.exec(className || "")?.[1]
		const text = reactNodeToString(children).replace(/\n$/, "")
		if (lang === "mermaid") return <MermaidBlock code={text} />
		if (lang) return <CodeBlock code={text} language={lang} />
		return (
			<code className={className} {...props}>
				{children}
			</code>
		)
	},
}

function handlePlanMarkdownClick(e: React.MouseEvent<HTMLDivElement>) {
	const anchor = (e.target as HTMLElement).closest("a")
	if (anchor && anchor.href) {
		e.preventDefault()
		window.api.invoke({ type: "openExternal", url: anchor.href })
	}
}

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
					data-component="markdown"
					onClick={handlePlanMarkdownClick}
				>
					<Streamdown
						mode="static"
						remarkPlugins={planRemarkPlugins}
						components={planMarkdownComponents}
						controls={false}
					>
						{plan}
					</Streamdown>
				</div>

				<div style={{ flexShrink: 0 }}>
					<input
						value={feedback}
						onChange={(e) => setFeedback(e.target.value)}
						placeholder="Optional feedback"
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
