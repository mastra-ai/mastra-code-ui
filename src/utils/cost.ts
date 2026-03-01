// Model pricing per million tokens (approximate)
export const MODEL_PRICING: Record<string, { input: number; output: number }> =
	{
		"anthropic/claude-opus-4-6": { input: 15, output: 75 },
		"anthropic/claude-sonnet-4-6": { input: 3, output: 15 },
		"anthropic/claude-sonnet-4-5": { input: 3, output: 15 },
		"anthropic/claude-haiku-4-5": { input: 0.8, output: 4 },
		"openai/gpt-5.2-codex": { input: 2, output: 8 },
		"openai/o3": { input: 10, output: 40 },
		"google/gemini-2.5-flash": { input: 0.15, output: 0.6 },
		"google/gemini-2.5-pro": { input: 1.25, output: 10 },
	}

export function estimateTokenCost(
	modelId: string | null,
	promptTokens: number,
	completionTokens: number,
): number {
	if (!modelId) return 0
	const pricing = MODEL_PRICING[modelId]
	if (!pricing) return 0
	return (
		(promptTokens / 1_000_000) * pricing.input +
		(completionTokens / 1_000_000) * pricing.output
	)
}
