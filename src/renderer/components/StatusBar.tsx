import { useEffect, useRef, useState } from "react"
import type { TokenUsage, OMProgressState } from "../types/ipc"
import { formatModelName } from "../utils/modelDisplay"
import { ChevronRightIcon, TinyChevronDownIcon } from "./Icons"
import { OMTokenTracker } from "./OMTokenTracker"

const OBSERVER_COLOR = "var(--om-observer)"
const REFLECTOR_COLOR = "var(--om-reflector)"

interface StatusBarProps {
	modeId: string
	modelId: string
	tokenUsage: TokenUsage
	isAgentActive: boolean
	projectName?: string
	gitBranch?: string
	thinkingLevel: string
	onSetThinkingLevel: (level: string) => void
	onSelectModel: (modelId: string) => void
	onOpenModelSelector: () => void
	omProgress?: OMProgressState | null
	omModelIds?: { observer: string; reflector: string }
	loggedInProviders?: Set<string>
	onOpenOMSettings?: () => void
}

const modeColors: Record<string, string> = {
	build: "var(--mode-build)",
	plan: "var(--mode-plan)",
	fast: "var(--mode-fast)",
}

const thinkingOptions = [
	{ value: "off", label: "Off" },
	{ value: "low", label: "Low" },
	{ value: "medium", label: "Medium" },
	{ value: "high", label: "High" },
	{ value: "xhigh", label: "Extra High" },
]

