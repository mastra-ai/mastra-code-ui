/**
 * Inline plan approval component.
 * Shows a submitted plan as rendered markdown with Approve/Reject/Request Changes options
 * directly in the conversation flow.
 */

import {
	Box,
	Container,
	type Focusable,
	getEditorKeybindings,
	Input,
	Markdown,
	SelectList,
	type SelectItem,
	Spacer,
	Text,
	type TUI,
} from "@mariozechner/pi-tui"
import { theme, getSelectListTheme, getMarkdownTheme } from "../theme.js"

export interface PlanApprovalInlineOptions {
	planId: string
	title: string
	plan: string
	onApprove: () => void
	onReject: (feedback?: string) => void
}

export class PlanApprovalInlineComponent
	extends Container
	implements Focusable
{
	private contentBox: Box
	private selectList?: SelectList
	private feedbackInput?: Input
	private onApprove: () => void
	private onReject: (feedback?: string) => void
	private resolved = false
	private mode: "select" | "feedback" = "select"

	private _focused = false
	get focused(): boolean {
		return this._focused
	}
	set focused(value: boolean) {
		this._focused = value
		if (this.mode === "feedback" && this.feedbackInput) {
			this.feedbackInput.focused = value
		}
	}

	constructor(options: PlanApprovalInlineOptions, _ui: TUI) {
		super()
		this.onApprove = options.onApprove
		this.onReject = options.onReject

		this.addChild(new Spacer(1))

		// Main content box with pending background
		this.contentBox = new Box(1, 1, (text: string) =>
			theme.bg("toolPendingBg", text),
		)
		this.addChild(this.contentBox)

		// Plan title header
		this.contentBox.addChild(
			new Text(theme.bold(theme.fg("accent", `Plan: ${options.title}`)), 0, 0),
		)
		this.contentBox.addChild(new Spacer(1))

		// Render plan as markdown
		const md = new Markdown(options.plan, 1, 0, getMarkdownTheme())
		this.contentBox.addChild(md)
		this.contentBox.addChild(new Spacer(1))

		// Action selector
		const items: SelectItem[] = [
			{
				value: "approve",
				label: `  ${theme.fg("success", "Approve")} ${theme.fg("dim", "— switch to Build mode and implement")}`,
			},
			{
				value: "reject",
				label: `  ${theme.fg("error", "Reject")} ${theme.fg("dim", "— stay in Plan mode")}`,
			},
			{
				value: "edit",
				label: `  ${theme.fg("warning", "Request changes")} ${theme.fg("dim", "— provide feedback")}`,
			},
		]

		this.selectList = new SelectList(items, items.length, getSelectListTheme())

		this.selectList.onSelect = (item: SelectItem) => {
			this.handleSelection(item.value)
		}
		this.selectList.onCancel = () => {
			this.handleReject()
		}

		this.contentBox.addChild(this.selectList)
		this.contentBox.addChild(new Spacer(1))
		this.contentBox.addChild(
			new Text(
				theme.fg("dim", "Up/Down navigate  Enter select  Esc reject"),
				0,
				0,
			),
		)
	}

	private handleSelection(value: string): void {
		if (this.resolved) return

		switch (value) {
			case "approve":
				this.handleApprove()
				break
			case "reject":
				this.handleReject()
				break
			case "edit":
				this.switchToFeedbackMode()
				break
		}
	}

	private handleApprove(): void {
		if (this.resolved) return
		this.resolved = true
		this.showResult(
			theme.fg("success", "Plan Approved"),
			"Switching to Build mode...",
		)
		this.onApprove()
	}

	private handleReject(feedback?: string): void {
		if (this.resolved) return
		this.resolved = true
		const detail = feedback ? `Feedback: ${feedback}` : "No feedback provided"
		this.showResult(theme.fg("error", "Plan Rejected"), detail)
		this.onReject(feedback)
	}

	private switchToFeedbackMode(): void {
		this.mode = "feedback"
		this.selectList = undefined

		// Rebuild content box with feedback input
		this.contentBox.clear()
		this.contentBox.addChild(
			new Text(theme.fg("accent", "Provide feedback for revision:"), 0, 0),
		)
		this.contentBox.addChild(new Spacer(1))

		this.feedbackInput = new Input()
		this.feedbackInput.focused = this._focused
		this.feedbackInput.onSubmit = (value: string) => {
			const trimmed = value.trim()
			this.handleReject(trimmed || undefined)
		}
		this.feedbackInput.onEscape = () => {
			this.handleReject()
		}

		this.contentBox.addChild(this.feedbackInput)
		this.contentBox.addChild(new Spacer(1))
		this.contentBox.addChild(
			new Text(
				theme.fg(
					"dim",
					"Enter to submit feedback  Esc to reject without feedback",
				),
				0,
				0,
			),
		)
	}

	private showResult(status: string, detail: string): void {
		this.contentBox.clear()
		this.contentBox.setBgFn((text: string) => theme.bg("toolSuccessBg", text))
		this.contentBox.addChild(new Text(theme.bold(status), 0, 0))
		this.contentBox.addChild(new Spacer(1))
		this.contentBox.addChild(new Text(theme.fg("text", detail), 0, 0))
	}

	handleInput(data: string): void {
		if (this.resolved) return

		if (this.mode === "feedback" && this.feedbackInput) {
			const kb = getEditorKeybindings()
			if (kb.matches(data, "selectCancel")) {
				this.handleReject()
				return
			}
			this.feedbackInput.handleInput(data)
		} else if (this.selectList) {
			this.selectList.handleInput(data)
		}
	}
}
