/**
 * Enhanced tool execution component with better collapsible support.
 * This will replace the existing tool-execution.ts
 */

import * as os from "node:os"
import { Box, Container, Spacer, Text, type TUI } from "@mariozechner/pi-tui"
import { highlight } from "cli-highlight"
import { theme } from "../theme.js"
import { CollapsibleComponent, CollapsibleDiffViewer } from "./collapsible.js"
import type {
	IToolExecutionComponent,
	ToolResult,
} from "./tool-execution-interface.js"
import { ErrorDisplayComponent } from "./error-display.js"
import {
	ToolValidationErrorComponent,
	parseValidationErrors,
} from "./tool-validation-error.js"

export type { ToolResult }

export interface ToolExecutionOptions {
	showImages?: boolean
	autoCollapse?: boolean
	collapsedByDefault?: boolean
}

/**
 * Convert absolute path to tilde notation if it's in home directory
 */
function shortenPath(path: string): string {
	const home = os.homedir()
	if (path.startsWith(home)) {
		return `~${path.slice(home.length)}`
	}
	return path
}

/**
 * Extract the actual content from tool result text.
 */
function extractContent(text: string): { content: string; isError: boolean } {
	try {
		const parsed = JSON.parse(text)
		if (typeof parsed === "object" && parsed !== null) {
			if ("content" in parsed) {
				const content = parsed.content
				let contentStr: string

				if (typeof content === "string") {
					contentStr = content
				} else if (Array.isArray(content)) {
					contentStr = content
						.filter(
							(part: unknown) =>
								typeof part === "object" &&
								part !== null &&
								(part as Record<string, unknown>).type === "text",
						)
						.map(
							(part: unknown) => (part as Record<string, unknown>).text || "",
						)
						.join("")
				} else {
					contentStr = JSON.stringify(content, null, 2)
				}

				return {
					content: contentStr,
					isError: Boolean(parsed.isError),
				}
			}
			return { content: JSON.stringify(parsed, null, 2), isError: false }
		}
	} catch {
		// Not JSON, use as-is
	}
	return { content: text, isError: false }
}

/**
 * Enhanced tool execution component with collapsible sections
 */