const quickModels = [
	{ id: "openai/gpt-5.3-codex", label: "GPT-5.3 Codex" },
	{ id: "openai/gpt-5.2-codex", label: "GPT-5.2 Codex" },
]

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
	thinkingLevel,
	onSetThinkingLevel,
	onSelectModel,
	onOpenModelSelector,
	omProgress,
	omModelIds,
	loggedInProviders,
	onOpenOMSettings,
}: StatusBarProps) {
	const intelligenceMenuRef = useRef<HTMLDivElement>(null)
	const [showIntelligenceMenu, setShowIntelligenceMenu] = useState(false)

	useEffect(() => {
		if (!showIntelligenceMenu) return

		const handlePointerDown = (event: PointerEvent) => {
			const target = event.target as Node
			if (intelligenceMenuRef.current?.contains(target)) return
			setShowIntelligenceMenu(false)
		}
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") setShowIntelligenceMenu(false)
		}

		document.addEventListener("pointerdown", handlePointerDown)
		document.addEventListener("keydown", handleKeyDown)
		return () => {
			document.removeEventListener("pointerdown", handlePointerDown)
			document.removeEventListener("keydown", handleKeyDown)
		}
	}, [showIntelligenceMenu])

	// OM status overrides badge when observing/reflecting
	const omStatus = omProgress?.status
	const isObserving = omStatus === "observing"
	const isReflecting = omStatus === "reflecting"
	const showOMMode = isObserving || isReflecting

	const badgeColor = showOMMode
		? isObserving
			? OBSERVER_COLOR
			: REFLECTOR_COLOR
		: (modeColors[modeId] ?? "var(--accent)")

	const modelLabel = formatModelName(modelId)
	const modelOptions = [
		...(modelId ? [{ id: modelId, label: modelLabel }] : []),
		...quickModels.filter((model) => model.id !== modelId),
	]
	const thinkingLabel =
		thinkingOptions.find((option) => option.value === thinkingLevel)?.label ??
		"Off"

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
				minWidth: 0,
				overflow: "visible",
				whiteSpace: "nowrap",
				position: "relative",
			}}
		>
			{/* Git branch (leftmost) */}
			{gitBranch && (
				<span
					style={{
						display: "flex",
						alignItems: "center",
						gap: 3,
						minWidth: 0,
						maxWidth: "42%",
						overflow: "hidden",
						textOverflow: "ellipsis",
						whiteSpace: "nowrap",
					}}
					title={gitBranch}
				>
					<span style={{ color: "var(--accent)", fontSize: 12, flexShrink: 0 }}>
						&#x2387;
					</span>
					<span
						style={{
							minWidth: 0,
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap",
						}}
					>
						{gitBranch}
					</span>
				</span>
			)}

			{/* Model + thinking selector */}
			<div
				ref={intelligenceMenuRef}
				style={{ position: "relative", flexShrink: 0 }}
			>
				<button
					onClick={() => setShowIntelligenceMenu((open) => !open)}
					style={{
						display: "inline-flex",
						alignItems: "center",
						gap: 6,
						background: showIntelligenceMenu
							? "var(--bg-elevated)"
							: "transparent",
						color: "var(--text)",
						border: showIntelligenceMenu
							? "1px solid var(--border)"
							: "1px solid transparent",
						height: 28,
						padding: "0 8px",
						borderRadius: 6,
						fontSize: 11,
						fontWeight: 500,
						cursor: "pointer",
						fontFamily: "inherit",
						lineHeight: 1,
						maxWidth: 220,
						transition:
							"color 0.15s ease, background 0.15s ease, border-color 0.15s ease",
					}}
					onMouseEnter={(e) => {
						e.currentTarget.style.background = "var(--bg-elevated)"
						e.currentTarget.style.borderColor = "var(--border)"
					}}
					onMouseLeave={(e) => {
						e.currentTarget.style.background = showIntelligenceMenu
							? "var(--bg-elevated)"
							: "transparent"
						e.currentTarget.style.borderColor = showIntelligenceMenu
							? "var(--border)"
							: "transparent"
					}}
					title={`${modelLabel} · ${thinkingLabel}`}
				>
					<span
						style={{
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap",
							minWidth: 0,
						}}
					>
						{modelLabel}
					</span>
					<span style={{ color: "var(--muted)", flexShrink: 0 }}>
						{thinkingLabel}
					</span>
					<TinyChevronDownIcon
						style={{
							color: "var(--muted)",
							flexShrink: 0,
						}}
					/>
				</button>
				{showIntelligenceMenu && (
					<div
						style={{
							position: "absolute",
							left: 0,
							bottom: "calc(100% + 8px)",
							width: 220,
							padding: 4,
							borderRadius: 8,
							background: "var(--bg-elevated)",
							border: "1px solid var(--border)",
							boxShadow: "var(--shadow-elevated)",
							zIndex: 80,
						}}
					>
						<div
							style={{
								padding: "5px 8px",
								fontSize: 10,
								color: "var(--dim)",
								fontWeight: 500,
								textTransform: "uppercase",
								letterSpacing: "0.5px",
							}}
						>
							Intelligence
						</div>
						{thinkingOptions.map((option) => {
							const selected = option.value === thinkingLevel
							return (
								<button
									key={option.value}
									className="ui-hover-item"
									data-selected={selected ? "true" : undefined}
									onClick={() => {
										onSetThinkingLevel(option.value)
										setShowIntelligenceMenu(false)
									}}
									style={{
										width: "100%",
										display: "flex",
										alignItems: "center",
										gap: 8,
										justifyContent: "space-between",
										padding: "7px 8px",
										borderRadius: 4,
										background: selected ? "var(--bg-hover)" : "transparent",
										color: "var(--text)",
										fontSize: 12,
										fontWeight: 500,
										textAlign: "left",
										cursor: "pointer",
										fontFamily: "inherit",
									}}
								>
									{option.label}
									{selected && (
										<span
											style={{
												width: 5,
												height: 5,
												borderRadius: "50%",
												background: "var(--accent)",
											}}
										/>
									)}
								</button>
							)
						})}
						<div
							style={{
								height: 1,
								margin: "4px 8px",
								background: "var(--border-muted)",
							}}
						/>
						{modelOptions.map((model) => {
							const selected = model.id === modelId
							return (
								<button
									key={model.id}
									className="ui-hover-item"
									data-selected={selected ? "true" : undefined}
									onClick={() => {
										onSelectModel(model.id)
										setShowIntelligenceMenu(false)
									}}
									style={{
										width: "100%",
										display: "flex",
										alignItems: "center",
										gap: 8,
										justifyContent: "space-between",
										padding: "7px 8px",
										borderRadius: 4,
										background: selected ? "var(--bg-hover)" : "transparent",
										color: "var(--text)",
										fontSize: 12,
										fontWeight: 500,
										textAlign: "left",
										cursor: "pointer",
										fontFamily: "inherit",
									}}
								>
									{model.label}
									{selected && (
										<span
											style={{
												width: 5,
												height: 5,
												borderRadius: "50%",
												background: "var(--accent)",
											}}
										/>
									)}
								</button>
							)
						})}
						<button
							className="ui-hover-item"
							onClick={() => {
								setShowIntelligenceMenu(false)
								onOpenModelSelector()
							}}
							style={{
								width: "100%",
								display: "flex",
								alignItems: "center",
								justifyContent: "space-between",
								padding: "7px 8px",
								borderRadius: 4,
								background: "transparent",
								color: "var(--text)",
								fontSize: 12,
								fontWeight: 500,
								textAlign: "left",
								cursor: "pointer",
								fontFamily: "inherit",
							}}
						>
							<span>More Models</span>
							<ChevronRightIcon style={{ color: "var(--muted)" }} />
						</button>
					</div>
				)}
			</div>

			{/* Running indicator */}
			{isAgentActive && (
				<span
					style={{
						display: "flex",
						alignItems: "center",
						gap: 4,
						color: showOMMode
							? badgeColor
							: (modeColors[modeId] ?? "var(--accent)"),
						flexShrink: 0,
						whiteSpace: "nowrap",
					}}
				>
					<span
						style={{
							width: 5,
							height: 5,
							borderRadius: "50%",
							background: showOMMode
								? badgeColor
								: (modeColors[modeId] ?? "var(--accent)"),
							animation: "pulse 1.5s ease-in-out infinite",
						}}
					/>
					{showOMMode ? (isObserving ? "observing" : "reflecting") : "running"}
				</span>
			)}

			<div style={{ flex: 1 }} />

			{/* OM Token Tracker or auth warning */}
			{omHasUnauthModel ? (
				<button
					onClick={onOpenOMSettings}
					style={{
						background: "var(--color-warning-bg)",
						color: "var(--warning)",
						border: "1px solid var(--color-warning-border)",
						borderRadius: 3,
						padding: "1px 8px",
						fontSize: 10,
						fontWeight: 500,
						cursor: "pointer",
						fontFamily: "inherit",
						display: "flex",
						alignItems: "center",
						gap: 4,
						flexShrink: 0,
						whiteSpace: "nowrap",
					}}
					title="OM memory models need authentication. Click to configure."
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
						flexShrink: 0,
					}}
				/>
			)}

			{/* Token usage */}
			<span style={{ flexShrink: 0, whiteSpace: "nowrap" }}>
				{formatTokens(tokenUsage.totalTokens)} tokens
			</span>
		</div>
	)
}
