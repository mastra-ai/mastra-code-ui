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

interface PermissionCategory {
	label: string
	description: string
}

interface PermissionData {
	rules: {
		categories: Record<string, string>
		tools: Record<string, string>
	}
	sessionGrants: string[]
	categories: Record<string, PermissionCategory>
}

interface McpServerStatus {
	name: string
	connected: boolean
	toolCount: number
	toolNames: string[]
	error?: string
}

interface SettingsProps {
	onClose?: () => void
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

const policyOptions: Array<{ value: string; label: string }> = [
	{ value: "allow", label: "Allow" },
	{ value: "ask", label: "Ask" },
	{ value: "deny", label: "Deny" },
]

export function Settings({ onClose }: SettingsProps) {
	const [state, setState] = useState<SettingsState | null>(null)
	const [models, setModels] = useState<Array<{ id: string; name?: string }>>([])
	const [activeSection, setActiveSection] = useState("general")
	const [permissions, setPermissions] = useState<PermissionData | null>(null)
	const [mcpStatuses, setMcpStatuses] = useState<McpServerStatus[]>([])
	const [mcpLoading, setMcpLoading] = useState(false)
	const [addingServer, setAddingServer] = useState(false)
	const [newServer, setNewServer] = useState({ name: "", command: "", args: "", scope: "project" })

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

	// Load permissions when general or permissions section is active
	useEffect(() => {
		if (activeSection !== "general" && activeSection !== "permissions") return
		async function load() {
			const p = await window.api.invoke({ type: "getPermissionRules" })
			setPermissions(p as PermissionData)
		}
		load()
	}, [activeSection])

	// Load MCP statuses when that section is active
	useEffect(() => {
		if (activeSection !== "mcp") return
		async function load() {
			setMcpLoading(true)
			try {
				const statuses = await window.api.invoke({ type: "getMcpStatuses" })
				setMcpStatuses((statuses as McpServerStatus[]) ?? [])
			} catch {
				// ignore
			} finally {
				setMcpLoading(false)
			}
		}
		load()
	}, [activeSection])

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

	const updatePermissionPolicy = useCallback(
		async (category: string, policy: string) => {
			await window.api.invoke({
				type: "setPermissionPolicy",
				category,
				policy,
			})
			// Refresh permissions
			const p = await window.api.invoke({ type: "getPermissionRules" }) as PermissionData
			setPermissions(p)
			// Sync YOLO state: on if all categories are "allow", off otherwise
			const allAllow = p.rules?.categories
				? Object.values(p.rules.categories).every((v) => v === "allow")
				: false
			const currentYolo = state?.yolo ?? false
			if (allAllow !== currentYolo) {
				await window.api.invoke({ type: "setState", patch: { yolo: allAllow } })
				setState((prev) => prev ? { ...prev, yolo: allAllow } : prev)
			}
		},
		[state?.yolo],
	)

	const resetSessionGrants = useCallback(async () => {
		await window.api.invoke({ type: "resetSessionGrants" })
		const p = await window.api.invoke({ type: "getPermissionRules" })
		setPermissions(p as PermissionData)
	}, [])

	const handleReloadMcp = useCallback(async () => {
		setMcpLoading(true)
		try {
			const statuses = await window.api.invoke({ type: "reloadMcp" })
			setMcpStatuses((statuses as McpServerStatus[]) ?? [])
		} catch {
			// ignore
		} finally {
			setMcpLoading(false)
		}
	}, [])

	const handleAddServer = useCallback(async () => {
		if (!newServer.name || !newServer.command) return
		setMcpLoading(true)
		try {
			const statuses = await window.api.invoke({
				type: "addMcpServer",
				serverName: newServer.name,
				serverCommand: newServer.command,
				serverArgs: newServer.args
					? newServer.args.split(/\s+/).filter(Boolean)
					: [],
				scope: newServer.scope,
			})
			setMcpStatuses((statuses as McpServerStatus[]) ?? [])
			setNewServer({ name: "", command: "", args: "", scope: "project" })
			setAddingServer(false)
		} catch {
			// ignore
		} finally {
			setMcpLoading(false)
		}
	}, [newServer])

	const handleRemoveServer = useCallback(async (serverName: string) => {
		setMcpLoading(true)
		try {
			const statuses = await window.api.invoke({
				type: "removeMcpServer",
				serverName,
			})
			setMcpStatuses((statuses as McpServerStatus[]) ?? [])
		} catch {
			// ignore
		} finally {
			setMcpLoading(false)
		}
	}, [])

	// Close on Escape (if used as closeable)
	useEffect(() => {
		if (!onClose) return
		const handleKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose()
		}
		window.addEventListener("keydown", handleKey)
		return () => window.removeEventListener("keydown", handleKey)
	}, [onClose])

