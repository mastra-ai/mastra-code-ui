/**
 * Tool approval dialog component.
 * Shows tool details and prompts user to approve or decline execution.
 *
 * Responses:
 *   y / yes       — approve this one call
 *   n / no / Esc  — decline this call
 *   a             — always allow this category for the session
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

export type ApprovalAction =
	| { type: "approve" }
	| { type: "decline" }
	| { type: "always_allow_category" }

export interface ToolApprovalDialogOptions {
	toolCallId: string
	toolName: string
	args: unknown
	/** Human-readable category label, e.g. "Edit" or "Execute" */
	categoryLabel?: string
	onAction: (action: ApprovalAction) => void
}

export class ToolApprovalDialogComponent extends Box implements Focusable {
	private toolName: string
	private args: unknown
	private categoryLabel: string | undefined
	private onAction: (action: ApprovalAction) => void
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
		this.categoryLabel = options.categoryLabel
		this.onAction = options.onAction

		// Create input for response
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
		if (this.categoryLabel) {
			this.addChild(
				new Text(
					fg("accent", `Category: `) + fg("text", this.categoryLabel),
					0,
					0,
				),
			)
		}
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

		// Prompt text with options
		const categoryHint = this.categoryLabel
			? `a = always allow ${this.categoryLabel.toLowerCase()}`
			: "a = always allow category"
		this.addChild(
			new Text(
				fg("accent", "Allow? ") +
					fg("muted", `(y)es / (n)o / (${categoryHint})`),
				0,
				0,
			),
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
			this.onAction({ type: "approve" })
		} else if (normalized === "n" || normalized === "no") {
			this.onAction({ type: "decline" })
		} else if (normalized === "a") {
			this.onAction({ type: "always_allow_category" })
		} else {
			// Invalid input - clear and let them try again
			this.input.setValue("")
		}
	}

	handleInput(data: string): void {
		const kb = getEditorKeybindings()

		// Handle escape to decline
		if (kb.matches(data, "selectCancel")) {
			this.onAction({ type: "decline" })
			return
		}

		// Pass to input
		this.input.handleInput(data)
	}

	render(maxWidth: number): string[] {
		return super.render(maxWidth)
	}
}
