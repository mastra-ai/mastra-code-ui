import { useEffect, useRef, useState } from "react"
import type { OMProgressState } from "../types/ipc"

// Mastra brand colors
const OBSERVER_COLOR = "#fdac53" // orange — observation/messages
const REFLECTOR_COLOR = "#ff69cc" // pink — reflection/memory
const COLOR_RED = "#DC5663" // high threshold
const COLOR_GRAY = "#52525b" // low threshold (dark mode)

function colorByPercent(percent: number): string {
	if (percent >= 90) return COLOR_RED
	if (percent >= 70) return OBSERVER_COLOR
	return COLOR_GRAY
}

/** Format token count without k suffix: 7234 -> "7.2", 200 -> "0.2", 38 -> "<0.1", 0 -> "0" */
function formatTokensValue(n: number): string {
	if (n === 0) return "0"
	const k = n / 1000
	if (k < 0.1) return "<0.1"
	const s = k.toFixed(1)
	return s.endsWith(".0") ? s.slice(0, -2) : s
}

/** Format token threshold with k suffix: 30000 -> "30k" */
function formatTokensThreshold(n: number): string {
	const k = n / 1000
	const s = k.toFixed(1)
	return (s.endsWith(".0") ? s.slice(0, -2) : s) + "k"
}

function ProgressBar({
	percent,
	width = 40,
}: {
	percent: number
	width?: number
}) {
	const filled = Math.min(width, Math.round((percent / 100) * width))
	const color = colorByPercent(percent)

	return (
		<span
			style={{
				display: "inline-flex",
				width,
				height: 3,
				borderRadius: 1.5,
				background: "var(--border-muted)",
				overflow: "hidden",
				verticalAlign: "middle",
			}}
		>
			<span
				style={{
					width: `${(filled / width) * 100}%`,
					background: color,
					borderRadius: 1.5,
					transition: "width 0.3s ease, background 0.3s ease",
				}}
			/>
		</span>
	)
}

function Metric({
	label,
	labelColor,
	value,
	threshold,
	percent,
	bufferedSavings,
}: {
	label: string
	labelColor: string
	value: number
	threshold: number
	percent: number
	bufferedSavings?: number
}) {
	const color = colorByPercent(percent)
	const fraction = `${formatTokensValue(value)}/${formatTokensThreshold(threshold)}`

	return (
		<span
			style={{
				display: "inline-flex",
				alignItems: "center",
				gap: 4,
				fontSize: 11,
			}}
		>
			<span style={{ color: labelColor, fontWeight: 500 }}>{label}</span>
			<ProgressBar percent={percent} width={32} />
			<span style={{ color, fontWeight: 400 }}>{fraction}</span>
			{bufferedSavings != null && bufferedSavings > 0 && (
				<span style={{ color: "var(--muted)", fontSize: 10 }}>
					↓{formatTokensThreshold(bufferedSavings)}
				</span>
			)}
		</span>
	)
}

function SpinnerDot({ color }: { color: string }) {
	return (
		<span
			style={{
				display: "inline-block",
				width: 5,
				height: 5,
				borderRadius: "50%",
				background: color,
				animation: "pulse 1s ease-in-out infinite",
			}}
		/>
	)
}

export interface OMTokenTrackerProps {
	omProgress: OMProgressState | null
}

export function OMTokenTracker({ omProgress }: OMTokenTrackerProps) {
	if (!omProgress) return null

	const {
		status,
		pendingTokens,
		threshold,
		thresholdPercent,
		observationTokens,
		reflectionThreshold,
		reflectionThresholdPercent,
		buffered,
	} = omProgress

	// Don't show if thresholds are 0 (OM not configured)
	if (threshold === 0 && reflectionThreshold === 0) return null

	const isObserving = status === "observing"
	const isReflecting = status === "reflecting"

	const obsBufferedSavings = buffered.observations.projectedMessageRemoval
	const refSavings =
		buffered.reflection.inputObservationTokens -
		buffered.reflection.observationTokens
	const refBufferedSavings =
		buffered.reflection.status === "complete" && refSavings > 0
			? refSavings
			: undefined

	return (
		<span
			style={{
				display: "inline-flex",
				alignItems: "center",
				gap: 10,
			}}
		>
			{/* Observation (messages) metric */}
			<span
				style={{
					display: "inline-flex",
					alignItems: "center",
					gap: 3,
				}}
			>
				{isObserving && <SpinnerDot color={OBSERVER_COLOR} />}
				<Metric
					label="msg"
					labelColor={isObserving ? OBSERVER_COLOR : "var(--muted)"}
					value={pendingTokens}
					threshold={threshold}
					percent={Math.round(thresholdPercent)}
					bufferedSavings={obsBufferedSavings}
				/>
			</span>

			{/* Separator */}
			<span
				style={{
					width: 1,
					height: 10,
					background: "var(--border-muted)",
				}}
			/>

			{/* Reflection (memory) metric */}
			<span
				style={{
					display: "inline-flex",
					alignItems: "center",
					gap: 3,
				}}
			>
				{isReflecting && <SpinnerDot color={REFLECTOR_COLOR} />}
				<Metric
					label="mem"
					labelColor={isReflecting ? REFLECTOR_COLOR : "var(--muted)"}
					value={observationTokens}
					threshold={reflectionThreshold}
					percent={Math.round(reflectionThresholdPercent)}
					bufferedSavings={refBufferedSavings}
				/>
			</span>
		</span>
	)
}