export class ToolExecutionComponentEnhanced
	extends Container
	implements IToolExecutionComponent
{
	private contentBox: Box
	private toolName: string
	private args: unknown
	private expanded = false
	private isPartial = true
	private ui: TUI
	private result?: ToolResult
	private options: ToolExecutionOptions
	private collapsible?: CollapsibleComponent
	private startTime = Date.now()
	private streamingOutput = "" // Buffer for streaming shell output

	constructor(
		toolName: string,
		args: unknown,
		options: ToolExecutionOptions = {},
		ui: TUI,
	) {
		super()
		this.toolName = toolName
		this.args = args
		this.ui = ui
		this.options = {
			autoCollapse: true,
			collapsedByDefault: true,
			...options,
		}
		this.expanded = !this.options.collapsedByDefault

		this.addChild(new Spacer(1))

		// Content box with background
		this.contentBox = new Box(1, 1, (text: string) =>
			theme.bg("toolPendingBg", text),
		)
		this.addChild(this.contentBox)

		this.rebuild()
	}

	updateArgs(args: unknown): void {
		this.args = args
		this.rebuild()
	}

	updateResult(result: ToolResult, isPartial = false): void {
		this.result = result
		this.isPartial = isPartial
		// Keep streaming output for colored display in final result
		this.rebuild()
	}

	/**
	 * Append streaming shell output.
	 * Only for execute_command tool - shows live output while command runs.
	 */
	appendStreamingOutput(output: string): void {
		if (
			this.toolName !== "execute_command" &&
			this.toolName !== "mastra_workspace_execute_command"
		) {
			return
		}
		this.streamingOutput += output
		this.rebuild()
	}

	setExpanded(expanded: boolean): void {
		this.expanded = expanded
		if (this.collapsible) {
			this.collapsible.setExpanded(expanded)
			this.updateBgColor()
			super.invalidate()
			return
		}
		// No collapsible — need a full rebuild (e.g. write tool, header-only tools)
		this.rebuild()
	}

	toggleExpanded(): void {
		this.setExpanded(!this.expanded)
	}

	override invalidate(): void {
		super.invalidate()
		// invalidate is called by the layout system — only update bg, don't rebuild
		this.updateBgColor()
	}

	private updateBgColor(): void {
		// For shell and view commands, skip background - we use bordered box style instead
		const isShellCommand =
			this.toolName === "execute_command" ||
			this.toolName === "mastra_workspace_execute_command"
		const isViewCommand =
			this.toolName === "view" || this.toolName === "mastra_workspace_read_file"

		if (isShellCommand || isViewCommand) {
			// No background - let terminal colors show through
			this.contentBox.setBgFn((text: string) => text)
			return
		}

		const bgColor = this.isPartial
			? "toolPendingBg"
			: this.result?.isError
				? "toolErrorBg"
				: "toolSuccessBg"
		this.contentBox.setBgFn((text: string) => theme.bg(bgColor, text))
	}

	/**
	 * Full clear-and-rebuild. Called when:
	 * - args change (updateArgs)
	 * - result arrives or changes (updateResult)
	 * - expand/collapse on a tool with no collapsible child
	 * - initial construction
	 */
	private rebuild(): void {
		this.updateBgColor()
		this.contentBox.clear()
		this.collapsible = undefined

		switch (this.toolName) {
			case "view":
			case "mastra_workspace_read_file":
				this.renderViewToolEnhanced()
				break
			case "execute_command":
			case "mastra_workspace_execute_command":
				this.renderBashToolEnhanced()
				break
			case "string_replace_lsp":
			case "mastra_workspace_edit_file":
				this.renderEditToolEnhanced()
				break
			case "mastra_workspace_write_file":
				this.renderWriteToolEnhanced()
				break
			case "mastra_workspace_list_files":
				this.renderListFilesEnhanced()
				break
			default:
				this.renderGenericToolEnhanced()
		}
	}

	private renderViewToolEnhanced(): void {
		const argsObj = this.args as Record<string, unknown> | undefined
		const path = argsObj?.path ? shortenPath(String(argsObj.path)) : "..."
		const fullPath = argsObj?.path ? String(argsObj.path) : ""
		const viewRange = argsObj?.view_range as [number, number] | undefined
		const rangeDisplay = viewRange
			? theme.fg("muted", `:${viewRange[0]},${viewRange[1]}`)
			: ""
		const startLine = viewRange?.[0] ?? 1

		const border = (char: string) => theme.bold(theme.fg("accent", char))
		const status = this.getStatusIndicator()
		const footerText = `${theme.bold(theme.fg("toolTitle", "view"))} ${theme.fg("accent", path)}${rangeDisplay}${status}`

		// Empty line padding above
		this.contentBox.addChild(new Text("", 0, 0))

		// Top border
		this.contentBox.addChild(new Text(border("┌──"), 0, 0))

		if (!this.result || this.isPartial) {
			// Bottom border with info (no content yet)
			this.contentBox.addChild(new Text(`${border("└──")} ${footerText}`, 0, 0))
			return
		}

		// Syntax-highlighted content with left border, truncated to prevent soft wrap
		const output = this.getFormattedOutput()
		if (output) {
			const termWidth = process.stdout.columns || 80
			const maxLineWidth = termWidth - 6 // Account for border "│ " (2) + padding (2) + buffer (2)
			const highlighted = highlightCode(output, fullPath, startLine)
			const borderedLines = highlighted.split("\n").map((line) => {
				const truncated = truncateAnsi(line, maxLineWidth)
				return border("│") + " " + truncated
			})
			this.contentBox.addChild(new Text(borderedLines.join("\n"), 0, 0))
		}

		// Bottom border with tool info
		this.contentBox.addChild(new Text(`${border("└──")} ${footerText}`, 0, 0))
	}

	private renderBashToolEnhanced(): void {
		const argsObj = this.args as Record<string, unknown> | undefined
		const command = argsObj?.command ? String(argsObj.command) : "..."
		const timeout = argsObj?.timeout as number | undefined
		const cwd = argsObj?.cwd ? shortenPath(String(argsObj.cwd)) : ""

		const timeoutSuffix = timeout
			? theme.fg("muted", ` (timeout ${timeout}s)`)
			: ""
		const cwdSuffix = cwd ? theme.fg("muted", ` in ${cwd}`) : ""
		const timeSuffix = this.isPartial ? timeoutSuffix : this.getDurationSuffix()

		// Helper to render shell command with bordered box
		const renderBorderedShell = (status: string, outputLines: string[]) => {
			const border = (char: string) => theme.bold(theme.fg("accent", char))
			const footerText = `${theme.bold(theme.fg("toolTitle", "$"))} ${theme.fg("accent", command)}${cwdSuffix}${timeSuffix}${status}`

			// Top border
			this.contentBox.addChild(new Text(border("┌──"), 0, 0))

			// Output lines with left border (no truncation)
			const borderedLines = outputLines.map((line) => border("│") + " " + line)
			const displayOutput = borderedLines.join("\n")
			if (displayOutput.trim()) {
				this.contentBox.addChild(new Text(displayOutput, 0, 0))
			}

			// Bottom border with command info
			this.contentBox.addChild(new Text(`${border("└──")} ${footerText}`, 0, 0))
		}

		if (!this.result || this.isPartial) {
			const status = this.getStatusIndicator()
			let lines = this.streamingOutput ? this.streamingOutput.split("\n") : []
			// Remove leading empty lines during streaming
			while (lines.length > 0 && lines[0] === "") {
				lines.shift()
			}
			// Remove trailing empty lines during streaming (from trailing newline)
			while (lines.length > 0 && lines[lines.length - 1] === "") {
				lines.pop()
			}
			renderBorderedShell(status, lines)
			return
		}

		// For errors, use bordered box with error status
		if (this.result.isError) {
			const status = theme.fg("error", " ✗")
			const output = this.streamingOutput.trim() || this.getFormattedOutput()
			renderBorderedShell(status, output.split("\n"))
			return
		}

		// Also check if output contains common error patterns
		const outputText = this.getFormattedOutput()
		const looksLikeError = outputText.match(
			/Error:|TypeError:|SyntaxError:|ReferenceError:|command not found|fatal:|error:/i,
		)
		if (looksLikeError) {
			const status = theme.fg("error", " ✗")
			const output = this.streamingOutput.trim() || this.getFormattedOutput()
			renderBorderedShell(status, output.split("\n"))
			return
		}

		// Success - use bordered box with checkmark
		const status = theme.fg("success", " ✓")
		const output = this.streamingOutput.trim() || this.getFormattedOutput()
		let lines = output.split("\n")
		// Remove leading/trailing empty lines
		while (lines.length > 0 && lines[0] === "") {
			lines.shift()
		}
		while (lines.length > 0 && lines[lines.length - 1] === "") {
			lines.pop()
		}
		renderBorderedShell(status, lines)
	}

	private renderEditToolEnhanced(): void {
		const argsObj = this.args as Record<string, unknown> | undefined
		const path = argsObj?.path ? shortenPath(String(argsObj.path)) : "..."
		const line = argsObj?.start_line
			? theme.fg("muted", `:${String(argsObj.start_line)}`)
			: ""

		const status = this.getStatusIndicator()
		const header = `${theme.bold(theme.fg("toolTitle", "✏️ edit"))} ${theme.fg("accent", path)}${line}${status}`

		if (!this.result || this.isPartial) {
			this.contentBox.addChild(new Text(header, 0, 0))
			return
		}

		// For edits, show the diff
		if (argsObj?.old_str && argsObj?.new_str && !this.result.isError) {
			const editStatus = this.getStatusIndicator()
			this.collapsible = new CollapsibleDiffViewer(
				`${path}${line}${editStatus}`,
				String(argsObj.old_str),
				String(argsObj.new_str),
				{
					expanded: this.expanded,
					collapsedLines: 15,
				},
				this.ui,
			)
			this.contentBox.addChild(this.collapsible)
		} else {
			// Show error or generic output
			if (this.result.isError) {
				this.renderErrorResult(header)
			} else {
				this.contentBox.addChild(new Text(header, 0, 0))
			}
		}
	}

	private renderWriteToolEnhanced(): void {
		const argsObj = this.args as Record<string, unknown> | undefined
		const path = argsObj?.path ? shortenPath(String(argsObj.path)) : "..."

		const status = this.getStatusIndicator()
		const header = `${theme.bold(theme.fg("toolTitle", "💾 write"))} ${theme.fg("accent", path)}${status}`

		this.contentBox.addChild(new Text(header, 0, 0))

		if (this.result && !this.isPartial) {
			const output = this.getFormattedOutput()
			if (output && (this.result.isError || this.expanded)) {
				this.contentBox.addChild(new Text("", 0, 0))
				const color = this.result.isError ? "error" : "success"
				this.contentBox.addChild(new Text(theme.fg(color, output), 0, 0))
			}
		}
	}

	private renderListFilesEnhanced(): void {
		const argsObj = this.args as Record<string, unknown> | undefined
		const path = argsObj?.path ? shortenPath(String(argsObj.path)) : "/"

		if (!this.result || this.isPartial) {
			const status = this.getStatusIndicator()
			const header = `${theme.bold(theme.fg("toolTitle", "📁 list"))} ${theme.fg("accent", path)}${status}`
			this.contentBox.addChild(new Text(header, 0, 0))
			return
		}

		const output = this.getFormattedOutput()
		if (output) {
			const lines = output.split("\n")
			const fileCount = lines.filter(
				(l) =>
					l.trim() && !l.includes("└") && !l.includes("├") && !l.includes("│"),
			).length
			const listStatus = this.getStatusIndicator()

			this.collapsible = new CollapsibleComponent(
				{
					header: `${theme.bold(theme.fg("toolTitle", "📁 list"))} ${theme.fg("accent", path)}${listStatus}`,
					summary: `${fileCount} items`,
					expanded: this.expanded,
					collapsedLines: 15,
					expandedLines: 100,
					showLineCount: false,
				},
				this.ui,
			)

			this.collapsible.setContent(output)
			this.contentBox.addChild(this.collapsible)
		}
	}

	private renderGenericToolEnhanced(): void {
		const status = this.getStatusIndicator()

		let argsSummary = ""
		if (this.args && typeof this.args === "object") {
			const argsObj = this.args as Record<string, unknown>
			const keys = Object.keys(argsObj)
			if (keys.length > 0) {
				argsSummary = theme.fg("muted", ` (${keys.length} args)`)
			}
		}

		const header = `${theme.bold(theme.fg("toolTitle", this.toolName))}${argsSummary}${status}`

		if (!this.result || this.isPartial) {
			this.contentBox.addChild(new Text(header, 0, 0))
			return
		}

		// Use enhanced error display for errors
		if (this.result.isError) {
			this.renderErrorResult(header)
			return
		}

		const output = this.getFormattedOutput()
		if (output) {
			this.collapsible = new CollapsibleComponent(
				{
					header,
					expanded: this.expanded,
					collapsedLines: 10,
					expandedLines: 200,
					showLineCount: true,
				},
				this.ui,
			)

			this.collapsible.setContent(output)
			this.contentBox.addChild(this.collapsible)
		}
	}

	private getStatusIndicator(): string {
		return this.isPartial
			? theme.fg("muted", " ⋯")
			: this.result?.isError
				? theme.fg("error", " ✗")
				: theme.fg("success", " ✓")
	}

	private getDurationSuffix(): string {
		if (this.isPartial) return ""
		const ms = Date.now() - this.startTime
		if (ms < 1000) return theme.fg("muted", ` ${ms}ms`)
		return theme.fg("muted", ` ${(ms / 1000).toFixed(1)}s`)
	}

	private getFormattedOutput(): string {
		if (!this.result) return ""

		const textContent = this.result.content
			.filter((c) => c.type === "text" && c.text)
			.map((c) => c.text!)
			.join("\n")

		if (!textContent) return ""

		const { content } = extractContent(textContent)
		// Remove excessive blank lines while preserving intentional formatting
		return content.trim().replace(/\n\s*\n\s*\n/g, "\n\n")
	}

	/**
	 * Render an error result using the enhanced error display component
	 */
	private renderErrorResult(header: string): void {
		if (!this.result) return

		// First add the header
		this.contentBox.addChild(new Text(header, 0, 0))

		// Extract error text from result
		const errorText = this.result.content
			.filter((c) => c.type === "text" && c.text)
			.map((c) => c.text!)
			.join("\n")

		if (!errorText) return

		// Check if this is a validation error
		const isValidationError =
			errorText.toLowerCase().includes("validation") ||
			errorText.toLowerCase().includes("required parameter") ||
			errorText.toLowerCase().includes("missing required") ||
			errorText.match(/at "\w+"/i) || // Zod-style errors
			(errorText.includes("Expected") && errorText.includes("Received"))

		if (isValidationError) {
			// Use specialized validation error component
			const validationErrors = parseValidationErrors(errorText)
			const validationDisplay = new ToolValidationErrorComponent(
				{
					toolName: this.toolName,
					errors: validationErrors,
					args: this.args,
				},
				this.ui,
			)
			this.contentBox.addChild(validationDisplay)
			return
		}

		// Try to parse as an error object
		let error: Error | string = errorText
		try {
			const { content } = extractContent(errorText)
			error = content

			// Try to create an Error object with better structure
			const errorMatch = content.match(/^([A-Z][a-zA-Z]*Error):\s*(.+)$/m)
			if (errorMatch) {
				const err = new Error(errorMatch[2])
				err.name = errorMatch[1]
				// Try to extract stack trace
				const stackMatch = content.match(/\n\s+at\s+.+/g)
				if (stackMatch) {
					err.stack = `${err.name}: ${err.message}\n${stackMatch.join("\n")}`
				}
				error = err
			}
		} catch {
			// Keep as string
		}

		// Create error display component
		const errorDisplay = new ErrorDisplayComponent(
			error,
			{
				showStack: true,
				showContext: true,
				expanded: this.expanded,
			},
			this.ui,
		)

		this.contentBox.addChild(errorDisplay)
	}
}

