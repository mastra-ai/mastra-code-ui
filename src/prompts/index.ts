/**
 * Prompt system — exports the prompt builder and mode-specific prompts.
 */

export { buildBasePrompt, type PromptContext } from "./base.js"
export { buildModePrompt } from "./build.js"
export { planModePrompt } from "./plan.js"
export { fastModePrompt } from "./fast.js"

import { buildBasePrompt, type PromptContext } from "./base.js"
import { buildModePrompt } from "./build.js"
import { planModePrompt } from "./plan.js"
import { fastModePrompt } from "./fast.js"

const modePrompts: Record<string, string> = {
	build: buildModePrompt,
	plan: planModePrompt,
	fast: fastModePrompt,
}

/**
 * Build the full system prompt for a given mode and context.
 * Combines the base prompt with mode-specific instructions.
 */
export function buildFullPrompt(mode: string, ctx: PromptContext): string {
	const base = buildBasePrompt(ctx)
	const modeSpecific = modePrompts[mode] || modePrompts.build
	return base + "\n" + modeSpecific
}
