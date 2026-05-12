import { useRef, useState, useCallback, useEffect } from "react"
import {
	useSlashAutocomplete,
	type SlashCommand,
} from "./SlashCommandAutocomplete"
import {
	useFileMentionAutocomplete,
	type FileMention,
} from "./FileMentionAutocomplete"
import {
	ArrowUpThinIcon,
	ExploreIcon,
	FileBlankIcon,
	IterateIcon,
	PlanIcon,
	PlusThinIcon,
	StopFilledIcon,
} from "./Icons"
import { getFileTypeInfo } from "../utils/fileIcons"
import type {
	PendingQuestion,
	QuestionAnswer,
	QuestionOption,
} from "../types/chat"

export interface AttachedFile {
	type: "image" | "file"
	name: string
	mimeType: string
	data: string // base64 for images, text content for files
	preview: string // data URL for images, empty for files
}

interface EditorInputProps {
	onSend: (content: string, files?: AttachedFile[]) => void
	onAbort: () => void
	isAgentActive: boolean
	modeId: string
	planningEnabled: boolean
	onTogglePlanning: () => void
	onBuiltinCommand?: (name: string) => void
	focusToken?: number
	pendingQuestion?: PendingQuestion | null
	onQuestionRespond?: (
		questionId: string,
		answer: QuestionAnswer,
	) => void | Promise<void>
}

const modeColors: Record<string, string> = {
	build: "var(--mode-build)",
	plan: "var(--mode-plan)",
	fast: "var(--mode-fast)",
}

interface FileMentionState {
	start: number
	end: number
	filter: string
}

const FILE_MENTION_ATTR = "data-file-mention-path"

function createFileMentionChip(file: FileMention): HTMLSpanElement {
	const fileType = getFileTypeInfo(file.fileName)
	const chip = document.createElement("span")
	chip.contentEditable = "false"
	chip.setAttribute(FILE_MENTION_ATTR, file.path)
	chip.title = file.path
	chip.className = "editor-file-mention-chip"

	const icon = document.createElement("span")
	icon.textContent = fileType.label
	icon.className = "editor-file-mention-icon"
	icon.style.color = fileType.color

	const label = document.createElement("span")
	label.textContent = file.fileName
	label.className = "editor-file-mention-label"

	chip.append(icon, label)
	return chip
}

function mentionToken(element: Element): string {
	const path = element.getAttribute(FILE_MENTION_ATTR)
	return path ? `@${path}` : ""
}

function serializeNode(node: Node): string {
	if (node.nodeType === Node.TEXT_NODE) {
		return node.textContent ?? ""
	}
	if (node.nodeType !== Node.ELEMENT_NODE) return ""

	const element = node as HTMLElement
	if (element.hasAttribute(FILE_MENTION_ATTR)) {
		return mentionToken(element)
	}
	if (element.tagName === "BR") return "\n"

	let text = ""
	for (const child of Array.from(element.childNodes)) {
		text += serializeNode(child)
	}
	return text
}

function serializeEditor(root: HTMLElement | null): string {
	if (!root) return ""
	if (!root.textContent && !root.querySelector(`[${FILE_MENTION_ATTR}]`)) {
		return ""
	}
	let text = ""
	for (const child of Array.from(root.childNodes)) {
		text += serializeNode(child)
	}
	return text.replace(/\u00a0/g, " ")
}

function getTextBeforeCursor(root: HTMLElement): {
	text: string
	offset: number
} {
	const selection = window.getSelection()
	if (!selection || selection.rangeCount === 0) {
		const text = serializeEditor(root)
		return { text, offset: text.length }
	}

	const range = selection.getRangeAt(0)
	if (!root.contains(range.endContainer)) {
		const text = serializeEditor(root)
		return { text, offset: text.length }
	}
	if (range.endContainer === root) {
		const children = Array.from(root.childNodes)
		const text = children
			.slice(0, Math.min(range.endOffset, children.length))
			.map(serializeNode)
			.join("")
		return { text, offset: text.length }
	}

	let text = ""
	let foundCursor = false

	const walk = (node: Node): void => {
		if (foundCursor) return

		if (node === range.endContainer) {
			if (node.nodeType === Node.TEXT_NODE) {
				text += (node.textContent ?? "").slice(0, range.endOffset)
				foundCursor = true
				return
			}

			const children = Array.from(node.childNodes)
			for (let i = 0; i < Math.min(range.endOffset, children.length); i++) {
				text += serializeNode(children[i])
			}
			foundCursor = true
			return
		}

		if (node.nodeType === Node.ELEMENT_NODE) {
			const element = node as HTMLElement
			if (element.hasAttribute(FILE_MENTION_ATTR)) {
				text += mentionToken(element)
				return
			}

			if (element.contains(range.endContainer)) {
				for (const child of Array.from(element.childNodes)) {
					walk(child)
					if (foundCursor) return
				}
				return
			}
		}

		text += serializeNode(node)
	}

	for (const child of Array.from(root.childNodes)) {
		walk(child)
		if (foundCursor) break
	}

	return { text, offset: text.length }
}

