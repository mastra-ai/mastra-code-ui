import { useState } from "react"

interface SubagentExecutionProps {
	subagent: {
		toolCallId: string
		agentType: string
		task: string
		tools: Array<{
			name: string
			args: unknown
			result?: unknown
			isError?: boolean
			status: string
		}>
		result?: string
		isError?: boolean
		durationMs?: number
		status: string
	}
}

const agentColors: Record<string, string> = {
	explore: "#3b82f6",
	plan: "#8b5cf6",
	execute: "#10b981",
}

export function SubagentExecution({ subagent }: SubagentExecutionProps) {
	const [expanded, setExpanded] = useState(false)
	const color = agentColors[subagent.agentType] ?? "var(--accent)"
	const isDone = subagent.status === "complete"

	return (
		<div
			style={{
				margin: "6px 0",
				borderLeft: `2px solid ${color}`,
				borderRadius: 4,
				background: "var(--bg-surface)",
				overflow: "hidden",
			}}
		>
			<button
				onClick={() => setExpanded(!expanded)}
				style={{
					display: "flex",
					alignItems: "center",
					gap: 8,
					width: "100%",
					padding: "6px 10px",
					textAlign: "left",
					cursor: "pointer",
					fontSize: 12,
				}}
			>
				<span
					style={{
						transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
						transition: "transform 0.15s",
						display: "inline-block",
						fontSize: 10,
						color: "var(--muted)",
					}}
				>
					&#9654;
				</span>

				<span style={{ color, fontWeight: 500, textTransform: "capitalize" }}>
					{subagent.agentType}
				</span>

				<span
					style={{
						color: "var(--muted)",
						flex: 1,
						overflow: "hidden",
						textOverflow: "ellipsis",
						whiteSpace: "nowrap",
					}}
				>
					{subagent.task}
				</span>

				{!isDone && (
					<span style={{ color: "var(--muted)", fontSize: 11 }}>
						{subagent.tools.length} tool(s)
					</span>
				)}

				{isDone && subagent.durationMs && (
					<span style={{ color: "var(--dim)", fontSize: 11 }}>
						{(subagent.durationMs / 1000).toFixed(1)}s
					</span>
				)}

				{isDone && !subagent.isError && (
					<span style={{ color: "var(--success)", fontSize: 11 }}>&#10003;</span>
				)}
				{isDone && subagent.isError && (
					<span style={{ color: "var(--error)", fontSize: 11 }}>&#10007;</span>
				)}
				{!isDone && (
					<span
						style={{
							width: 6,
							height: 6,
							borderRadius: "50%",
							background: color,
							animation: "pulse 1.5s ease-in-out infinite",
							flexShrink: 0,
						}}
					/>
				)}
			</button>

			{expanded && (
				<div style={{ padding: "0 10px 8px", fontSize: 12 }}>
					{/* Sub-tool list */}
					{subagent.tools.map((t, i) => (
						<div
							key={i}
							style={{
								padding: "4px 0",
								display: "flex",
								gap: 6,
								alignItems: "center",
								borderBottom:
									i < subagent.tools.length - 1
										? "1px solid var(--border-muted)"
										: "none",
							}}
						>
							{t.status === "complete" && !t.isError && (
								<span style={{ color: "var(--success)", fontSize: 10 }}>
									&#10003;
								</span>
							)}
							{t.status === "complete" && t.isError && (
								<span style={{ color: "var(--error)", fontSize: 10 }}>
									&#10007;
								</span>
							)}
							{t.status === "running" && (
								<span
									style={{
										width: 5,
										height: 5,
										borderRadius: "50%",
										background: color,
										animation: "pulse 1.5s ease-in-out infinite",
									}}
								/>
							)}
							<span style={{ color: "var(--tool-title)" }}>
								{t.name.replace(/_/g, " ")}
							</span>
						</div>
					))}

					{/* Final result */}
					{subagent.result && (
						<div style={{ marginTop: 6 }}>
							<pre
								style={{
									background: "var(--bg)",
									padding: 8,
									borderRadius: 4,
									color: subagent.isError
										? "var(--error)"
										: "var(--tool-output)",
									fontSize: 11,
									overflow: "auto",
									maxHeight: 200,
									margin: 0,
									border: "1px solid var(--border-muted)",
									whiteSpace: "pre-wrap",
								}}
							>
								{subagent.result}
							</pre>
						</div>
					)}
				</div>
			)}
		</div>
	)
}
