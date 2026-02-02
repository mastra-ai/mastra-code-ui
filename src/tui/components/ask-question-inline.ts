/**
 * Inline ask question component.
 * Shows a question with either selectable options or free-text input
 * directly in the conversation flow instead of as an overlay dialog.
 */

import {
    Box,
    Container,
    type Focusable,
    getEditorKeybindings,
    Input,
    SelectList,
    type SelectItem,
    Spacer,
    Text,
    type TUI,
} from "@mariozechner/pi-tui"
import { theme, getSelectListTheme } from "../theme.js"

export interface AskQuestionInlineOptions {
    question: string
    options?: Array<{ label: string; description?: string }>
    onSubmit: (answer: string) => void
    onCancel: () => void
}

export class AskQuestionInlineComponent extends Container implements Focusable {
    private contentBox: Box
    private selectList?: SelectList
    private input?: Input
    private onSubmit: (answer: string) => void
    private onCancel: () => void
    private answered = false
    private answerText?: Text

    private _focused = false
    get focused(): boolean {
        return this._focused
    }
    set focused(value: boolean) {
        this._focused = value
        if (!this.answered && this.input) {
            this.input.focused = value
        }
    }

    constructor(options: AskQuestionInlineOptions, ui: TUI) {
        super()

        this.onSubmit = options.onSubmit
        this.onCancel = options.onCancel

        // Add spacing above
        this.addChild(new Spacer(1))

        // Create box with accent border for the question
        this.contentBox = new Box(1, 1, (text: string) =>
            theme.bg("toolPendingBg", text),
        )
        this.addChild(this.contentBox)

        // Question header
        this.contentBox.addChild(
            new Text(
                theme.bold(theme.fg("accent", "❓ Question")),
                0,
                0,
            ),
        )
        this.contentBox.addChild(new Spacer(1))

        // Question text (may be multi-line)
        for (const line of options.question.split("\n")) {
            this.contentBox.addChild(
                new Text(theme.fg("text", line), 0, 0),
            )
        }
        this.contentBox.addChild(new Spacer(1))

        if (options.options && options.options.length > 0) {
            this.buildSelectMode(options.options)
        } else {
            this.buildInputMode()
        }
    }

    private buildSelectMode(
        opts: Array<{ label: string; description?: string }>,
    ): void {
        const items: SelectItem[] = opts.map((opt) => ({
            value: opt.label,
            label: opt.description
                ? `  ${opt.label}  ${theme.fg("dim", opt.description)}`
                : `  ${opt.label}`,
        }))

        this.selectList = new SelectList(
            items,
            Math.min(items.length, 8),
            getSelectListTheme(),
        )

        this.selectList.onSelect = (item: SelectItem) => {
            this.handleAnswer(item.value)
        }
        this.selectList.onCancel = () => {
            this.handleAnswer("(skipped)")
        }

        this.contentBox.addChild(this.selectList)
        this.contentBox.addChild(new Spacer(1))
        this.contentBox.addChild(
            new Text(
                theme.fg("dim", "↑↓ to navigate · Enter to select · Esc to skip"),
                0,
                0,
            ),
        )
    }

    private buildInputMode(): void {
        this.input = new Input()
        this.input.onSubmit = (value: string) => {
            const trimmed = value.trim()
            if (trimmed) {
                this.handleAnswer(trimmed)
            }
        }

        this.contentBox.addChild(this.input)
        this.contentBox.addChild(new Spacer(1))
        this.contentBox.addChild(
            new Text(
                theme.fg("dim", "Enter to submit · Esc to skip"),
                0,
                0,
            ),
        )
    }

    private handleAnswer(answer: string): void {
        if (this.answered) return
        this.answered = true

        // Clear the interactive elements
        this.contentBox.clear()
        
        // Show the question as answered
        this.contentBox.setBgFn((text: string) => theme.bg("toolSuccessBg", text))
        
        this.contentBox.addChild(
            new Text(
                theme.bold(theme.fg("success", "✓ Answered")),
                0,
                0,
            ),
        )
        this.contentBox.addChild(new Spacer(1))
        
        // Show answer
        this.answerText = new Text(
            theme.fg("text", `Answer: ${answer}`),
            0,
            0,
        )
        this.contentBox.addChild(this.answerText)
        
        // Call the callback
        this.onSubmit(answer)
    }

    handleInput(data: string): void {
        if (this.answered) return

        if (this.selectList) {
            this.selectList.handleInput(data)
        } else if (this.input) {
            const kb = getEditorKeybindings()
            if (kb.matches(data, "selectCancel")) {
                this.handleAnswer("(skipped)")
                return
            }
            this.input.handleInput(data)
        }
    }
}