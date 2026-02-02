/**
 * Prompt system — exports the prompt builder and mode-specific prompts.
 */

export { buildBasePrompt, type PromptContext } from "./base.js"
export { buildModePrompt, buildModePromptFn } from "./build.js"
export { planModePrompt } from "./plan.js"
export { fastModePrompt } from "./fast.js"

import { buildBasePrompt, type PromptContext } from "./base.js"
import { buildModePromptFn } from "./build.js"
import { planModePrompt } from "./plan.js"
import { fastModePrompt } from "./fast.js"

const modePrompts: Record<string, string | ((ctx: PromptContext) => string)> = {
	build: buildModePromptFn,
	plan: planModePrompt,
	fast: fastModePrompt,
}

/**
 * Build the full system prompt for a given mode and context.
 * Combines the base prompt with mode-specific instructions.
 */
export function buildFullPrompt(mode: string, ctx: PromptContext): string {
	const base = buildBasePrompt(ctx)
	const entry = modePrompts[mode] || modePrompts.build
	const modeSpecific = typeof entry === "function" ? entry(ctx) : entry
	return base + "\n" + modeSpecific
}
