/**
 * Subagent execution rendering component.
 * Shows real-time activity from a delegated subagent task using
 * the same bordered box style as shell/view tools:
 *  - Top border
 *  - Task description (always visible)
 *  - Streaming tool call activity (capped rolling window)
 *  - Bottom border with agent type, model, status, duration
 */

import { Container, Spacer, Text, type TUI } from "@mariozechner/pi-tui"
import { theme } from "../theme.js"
import type { IToolExecutionComponent } from "./tool-execution-interface.js"

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SubagentToolCall {
	name: string
	args: unknown
	result?: string
	isError?: boolean
	done: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

const MAX_ACTIVITY_LINES = 10

export class SubagentExecutionComponent
	extends Container
	implements IToolExecutionComponent
{
	private ui: TUI

	// State
	private agentType: string
	private task: string
	private modelId?: string
	private toolCalls: SubagentToolCall[] = []
	private done = false
	private isError = false
	private startTime = Date.now()
	private durationMs = 0
	private finalResult?: string

	constructor(agentType: string, task: string, ui: TUI, modelId?: string) {
		super()
		this.agentType = agentType
		this.task = task
		this.modelId = modelId
		this.ui = ui

		this.rebuild()
	}

	// ── Mutation API ──────────────────────────────────────────────────────

	addToolStart(name: string, args: unknown): void {
		this.toolCalls.push({ name, args, done: false })
		this.rebuild()
	}

	addToolEnd(name: string, result: unknown, isError: boolean): void {
		for (let i = this.toolCalls.length - 1; i >= 0; i--) {
			if (this.toolCalls[i].name === name && !this.toolCalls[i].done) {
				this.toolCalls[i].done = true
				this.toolCalls[i].isError = isError
				this.toolCalls[i].result =
					typeof result === "string" ? result : JSON.stringify(result ?? "")
				break
			}
		}
		this.rebuild()
	}

	finish(isError: boolean, durationMs: number, result?: string): void {
		this.done = true
		this.isError = isError
		this.durationMs = durationMs
		this.finalResult = result
		this.rebuild()
	}

	setExpanded(_expanded: boolean): void {
		// No-op — bordered style doesn't use collapsible
	}

	toggleExpanded(): void {
		// No-op
	}

	// IToolExecutionComponent interface methods
	updateArgs(_args: unknown): void {}
	updateResult(_result: unknown, _isPartial: boolean): void {}

	// ── Rendering ──────────────────────────────────────────────────────────

	private rebuild(): void {
		this.clear()
		this.addChild(new Spacer(1))

		const border = (char: string) => theme.bold(theme.fg("accent", char))
		const termWidth = process.stdout.columns || 80
		const maxLineWidth = termWidth - 6

		// ── Top border ──
		this.addChild(new Text(border("┌──"), 0, 0))

		// ── Task description (always shown) ──
		const taskLines = this.task.split("\n")
		const wrappedTaskLines: string[] = []
		for (const line of taskLines) {
			if (line.length > maxLineWidth) {
				// Word-wrap long lines
				let remaining = line
				while (remaining.length > maxLineWidth) {
					const breakAt = remaining.lastIndexOf(" ", maxLineWidth)
					const splitAt = breakAt > 0 ? breakAt : maxLineWidth
					wrappedTaskLines.push(remaining.slice(0, splitAt))
					remaining = remaining.slice(splitAt).trimStart()
				}
				if (remaining) wrappedTaskLines.push(remaining)
			} else {
				wrappedTaskLines.push(line)
			}
		}
		const taskContent = wrappedTaskLines
			.map((line) => `${border("│")} ${theme.fg("muted", line)}`)
			.join("\n")
		this.addChild(new Text(taskContent, 0, 0))

		// ── Activity lines (tool calls — capped rolling window) ──
		if (this.toolCalls.length > 0) {
			// Separator between task and activity
			this.addChild(
				new Text(`${border("│")} ${theme.fg("muted", "───")}`, 0, 0),
			)

			const activityLines = this.toolCalls.map((tc) =>
				formatToolCallLine(tc, maxLineWidth),
			)

			// Cap to rolling window
			let displayLines = activityLines
			if (activityLines.length > MAX_ACTIVITY_LINES) {
				const hidden = activityLines.length - MAX_ACTIVITY_LINES
				displayLines = [
					theme.fg("muted", `  ... ${hidden} more above`),
					...activityLines.slice(-MAX_ACTIVITY_LINES),
				]
			}

			const activityContent = displayLines
				.map((line) => `${border("│")} ${line}`)
				.join("\n")
			this.addChild(new Text(activityContent, 0, 0))
		}

		// ── Final result (last 10 lines, shown after completion) ──
		if (this.done && this.finalResult) {
			this.addChild(
				new Text(`${border("│")} ${theme.fg("muted", "───")}`, 0, 0),
			)

			const resultLines = this.finalResult.split("\n")
			const maxResultLines = 10
			const truncated = resultLines.length > maxResultLines
			const displayLines = truncated
				? resultLines.slice(-maxResultLines)
				: resultLines

			if (truncated) {
				const hiddenLine = `${border("│")} ${theme.fg("muted", `  ... ${resultLines.length - maxResultLines} more lines above`)}`
				this.addChild(new Text(hiddenLine, 0, 0))
			}

			const resultContent = displayLines
				.map((line) => {
					const truncatedLine =
						line.length > maxLineWidth
							? line.slice(0, maxLineWidth - 1) + "…"
							: line
					return `${border("│")} ${truncatedLine}`
				})
				.join("\n")
			if (resultContent.trim()) {
				this.addChild(new Text(resultContent, 0, 0))
			}
		}

		// ── Bottom border with info ──
		const typeLabel = theme.bold(theme.fg("accent", this.agentType))
		const modelLabel = this.modelId ? theme.fg("muted", ` ${this.modelId}`) : ""
		const statusIcon = this.done
			? this.isError
				? theme.fg("error", " ✗")
				: theme.fg("success", " ✓")
			: theme.fg("muted", " ⋯")
		const durationStr = this.done
			? theme.fg("muted", ` ${formatDuration(this.durationMs)}`)
			: ""

		const footerText = `${theme.bold(theme.fg("toolTitle", "subagent"))} ${typeLabel}${modelLabel}${durationStr}${statusIcon}`
		this.addChild(new Text(`${border("└──")} ${footerText}`, 0, 0))

		this.invalidate()
		this.ui.requestRender()
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatToolCallLine(tc: SubagentToolCall, _maxWidth: number): string {
	const icon = tc.done
		? tc.isError
			? theme.fg("error", "✗")
			: theme.fg("success", "✓")
		: theme.fg("muted", "⋯")
	const name = theme.fg("toolTitle", tc.name)
	const argsSummary = summarizeArgs(tc.args)
	return `${icon} ${name} ${argsSummary}`
}

function formatDuration(ms: number): string {
	if (ms < 1000) return `${ms}ms`
	const s = (ms / 1000).toFixed(1)
	return `${s}s`
}

function summarizeArgs(args: unknown): string {
	if (!args || typeof args !== "object") return ""
	const obj = args as Record<string, unknown>
	const parts: string[] = []

	// Special handling for todo_write tool
	if (obj.todos && Array.isArray(obj.todos)) {
		const todos = obj.todos as Array<{
			content?: string
			status?: string
			activeForm?: string
		}>
		const taskSummaries = todos.map((t) => {
			const icon =
				t.status === "completed" ? "✓" : t.status === "in_progress" ? "→" : "○"
			const content = t.content || t.activeForm || "task"
			return `${icon} ${content}`
		})
		return theme.fg("muted", taskSummaries.join(", "))
	}

	for (const [key, val] of Object.entries(obj)) {
		if (typeof val === "string") {
			const short = val.length > 40 ? val.slice(0, 40) + "…" : val
			parts.push(theme.fg("muted", short))
		} else if (Array.isArray(val)) {
			parts.push(theme.fg("muted", `${val.length} items`))
		} else if (typeof val === "object" && val !== null) {
			parts.push(theme.fg("muted", "{...}"))
		}
	}
	return parts.join(" ")
}
