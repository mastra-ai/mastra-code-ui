import { useState } from "react"
import Ansi from "ansi-to-react"

interface ToolExecutionProps {
	tool: {
		id: string
		name: string
		args: unknown
		result?: unknown
		isError?: boolean
		status: string
		shellOutput?: string
	}
}

function formatArgs(args: unknown): string {
	if (!args) return ""
	if (typeof args === "string") return args
	try {
		return JSON.stringify(args, null, 2)
	} catch {
		return String(args)
	}
}

function formatResult(result: unknown): string {
	if (result === undefined || result === null) return ""
	if (typeof result === "string") return result
	try {
		return JSON.stringify(result, null, 2)
	} catch {
		return String(result)
	}
}

const statusColors: Record<string, string> = {
	pending: "var(--tool-border-pending)",
	running: "var(--tool-border-pending)",
	complete: "var(--tool-border-success)",
	error: "var(--tool-border-error)",
}

const statusBgs: Record<string, string> = {
	pending: "var(--tool-pending-bg)",
	running: "var(--tool-pending-bg)",
	complete: "var(--tool-success-bg)",
	error: "var(--tool-error-bg)",
}

export function ToolExecution({ tool }: ToolExecutionProps) {
	const [expanded, setExpanded] = useState(false)
	const borderColor = statusColors[tool.status] ?? "var(--border)"
	const bgColor = statusBgs[tool.status] ?? "var(--bg-surface)"
	const resultText = formatResult(tool.result)

	// Friendly tool name display
	const displayName = tool.name.replace(/_/g, " ")

	// Extract brief summary for collapsed view
	let summary = ""
	if (tool.name === "execute_command" || tool.name === "shell") {
		const args = tool.args as { command?: string }
		summary = args?.command ?? ""
	} else if (tool.name === "view") {
		const args = tool.args as { path?: string; filePath?: string }
		summary = args?.path ?? args?.filePath ?? ""
	} else if (
		tool.name === "search_content" ||
		tool.name === "grep"
	) {
		const args = tool.args as { pattern?: string }
		summary = args?.pattern ?? ""
	} else if (
		tool.name === "find_files" ||
		tool.name === "glob"
	) {
		const args = tool.args as { pattern?: string }
		summary = args?.pattern ?? ""
	} else if (
		tool.name === "string_replace_lsp" ||
		tool.name === "write_file"
	) {
		const args = tool.args as { path?: string; filePath?: string }
		summary = args?.path ?? args?.filePath ?? ""
	}

	return (
		<div
			style={{
				margin: "6px 0",
				borderLeft: `2px solid ${borderColor}`,
				borderRadius: 4,
				background: bgColor,
				overflow: "hidden",
			}}
		>
			{/* Header */}
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

				<span
					style={{
						color: "var(--tool-title)",
						fontWeight: 500,
					}}
				>
					{displayName}
				</span>

				{summary && (
					<span
						style={{
							color: "var(--muted)",
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap",
							flex: 1,
						}}
					>
						{summary}
					</span>
				)}

				{/* Status indicator */}
				{tool.status === "running" && (
					<span
						style={{
							width: 6,
							height: 6,
							borderRadius: "50%",
							background: "var(--tool-border-pending)",
							animation: "pulse 1.5s ease-in-out infinite",
							flexShrink: 0,
						}}
					/>
				)}
				{tool.status === "complete" && (
					<span style={{ color: "var(--success)", fontSize: 11, flexShrink: 0 }}>
						&#10003;
					</span>
				)}
				{tool.status === "error" && (
					<span style={{ color: "var(--error)", fontSize: 11, flexShrink: 0 }}>
						&#10007;
					</span>
				)}
			</button>

			{/* Expanded content */}
			{expanded && (
				<div
					style={{
						padding: "0 10px 8px",
						fontSize: 12,
					}}
				>
					{/* Args */}
					<div style={{ marginBottom: 6 }}>
						<div
							style={{
								color: "var(--muted)",
								fontSize: 10,
								marginBottom: 2,
								textTransform: "uppercase",
							}}
						>
							Arguments
						</div>
						<pre
							style={{
								background: "var(--bg)",
								padding: 8,
								borderRadius: 4,
								color: "var(--tool-output)",
								fontSize: 11,
								overflow: "auto",
								maxHeight: 200,
								margin: 0,
								border: "1px solid var(--border-muted)",
							}}
						>
							{formatArgs(tool.args)}
						</pre>
					</div>

					{/* Shell output */}
					{tool.shellOutput && (
						<div style={{ marginBottom: 6 }}>
							<div
								style={{
									color: "var(--muted)",
									fontSize: 10,
									marginBottom: 2,
									textTransform: "uppercase",
								}}
							>
								Output
							</div>
							<pre
								style={{
									background: "#000",
									padding: 8,
									borderRadius: 4,
									color: "#e5e5e5",
									fontSize: 11,
									overflow: "auto",
									maxHeight: 300,
									margin: 0,
									border: "1px solid var(--border-muted)",
								}}
							>
								<Ansi>{tool.shellOutput}</Ansi>
							</pre>
						</div>
					)}

					{/* Result */}
					{resultText && (
						<div>
							<div
								style={{
									color: "var(--muted)",
									fontSize: 10,
									marginBottom: 2,
									textTransform: "uppercase",
								}}
							>
								Result
							</div>
							<pre
								style={{
									background: "var(--bg)",
									padding: 8,
									borderRadius: 4,
									color: tool.isError
										? "var(--error)"
										: "var(--tool-output)",
									fontSize: 11,
									overflow: "auto",
									maxHeight: 300,
									margin: 0,
									border: `1px solid ${tool.isError ? "var(--tool-border-error)" : "var(--border-muted)"}`,
								}}
							>
								{resultText}
							</pre>
						</div>
					)}
				</div>
			)}
		</div>
	)
}
