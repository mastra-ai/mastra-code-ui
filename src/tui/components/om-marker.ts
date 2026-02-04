/**
 * TUI component for rendering OM observation markers in chat history.
 * Supports updating in-place (start → end/failed).
 */

import { Container, Text, Spacer } from "@mariozechner/pi-tui"
import { fg } from "../theme.js"

/**
 * Format token count for display (e.g., 7234 -> "7.2k", 234 -> "234")
 */
function formatTokens(tokens: number): string {
	if (tokens >= 1000) {
		const k = tokens / 1000
		return k % 1 === 0 ? `${k}k` : `${k.toFixed(1)}k`
	}
	return String(tokens)
}

export type OMMarkerData =
	| {
			type: "om_observation_start"
			tokensToObserve: number
			operationType?: "observation" | "reflection"
	  }
	| {
			type: "om_observation_end"
			tokensObserved: number
			observationTokens: number
			durationMs: number
			operationType?: "observation" | "reflection"
	  }
	| {
			type: "om_observation_failed"
			error: string
			tokensAttempted?: number
			operationType?: "observation" | "reflection"
	  }

/**
 * Renders an inline OM observation marker in the chat history.
 * Can be updated in-place to transition from start → end/failed.
 */
export class OMMarkerComponent extends Container {
	private textChild: Text

	constructor(data: OMMarkerData) {
		super()
		// Add 1 line of padding above
		this.addChild(new Spacer(1))
		this.textChild = new Text(formatMarker(data), 0, 0)
		this.addChild(this.textChild)
	}

	/**
	 * Update the marker in-place (e.g., from start → end).
	 */
	update(data: OMMarkerData): void {
		this.textChild.setText(formatMarker(data))
	}
}

function formatMarker(data: OMMarkerData): string {
	const isReflection = data.operationType === "reflection"
	const label = isReflection ? "Reflection" : "Observation"

	switch (data.type) {
		case "om_observation_start": {
			const tokens =
				data.tokensToObserve > 0
					? ` ~${formatTokens(data.tokensToObserve)} tokens`
					: ""
			return fg("muted", `  🧠 ${label} in progress${tokens}...`)
		}
		case "om_observation_end": {
			const observed = formatTokens(data.tokensObserved)
			const compressed = formatTokens(data.observationTokens)
			const ratio =
				data.tokensObserved > 0 && data.observationTokens > 0
					? `${Math.round(data.tokensObserved / data.observationTokens)}x`
					: ""
			const duration = (data.durationMs / 1000).toFixed(1)
			const ratioStr = ratio ? ` (${ratio} compression)` : ""
			return fg(
				"success",
				`  🧠 Observed: ${observed} → ${compressed} tokens${ratioStr} in ${duration}s ✓`,
			)
		}
		case "om_observation_failed": {
			const tokens = data.tokensAttempted
				? ` (${formatTokens(data.tokensAttempted)} tokens)`
				: ""
			return fg("error", `  ✗ ${label} failed${tokens}: ${data.error}`)
		}
	}
}
