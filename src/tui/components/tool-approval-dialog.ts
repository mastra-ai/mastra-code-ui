/**
 * Tool approval dialog component.
 * Shows tool details and prompts user to approve or decline execution.
 */

import {
	Box,
	type Focusable,
	getEditorKeybindings,
	Input,
	Spacer,
	Text,
} from "@mariozechner/pi-tui"
import { bg, fg } from "../theme.js"

export interface ToolApprovalDialogOptions {
	toolCallId: string
	toolName: string
	args: unknown
	onApprove: () => void
	onDecline: () => void
}

export class ToolApprovalDialogComponent extends Box implements Focusable {
	private toolName: string
	private args: unknown
	private onApprove: () => void
	private onDecline: () => void
	public input: Input

	// Focusable implementation
	private _focused = false
	get focused(): boolean {
		return this._focused
	}
	set focused(value: boolean) {
		this._focused = value
		this.input.focused = value
	}

	constructor(options: ToolApprovalDialogOptions) {
		super(2, 1, (text) => bg("overlayBg", text))

		this.toolName = options.toolName
		this.args = options.args
		this.onApprove = options.onApprove
		this.onDecline = options.onDecline

		// Create input for y/n response
		this.input = new Input()
		this.input.onSubmit = (value: string) => this.handleSubmit(value)

		this.buildUI()
	}

	private buildUI(): void {
		// Title
		this.addChild(new Text(fg("warning", "⚠ Tool Approval Required"), 0, 0))
		this.addChild(new Spacer(1))

		// Tool name
		this.addChild(
			new Text(fg("accent", `Tool: `) + fg("text", this.toolName), 0, 0),
		)
		this.addChild(new Spacer(1))

		// Arguments (formatted)
		this.addChild(new Text(fg("muted", "Arguments:"), 0, 0))
		const argsText = this.formatArgs(this.args)
		for (const line of argsText.split("\n").slice(0, 10)) {
			this.addChild(new Text(fg("text", "  " + line), 0, 0))
		}
		if (argsText.split("\n").length > 10) {
			this.addChild(new Text(fg("muted", "  ... (truncated)"), 0, 0))
		}

		this.addChild(new Spacer(1))

		// Prompt text
		this.addChild(
			new Text(fg("accent", "Allow? ") + fg("muted", "(y/n) "), 0, 0),
		)

		// Input
		this.addChild(this.input)
	}

	private formatArgs(args: unknown): string {
		if (args === null || args === undefined) {
			return "(none)"
		}

		try {
			if (typeof args === "object") {
				return JSON.stringify(args, null, 2)
			}
			return String(args)
		} catch {
			return String(args)
		}
	}

	private handleSubmit(value: string): void {
		const normalized = value.toLowerCase().trim()

		if (normalized === "y" || normalized === "yes") {
			this.onApprove()
		} else if (normalized === "n" || normalized === "no") {
			this.onDecline()
		} else {
			// Invalid input - clear and let them try again
			this.input.setValue("")
		}
	}

	handleInput(data: string): void {
		const kb = getEditorKeybindings()

		// Handle escape to decline
		if (kb.matches(data, "selectCancel")) {
			this.onDecline()
			return
		}

		// Pass to input
		this.input.handleInput(data)
	}

	render(maxWidth: number): string[] {
		return super.render(maxWidth)
	}
}