/** Map file extensions to highlight.js language names */
function getLanguageFromPath(path: string): string | undefined {
	const ext = path.split(".").pop()?.toLowerCase()
	const langMap: Record<string, string> = {
		ts: "typescript",
		tsx: "typescript",
		js: "javascript",
		jsx: "javascript",
		mjs: "javascript",
		cjs: "javascript",
		json: "json",
		md: "markdown",
		py: "python",
		rb: "ruby",
		rs: "rust",
		go: "go",
		java: "java",
		kt: "kotlin",
		swift: "swift",
		c: "c",
		cpp: "cpp",
		h: "c",
		hpp: "cpp",
		cs: "csharp",
		php: "php",
		sh: "bash",
		bash: "bash",
		zsh: "bash",
		fish: "bash",
		yml: "yaml",
		yaml: "yaml",
		toml: "ini",
		ini: "ini",
		xml: "xml",
		html: "html",
		htm: "html",
		css: "css",
		scss: "scss",
		sass: "scss",
		less: "less",
		sql: "sql",
		graphql: "graphql",
		gql: "graphql",
		dockerfile: "dockerfile",
		makefile: "makefile",
		cmake: "cmake",
		vue: "vue",
		svelte: "xml",
	}
	return ext ? langMap[ext] : undefined
}

