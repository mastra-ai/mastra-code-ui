/**
 * Subagent registry — maps subagent IDs to their definitions.
 */

export type { SubagentDefinition } from "./types.js"
export { exploreSubagent } from "./explore.js"
export { planSubagent } from "./plan.js"

import type { SubagentDefinition } from "./types.js"
import { exploreSubagent } from "./explore.js"
import { planSubagent } from "./plan.js"

/** All registered subagent definitions, keyed by ID. */
const subagentRegistry: Record<string, SubagentDefinition> = {
    explore: exploreSubagent,
    plan: planSubagent,
}

/**
 * Look up a subagent definition by ID.
 * Returns undefined if not found.
 */
export function getSubagentDefinition(
    id: string,
): SubagentDefinition | undefined {
    return subagentRegistry[id]
}

/**
 * Get all registered subagent IDs (for tool description / validation).
 */
export function getSubagentIds(): string[] {
    return Object.keys(subagentRegistry)
}
