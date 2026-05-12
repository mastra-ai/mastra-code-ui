import { useState } from "react"
import Ansi from "ansi-to-react"
import { FileMentionChip, isFileToken } from "./FileMentionChip"
import { QuestionIcon } from "./Icons"
import type { ToolQuestionState } from "../types/chat"
import {
	formatQuestionAnswer,
	isRecord,
	normalizeAskUserQuestion,
	normalizeAskUserResult,
} from "../utils/askUser"

export interface ToolExecutionProps {
	tool: {
		id: string
		name: string
		args: unknown
		result?: unknown
		isError?: boolean
		status: string
		shellOutput?: string
		question?: ToolQuestionState
	}
	onFileClick?: (filePath: string) => void
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

function getAskUserQuestion(
	tool: ToolExecutionProps["tool"],
): ReturnType<typeof normalizeAskUserQuestion> {
	if (tool.question) {
		return normalizeAskUserQuestion(tool.question)
	}
	if (!isRecord(tool.args)) {
		return null
	}

	return normalizeAskUserQuestion(tool.args)
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
function getDiffCounts(
	args: unknown,
): { added: number; removed: number } | null {
	if (!args || typeof args !== "object") return null
	const a = args as Record<string, unknown>
	const oldStr = a.old_str as string | undefined
	const newStr = a.new_str as string | undefined
	if (oldStr == null && newStr == null) return null
	const oldLines = oldStr ? oldStr.split("\n").length : 0
	const newLines = newStr ? newStr.split("\n").length : 0
	return { added: newLines, removed: oldLines }
}

/** Check if a tool result contains a base64 image (Computer Use screenshot). */
function getImageData(result: unknown): string | null {
	if (!result || typeof result !== "object") return null
	const r = result as Record<string, unknown>
	if (r.type === "image" && typeof r.data === "string") return r.data
	if (Array.isArray(r.content)) {
		for (const item of r.content) {
			if (
				item &&
				typeof item === "object" &&
				(item as Record<string, unknown>).type === "image" &&
				typeof (item as Record<string, unknown>).data === "string"
			)
				return (item as Record<string, unknown>).data as string
		}
	}
	return null
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
		case "computer": {
			const action = args?.action as string | undefined
			return {
				icon: "\u{1F5A5}\uFE0F",
				label: "Computer Use",
				pill: action ?? null,
			}
		}
		case "navigate_browser":
		case "navigate-browser": {
			const navUrl = args?.url as string | undefined
			return {
				icon: "\u{1F310}",
				label: "Navigate browser",
				pill: navUrl
					? navUrl.length > 60
						? navUrl.slice(0, 57) + "\u2026"
						: navUrl
					: null,
			}
		}
		case "web_fetch": {
			const fetchUrl = args?.url as string | undefined
			return {
				icon: "\u{1F310}",
				label: "Web fetch",
				pill: fetchUrl
					? fetchUrl.length > 60
						? fetchUrl.slice(0, 57) + "\u2026"
						: fetchUrl
					: null,
			}
		}
		case "code_execution": {
			return {
				icon: "\u{1F4BB}",
				label: "Code execution",
				pill: null,
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
		case "task_write":
			return { icon: "\u{1F4CB}", label: "Update tasks", pill: null }
		case "task_check":
			return { icon: "\u2611\uFE0F", label: "Check tasks", pill: null }
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

function AskUserToolExecution({ tool }: { tool: ToolExecutionProps["tool"] }) {
	const question = getAskUserQuestion(tool)
	const normalizedResult = normalizeAskUserResult(tool.result, tool.isError)
	const submittedAnswer = formatQuestionAnswer(tool.question?.answer)
	const answer = normalizedResult.answer ?? submittedAnswer
	const headline = question?.question || "Asking question"
	const isError = tool.status === "error" || normalizedResult.isError
	const isPreparingQuestion =
		tool.status === "running" && tool.question?.responseEnabled === false
	const isAnswered =
		tool.status === "complete" &&
		!isError &&
		!normalizedResult.skipped &&
		answer
	const isSubmitting =
		tool.status === "running" &&
		tool.question?.responseStatus === "submitted" &&
		submittedAnswer
	const isWaiting =
		tool.status === "running" && !isSubmitting && !isPreparingQuestion
	const isCompleteWithoutAnswer =
		tool.status === "complete" &&
		!isError &&
		(!answer || normalizedResult.skipped)
	const statusLabel = isAnswered
		? "Answered"
		: isPreparingQuestion
			? "Preparing question"
			: isSubmitting
				? "Submitting"
				: isError
					? normalizedResult.content || "Interrupted"
					: isCompleteWithoutAnswer
						? normalizedResult.skipped
							? "Skipped"
							: normalizedResult.content || "Completed"
						: isWaiting
							? "Waiting for response"
							: "Preparing question"
	const stateName = isAnswered
		? "answered"
		: isPreparingQuestion
			? "preparing"
			: isSubmitting
				? "submitting"
				: isError
					? "error"
					: isCompleteWithoutAnswer
						? "complete"
						: "waiting"

	if (isAnswered) {
		return (
			<div className="ask-user-tool-card" data-question-state={stateName}>
				<div className="ask-user-tool-card-header">
					<QuestionIcon className="ask-user-tool-icon" />
					<span>
						{question?.selectionMode === "multi_select" ? "Answers" : "Answer"}
					</span>
				</div>
				<div className="ask-user-tool-card-body">
					<div className="ask-user-tool-question">{headline}</div>
					<div className="ask-user-tool-answer">{answer}</div>
				</div>
			</div>
		)
	}

	return (
		<div className="ask-user-tool-row" data-question-state={stateName}>
			<QuestionIcon className="ask-user-tool-icon" />
			<span className="ask-user-tool-label">{headline}</span>
			<span className="ask-user-tool-separator">•</span>
			<span
				className={
					isError ? "ask-user-tool-status error" : "ask-user-tool-status"
				}
			>
				{statusLabel}
			</span>
		</div>
	)
}

export function ToolExecution({ tool, onFileClick }: ToolExecutionProps) {
	const [expanded, setExpanded] = useState(false)

	if (tool.name === "ask_user") {
		return (
			<div style={{ margin: "2px 0" }}>
				<AskUserToolExecution tool={tool} />
			</div>
		)
	}

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
				<span
					style={{
						fontSize: 14,
						flexShrink: 0,
						width: 20,
						textAlign: "center",
					}}
				>
					{display.icon}
				</span>

				{/* Label */}
				<span style={{ color: "var(--muted)", fontWeight: 500 }}>
					{display.label}
				</span>

				{/* Pill badge (file path, command, pattern) */}
				{display.pill &&
					(isFileToken(display.pill) ? (
						<FileMentionChip
							path={display.pill}
							variant="message"
							onOpen={onFileClick}
						/>
					) : (
						<span
							style={{
								background: "var(--bg-surface)",
								padding: "1px 8px",
								borderRadius: 4,
								fontFamily:
									"var(--font-mono, 'SF Mono', Monaco, 'Cascadia Code', monospace)",
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
					))}

				{/* Diff counts */}
				{display.diffCounts && (
					<span
						style={{ display: "flex", gap: 4, fontSize: 12, flexShrink: 0 }}
					>
						<span style={{ color: "var(--terminal-green)" }}>
							+{display.diffCounts.added}
						</span>
						<span style={{ color: "var(--color-red)" }}>
							-{display.diffCounts.removed}
						</span>
					</span>
				)}

				{/* Screenshot thumbnail for computer tool */}
				{tool.name === "computer" &&
					tool.status === "complete" &&
					getImageData(tool.result) && (
						<img
							src={`data:image/jpeg;base64,${getImageData(tool.result)}`}
							style={{
								width: 48,
								height: 30,
								objectFit: "cover",
								borderRadius: 3,
								border: "1px solid var(--border-muted)",
								flexShrink: 0,
							}}
							alt=""
						/>
					)}

				{/* Status indicator */}
				<span
					style={{
						marginLeft: "auto",
						flexShrink: 0,
						display: "flex",
						alignItems: "center",
					}}
				>
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
						<span style={{ color: "var(--success)", fontSize: 11 }}>
							&#10003;
						</span>
					)}
					{tool.status === "error" && (
						<span style={{ color: "var(--error)", fontSize: 11 }}>
							&#10007;
						</span>
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
									background: "var(--color-black)",
									padding: 8,
									borderRadius: 4,
									color: "var(--color-text-soft)",
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

					{/* Screenshot image result */}
					{getImageData(tool.result) && (
						<div style={{ marginBottom: 6 }}>
							<div
								style={{
									color: "var(--muted)",
									fontSize: 10,
									marginBottom: 2,
									textTransform: "uppercase",
								}}
							>
								Screenshot
							</div>
							<img
								src={`data:image/jpeg;base64,${getImageData(tool.result)}`}
								style={{
									maxWidth: "100%",
									maxHeight: 400,
									borderRadius: 4,
									border: "1px solid var(--border-muted)",
								}}
								alt="Browser screenshot"
							/>
						</div>
					)}

					{/* Result */}
					{resultText && !getImageData(tool.result) && (
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
									color: tool.isError ? "var(--error)" : "var(--tool-output)",
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
