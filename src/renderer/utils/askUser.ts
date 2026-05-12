import type {
	PendingQuestion,
	QuestionAnswer,
	QuestionOption,
	QuestionSelectionMode,
} from "../types/chat"

export const ASK_USER_ANSWER_PREFIX = "User answered:"

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function formatQuestionAnswer(
	answer: QuestionAnswer | undefined,
): string {
	if (answer === undefined) return ""
	return Array.isArray(answer) ? answer.join(", ") : answer
}

export function getResultContent(result: unknown): string {
	if (typeof result === "string") return result
	if (isRecord(result) && typeof result.content === "string") {
		return result.content
	}
	return ""
}

export function getToolResultIsError(
	result: unknown,
	topLevelIsError = false,
): boolean {
	return topLevelIsError || (isRecord(result) && result.isError === true)
}

export function normalizeQuestionOptions(
	options: unknown,
): QuestionOption[] | undefined {
	if (!Array.isArray(options)) return undefined

	const normalized = options.flatMap((option) => {
		if (!isRecord(option) || typeof option.label !== "string") return []

		const label = option.label.trim()
		if (!label) return []

		return [
			{
				label,
				...(typeof option.description === "string" && option.description.trim()
					? { description: option.description.trim() }
					: {}),
			},
		]
	})

	return normalized.length > 0 ? normalized : undefined
}

export function normalizeQuestionSelectionMode(
	selectionMode: unknown,
	options: QuestionOption[] | undefined,
): QuestionSelectionMode | undefined {
	if (!options?.length) return undefined
	return selectionMode === "multi_select" ? "multi_select" : "single_select"
}

export function normalizeAskUserQuestion(input: {
	question?: unknown
	options?: unknown
	selectionMode?: unknown
}): Omit<PendingQuestion, "questionId"> | null {
	if (typeof input.question !== "string") return null

	const question = input.question.trim()
	if (!question) return null

	const options = normalizeQuestionOptions(input.options)
	const selectionMode = normalizeQuestionSelectionMode(
		input.selectionMode,
		options,
	)

	return {
		question,
		options,
		selectionMode,
	}
}

export function normalizePendingQuestion(input: {
	questionId: string
	toolCallId?: string
	question: string
	options?: unknown
	selectionMode?: unknown
	responseEnabled?: boolean
}): PendingQuestion {
	const normalized = normalizeAskUserQuestion(input)

	return {
		questionId: input.questionId,
		...(input.toolCallId ? { toolCallId: input.toolCallId } : {}),
		question: normalized?.question ?? input.question,
		options: normalized?.options,
		selectionMode: normalized?.selectionMode,
		...(input.responseEnabled === false ? { responseEnabled: false } : {}),
	}
}

export function normalizePendingQuestionFromToolStart(
	toolCallId: string,
	args: unknown,
): PendingQuestion | null {
	if (!isRecord(args)) return null

	const normalized = normalizeAskUserQuestion(args)
	if (!normalized) return null

	return {
		questionId: `tool:${toolCallId}`,
		toolCallId,
		responseEnabled: false,
		...normalized,
	}
}

export function normalizeAskUserResult(
	result: unknown,
	topLevelIsError = false,
): {
	content: string
	isError: boolean
	skipped: boolean
	answer?: string
	hasResult: boolean
} {
	const hasResult = result !== undefined && result !== null
	const content = getResultContent(result).trim()
	const isError = getToolResultIsError(result, topLevelIsError)
	const prefixedAnswer = content.startsWith(ASK_USER_ANSWER_PREFIX)
		? content.slice(ASK_USER_ANSWER_PREFIX.length).trim()
		: undefined
	const skipped = content === "(skipped)" || prefixedAnswer === "(skipped)"

	let answer: string | undefined
	if (!isError && !skipped && content) {
		if (prefixedAnswer !== undefined) {
			answer = prefixedAnswer
		} else if (typeof result === "string") {
			answer = content
		}
	}

	return { content, isError, skipped, answer, hasResult }
}
