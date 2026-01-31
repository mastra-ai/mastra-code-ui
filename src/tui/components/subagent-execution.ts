/**
 * Subagent execution rendering component.
 * Shows real-time activity from a delegated subagent task:
 *  - Agent type and task description
 *  - Live tool calls with names and abbreviated args
 *  - Final result or error with duration
 */

import { Box, Container, Spacer, Text, type TUI } from "@mariozechner/pi-tui"
import { theme } from "../theme.js"

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

export class SubagentExecutionComponent extends Container {
    private contentBox: Box
    private ui: TUI

    // State
    private agentType: string
    private task: string
    private toolCalls: SubagentToolCall[] = []
    private done = false
    private isError = false
    private durationMs = 0

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

        this.updateDisplay()
    }

    // ── Mutation API ──────────────────────────────────────────────────────

    addToolStart(name: string, args: unknown): void {
        this.toolCalls.push({ name, args, done: false })
        this.updateDisplay()
    }

    addToolEnd(name: string, result: unknown, isError: boolean): void {
        // Find the most recent matching tool call that isn't done yet
        for (let i = this.toolCalls.length - 1; i >= 0; i--) {
            if (this.toolCalls[i].name === name && !this.toolCalls[i].done) {
                this.toolCalls[i].done = true
                this.toolCalls[i].isError = isError
                this.toolCalls[i].result = typeof result === "string"
                    ? result
                    : JSON.stringify(result ?? "")
                break
            }
        }
        this.updateDisplay()
    }

    finish(isError: boolean, durationMs: number): void {
        this.done = true
        this.isError = isError
        this.durationMs = durationMs
        this.updateDisplay()
    }

    // ── Rendering ─────────────────────────────────────────────────────────

    private updateDisplay(): void {
        const bgColor = this.done
            ? this.isError
                ? "toolErrorBg"
                : "toolSuccessBg"
            : "toolPendingBg"

        this.contentBox.setBgFn((text: string) => theme.bg(bgColor, text))
        this.contentBox.clear()

        // Header line: 🤖 explore  "Find all usages of X…"
        const typeLabel = theme.bold(theme.fg("accent", this.agentType))
        const taskPreview = truncate(this.task, 80)
        const statusIcon = this.done
            ? this.isError
                ? theme.fg("error", " ✗")
                : theme.fg("success", " ✓")
            : theme.fg("muted", " ⋯")
        const durationStr = this.done
            ? theme.fg("muted", ` ${formatDuration(this.durationMs)}`)
            : ""

        const header = `${theme.bold(theme.fg("toolTitle", "🤖 subagent"))} ${typeLabel}${statusIcon}${durationStr}`
        this.contentBox.addChild(new Text(header, 0, 0))

        // Task description (dimmed)
        this.contentBox.addChild(
            new Text(theme.fg("muted", `   ${taskPreview}`), 0, 0),
        )

        // Tool calls list
        for (const tc of this.toolCalls) {
            const icon = tc.done
                ? tc.isError
                    ? theme.fg("error", "✗")
                    : theme.fg("success", "✓")
                : theme.fg("muted", "⋯")
            const name = theme.fg("toolTitle", tc.name)
            const argsSummary = summarizeArgs(tc.args)

            this.contentBox.addChild(
                new Text(`   ${icon} ${name} ${argsSummary}`, 0, 0),
            )
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function truncate(text: string, maxLen: number): string {
    // Collapse to single line
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

    // Show the most relevant arg for common tools
    if (obj.path) parts.push(String(obj.path))
    else if (obj.pattern) parts.push(String(obj.pattern))
    else if (obj.command) parts.push(String(obj.command))
    else {
        // Generic: show first key's value
        const firstKey = Object.keys(obj)[0]
        if (firstKey) {
            const val = String(obj[firstKey])
            parts.push(val.length > 60 ? `${val.slice(0, 59)}…` : val)
        }
    }

    return parts.length > 0
        ? theme.fg("muted", parts.join(", "))
        : ""
}
