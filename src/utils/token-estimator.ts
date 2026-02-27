import { Tiktoken } from "js-tiktoken/lite"
import o200k_base from "js-tiktoken/ranks/o200k_base"

const enc = new Tiktoken(o200k_base)

function sanitizeInput(text: string | object) {
	if (!text) return ""
	return (typeof text === `string` ? text : JSON.stringify(text))
		.replaceAll(`<|endoftext|>`, ``)
		.replaceAll(`<|endofprompt|>`, ``)
}
export function truncateStringForTokenEstimate(
	text: string,
	desiredTokenCount: number,
	fromEnd = true,
) {
	// Fast path: rough char-based check (avg ~3-4 chars/token for code).
	// If the text is small enough, it definitely fits — skip BPE entirely.
	if (text.length <= desiredTokenCount * 3) return text

	// Pre-truncate by characters before BPE to avoid tokenizing huge inputs.
	// Use a generous multiplier (6 chars/token) so we don't cut too aggressively,
	// then let BPE do the precise trim on the smaller string.
	const charBudget = desiredTokenCount * 6
	let preText = text
	if (text.length > charBudget) {
		preText = fromEnd ? text.slice(-charBudget) : text.slice(0, charBudget)
	}

	const tokens = enc.encode(sanitizeInput(preText))

	if (tokens.length <= desiredTokenCount)
		return text.length === preText.length ? text : preText

	const kept = enc.decode(
		tokens.slice(
			fromEnd ? -desiredTokenCount : 0,
			fromEnd ? undefined : desiredTokenCount,
		),
	)
	// Estimate how many tokens were dropped from the original (including pre-truncated portion)
	const estimatedTotalTokens = Math.round(
		text.length / (preText.length / tokens.length),
	)
	const droppedTokens = estimatedTotalTokens - desiredTokenCount
	return `[Truncated ~${droppedTokens} tokens]\n${kept}`
}
