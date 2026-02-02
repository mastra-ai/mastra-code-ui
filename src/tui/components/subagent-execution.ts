/**
 * Subagent execution rendering component.
 * Shows real-time activity from a delegated subagent task:
 *  - Agent type and task description
 *  - Live tool calls with names and abbreviated args
 *  - Final result or error with duration
 *
 * Always collapsible. Starts expanded while running so tool calls
 * are visible in real time. Auto-collapses to a summary when finished.
 */

import { Box, Container, Spacer, type TUI } from "@mariozechner/pi-tui"
import { theme } from "../theme.js"
import { CollapsibleComponent } from "./collapsible.js"
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

export class SubagentExecutionComponent
	extends Container
	implements IToolExecutionComponent
{
	private contentBox: Box
	private collapsible: CollapsibleComponent
	private ui: TUI

	// State
	private agentType: string
	private task: string
	private toolCalls: SubagentToolCall[] = []
	private done = false
	private isError = false
	private durationMs = 0
	private finalResult?: string

	constructor(agentType: string, task: string, ui: TUI) {
		super()
		this.agentType = agentType
		this.task = task
		this.ui = ui

		this.addChild(new Spacer(1))

		this.contentBox = new Box(1, 1, (text: string) =>
			theme.bg("toolPendingBg", text),
		)
		this.addChild(this.contentBox)

		// Create collapsible — starts expanded so live events are visible
		this.collapsible = new CollapsibleComponent(
			{
				header: this.buildHeader(),
				expanded: true,
				collapsedLines: 0,
				expandedLines: 200,
				showLineCount: false,
			},
			this.ui,
		)
		this.contentBox.addChild(this.collapsible)

		this.rebuildContent()
	}

	// ── Mutation API ──────────────────────────────────────────────────────

	addToolStart(name: string, args: unknown): void {
		this.toolCalls.push({ name, args, done: false })
		this.refresh()
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
		this.refresh()
	}

	finish(isError: boolean, durationMs: number, result?: string): void {
		this.done = true
		this.isError = isError
		this.durationMs = durationMs
		this.finalResult = result

		// Auto-collapse on success, stay expanded on error
		if (!isError) {
			this.collapsible.setExpanded(false)
		}
		this.refresh()
	}

	setExpanded(expanded: boolean): void {
		this.collapsible.setExpanded(expanded)
		this.invalidate()
	}

	toggleExpanded(): void {
		this.collapsible.toggle()
		this.invalidate()
	}

	// IToolExecutionComponent interface methods
	updateArgs(args: unknown): void {
		// Not needed for subagent - args are set at creation
	}

	updateResult(result: unknown, isPartial: boolean): void {
		// Not needed for subagent - results come through finish()
	}

	// ── Internal ──────────────────────────────────────────────────────────

	private refresh(): void {
		const bgColor = this.done
			? this.isError
				? "toolErrorBg"
				: "toolSuccessBg"
			: "toolPendingBg"

		this.contentBox.setBgFn((text: string) => theme.bg(bgColor, text))

		// Recreate the collapsible with updated header + content
		// (preserving its current expanded/collapsed state)
		const wasExpanded = this.collapsible ? this.collapsible.isExpanded() : true

		this.contentBox.clear()
		this.collapsible = new CollapsibleComponent(
			{
				header: this.buildHeader(),
				summary: this.buildSummary(),
				expanded: wasExpanded,
				collapsedLines: 0,
				expandedLines: 200,
				showLineCount: false,
			},
			this.ui,
		)
		this.rebuildContent()
		this.contentBox.addChild(this.collapsible)
	}

	private buildHeader(): string {
		const typeLabel = theme.bold(theme.fg("accent", this.agentType))
		const statusIcon = this.done
			? this.isError
				? theme.fg("error", " ✗")
				: theme.fg("success", " ✓")
			: theme.fg("muted", " ⋯")
		const durationStr = this.done
			? theme.fg("muted", ` ${formatDuration(this.durationMs)}`)
			: ""

		return `${theme.bold(theme.fg("toolTitle", "🤖 subagent"))} ${typeLabel}${statusIcon}${durationStr}`
	}

	private buildSummary(): string {
		const taskPreview = truncate(this.task, 60)

		// If we have a final result, show a preview of it
		if (this.done && this.finalResult) {
			const resultPreview = truncate(this.finalResult.replace(/\n/g, " "), 80)
			return theme.fg("muted", `   ${resultPreview}`)
		}

		if (this.toolCalls.length === 0) {
			return theme.fg("muted", `   ${taskPreview}`)
		}
		const errorCount = this.toolCalls.filter((tc) => tc.isError).length
		const countStr =
			errorCount > 0
				? `${this.toolCalls.length} tool calls (${errorCount} failed)`
				: `${this.toolCalls.length} tool calls`
		return theme.fg("muted", `   ${taskPreview} — ${countStr}`)
	}

	private rebuildContent(): void {
		const lines: string[] = []

		// Task description
		const taskPreview = truncate(this.task, 80)
		lines.push(theme.fg("muted", `   ${taskPreview}`))

		// Tool calls
		for (const tc of this.toolCalls) {
			lines.push(formatToolCallLine(tc))
		}

		// Final result (if available)
		if (this.done && this.finalResult) {
			lines.push("") // blank line
			lines.push(theme.fg("muted", "   ───"))
			const resultLines = this.finalResult.split("\n")
			for (const line of resultLines) {
				lines.push(`   ${line}`)
			}
		}

		this.collapsible.setContent(lines)
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatToolCallLine(tc: SubagentToolCall): string {
	const icon = tc.done
		? tc.isError
			? theme.fg("error", "✗")
			: theme.fg("success", "✓")
		: theme.fg("muted", "⋯")
	const name = theme.fg("toolTitle", tc.name)
	const argsSummary = summarizeArgs(tc.args)
	return `   ${icon} ${name} ${argsSummary}`
}

function truncate(text: string, maxLen: number): string {
	const oneLine = text.replace(/\n/g, " ").replace(/\s+/g, " ").trim()
	if (oneLine.length <= maxLen) return oneLine
	return `${oneLine.slice(0, maxLen - 1)}…`
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

	if (obj.path) parts.push(String(obj.path))
	else if (obj.pattern) parts.push(String(obj.pattern))
	else if (obj.command) parts.push(String(obj.command))
	else {
		const firstKey = Object.keys(obj)[0]
		if (firstKey) {
			const val = String(obj[firstKey])
			parts.push(val.length > 60 ? `${val.slice(0, 59)}…` : val)
		}
	}

	return parts.length > 0 ? theme.fg("muted", parts.join(", ")) : ""
}
