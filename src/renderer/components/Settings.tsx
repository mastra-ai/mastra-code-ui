import { useState, useEffect, useCallback } from "react"
import { type ModelInfo } from "./ModelSelector"
import type {
	NotificationMode,
	ThinkingLevel,
	SettingsState,
	PermissionData,
	McpServerStatus,
	SettingsProps,
} from "../types/settings"
import { AccountsSection } from "./settings/AccountsSection"
import { GeneralSection } from "./settings/GeneralSection"
import { McpSection } from "./settings/McpSection"
import { ModelsSection } from "./settings/ModelsSection"
import { AgentSection } from "./settings/AgentSection"
import { GitSection } from "./settings/GitSection"
import { MemorySection } from "./settings/MemorySection"

export function Settings({ onClose, loggedInProviders, onLogin, onApiKey, onLogout, initialSection, onSectionChange }: SettingsProps) {
	const [state, setState] = useState<SettingsState | null>(null)
	const [models, setModels] = useState<ModelInfo[]>([])
	const [activeSection, setActiveSectionRaw] = useState(initialSection || "general")
	const setActiveSection = useCallback((s: string) => {
		setActiveSectionRaw(s)
		onSectionChange?.(s)
	}, [onSectionChange])

	// Sync when initialSection changes externally (e.g. sidebar "Manage accounts" click)
	useEffect(() => {
		if (initialSection) setActiveSectionRaw(initialSection)
	}, [initialSection])
	const [permissions, setPermissions] = useState<PermissionData | null>(null)
	const [mcpStatuses, setMcpStatuses] = useState<McpServerStatus[]>([])
	const [mcpLoading, setMcpLoading] = useState(false)

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
				defaultClonePath: (st?.defaultClonePath as string) ?? "",
			})
			if (Array.isArray(m)) setModels(m as ModelInfo[])
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

	const handleAddServer = useCallback(async (server: { name: string; command: string; args: string; scope: string }) => {
		if (!server.name || !server.command) return
		setMcpLoading(true)
		try {
			const statuses = await window.api.invoke({
				type: "addMcpServer",
				serverName: server.name,
				serverCommand: server.command,
				serverArgs: server.args
					? server.args.split(/\s+/).filter(Boolean)
					: [],
				scope: server.scope,
			})
			setMcpStatuses((statuses as McpServerStatus[]) ?? [])
		} catch {
			// ignore
		} finally {
			setMcpLoading(false)
		}
	}, [])

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
		{ id: "accounts", label: "Accounts" },
		{ id: "general", label: "General" },
		{ id: "mcp", label: "MCP" },
		{ id: "models", label: "Models" },
		{ id: "agent", label: "Agent" },
		{ id: "git", label: "Git" },
		{ id: "memory", label: "Memory" },
	]

	const modelsLoaded = models.length > 0

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
								{activeSection === "accounts" && (
									<AccountsSection
										loggedInProviders={loggedInProviders}
										onLogin={onLogin}
										onApiKey={onApiKey}
										onLogout={onLogout}
									/>
								)}

								{activeSection === "general" && (
									<GeneralSection
										state={state}
										permissions={permissions}
										update={update}
										updatePermissionPolicy={updatePermissionPolicy}
										resetSessionGrants={resetSessionGrants}
									/>
								)}

								{activeSection === "mcp" && (
									<McpSection
										mcpStatuses={mcpStatuses}
										mcpLoading={mcpLoading}
										onReload={handleReloadMcp}
										onAddServer={handleAddServer}
										onRemoveServer={handleRemoveServer}
									/>
								)}

								{activeSection === "models" && (
									<ModelsSection
										state={state}
										update={update}
									/>
								)}

								{activeSection === "agent" && (
									<AgentSection
										state={state}
										update={update}
									/>
								)}

								{activeSection === "git" && (
									<GitSection
										state={state}
										setState={setState}
										update={update}
									/>
								)}

								{activeSection === "memory" && (
									<MemorySection
										state={state}
										models={models}
										modelsLoaded={modelsLoaded}
										update={update}
									/>
								)}
							</>
						)}
					</div>
				</div>
		</div>
	)
}
