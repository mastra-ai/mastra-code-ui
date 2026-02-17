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

export function SubagentExecution({ subagent }: SubagentExecutionProps) {
	const [expanded, setExpanded] = useState(false)
	const isDone = subagent.status === "complete"

	return (
		<div style={{ margin: "2px 0" }}>
			{/* Compact header line */}
			<button
				onClick={() => setExpanded(!expanded)}
				style={{
					display: "flex",
					alignItems: "center",
					gap: 8,
					width: "100%",
					padding: "3px 0",
					textAlign: "left",
					cursor: "pointer",
					fontSize: 13,
					background: "none",
					border: "none",
					color: "inherit",
				}}
			>
				{/* Icon */}
				<span style={{ fontSize: 14, flexShrink: 0, width: 20, textAlign: "center" }}>
					&#x1F3D7;&#xFE0F;
				</span>

				{/* Label */}
				<span style={{ color: "var(--muted)", fontWeight: 500 }}>
					Agent
				</span>

				{/* Task description */}
				<span
					style={{
						color: "var(--muted)",
						flex: 1,
						overflow: "hidden",
						textOverflow: "ellipsis",
						whiteSpace: "nowrap",
						minWidth: 0,
					}}
				>
					{subagent.task}
				</span>

				{/* Duration */}
				{isDone && subagent.durationMs != null && (
					<span style={{ color: "var(--dim)", fontSize: 12, flexShrink: 0 }}>
						{(subagent.durationMs / 1000).toFixed(1)}s
					</span>
				)}

				{/* Status */}
				<span style={{ flexShrink: 0, display: "flex", alignItems: "center" }}>
					{isDone && !subagent.isError && (
						<span style={{ color: "var(--success)", fontSize: 11 }}>&#10003;</span>
					)}
					{isDone && subagent.isError && (
						<span style={{ color: "var(--error)", fontSize: 11 }}>&#10007;</span>
					)}
					{!isDone && (
						<span
							style={{
								width: 5,
								height: 5,
								borderRadius: "50%",
								background: "var(--accent)",
								animation: "pulse 1.5s ease-in-out infinite",
							}}
						/>
					)}
				</span>
			</button>

			{/* Expanded details */}
			{expanded && (
				<div style={{ paddingLeft: 28, paddingBottom: 8, fontSize: 12 }}>
					{/* Sub-tool list */}
					{subagent.tools.map((t, i) => (
						<div
							key={i}
							style={{
								padding: "3px 0",
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
										background: "var(--accent)",
										animation: "pulse 1.5s ease-in-out infinite",
									}}
								/>
							)}
							<span style={{ color: "var(--muted)" }}>
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
