import type { TokenUsage, OMProgressState } from "../types/ipc"
import { OMTokenTracker } from "./OMTokenTracker"

const OBSERVER_COLOR = "#fdac53"
const REFLECTOR_COLOR = "#ff69cc"
const WARNING_COLOR = "#f59e0b"
const THINKING_COLOR = "#f59e0b"
const PLAN_COLOR = "#2563eb"

interface StatusBarProps {
	modeId: string
	modelId: string
	tokenUsage: TokenUsage
	isAgentActive: boolean
	projectName?: string
	gitBranch?: string
	onOpenModelSelector: () => void
	omProgress?: OMProgressState | null
	omModelIds?: { observer: string; reflector: string }
	loggedInProviders?: Set<string>
	onOpenOMSettings?: () => void
	thinkingEnabled: boolean
	onToggleThinking: () => void
	planningEnabled: boolean
	onTogglePlanning: () => void
}

const modeColors: Record<string, string> = {
	build: "var(--mode-build)",
	plan: "var(--mode-plan)",
	fast: "var(--mode-fast)",
}

function formatTokens(n: number): string {
	if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M"
	if (n >= 1_000) return (n / 1_000).toFixed(1) + "k"
	return String(n)
}

/** Extract auth provider ID from a model ID like "openai/gpt-5" -> "openai-codex" */
function getAuthProviderId(modelId: string): string {
	const prefix = modelId.includes("/") ? modelId.split("/")[0] : modelId
	if (prefix === "openai") return "openai-codex"
	return prefix
}

export function StatusBar({
	modeId,
	modelId,
	tokenUsage,
	isAgentActive,
	gitBranch,
	onOpenModelSelector,
	omProgress,
	omModelIds,
	loggedInProviders,
	onOpenOMSettings,
	thinkingEnabled,
	onToggleThinking,
	planningEnabled,
	onTogglePlanning,
}: StatusBarProps) {
	// OM status overrides badge when observing/reflecting
	const omStatus = omProgress?.status
	const isObserving = omStatus === "observing"
	const isReflecting = omStatus === "reflecting"
	const showOMMode = isObserving || isReflecting

	const badgeColor = showOMMode
		? isObserving
			? OBSERVER_COLOR
			: REFLECTOR_COLOR
		: modeColors[modeId] ?? "var(--accent)"

	// Extract short model name
	const modelShort = modelId.includes("/")
		? modelId.split("/").pop()
		: modelId || "no model"

	// Check if OM models are authenticated
	const omHasUnauthModel =
		omModelIds &&
		loggedInProviders &&
		omProgress &&
		(omProgress.threshold > 0 || omProgress.reflectionThreshold > 0) &&
		(!loggedInProviders.has(getAuthProviderId(omModelIds.observer)) ||
			!loggedInProviders.has(getAuthProviderId(omModelIds.reflector)))

	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				gap: 12,
				padding: "4px 24px",
				height: 28,
				borderTop: "1px solid var(--border-muted)",
				background: "var(--bg-surface)",
				fontSize: 11,
				color: "var(--muted)",
				flexShrink: 0,
			}}
		>
			{/* Git branch (leftmost) */}
			{gitBranch && (
				<span
					style={{
						display: "flex",
						alignItems: "center",
						gap: 3,
					}}
				>
					<span style={{ color: "var(--accent)", fontSize: 12 }}>
						&#x2387;
					</span>
					{gitBranch}
				</span>
			)}

			{/* Model name (clickable) */}
			<button
				onClick={onOpenModelSelector}
				style={{
					background: "transparent",
					border: "none",
					color: "var(--muted)",
					cursor: "pointer",
					fontSize: 11,
					padding: "1px 4px",
					borderRadius: 3,
				}}
				title="Change model"
			>
				{modelShort}
			</button>

			{/* Running indicator */}
			{isAgentActive && (
				<span
					style={{
						display: "flex",
						alignItems: "center",
						gap: 4,
						color: showOMMode ? badgeColor : (modeColors[modeId] ?? "var(--accent)"),
					}}
				>
					<span
						style={{
							width: 5,
							height: 5,
							borderRadius: "50%",
							background: showOMMode ? badgeColor : (modeColors[modeId] ?? "var(--accent)"),
							animation: "pulse 1.5s ease-in-out infinite",
						}}
					/>
					{showOMMode ? (isObserving ? "observing" : "reflecting") : "running"}
				</span>
			)}

			{/* Thinking toggle */}
			<button
				onClick={onToggleThinking}
				style={{
					background: thinkingEnabled ? THINKING_COLOR + "22" : "transparent",
					color: thinkingEnabled ? THINKING_COLOR : "var(--muted)",
					border: thinkingEnabled ? `1px solid ${THINKING_COLOR}44` : "1px solid transparent",
					padding: "1px 8px",
					borderRadius: 3,
					fontSize: 11,
					fontWeight: 500,
					cursor: "pointer",
					fontFamily: "inherit",
					transition: "all 0.15s ease",
					opacity: thinkingEnabled ? 1 : 0.6,
				}}
				title={thinkingEnabled ? "Thinking enabled (click to disable)" : "Thinking disabled (click to enable)"}
			>
				thinking
			</button>

			{/* Planning toggle */}
			<button
				onClick={onTogglePlanning}
				style={{
					background: planningEnabled ? PLAN_COLOR + "22" : "transparent",
					color: planningEnabled ? PLAN_COLOR : "var(--muted)",
					border: planningEnabled ? `1px solid ${PLAN_COLOR}44` : "1px solid transparent",
					padding: "1px 8px",
					borderRadius: 3,
					fontSize: 11,
					fontWeight: 500,
					cursor: "pointer",
					fontFamily: "inherit",
					transition: "all 0.15s ease",
					opacity: planningEnabled ? 1 : 0.6,
				}}
				title={planningEnabled ? "Plan mode (click to switch to build)" : "Build mode (click to switch to plan)"}
			>
				plan
			</button>

			<div style={{ flex: 1 }} />

			{/* OM Token Tracker or auth warning */}
			{omHasUnauthModel ? (
				<button
					onClick={onOpenOMSettings}
					style={{
						background: WARNING_COLOR + "18",
						color: WARNING_COLOR,
						border: `1px solid ${WARNING_COLOR}44`,
						borderRadius: 3,
						padding: "1px 8px",
						fontSize: 10,
						fontWeight: 500,
						cursor: "pointer",
						fontFamily: "inherit",
						display: "flex",
						alignItems: "center",
						gap: 4,
					}}
					title="OM memory models need authentication — click to configure"
				>
					<span style={{ fontSize: 11 }}>&#x26A0;</span>
					OM model not connected
				</button>
			) : (
				<OMTokenTracker omProgress={omProgress ?? null} />
			)}

			{/* Separator when OM is shown */}
			{omProgress && omProgress.threshold > 0 && (
				<span
					style={{
						width: 1,
						height: 10,
						background: "var(--border-muted)",
					}}
				/>
			)}

			{/* Token usage */}
			<span>{formatTokens(tokenUsage.totalTokens)} tokens</span>
		</div>
	)
}