function placeCaretAfter(node: Node): void {
	const selection = window.getSelection()
	if (!selection) return
	const range = document.createRange()
	range.setStartAfter(node)
	range.collapse(true)
	selection.removeAllRanges()
	selection.addRange(range)
}

function placeCaretAtEnd(root: HTMLElement): void {
	const selection = window.getSelection()
	if (!selection) return
	const range = document.createRange()
	range.selectNodeContents(root)
	range.collapse(false)
	selection.removeAllRanges()
	selection.addRange(range)
}

function insertPlainTextAtSelection(text: string): void {
	const selection = window.getSelection()
	if (!selection || selection.rangeCount === 0) return
	const range = selection.getRangeAt(0)
	range.deleteContents()
	const textNode = document.createTextNode(text)
	range.insertNode(textNode)
	placeCaretAfter(textNode)
}

const OTHER_OPTION_VALUE = "__editor_question_other__"

type RenderedQuestionOption = QuestionOption & {
	answerValue: string
	isOther?: boolean
}

function getQuestionOptions(
	options: QuestionOption[],
): RenderedQuestionOption[] {
	const renderedOptions = options.map((option) => ({
		...option,
		answerValue: option.label,
	}))
	const hasOtherOption = options.some(
		(option) => option.label.trim().toLowerCase() === "other",
	)

	if (options.length === 0 || hasOtherOption) {
		return renderedOptions
	}

	return [
		...renderedOptions,
		{
			answerValue: OTHER_OPTION_VALUE,
			description: "Type a custom answer.",
			isOther: true,
			label: "Other",
		},
	]
}

