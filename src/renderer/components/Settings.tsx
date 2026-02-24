import { useState, useEffect, useCallback } from "react"

type NotificationMode = "off" | "bell" | "system" | "both"
type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high"

interface SettingsState {
	notifications: NotificationMode
	yolo: boolean
	smartEditing: boolean
	thinkingLevel: ThinkingLevel
	observerModelId: string
	reflectorModelId: string
	observationThreshold: number
	reflectionThreshold: number
	prInstructions: string
}

interface SettingsProps {
	onClose: () => void
}

// Reusable setting row
function SettingRow({
	label,
	description,
	children,
}: {
	label: string
	description?: string
	children: React.ReactNode
}) {
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				justifyContent: "space-between",
				padding: "12px 0",
				borderBottom: "1px solid var(--border-muted)",
				gap: 24,
			}}
		>
			<div style={{ flex: 1, minWidth: 0 }}>
				<div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>
					{label}
				</div>
				{description && (
					<div
						style={{
							fontSize: 11,
							color: "var(--muted)",
							marginTop: 2,
							lineHeight: 1.4,
						}}
					>
						{description}
					</div>
				)}
			</div>
			<div style={{ flexShrink: 0 }}>{children}</div>
		</div>
	)
}

// Toggle switch
function Toggle({
	checked,
	onChange,
}: {
	checked: boolean
	onChange: (v: boolean) => void
}) {
	return (
		<button
			onClick={() => onChange(!checked)}
			style={{
				width: 36,
				height: 20,
				borderRadius: 10,
				background: checked ? "var(--accent)" : "var(--bg-elevated)",
				border: `1px solid ${checked ? "var(--accent)" : "var(--border)"}`,
				position: "relative",
				cursor: "pointer",
				transition: "background 0.15s, border-color 0.15s",
			}}
		>
			<span
				style={{
					position: "absolute",
					top: 2,
					left: checked ? 18 : 2,
					width: 14,
					height: 14,
					borderRadius: "50%",
					background: "#fff",
					transition: "left 0.15s",
				}}
			/>
		</button>
	)
}

// Select dropdown
function Select({
	value,
	options,
	onChange,
}: {
	value: string
	options: Array<{ value: string; label: string }>
	onChange: (v: string) => void
}) {
	return (
		<select
			value={value}
			onChange={(e) => onChange(e.target.value)}
			style={{
				background: "var(--bg-elevated)",
				color: "var(--text)",
				border: "1px solid var(--border)",
				borderRadius: 4,
				padding: "4px 8px",
				fontSize: 12,
				cursor: "pointer",
				fontFamily: "inherit",
				minWidth: 120,
			}}
		>
			{options.map((o) => (
				<option key={o.value} value={o.value}>
					{o.label}
				</option>
			))}
		</select>
	)
}

// Section header
function SectionHeader({ title }: { title: string }) {
	return (
		<div
			style={{
				fontSize: 10,
				fontWeight: 600,
				color: "var(--muted)",
				textTransform: "uppercase",
				letterSpacing: "0.5px",
				padding: "16px 0 4px",
			}}
		>
			{title}
		</div>
	)
}

const notificationOptions: Array<{ value: string; label: string }> = [
	{ value: "off", label: "Off" },
	{ value: "bell", label: "Sound" },
	{ value: "system", label: "System" },
	{ value: "both", label: "Sound + System" },
]

const thinkingOptions: Array<{ value: string; label: string }> = [
	{ value: "off", label: "Off" },
	{ value: "minimal", label: "Minimal" },
	{ value: "low", label: "Low" },
	{ value: "medium", label: "Medium" },
	{ value: "high", label: "High" },
]