/** Strip cat -n formatting and apply syntax highlighting */
function highlightCode(
	content: string,
	path: string,
	startLine?: number,
): string {
	let lines = content.split("\n").map((line) => line.trimEnd())

	// Remove "Here's the result of running `cat -n`..." header if present
	if (lines.length > 0 && lines[0].includes("Here's the result of running")) {
		lines = lines.slice(1)
	}

	// Strip line numbers - we know they're sequential starting from startLine
	let expectedLineNum = startLine ?? 1
	const codeLines = lines.map((line) => {
		const numStr = String(expectedLineNum)
		// Line format is like "   123\tcode" or "   123" for blank lines
		// Check if line starts with spaces + our expected number
		const match = line.match(/^(\s*)(\d+)(\t?)(.*)$/)
		if (match && match[2] === numStr) {
			expectedLineNum++
			return match[4] // Return just the code part after the tab
		}
		return line
	})

	// Remove trailing empty lines
	while (codeLines.length > 0 && codeLines[codeLines.length - 1] === "") {
		codeLines.pop()
	}

	// Apply syntax highlighting
	try {
		return highlight(codeLines.join("\n"), {
			language: getLanguageFromPath(path),
			ignoreIllegals: true,
		})
	} catch {
		return codeLines.join("\n")
	}
}

/** Truncate a string with ANSI codes to a visible width */
function truncateAnsi(str: string, maxWidth: number): string {
	// eslint-disable-next-line no-control-regex
	const ansiRegex = /\x1b\[[0-9;]*m/g
	let visibleLength = 0
	let result = ""
	let lastIndex = 0
	let match: RegExpExecArray | null

	while ((match = ansiRegex.exec(str)) !== null) {
		// Add text before this ANSI code
		const textBefore = str.slice(lastIndex, match.index)
		const remaining = maxWidth - visibleLength
		if (textBefore.length <= remaining) {
			result += textBefore
			visibleLength += textBefore.length
		} else {
			result += textBefore.slice(0, remaining - 1) + "…"
			result += "\x1b[0m" // Reset to clean up any open styles
			return result
		}
		// Add the ANSI code (doesn't count toward visible length)
		result += match[0]
		lastIndex = match.index + match[0].length
	}

	// Add remaining text after last ANSI code
	const remaining = str.slice(lastIndex)
	const spaceLeft = maxWidth - visibleLength
	if (remaining.length <= spaceLeft) {
		result += remaining
	} else {
		result += remaining.slice(0, spaceLeft - 1) + "…"
		result += "\x1b[0m" // Reset
	}

	return result
}