function QuestionResponseCard({
	onRespond,
	pendingQuestion,
}: {
	onRespond: (
		questionId: string,
		answer: QuestionAnswer,
	) => void | Promise<void>
	pendingQuestion: PendingQuestion
}) {
	const [customAnswer, setCustomAnswer] = useState("")
	const [selectedOptions, setSelectedOptions] = useState<string[]>([])
	const [isSubmitting, setIsSubmitting] = useState(false)
	const customInputRef = useRef<HTMLInputElement>(null)
	const firstOptionRef = useRef<HTMLButtonElement>(null)
	const options = pendingQuestion.options ?? []
	const renderedOptions = getQuestionOptions(options)
	const hasOptions = options.length > 0
	const responseEnabled = pendingQuestion.responseEnabled !== false
	const selectionMode =
		pendingQuestion.selectionMode ?? (hasOptions ? "single_select" : undefined)
	const allowMultiple = selectionMode === "multi_select"
	const hasCustomAnswerSelected = selectedOptions.includes(OTHER_OPTION_VALUE)
	const selectedAnswerValues = selectedOptions.flatMap((value) => {
		if (value !== OTHER_OPTION_VALUE) return [value]
		const trimmed = customAnswer.trim()
		return trimmed ? [trimmed] : []
	})
	const canSubmitSelected =
		responseEnabled &&
		selectedOptions.length > 0 &&
		(!hasCustomAnswerSelected || customAnswer.trim().length > 0)

	useEffect(() => {
		if (!responseEnabled || !hasOptions) return
		const frame = window.requestAnimationFrame(() => {
			firstOptionRef.current?.focus()
		})

		return () => window.cancelAnimationFrame(frame)
	}, [hasOptions, pendingQuestion.questionId, responseEnabled])

	const submitAnswer = useCallback(
		(answer: QuestionAnswer) => {
			if (!responseEnabled) return

			const resolvedAnswer = Array.isArray(answer)
				? answer.flatMap((item) => {
						const trimmed = item.trim()
						return trimmed ? [trimmed] : []
					})
				: answer.trim()

			if (
				isSubmitting ||
				(Array.isArray(resolvedAnswer)
					? resolvedAnswer.length === 0
					: !resolvedAnswer)
			) {
				return
			}

			setIsSubmitting(true)
			void Promise.resolve(
				onRespond(pendingQuestion.questionId, resolvedAnswer),
			).catch(() => {
				setIsSubmitting(false)
			})
		},
		[isSubmitting, onRespond, pendingQuestion.questionId, responseEnabled],
	)

	const submitSelectedOptions = useCallback(() => {
		if (!canSubmitSelected) return
		submitAnswer(allowMultiple ? selectedAnswerValues : selectedAnswerValues[0])
	}, [allowMultiple, canSubmitSelected, selectedAnswerValues, submitAnswer])

	const skipQuestion = useCallback(() => {
		submitAnswer("(skipped)")
	}, [submitAnswer])

	const handleOptionSelect = useCallback(
		(option: RenderedQuestionOption) => {
			if (isSubmitting || !responseEnabled) return

			if (option.isOther) {
				setSelectedOptions((prev) => {
					if (allowMultiple) {
						return prev.includes(OTHER_OPTION_VALUE)
							? prev.filter((value) => value !== OTHER_OPTION_VALUE)
							: [...prev, OTHER_OPTION_VALUE]
					}
					return [OTHER_OPTION_VALUE]
				})
				window.requestAnimationFrame(() => customInputRef.current?.focus())
				return
			}

			if (allowMultiple) {
				setSelectedOptions((prev) =>
					prev.includes(option.answerValue)
						? prev.filter((value) => value !== option.answerValue)
						: [...prev, option.answerValue],
				)
				return
			}

			setSelectedOptions([option.answerValue])
			submitAnswer(option.answerValue)
		},
		[allowMultiple, isSubmitting, responseEnabled, submitAnswer],
	)

	const handleQuestionKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLDivElement>) => {
			const target = e.target as HTMLElement
			if (
				target instanceof HTMLInputElement ||
				target.getAttribute("contenteditable") === "true"
			) {
				return
			}

			if (e.key >= "1" && e.key <= "9") {
				const option = renderedOptions[Number(e.key) - 1]
				if (!option) return
				e.preventDefault()
				handleOptionSelect(option)
				return
			}

			if (e.key === "Enter" && allowMultiple && canSubmitSelected) {
				e.preventDefault()
				submitSelectedOptions()
			}
		},
		[
			allowMultiple,
			canSubmitSelected,
			handleOptionSelect,
			renderedOptions,
			submitSelectedOptions,
		],
	)

	const questionMetaLabel = !responseEnabled
		? "Preparing"
		: !hasOptions
			? "Open response"
			: allowMultiple
				? "Multi-select"
				: "Single-select"

	return (
		<div
			role="group"
			aria-label="Agent question"
			className="editor-question-card"
			onKeyDown={handleQuestionKeyDown}
		>
			<div className="editor-question-header">
				<span>Question</span>
				<span className="editor-question-separator">•</span>
				<span>{questionMetaLabel}</span>
			</div>
			<div className="editor-question-title">
				{pendingQuestion.question || "Preparing question..."}
			</div>

			{hasOptions && (
				<div className="editor-question-options">
					{renderedOptions.map((option, index) => {
						const isSelected = selectedOptions.includes(option.answerValue)

						if (option.isOther && isSelected) {
							return (
								<div
									key={`${option.label}:${option.description ?? ""}`}
									className="editor-question-option editor-question-option-custom selected"
								>
									<button
										type="button"
										aria-label="Clear custom answer option"
										disabled={isSubmitting || !responseEnabled}
										onClick={() => handleOptionSelect(option)}
										className="editor-question-option-index editor-question-option-index-button"
									>
										{index + 1}
									</button>
									<span className="editor-question-option-body">
										<input
											ref={customInputRef}
											value={customAnswer}
											disabled={isSubmitting || !responseEnabled}
											onChange={(e) => setCustomAnswer(e.target.value)}
											onKeyDown={(e) => {
												if (e.key === "Enter" && customAnswer.trim()) {
													e.preventDefault()
													submitSelectedOptions()
												}
											}}
											placeholder="Type your answer..."
											className="editor-question-answer-input"
											aria-label="Custom answer"
										/>
									</span>
								</div>
							)
						}

						return (
							<button
								key={`${option.label}:${option.description ?? ""}`}
								ref={index === 0 ? firstOptionRef : undefined}
								type="button"
								disabled={isSubmitting || !responseEnabled}
								onClick={() => handleOptionSelect(option)}
								className={
									isSelected
										? "editor-question-option selected"
										: "editor-question-option"
								}
							>
								<span className="editor-question-option-index">
									{index + 1}
								</span>
								<span className="editor-question-option-body">
									<span className="editor-question-option-title">
										{option.label}
									</span>
									{option.description && (
										<span className="editor-question-option-description">
											{option.description}
										</span>
									)}
								</span>
							</button>
						)
					})}
					{responseEnabled ? (
						<div className="editor-question-footer">
							<span className="editor-question-hint">
								{allowMultiple
									? "1-9 toggle, Enter send"
									: hasCustomAnswerSelected
										? "Enter send custom answer"
										: "Pick an option or skip"}
							</span>
							<div className="editor-question-actions">
								<button
									type="button"
									disabled={isSubmitting}
									onClick={skipQuestion}
									className="editor-question-skip"
								>
									Skip
								</button>
								{allowMultiple || hasCustomAnswerSelected ? (
									<button
										type="button"
										disabled={
											isSubmitting || !responseEnabled || !canSubmitSelected
										}
										onClick={submitSelectedOptions}
										className="editor-question-submit"
									>
										Send answer
									</button>
								) : null}
							</div>
						</div>
					) : null}
				</div>
			)}
		</div>
	)
}