export function Settings({ onClose }: SettingsProps) {
	const [state, setState] = useState<SettingsState | null>(null)
	const [models, setModels] = useState<Array<{ id: string; name?: string }>>([])
	const [activeSection, setActiveSection] = useState("general")

	// Load current state
	useEffect(() => {
		async function load() {
			const [s, m] = await Promise.all([
				window.api.invoke({ type: "getState" }),
				window.api.invoke({ type: "getAvailableModels" }),
			])
			const st = s as Record<string, unknown>
			setState({
				notifications: (st?.notifications as NotificationMode) ?? "off",
				yolo: (st?.yolo as boolean) ?? false,
				smartEditing: (st?.smartEditing as boolean) ?? true,
				thinkingLevel: (st?.thinkingLevel as ThinkingLevel) ?? "off",
				observerModelId:
					(st?.observerModelId as string) ?? "google/gemini-2.5-flash",
				reflectorModelId:
					(st?.reflectorModelId as string) ?? "google/gemini-2.5-flash",
				observationThreshold: (st?.observationThreshold as number) ?? 30000,
				reflectionThreshold: (st?.reflectionThreshold as number) ?? 40000,
				prInstructions: (st?.prInstructions as string) ?? "",
			})
			if (Array.isArray(m)) setModels(m as Array<{ id: string; name?: string }>)
		}
		load()
	}, [])

	// Persist a setting change
	const update = useCallback(
		async (key: keyof SettingsState, value: unknown) => {
			setState((prev) => (prev ? { ...prev, [key]: value } : prev))
			switch (key) {
				case "yolo":
					await window.api.invoke({ type: "setYoloMode", enabled: value })
					break
				case "thinkingLevel":
					await window.api.invoke({ type: "setThinkingLevel", level: value })
					break
				case "notifications":
					await window.api.invoke({ type: "setNotifications", mode: value })
					break
				case "smartEditing":
					await window.api.invoke({ type: "setSmartEditing", enabled: value })
					break
				case "observerModelId":
					await window.api.invoke({ type: "setObserverModel", modelId: value })
					break
				case "reflectorModelId":
					await window.api.invoke({
						type: "setReflectorModel",
						modelId: value,
					})
					break
				default:
					await window.api.invoke({
						type: "setState",
						patch: { [key]: value },
					})
			}
		},
		[],
	)

	// Close on Escape
	useEffect(() => {
		const handleKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose()
		}
		window.addEventListener("keydown", handleKey)
		return () => window.removeEventListener("keydown", handleKey)
	}, [onClose])

	const sections = [
		{ id: "general", label: "General" },
		{ id: "models", label: "Models" },
		{ id: "agent", label: "Agent" },
		{ id: "git", label: "Git" },
		{ id: "memory", label: "Memory" },
	]

	const modelOptions = models.map((m) => ({
		value: m.id,
		label: m.name || m.id,
	}))

	return (
		<div
			style={{
				position: "fixed",
				inset: 0,
				background: "rgba(0,0,0,0.6)",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				zIndex: 9999,
			}}
			onClick={onClose}
		>
			<div
				onClick={(e) => e.stopPropagation()}
				style={{
					background: "var(--bg)",
					border: "1px solid var(--border-muted)",
					borderRadius: 12,
					width: 600,
					maxWidth: "90vw",
					maxHeight: "80vh",
					display: "flex",
					flexDirection: "column",
					overflow: "hidden",
				}}
			>
				{/* Header */}
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						padding: "16px 20px",
						borderBottom: "1px solid var(--border-muted)",
						flexShrink: 0,
					}}
				>
					<span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>
						Settings
					</span>
					<button
						onClick={onClose}
						style={{
							color: "var(--muted)",
							fontSize: 16,
							cursor: "pointer",
							padding: "0 4px",
							lineHeight: 1,
						}}
					>
						&times;
					</button>
				</div>

				{/* Body */}
				<div style={{ display: "flex", flex: 1, minHeight: 0 }}>
					{/* Nav */}
					<div
						style={{
							width: 140,
							borderRight: "1px solid var(--border-muted)",
							padding: "8px 0",
							flexShrink: 0,
						}}
					>
						{sections.map((s) => (
							<button
								key={s.id}
								onClick={() => setActiveSection(s.id)}
								style={{
									display: "block",
									width: "100%",
									textAlign: "left",
									padding: "8px 16px",
									fontSize: 12,
									fontWeight: activeSection === s.id ? 600 : 400,
									color:
										activeSection === s.id
											? "var(--text)"
											: "var(--muted)",
									background:
										activeSection === s.id
											? "var(--bg-surface)"
											: "transparent",
									borderLeft:
										activeSection === s.id
											? "2px solid var(--accent)"
											: "2px solid transparent",
									cursor: "pointer",
								}}
							>
								{s.label}
							</button>
						))}
					</div>

					{/* Content */}
					<div
						style={{
							flex: 1,
							padding: "4px 24px 24px",
							overflowY: "auto",
						}}
					>
						{!state ? (
							<div
								style={{
									padding: 32,
									textAlign: "center",
									color: "var(--muted)",
									fontSize: 12,
								}}
							>
								Loading...
							</div>
						) : (
							<>
								{activeSection === "general" && (
									<>
										<SectionHeader title="Notifications" />
										<SettingRow
											label="Notification mode"
											description="How to notify you when the agent finishes or needs attention"
										>
											<Select
												value={state.notifications}
												options={notificationOptions}
												onChange={(v) =>
													update(
														"notifications",
														v as NotificationMode,
													)
												}
											/>
										</SettingRow>

										<SectionHeader title="Behavior" />
										<SettingRow
											label="Auto-approve tools"
											description="Skip confirmation dialogs for tool execution (YOLO mode)"
										>
											<Toggle
												checked={state.yolo}
												onChange={(v) => update("yolo", v)}
											/>
										</SettingRow>
									</>
								)}

								{activeSection === "models" && (
									<>
										<SectionHeader title="Thinking" />
										<SettingRow
											label="Extended thinking"
											description="Budget for chain-of-thought reasoning (Anthropic models)"
										>
											<Select
												value={state.thinkingLevel}
												options={thinkingOptions}
												onChange={(v) =>
													update(
														"thinkingLevel",
														v as ThinkingLevel,
													)
												}
											/>
										</SettingRow>

										<div
											style={{
												fontSize: 11,
												color: "var(--dim)",
												padding: "12px 0",
												lineHeight: 1.5,
											}}
										>
											Use the model selector in the status bar
											to change the active model and mode.
										</div>
									</>
								)}

								{activeSection === "agent" && (
									<>
										<SectionHeader title="Editing" />
										<SettingRow
											label="Smart editing"
											description="Use LSP-based intelligent edits when available"
										>
											<Toggle
												checked={state.smartEditing}
												onChange={(v) =>
													update("smartEditing", v)
												}
											/>
										</SettingRow>
									</>
								)}

								{activeSection === "git" && (
									<>
										<SectionHeader title="Pull Requests" />
										<div style={{ padding: "12px 0" }}>
											<div
												style={{
													fontSize: 13,
													fontWeight: 500,
													color: "var(--text)",
													marginBottom: 4,
												}}
											>
												PR instructions
											</div>
											<div
												style={{
													fontSize: 11,
													color: "var(--muted)",
													marginBottom: 8,
													lineHeight: 1.4,
												}}
											>
												Custom instructions the agent follows
												when creating pull requests (e.g.
												format, reviewers, labels, conventions)
											</div>
											<textarea
												value={state.prInstructions}
												onChange={(e) => {
													const v = e.target.value
													setState((prev) =>
														prev
															? {
																	...prev,
																	prInstructions: v,
																}
															: prev,
													)
												}}
												onBlur={() =>
													update(
														"prInstructions",
														state.prInstructions,
													)
												}
												placeholder={`Example:\n- Always include a "Test plan" section\n- Add the "team/frontend" label\n- Tag @grayson for review`}
												rows={6}
												style={{
													width: "100%",
													background:
														"var(--bg-elevated)",
													color: "var(--text)",
													border: "1px solid var(--border)",
													borderRadius: 6,
													padding: "8px 10px",
													fontSize: 12,
													fontFamily: "inherit",
													lineHeight: 1.5,
													resize: "vertical",
													minHeight: 80,
												}}
											/>
										</div>
									</>
								)}

								{activeSection === "memory" && (
									<>
										<SectionHeader title="Observational Memory" />
										<SettingRow
											label="Observer model"
											description="Model used to analyze conversation and extract observations"
										>
											{modelOptions.length > 0 ? (
												<Select
													value={state.observerModelId}
													options={modelOptions}
													onChange={(v) =>
														update("observerModelId", v)
													}
												/>
											) : (
												<span
													style={{
														fontSize: 11,
														color: "var(--muted)",
													}}
												>
													{state.observerModelId}
												</span>
											)}
										</SettingRow>
										<SettingRow
											label="Reflector model"
											description="Model used to synthesize observations into memory"
										>
											{modelOptions.length > 0 ? (
												<Select
													value={state.reflectorModelId}
													options={modelOptions}
													onChange={(v) =>
														update("reflectorModelId", v)
													}
												/>
											) : (
												<span
													style={{
														fontSize: 11,
														color: "var(--muted)",
													}}
												>
													{state.reflectorModelId}
												</span>
											)}
										</SettingRow>

										<SectionHeader title="Thresholds" />
										<SettingRow
											label="Observation threshold"
											description="Token count that triggers observation extraction"
										>
											<input
												type="number"
												value={state.observationThreshold}
												onChange={(e) => {
													const v = parseInt(e.target.value, 10)
													if (!isNaN(v) && v > 0)
														update("observationThreshold", v)
												}}
												style={{
													width: 80,
													background: "var(--bg-elevated)",
													color: "var(--text)",
													border: "1px solid var(--border)",
													borderRadius: 4,
													padding: "4px 8px",
													fontSize: 12,
													fontFamily: "inherit",
													textAlign: "right",
												}}
											/>
										</SettingRow>
										<SettingRow
											label="Reflection threshold"
											description="Token count that triggers memory reflection"
										>
											<input
												type="number"
												value={state.reflectionThreshold}
												onChange={(e) => {
													const v = parseInt(e.target.value, 10)
													if (!isNaN(v) && v > 0)
														update("reflectionThreshold", v)
												}}
												style={{
													width: 80,
													background: "var(--bg-elevated)",
													color: "var(--text)",
													border: "1px solid var(--border)",
													borderRadius: 4,
													padding: "4px 8px",
													fontSize: 12,
													fontFamily: "inherit",
													textAlign: "right",
												}}
											/>
										</SettingRow>
									</>
								)}
							</>
						)}
					</div>
				</div>
			</div>
		</div>
	)
}
