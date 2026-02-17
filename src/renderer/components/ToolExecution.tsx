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

// Extract file path from various arg shapes
function getFilePath(args: unknown): string | null {
	if (!args || typeof args !== "object") return null
	const a = args as Record<string, unknown>
	return (a.file_path ?? a.filePath ?? a.path ?? null) as string | null
}

// Get display-friendly short path (last 2 segments)
function getShortPath(fullPath: string): string {
	const parts = fullPath.replace(/\\/g, "/").split("/")
	if (parts.length <= 2) return fullPath
	return parts.slice(-2).join("/")
}

// Count lines in result content
function countResultLines(result: unknown): number | null {
	if (!result) return null
	let text: string | null = null
	if (typeof result === "string") {
		text = result
	} else if (typeof result === "object" && result !== null) {
		const r = result as Record<string, unknown>
		if (typeof r.content === "string") text = r.content
		else if (typeof r.output === "string") text = r.output
	}
	if (!text) return null
	return text.split("\n").length
}

// Get diff counts for edit tools
function getDiffCounts(args: unknown): { added: number; removed: number } | null {
	if (!args || typeof args !== "object") return null
	const a = args as Record<string, unknown>
	const oldStr = a.old_str as string | undefined
	const newStr = a.new_str as string | undefined
	if (oldStr == null && newStr == null) return null
	const oldLines = oldStr ? oldStr.split("\n").length : 0
	const newLines = newStr ? newStr.split("\n").length : 0
	return { added: newLines, removed: oldLines }
}

type ToolDisplay = {
	icon: string
	label: string
	pill: string | null
	diffCounts?: { added: number; removed: number } | null
}

function getToolDisplay(tool: ToolExecutionProps["tool"]): ToolDisplay {
	const args = tool.args as Record<string, unknown> | null
	const filePath = getFilePath(tool.args)
	const shortPath = filePath ? getShortPath(filePath) : null

	switch (tool.name) {
		case "view": {
			const lines = countResultLines(tool.result)
			return {
				icon: "\u{1F4C4}",
				label: lines != null ? `Read ${lines} lines` : "Read",
				pill: shortPath,
			}
		}
		case "string_replace_lsp":
		case "ast_smart_edit": {
			const diff = getDiffCounts(tool.args)
			return {
				icon: "\u269B\uFE0F",
				label: shortPath ?? "Edit",
				pill: null,
				diffCounts: diff,
			}
		}
		case "write_file": {
			const content = args?.content as string | undefined
			const lineCount = content ? content.split("\n").length : null
			return {
				icon: "\u269B\uFE0F",
				label: shortPath ?? "Write",
				pill: lineCount != null ? `+${lineCount}` : null,
			}
		}
		case "execute_command":
		case "shell": {
			const cmd = args?.command as string | undefined
			const shortCmd = cmd
				? cmd.length > 80
					? cmd.slice(0, 77) + "\u2026"
					: cmd
				: null
			return {
				icon: "\u{1F4BB}",
				label: "Bash",
				pill: shortCmd,
			}
		}
		case "search_content":
		case "grep": {
			const pattern = args?.pattern as string | undefined
			return {
				icon: "\u{1F50D}",
				label: "Search",
				pill: pattern ?? null,
			}
		}
		case "find_files":
		case "glob": {
			const pattern = args?.pattern as string | undefined
			return {
				icon: "\u{1F4C1}",
				label: "Find files",
				pill: pattern ?? null,
			}
		}
		case "web_search": {
			const query = args?.query as string | undefined
			return {
				icon: "\u{1F310}",
				label: "Web search",
				pill: query ?? null,
			}
		}
		case "web_extract": {
			const url = args?.url as string | undefined
			return {
				icon: "\u{1F310}",
				label: "Web extract",
				pill: url
					? url.length > 60
						? url.slice(0, 57) + "\u2026"
						: url
					: null,
			}
		}
		case "subagent": {
			const subArgs = args as { task?: string; description?: string } | null
			const task = subArgs?.task ?? subArgs?.description ?? null
			return {
				icon: "\u{1F3D7}\uFE0F",
				label: "Agent",
				pill: task
					? task.length > 80
						? task.slice(0, 77) + "\u2026"
						: task
					: null,
			}
		}
		case "todo_write":
			return { icon: "\u{1F4CB}", label: "Update todos", pill: null }
		case "todo_check":
			return { icon: "\u2611\uFE0F", label: "Check todo", pill: null }
		case "ask_user":
			return { icon: "\u2753", label: "Ask user", pill: null }
		case "submit_plan":
			return { icon: "\u{1F4D0}", label: "Submit plan", pill: null }
		case "request_sandbox_access":
			return { icon: "\u{1F512}", label: "Request access", pill: null }
		default: {
			// MCP tools: mcp__server__toolname
			if (tool.name.startsWith("mcp__")) {
				const parts = tool.name.split("__")
				const server = parts[1] ?? ""
				const toolName = parts.slice(2).join(" ")
				return {
					icon: "\u{1F50C}",
					label: `${server}: ${toolName}`,
					pill: null,
				}
			}
			return {
				icon: "\u2699\uFE0F",
				label: tool.name.replace(/_/g, " "),
				pill: null,
			}
		}
	}
}

export function ToolExecution({ tool }: ToolExecutionProps) {
	const [expanded, setExpanded] = useState(false)
	const display = getToolDisplay(tool)
	const resultText = formatResult(tool.result)

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
					{display.icon}
				</span>

				{/* Label */}
				<span style={{ color: "var(--muted)", fontWeight: 500 }}>
					{display.label}
				</span>

				{/* Pill badge (file path, command, pattern) */}
				{display.pill && (
					<span
						style={{
							background: "var(--bg-surface)",
							padding: "1px 8px",
							borderRadius: 4,
							fontFamily: "var(--font-mono, 'SF Mono', Monaco, 'Cascadia Code', monospace)",
							fontSize: 12,
							color: "var(--tool-output)",
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap",
							maxWidth: 400,
						}}
					>
						{display.pill}
					</span>
				)}

				{/* Diff counts */}
				{display.diffCounts && (
					<span style={{ display: "flex", gap: 4, fontSize: 12, flexShrink: 0 }}>
						<span style={{ color: "#22c55e" }}>+{display.diffCounts.added}</span>
						<span style={{ color: "#ef4444" }}>-{display.diffCounts.removed}</span>
					</span>
				)}

				{/* Status indicator */}
				<span style={{ marginLeft: "auto", flexShrink: 0, display: "flex", alignItems: "center" }}>
					{tool.status === "running" && (
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
					{tool.status === "complete" && !tool.isError && (
						<span style={{ color: "var(--success)", fontSize: 11 }}>&#10003;</span>
					)}
					{tool.status === "error" && (
						<span style={{ color: "var(--error)", fontSize: 11 }}>&#10007;</span>
					)}
				</span>
			</button>

			{/* Expanded details */}
			{expanded && (
				<div
					style={{
						paddingLeft: 28,
						paddingBottom: 8,
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