export function EditorInput({
	onSend,
	onAbort,
	isAgentActive,
	modeId,
	planningEnabled,
	onTogglePlanning,
	onBuiltinCommand,
	focusToken = 0,
	pendingQuestion,
	onQuestionRespond,
}: EditorInputProps) {
	const editorRef = useRef<HTMLDivElement>(null)
	const fileInputRef = useRef<HTMLInputElement>(null)
	const [value, setValue] = useState("")
	const [showSlashMenu, setShowSlashMenu] = useState(false)
	const [slashFilter, setSlashFilter] = useState("")
	const [fileMention, setFileMention] = useState<FileMentionState | null>(null)
	const [activeCommand, setActiveCommand] = useState<SlashCommand | null>(null)
	const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([])
	const [isFocused, setIsFocused] = useState(false)
	const [isOpenQuestionSubmitting, setIsOpenQuestionSubmitting] =
		useState(false)
	const isOpenQuestion =
		!!pendingQuestion &&
		(pendingQuestion.options?.length ?? 0) === 0 &&
		pendingQuestion.responseEnabled !== false &&
		!!onQuestionRespond
	const isComposerEditable =
		(!isAgentActive || isOpenQuestion) && !isOpenQuestionSubmitting

	useEffect(() => {
		if (pendingQuestion && !isOpenQuestion) return
		editorRef.current?.focus()
	}, [isAgentActive, isOpenQuestion, pendingQuestion])

	const detectFileMention = useCallback(
		(text: string, cursorPosition: number): FileMentionState | null => {
			const beforeCursor = text.slice(0, cursorPosition)
			const atIndex = beforeCursor.lastIndexOf("@")
			if (atIndex === -1) return null

			const charBefore = atIndex > 0 ? beforeCursor[atIndex - 1] : ""
			if (charBefore && !/[\s([{,:]/.test(charBefore)) return null

			const filter = beforeCursor.slice(atIndex + 1)
			if (filter.includes("\n") || /\s/.test(filter)) return null

			return {
				start: atIndex,
				end: cursorPosition,
				filter,
			}
		},
		[],
	)

	const focusEditor = useCallback(() => {
		const editor = editorRef.current
		if (!editor) return
		editor.focus()
		const selection = window.getSelection()
		if (!selection || selection.rangeCount === 0) {
			placeCaretAtEnd(editor)
			return
		}
		if (!editor.contains(selection.anchorNode)) {
			placeCaretAtEnd(editor)
		}
	}, [])

	useEffect(() => {
		setIsOpenQuestionSubmitting(false)
		if (!isOpenQuestion) return
		const frame = window.requestAnimationFrame(() => focusEditor())
		return () => window.cancelAnimationFrame(frame)
	}, [focusEditor, isOpenQuestion, pendingQuestion?.questionId])

	useEffect(() => {
		if (focusToken === 0) return
		const frame = window.requestAnimationFrame(() => focusEditor())
		return () => window.cancelAnimationFrame(frame)
	}, [focusEditor, focusToken])

	const syncEditorState = useCallback(() => {
		const editor = editorRef.current
		if (!editor) return ""

		const nextValue = serializeEditor(editor)
		setValue(nextValue)

		const slashText = nextValue.slice(1)
		const isSlashCommandQuery =
			!activeCommand &&
			!isOpenQuestion &&
			nextValue.startsWith("/") &&
			!nextValue.includes("\n") &&
			!/\s/.test(slashText)

		if (isSlashCommandQuery) {
			setShowSlashMenu(true)
			setSlashFilter(slashText)
			setFileMention(null)
			return nextValue
		}

		setShowSlashMenu(false)
		const beforeCursor = getTextBeforeCursor(editor)
		setFileMention(detectFileMention(beforeCursor.text, beforeCursor.offset))
		return nextValue
	}, [activeCommand, detectFileMention, isOpenQuestion])

	const clearEditor = useCallback(() => {
		if (editorRef.current) {
			editorRef.current.textContent = ""
		}
		setValue("")
	}, [])

	const processImageFile = useCallback((file: File) => {
		const reader = new FileReader()
		reader.onload = () => {
			const dataUrl = reader.result as string
			const base64 = dataUrl.split(",")[1]
			setAttachedFiles((prev) => [
				...prev,
				{
					type: "image",
					name: file.name,
					mimeType: file.type,
					data: base64,
					preview: dataUrl,
				},
			])
		}
		reader.readAsDataURL(file)
	}, [])

	const processNonImageFile = useCallback((file: File) => {
		const reader = new FileReader()
		reader.onload = () => {
			setAttachedFiles((prev) => [
				...prev,
				{
					type: "file",
					name: file.name,
					mimeType: file.type || "application/octet-stream",
					data: reader.result as string,
					preview: "",
				},
			])
		}
		reader.readAsText(file)
	}, [])

	const handlePaste = useCallback(
		(e: React.ClipboardEvent) => {
			const items = e.clipboardData?.items
			if (items) {
				for (const item of items) {
					if (item.type.startsWith("image/")) {
						e.preventDefault()
						const file = item.getAsFile()
						if (file) processImageFile(file)
						return
					}
				}
			}

			const text = e.clipboardData.getData("text/plain")
			if (!text) return
			e.preventDefault()
			insertPlainTextAtSelection(text)
			syncEditorState()
		},
		[processImageFile, syncEditorState],
	)

	const handleFileSelect = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const files = e.target.files
			if (!files) return
			for (const file of files) {
				if (file.type.startsWith("image/")) {
					processImageFile(file)
				} else {
					processNonImageFile(file)
				}
			}
			e.target.value = ""
		},
		[processImageFile, processNonImageFile],
	)

	const handleCommandSelect = useCallback(
		(command: SlashCommand) => {
			if (command.builtin && onBuiltinCommand) {
				onBuiltinCommand(command.name)
				clearEditor()
				setActiveCommand(null)
				setShowSlashMenu(false)
				setFileMention(null)
				focusEditor()
			} else {
				setActiveCommand(command)
				clearEditor()
				setShowSlashMenu(false)
				setFileMention(null)
				focusEditor()
			}
		},
		[clearEditor, focusEditor, onBuiltinCommand],
	)

	const handleSlashClose = useCallback(() => {
		setShowSlashMenu(false)
	}, [])

	const handleFileMentionSelect = useCallback(
		(file: FileMention) => {
			const editor = editorRef.current
			const selection = window.getSelection()
			const range =
				selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null

			if (
				editor &&
				range &&
				range.collapsed &&
				editor.contains(range.startContainer) &&
				range.startContainer.nodeType === Node.TEXT_NODE &&
				fileMention
			) {
				const node = range.startContainer as Text
				const typedLength = fileMention.filter.length + 1
				const startOffset = Math.max(0, range.startOffset - typedLength)
				const before = node.data.slice(0, startOffset)
				const after = node.data.slice(range.startOffset)
				const parent = node.parentNode

				if (parent) {
					node.data = before
					const chip = createFileMentionChip(file)
					const shouldAddSpace = after.length === 0 || !/^\s/.test(after)
					const space = shouldAddSpace ? document.createTextNode(" ") : null
					const afterNode = after ? document.createTextNode(after) : null
					parent.insertBefore(chip, node.nextSibling)
					if (space) {
						parent.insertBefore(space, chip.nextSibling)
					}
					if (afterNode) {
						parent.insertBefore(
							afterNode,
							space ? space.nextSibling : chip.nextSibling,
						)
					}
					placeCaretAfter(space ?? chip)
				}
			} else if (editor) {
				const chip = createFileMentionChip(file)
				const space = document.createTextNode(" ")
				editor.append(chip, space)
				placeCaretAfter(space)
			}

			syncEditorState()
			setFileMention(null)
			setShowSlashMenu(false)
			focusEditor()
		},
		[fileMention, focusEditor, syncEditorState],
	)

	const handleFileMentionClose = useCallback(() => {
		setFileMention(null)
	}, [])

	const slash = useSlashAutocomplete(
		slashFilter,
		showSlashMenu,
		handleCommandSelect,
		handleSlashClose,
	)

	const fileAutocomplete = useFileMentionAutocomplete(
		fileMention?.filter ?? "",
		fileMention !== null && !showSlashMenu && !isAgentActive,
		handleFileMentionSelect,
		handleFileMentionClose,
	)

	const respondToOpenQuestion = useCallback(
		(answer: QuestionAnswer) => {
			if (
				!isOpenQuestion ||
				!pendingQuestion ||
				!onQuestionRespond ||
				isOpenQuestionSubmitting
			) {
				return
			}

			const resolvedAnswer = Array.isArray(answer)
				? answer.flatMap((item) => {
						const trimmed = item.trim()
						return trimmed ? [trimmed] : []
					})
				: answer.trim()

			if (
				Array.isArray(resolvedAnswer)
					? resolvedAnswer.length === 0
					: !resolvedAnswer
			) {
				return
			}

			setIsOpenQuestionSubmitting(true)
			clearEditor()
			setActiveCommand(null)
			setAttachedFiles([])
			setShowSlashMenu(false)
			setFileMention(null)
			void Promise.resolve(
				onQuestionRespond(pendingQuestion.questionId, resolvedAnswer),
			).catch(() => {
				setIsOpenQuestionSubmitting(false)
			})
		},
		[
			clearEditor,
			isOpenQuestion,
			isOpenQuestionSubmitting,
			onQuestionRespond,
			pendingQuestion,
		],
	)

	const submitOpenQuestionFromComposer = useCallback(() => {
		respondToOpenQuestion(serializeEditor(editorRef.current))
	}, [respondToOpenQuestion])

	const skipOpenQuestion = useCallback(() => {
		respondToOpenQuestion("(skipped)")
	}, [respondToOpenQuestion])

	const sendCurrentMessage = useCallback(() => {
		const currentValue = serializeEditor(editorRef.current)
		const trimmed = currentValue.trim()
		if (isOpenQuestion) {
			submitOpenQuestionFromComposer()
			return
		}
		if (!trimmed && !activeCommand && attachedFiles.length === 0) return
		const message = activeCommand
			? `/${activeCommand.name} ${trimmed}`.trim()
			: trimmed
		onSend(message, attachedFiles.length > 0 ? attachedFiles : undefined)
		clearEditor()
		setActiveCommand(null)
		setAttachedFiles([])
		setShowSlashMenu(false)
		setFileMention(null)
	}, [
		activeCommand,
		attachedFiles,
		clearEditor,
		isOpenQuestion,
		onSend,
		submitOpenQuestionFromComposer,
	])

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			// Delegate to slash autocomplete first when open
			if (showSlashMenu && slash.handleKeyDown(e)) {
				return
			}

			if (fileMention && fileAutocomplete.handleKeyDown(e)) {
				return
			}

			const currentValue = serializeEditor(editorRef.current)

			// Backspace at start of input removes the command chip
			if (e.key === "Backspace" && activeCommand && currentValue === "") {
				e.preventDefault()
				setActiveCommand(null)
				return
			}

			if (e.key === "Enter" && e.shiftKey) {
				e.preventDefault()
				insertPlainTextAtSelection("\n")
				syncEditorState()
				return
			}

			if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
				e.preventDefault()
				if (isOpenQuestion) {
					submitOpenQuestionFromComposer()
					return
				}
				if (isAgentActive) return
				sendCurrentMessage()
			}
			if (e.key === "Escape" && isAgentActive) {
				onAbort()
			}
		},
		[
			isAgentActive,
			onAbort,
			showSlashMenu,
			slash,
			fileMention,
			fileAutocomplete,
			activeCommand,
			isOpenQuestion,
			sendCurrentMessage,
			submitOpenQuestionFromComposer,
			syncEditorState,
		],
	)

	const handleEditorInput = useCallback(() => {
		syncEditorState()
	}, [syncEditorState])

	const handleEditorSelection = useCallback(() => {
		const editor = editorRef.current
		if (!editor) return
		setValue(serializeEditor(editor))
		if (showSlashMenu) return
		const beforeCursor = getTextBeforeCursor(editor)
		setFileMention(detectFileMention(beforeCursor.text, beforeCursor.offset))
	}, [detectFileMention, showSlashMenu])

	const handleEditorBlur = useCallback(() => {
		setIsFocused(false)
		window.requestAnimationFrame(() => {
			const editor = editorRef.current
			const active = document.activeElement
			if (!editor || editor.contains(active)) return
			if (showSlashMenu) return
			setFileMention(null)
		})
	}, [showSlashMenu])

	useEffect(() => {
		const handleSelectionChange = () => {
			const editor = editorRef.current
			if (!editor) return

			const chips = editor.querySelectorAll(`[${FILE_MENTION_ATTR}]`)
			const selection = window.getSelection()
			if (!selection || selection.rangeCount === 0) {
				chips.forEach((chip) => chip.classList.remove("mention-selected"))
				return
			}

			const range = selection.getRangeAt(0)
			if (!editor.contains(range.commonAncestorContainer)) return

			chips.forEach((chip) => {
				chip.classList.toggle("mention-selected", range.intersectsNode(chip))
			})
		}

		document.addEventListener("selectionchange", handleSelectionChange)
		return () => {
			document.removeEventListener("selectionchange", handleSelectionChange)
		}
	}, [])

	const isBuildMode = modeId === "build"
	const borderColor = isBuildMode
		? "var(--border)"
		: (modeColors[modeId] ?? "var(--border)")
	const focusRing = isBuildMode
		? "0 0 0 2px color-mix(in srgb, var(--text) 22%, transparent)"
		: `0 0 0 2px color-mix(in srgb, ${borderColor} 35%, transparent)`
	const ModeIcon =
		modeId === "plan" ? PlanIcon : modeId === "fast" ? ExploreIcon : IterateIcon
	const modeLabel =
		modeId === "plan" ? "Plan" : modeId === "fast" ? "Fast" : "Build"
	const modeToggleColor = isBuildMode
		? "var(--text)"
		: (modeColors[modeId] ?? "var(--accent)")

	const hasContent = value.trim() || activeCommand || attachedFiles.length > 0
	const canSendComposer = isOpenQuestion
		? !!value.trim() && !isOpenQuestionSubmitting
		: !!hasContent
	const showComposer = !pendingQuestion || isOpenQuestion
	const sendButtonBackground = canSendComposer
		? isBuildMode
			? "var(--text)"
			: modeToggleColor
		: "var(--bg-elevated)"
	const sendButtonColor = canSendComposer
		? isBuildMode
			? "var(--bg)"
			: "var(--text-on-accent)"
		: "var(--dim)"

	return (
		<div
			style={{
				position: "relative",
				zIndex: 10,
				padding: "8px 8px 8px",
				flexShrink: 0,
				boxShadow:
					"0 -10px 24px color-mix(in srgb, var(--bg) 72%, transparent)",
			}}
		>
			<div
				style={{
					width: "100%",
					maxWidth: "var(--chat-column-max-width)",
					margin: "0 auto",
				}}
			>
				{pendingQuestion && onQuestionRespond && (
					<QuestionResponseCard
						key={pendingQuestion.questionId}
						pendingQuestion={pendingQuestion}
						onRespond={onQuestionRespond}
					/>
				)}
				{showComposer && (
					<div style={{ position: "relative", width: "100%" }}>
						{slash.element}
						{fileAutocomplete.element}
						<input
							ref={fileInputRef}
							type="file"
							multiple
							onChange={handleFileSelect}
							style={{ display: "none" }}
						/>
						<div
							onClick={focusEditor}
							style={{
								position: "relative",
								zIndex: 10,
								background: "var(--bg-surface)",
								border: `1px solid ${isFocused ? borderColor : "var(--border)"}`,
								borderRadius: 12,
								padding: 8,
								cursor: "text",
								transition: "border-color 0.15s, box-shadow 0.15s",
								boxShadow: isFocused ? focusRing : "none",
							}}
						>
							{attachedFiles.length > 0 && (
								<div
									style={{
										display: "flex",
										flexWrap: "wrap",
										alignItems: "center",
										gap: 6,
										marginBottom: 6,
									}}
								>
									{attachedFiles.map((file, i) => (
										<div
											key={`${file.type}:${file.name}:${file.mimeType}:${file.data.slice(0, 32)}`}
											style={{ position: "relative", flexShrink: 0 }}
										>
											{file.type === "image" ? (
												<img
													src={file.preview}
													alt={file.name}
													style={{
														height: 56,
														maxWidth: 104,
														objectFit: "cover",
														borderRadius: 8,
														border: "1px solid var(--border-muted)",
													}}
												/>
											) : (
												<div
													title={file.name}
													style={{
														height: 56,
														minWidth: 88,
														maxWidth: 136,
														display: "flex",
														alignItems: "center",
														gap: 8,
														padding: "7px 10px",
														borderRadius: 8,
														border: "1px solid var(--border-muted)",
														background: "var(--bg-elevated)",
													}}
												>
													<FileBlankIcon style={{ color: "var(--muted)" }} />
													<span
														style={{
															fontSize: 11,
															color: "var(--muted)",
															maxWidth: 92,
															overflow: "hidden",
															textOverflow: "ellipsis",
															whiteSpace: "nowrap",
														}}
													>
														{file.name}
													</span>
												</div>
											)}
											<button
												onClick={(e) => {
													e.stopPropagation()
													setAttachedFiles((prev) =>
														prev.filter((_, idx) => idx !== i),
													)
												}}
												style={{
													position: "absolute",
													top: -5,
													right: -5,
													width: 18,
													height: 18,
													borderRadius: 9,
													background: "var(--bg-elevated)",
													border: "1px solid var(--border)",
													color: "var(--text)",
													fontSize: 12,
													display: "flex",
													alignItems: "center",
													justifyContent: "center",
													cursor: "pointer",
													lineHeight: 1,
													padding: 0,
												}}
											>
												&times;
											</button>
										</div>
									))}
								</div>
							)}
							<div
								style={{ display: "flex", alignItems: "flex-start", gap: 6 }}
							>
								{activeCommand && (
									<span
										onClick={(e) => {
											e.stopPropagation()
											setActiveCommand(null)
											focusEditor()
										}}
										style={{
											display: "inline-flex",
											alignItems: "center",
											gap: 5,
											marginTop: 4,
											padding: "2px 8px",
											background:
												"color-mix(in srgb, var(--accent) 14%, transparent)",
											color: "var(--accent)",
											borderRadius: 6,
											fontSize: 12,
											fontFamily: "var(--font-mono, monospace)",
											fontWeight: 500,
											flexShrink: 0,
											cursor: "pointer",
											lineHeight: 1.5,
										}}
									>
										/{activeCommand.name}
										<span style={{ fontSize: 11, opacity: 0.65 }}>&times;</span>
									</span>
								)}
								<div
									style={{
										flex: 1,
										width: "100%",
										position: "relative",
									}}
								>
									{!value && (
										<div
											style={{
												position: "absolute",
												top: 4,
												left: 4,
												right: 4,
												color: "var(--dim)",
												fontSize: 14,
												lineHeight: "20px",
												pointerEvents: "none",
												userSelect: "none",
											}}
										>
											{isAgentActive
												? isOpenQuestion
													? "Type your answer..."
													: "Agent is running... (Esc to abort)"
												: activeCommand
													? "Add a message..."
													: "Send a message..."}
										</div>
									)}
									<div
										className="editor-input-editor"
										ref={editorRef}
										contentEditable={isComposerEditable}
										suppressContentEditableWarning
										spellCheck={false}
										onInput={handleEditorInput}
										onKeyDown={handleKeyDown}
										onKeyUp={handleEditorSelection}
										onMouseUp={handleEditorSelection}
										onPaste={handlePaste}
										onFocus={() => setIsFocused(true)}
										onBlur={handleEditorBlur}
										style={{
											width: "100%",
											background: "transparent",
											border: "none",
											outline: "none",
											color: "var(--text)",
											fontSize: 14,
											fontFamily: "inherit",
											lineHeight: "20px",
											whiteSpace: "pre-wrap",
											overflowWrap: "anywhere",
											wordBreak: "break-word",
											minHeight: 24,
											maxHeight: 200,
											overflowY: "auto",
											padding: 4,
											opacity: isComposerEditable ? 1 : 0.5,
											cursor: isComposerEditable ? "text" : "default",
										}}
									/>
								</div>
							</div>
							<div
								style={{
									display: "flex",
									alignItems: "center",
									gap: 4,
									marginTop: 6,
									width: "100%",
								}}
							>
								<button
									onClick={(e) => {
										e.stopPropagation()
										onTogglePlanning()
									}}
									style={{
										display: "inline-flex",
										alignItems: "center",
										gap: 6,
										padding: "4px 8px",
										borderRadius: 6,
										background: "transparent",
										color: modeToggleColor,
										border: "1px solid transparent",
										fontSize: 12,
										fontWeight: 500,
										fontFamily: "inherit",
										lineHeight: 1,
										cursor: "pointer",
										transition:
											"color 0.15s ease, background 0.15s ease, border-color 0.15s ease",
									}}
									onMouseEnter={(e) => {
										e.currentTarget.style.color = modeToggleColor
										e.currentTarget.style.background = "var(--bg-elevated)"
										e.currentTarget.style.borderColor = "var(--border-muted)"
									}}
									onMouseLeave={(e) => {
										e.currentTarget.style.color = modeToggleColor
										e.currentTarget.style.background = "transparent"
										e.currentTarget.style.borderColor = "transparent"
									}}
									title={
										planningEnabled
											? "Plan mode. Click to switch to build."
											: "Build mode. Click to switch to plan."
									}
								>
									<ModeIcon style={{ width: 13, height: 13, flexShrink: 0 }} />
									{modeLabel}
								</button>
								<div
									style={{
										marginLeft: "auto",
										display: "flex",
										alignItems: "center",
										gap: 2,
									}}
								>
									{!isAgentActive && (
										<button
											onClick={(e) => {
												e.stopPropagation()
												fileInputRef.current?.click()
											}}
											title="Attach file"
											style={{
												display: "flex",
												alignItems: "center",
												justifyContent: "center",
												width: 28,
												height: 28,
												borderRadius: 4,
												background: "transparent",
												color: "var(--muted)",
												cursor: "pointer",
												flexShrink: 0,
												padding: 0,
												border: "1px solid transparent",
												transition:
													"color 0.15s, background 0.15s, border-color 0.15s",
											}}
											onMouseEnter={(e) => {
												e.currentTarget.style.color = "var(--text)"
												e.currentTarget.style.background = "var(--bg-elevated)"
												e.currentTarget.style.borderColor =
													"var(--border-muted)"
											}}
											onMouseLeave={(e) => {
												e.currentTarget.style.color = "var(--muted)"
												e.currentTarget.style.background = "transparent"
												e.currentTarget.style.borderColor = "transparent"
											}}
										>
											<PlusThinIcon />
										</button>
									)}
									{isOpenQuestion ? (
										<>
											<button
												type="button"
												onClick={(e) => {
													e.stopPropagation()
													skipOpenQuestion()
												}}
												disabled={isOpenQuestionSubmitting}
												title="Skip question"
												className="editor-open-question-action editor-open-question-skip"
											>
												Skip
											</button>
											<button
												type="button"
												onClick={(e) => {
													e.stopPropagation()
													submitOpenQuestionFromComposer()
												}}
												title="Submit answer"
												disabled={!canSendComposer}
												className="editor-open-question-action editor-open-question-submit"
											>
												Submit answer
											</button>
										</>
									) : isAgentActive ? (
										<button
											onClick={(e) => {
												e.stopPropagation()
												onAbort()
											}}
											title="Stop"
											style={{
												width: 28,
												height: 28,
												display: "flex",
												alignItems: "center",
												justifyContent: "center",
												background: "var(--bg-elevated)",
												color: "var(--text)",
												borderRadius: 4,
												border: "1px solid var(--border-muted)",
												cursor: "pointer",
												flexShrink: 0,
												padding: 0,
											}}
										>
											<StopFilledIcon />
										</button>
									) : (
										<button
											onClick={(e) => {
												e.stopPropagation()
												sendCurrentMessage()
											}}
											title="Send"
											disabled={!canSendComposer}
											style={{
												width: 28,
												height: 28,
												display: "flex",
												alignItems: "center",
												justifyContent: "center",
												background: sendButtonBackground,
												color: sendButtonColor,
												borderRadius: 4,
												border: "none",
												cursor: canSendComposer ? "pointer" : "default",
												flexShrink: 0,
											}}
										>
											<ArrowUpThinIcon />
										</button>
									)}
								</div>
							</div>
						</div>
					</div>
				)}
			</div>
		</div>
	)
}