	const sections = [
		{ id: "general", label: "General" },
		{ id: "mcp", label: "MCP" },
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
				flex: 1,
				display: "flex",
				flexDirection: "column",
				overflow: "hidden",
				background: "var(--bg)",
			}}
		>
			{/* Header */}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					padding: "16px 20px",
					borderBottom: "1px solid var(--border-muted)",
					flexShrink: 0,
					gap: 12,
				}}
			>
				{onClose && (
					<button
						onClick={onClose}
						style={{
							display: "flex",
							alignItems: "center",
							background: "transparent",
							border: "none",
							color: "var(--muted)",
							cursor: "pointer",
							padding: "2px",
						}}
						title="Back (Esc)"
					>
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
							<polyline points="15 18 9 12 15 6" />
						</svg>
					</button>
				)}
				<span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>
					Settings
				</span>
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

										<SectionHeader title="Permissions" />
										<SettingRow
											label="Auto-approve all tools"
											description="Skip confirmation dialogs for all tool execution (YOLO mode)"
										>
											<Toggle
												checked={state.yolo}
												onChange={(v) => update("yolo", v)}
											/>
										</SettingRow>

										{!state.yolo && permissions && (
											<div style={{ paddingBottom: 8 }}>
												<div
													style={{
														fontSize: 11,
														color: "var(--muted)",
														padding: "4px 0 8px",
														lineHeight: 1.4,
													}}
												>
													Fine-tune approval per tool category:
												</div>
												{Object.entries(permissions.categories).map(
													([catId, cat]) => (
														<SettingRow
															key={catId}
															label={cat.label}
															description={cat.description}
														>
															<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
																<Select
																	value={permissions.rules.categories[catId] ?? "ask"}
																	options={policyOptions}
																	onChange={(v) => updatePermissionPolicy(catId, v)}
																/>
																{permissions.sessionGrants.includes(catId) && (
																	<span
																		style={{
																			fontSize: 9,
																			color: "#059669",
																			background: "#05966922",
																			padding: "1px 5px",
																			borderRadius: 3,
																			border: "1px solid #05966944",
																			whiteSpace: "nowrap",
																		}}
																	>
																		Session grant
																	</span>
																)}
															</div>
														</SettingRow>
													),
												)}
												{permissions.sessionGrants.length > 0 && (
													<div style={{ paddingTop: 8 }}>
														<button
															onClick={resetSessionGrants}
															style={{
																padding: "5px 10px",
																background: "var(--bg-surface)",
																color: "var(--muted)",
																borderRadius: 6,
																border: "1px solid var(--border)",
																cursor: "pointer",
																fontSize: 11,
															}}
														>
															Reset session grants
														</button>
													</div>
												)}
											</div>
										)}
									</>
								)}

								{activeSection === "mcp" && (
									<>
										<SectionHeader title="MCP Servers" />
										<div
											style={{
												fontSize: 11,
												color: "var(--muted)",
												padding: "4px 0 8px",
												lineHeight: 1.4,
											}}
										>
											External tool servers connected via Model
											Context Protocol.
										</div>

										{mcpLoading && (
											<div
												style={{
													padding: 16,
													textAlign: "center",
													color: "var(--muted)",
													fontSize: 12,
												}}
											>
												Loading...
											</div>
										)}

										{!mcpLoading &&
											mcpStatuses.length === 0 && (
												<div
													style={{
														padding: "16px 0",
														color: "var(--muted)",
														fontSize: 12,
													}}
												>
													No MCP servers configured.
												</div>
											)}

										{!mcpLoading &&
											mcpStatuses.map((server) => (
												<div
													key={server.name}
													style={{
														padding: "10px 0",
														borderBottom:
															"1px solid var(--border-muted)",
													}}
												>
													<div
														style={{
															display: "flex",
															alignItems: "center",
															justifyContent:
																"space-between",
														}}
													>
														<div
															style={{
																display: "flex",
																alignItems:
																	"center",
																gap: 8,
															}}
														>
															<span
																style={{
																	width: 6,
																	height: 6,
																	borderRadius:
																		"50%",
																	background:
																		server.connected
																			? "#059669"
																			: "#ef4444",
																	flexShrink: 0,
																}}
															/>
															<span
																style={{
																	fontSize: 13,
																	fontWeight: 500,
																	color: "var(--text)",
																}}
															>
																{server.name}
															</span>
															<span
																style={{
																	fontSize: 10,
																	color: "var(--muted)",
																}}
															>
																{server.connected
																	? `${server.toolCount} tools`
																	: "disconnected"}
															</span>
														</div>
														<button
															onClick={() =>
																handleRemoveServer(
																	server.name,
																)
															}
															style={{
																padding: "2px 8px",
																background:
																	"transparent",
																color: "var(--muted)",
																borderRadius: 4,
																border: "1px solid var(--border-muted)",
																cursor: "pointer",
																fontSize: 10,
															}}
														>
															Remove
														</button>
													</div>
													{server.error && (
														<div
															style={{
																fontSize: 11,
																color: "#ef4444",
																marginTop: 4,
																paddingLeft: 14,
															}}
														>
															{server.error}
														</div>
													)}
													{server.connected &&
														server.toolNames
															.length > 0 && (
															<div
																style={{
																	fontSize: 10,
																	color: "var(--muted)",
																	marginTop: 4,
																	paddingLeft: 14,
																	lineHeight: 1.6,
																}}
															>
																{server.toolNames.join(
																	", ",
																)}
															</div>
														)}
												</div>
											))}

										<div
											style={{
												paddingTop: 12,
												display: "flex",
												gap: 8,
											}}
										>
											<button
												onClick={() =>
													setAddingServer(!addingServer)
												}
												style={{
													padding: "6px 12px",
													background:
														"var(--bg-surface)",
													color: "var(--accent)",
													borderRadius: 6,
													border: "1px solid var(--accent)",
													cursor: "pointer",
													fontSize: 11,
												}}
											>
												{addingServer
													? "Cancel"
													: "Add server"}
											</button>
											<button
												onClick={handleReloadMcp}
												style={{
													padding: "6px 12px",
													background:
														"var(--bg-surface)",
													color: "var(--muted)",
													borderRadius: 6,
													border: "1px solid var(--border)",
													cursor: "pointer",
													fontSize: 11,
												}}
											>
												Reload all
											</button>
										</div>

										{addingServer && (
											<div
												style={{
													marginTop: 12,
													padding: 12,
													background:
														"var(--bg-surface)",
													borderRadius: 8,
													border: "1px solid var(--border-muted)",
												}}
											>
												<div
													style={{
														display: "flex",
														flexDirection: "column",
														gap: 8,
													}}
												>
													<input
														value={newServer.name}
														onChange={(e) =>
															setNewServer((p) => ({
																...p,
																name: e.target
																	.value,
															}))
														}
														placeholder="Server name"
														style={{
															padding: "6px 8px",
															background:
																"var(--bg-elevated)",
															color: "var(--text)",
															border: "1px solid var(--border)",
															borderRadius: 4,
															fontSize: 12,
															fontFamily: "inherit",
														}}
													/>
													<input
														value={
															newServer.command
														}
														onChange={(e) =>
															setNewServer((p) => ({
																...p,
																command:
																	e.target
																		.value,
															}))
														}
														placeholder="Command (e.g., npx)"
														style={{
															padding: "6px 8px",
															background:
																"var(--bg-elevated)",
															color: "var(--text)",
															border: "1px solid var(--border)",
															borderRadius: 4,
															fontSize: 12,
															fontFamily: "inherit",
														}}
													/>
													<input
														value={newServer.args}
														onChange={(e) =>
															setNewServer((p) => ({
																...p,
																args: e.target
																	.value,
															}))
														}
														placeholder="Arguments (space-separated)"
														style={{
															padding: "6px 8px",
															background:
																"var(--bg-elevated)",
															color: "var(--text)",
															border: "1px solid var(--border)",
															borderRadius: 4,
															fontSize: 12,
															fontFamily: "inherit",
														}}
													/>
													<div
														style={{
															display: "flex",
															alignItems:
																"center",
															gap: 8,
														}}
													>
														<Select
															value={
																newServer.scope
															}
															options={[
																{
																	value: "project",
																	label: "Project",
																},
																{
																	value: "global",
																	label: "Global",
																},
															]}
															onChange={(v) =>
																setNewServer(
																	(p) => ({
																		...p,
																		scope: v,
																	}),
																)
															}
														/>
														<button
															onClick={
																handleAddServer
															}
															disabled={
																!newServer.name ||
																!newServer.command
															}
															style={{
																padding:
																	"6px 16px",
																background:
																	newServer.name &&
																	newServer.command
																		? "var(--accent)"
																		: "var(--bg-elevated)",
																color:
																	newServer.name &&
																	newServer.command
																		? "#fff"
																		: "var(--muted)",
																borderRadius: 6,
																cursor:
																	newServer.name &&
																	newServer.command
																		? "pointer"
																		: "default",
																fontSize: 12,
																fontWeight: 500,
															}}
														>
															Add
														</button>
													</div>
												</div>
											</div>
										)}
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
	)
}
