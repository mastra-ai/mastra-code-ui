import { useState, useEffect, useCallback, useMemo } from "react"

export interface LinearIssue {
	id: string
	identifier: string
	title: string
	description?: string
	state: { id: string; name: string; color: string; type: string }
	assignee?: { name: string; displayName: string }
	priority: number
	url: string
	labels: Array<{ name: string; color: string }>
	createdAt: string
	updatedAt: string
}

interface LinearTeam {
	id: string
	name: string
	key: string
}

interface LinearState {
	id: string
	name: string
	color: string
	type: string
	position: number
}

interface AgentTask {
	content: string
	status: "pending" | "in_progress" | "completed"
	activeForm: string
}

export interface WorkflowStates {
	startedStateId: string
	doneStateId: string
}

interface TaskBoardProps {
	agentTasks: AgentTask[]
	onClose?: () => void
	onStartWork?: (issue: LinearIssue, workflowStates: WorkflowStates) => void
	linkedIssues?: Record<string, { issueId: string; issueIdentifier: string }>
	onSwitchToWorktree?: (worktreePath: string) => void
}

const PRIORITY_LABELS: Record<number, { label: string; color: string }> = {
	0: { label: "No priority", color: "var(--dim)" },
	1: { label: "Urgent", color: "#ef4444" },
	2: { label: "High", color: "#f97316" },
	3: { label: "Medium", color: "#eab308" },
	4: { label: "Low", color: "#6b7280" },
}

// Group states into kanban columns
const STATE_TYPE_ORDER = ["backlog", "unstarted", "started", "completed", "cancelled"]

export function TaskBoard({ agentTasks, onClose, onStartWork, linkedIssues, onSwitchToWorktree }: TaskBoardProps) {
	const [linearApiKey, setLinearApiKey] = useState("")
	const [teams, setTeams] = useState<LinearTeam[]>([])
	const [selectedTeamId, setSelectedTeamId] = useState("")
	const [issues, setIssues] = useState<LinearIssue[]>([])
	const [states, setStates] = useState<LinearState[]>([])
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [connected, setConnected] = useState(false)
	const [creating, setCreating] = useState(false)
	const [newTitle, setNewTitle] = useState("")
	const [newDescription, setNewDescription] = useState("")
	const [view, setView] = useState<"board" | "list">("board")
	const [filter, setFilter] = useState<"all" | "active" | "backlog">("active")
	const [showApiKeyInput, setShowApiKeyInput] = useState(false)
	const [connecting, setConnecting] = useState(false)

	// Load saved Linear API key
	useEffect(() => {
		async function load() {
			const state = (await window.api.invoke({ type: "getState" })) as Record<string, unknown>
			const key = (state?.linearApiKey as string) ?? ""
			const teamId = (state?.linearTeamId as string) ?? ""
			setLinearApiKey(key)
			if (teamId) setSelectedTeamId(teamId)
			if (key) {
				setConnected(true)
				loadTeams(key)
			}
		}
		load()
	}, [])

	// Load issues when team changes
	useEffect(() => {
		if (connected && linearApiKey && selectedTeamId) {
			loadIssues()
			loadStates()
		}
	}, [selectedTeamId, connected])

	const linearQuery = useCallback(
		async (query: string, variables?: Record<string, unknown>) => {
			const result = (await window.api.invoke({
				type: "linearQuery",
				apiKey: linearApiKey,
				query,
				variables,
			})) as { data?: unknown; errors?: Array<{ message: string }> }
			if (result.errors?.length) {
				throw new Error(result.errors[0].message)
			}
			return result.data
		},
		[linearApiKey],
	)

	const loadTeams = useCallback(
		async (key?: string) => {
			try {
				const data = (await window.api.invoke({
					type: "linearQuery",
					apiKey: key || linearApiKey,
					query: `{ teams { nodes { id name key } } }`,
				})) as { data?: { teams?: { nodes: LinearTeam[] } }; errors?: Array<{ message: string }> }
				if (data.errors?.length) throw new Error(data.errors[0].message)
				const teamNodes = data.data?.teams?.nodes ?? []
				setTeams(teamNodes)
				if (teamNodes.length > 0 && !selectedTeamId) {
					setSelectedTeamId(teamNodes[0].id)
				}
			} catch (err: any) {
				setError(err.message)
			}
		},
		[linearApiKey, selectedTeamId],
	)

	const loadIssues = useCallback(async () => {
		if (!linearApiKey || !selectedTeamId) return
		setLoading(true)
		setError(null)
		try {
			const data = (await window.api.invoke({
				type: "linearQuery",
				apiKey: linearApiKey,
				query: `query($teamId: String!) {
					team(id: $teamId) {
						issues(first: 100, orderBy: updatedAt) {
							nodes {
								id identifier title description
								state { id name color type }
								assignee { name displayName }
								priority url
								labels { nodes { name color } }
								createdAt updatedAt
							}
						}
					}
				}`,
				variables: { teamId: selectedTeamId },
			})) as { data?: { team?: { issues?: { nodes: any[] } } }; errors?: Array<{ message: string }> }
			if (data.errors?.length) throw new Error(data.errors[0].message)
			const nodes = data.data?.team?.issues?.nodes ?? []
			setIssues(
				nodes.map((n: any) => ({
					...n,
					labels: n.labels?.nodes ?? [],
				})),
			)
		} catch (err: any) {
			setError(err.message)
		} finally {
			setLoading(false)
		}
	}, [linearApiKey, selectedTeamId])

	const loadStates = useCallback(async () => {
		if (!linearApiKey || !selectedTeamId) return
		try {
			const data = (await window.api.invoke({
				type: "linearQuery",
				apiKey: linearApiKey,
				query: `query($teamId: String!) {
					team(id: $teamId) {
						states { nodes { id name color type position } }
					}
				}`,
				variables: { teamId: selectedTeamId },
			})) as { data?: { team?: { states?: { nodes: LinearState[] } } }; errors?: Array<{ message: string }> }
			if (data.errors?.length) throw new Error(data.errors[0].message)
			setStates(data.data?.team?.states?.nodes ?? [])
		} catch {
			// non-critical
		}
	}, [linearApiKey, selectedTeamId])

	const handleOAuthConnect = useCallback(async () => {
		setConnecting(true)
		setError(null)
		try {
			const result = (await window.api.invoke({
				type: "linearConnect",
			})) as { success: boolean; accessToken?: string; error?: string }

			if (result.error === "needs_api_key" || result.error === "cancelled") {
				// Popup was closed — show API key paste input
				setShowApiKeyInput(true)
				setConnecting(false)
				return
			}

			if (!result.success || !result.accessToken) {
				throw new Error(result.error || "Failed to connect")
			}

			// OAuth succeeded — use the access token
			setLinearApiKey(result.accessToken)
			setConnected(true)
			loadTeams(result.accessToken)
		} catch (err: any) {
			setError(err.message || "Failed to connect to Linear")
		} finally {
			setConnecting(false)
		}
	}, [])

	const handleApiKeyConnect = useCallback(async () => {
		if (!linearApiKey.trim()) return
		setLoading(true)
		setError(null)
		try {
			const data = (await window.api.invoke({
				type: "linearQuery",
				apiKey: linearApiKey,
				query: `{ viewer { id name } teams { nodes { id name key } } }`,
			})) as { data?: { teams?: { nodes: LinearTeam[] } }; errors?: Array<{ message: string }> }
			if (data.errors?.length) throw new Error(data.errors[0].message)
			const teamNodes = data.data?.teams?.nodes ?? []
			setTeams(teamNodes)
			if (teamNodes.length > 0) setSelectedTeamId(teamNodes[0].id)
			setConnected(true)
			await window.api.invoke({
				type: "setState",
				patch: { linearApiKey: linearApiKey },
			})
		} catch (err: any) {
			setError(err.message || "Failed to connect to Linear")
		} finally {
			setLoading(false)
		}
	}, [linearApiKey])

	const handleDisconnect = useCallback(async () => {
		setConnected(false)
		setIssues([])
		setTeams([])
		setStates([])
		setLinearApiKey("")
		await window.api.invoke({
			type: "setState",
			patch: { linearApiKey: "", linearTeamId: "" },
		})
	}, [])

	const handleTeamChange = useCallback(
		async (teamId: string) => {
			setSelectedTeamId(teamId)
			await window.api.invoke({
				type: "setState",
				patch: { linearTeamId: teamId },
			})
		},
		[],
	)

	const handleUpdateStatus = useCallback(
		async (issueId: string, stateId: string) => {
			try {
				await window.api.invoke({
					type: "linearQuery",
					apiKey: linearApiKey,
					query: `mutation($id: String!, $stateId: String!) {
						issueUpdate(id: $id, input: { stateId: $stateId }) {
							success
						}
					}`,
					variables: { id: issueId, stateId },
				})
				// Update locally
				setIssues((prev) =>
					prev.map((issue) => {
						if (issue.id !== issueId) return issue
						const newState = states.find((s) => s.id === stateId)
						return newState ? { ...issue, state: newState } : issue
					}),
				)
			} catch (err: any) {
				setError(err.message)
			}
		},
		[linearApiKey, states],
	)

	const handleCreateIssue = useCallback(async () => {
		if (!newTitle.trim() || !selectedTeamId) return
		setLoading(true)
		try {
			await window.api.invoke({
				type: "linearQuery",
				apiKey: linearApiKey,
				query: `mutation($teamId: String!, $title: String!, $description: String) {
					issueCreate(input: { teamId: $teamId, title: $title, description: $description }) {
						success
					}
				}`,
				variables: {
					teamId: selectedTeamId,
					title: newTitle,
					description: newDescription || undefined,
				},
			})
			setNewTitle("")
			setNewDescription("")
			setCreating(false)
			// Reload issues
			await loadIssues()
		} catch (err: any) {
			setError(err.message)
		} finally {
			setLoading(false)
		}
	}, [linearApiKey, selectedTeamId, newTitle, newDescription, loadIssues])

	// Compute workflow state IDs for "started" and "completed" types
	const workflowStates = useMemo<WorkflowStates>(() => {
		const started = states.find((s) => s.type === "started")
		const done = states.find((s) => s.type === "completed")
		return {
			startedStateId: started?.id ?? "",
			doneStateId: done?.id ?? "",
		}
	}, [states])

	// Reverse map: issueId → worktreePath
	const issueWorktreeMap = useMemo(() => {
		const map: Record<string, string> = {}
		if (linkedIssues) {
			for (const [wtPath, info] of Object.entries(linkedIssues)) {
				map[info.issueId] = wtPath
			}
		}
		return map
	}, [linkedIssues])

	// Filter issues
	const filteredIssues = issues.filter((issue) => {
		if (filter === "all") return true
		if (filter === "active")
			return issue.state.type === "started" || issue.state.type === "unstarted"
		if (filter === "backlog") return issue.state.type === "backlog"
		return true
	})

	// Group issues by state type for board view
	const columns = STATE_TYPE_ORDER.filter((type) =>
		filter === "all" ? true : type !== "cancelled",
	).map((type) => {
		const columnStates = states
			.filter((s) => s.type === type)
			.sort((a, b) => a.position - b.position)
		const columnIssues = filteredIssues.filter((i) => i.state.type === type)
		const label =
			type === "backlog"
				? "Backlog"
				: type === "unstarted"
					? "Todo"
					: type === "started"
						? "In Progress"
						: type === "completed"
							? "Done"
							: "Cancelled"
		return { type, label, states: columnStates, issues: columnIssues }
	})

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
					padding: "12px 20px",
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
						<svg
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<polyline points="15 18 9 12 15 6" />
						</svg>
					</button>
				)}
				<span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>
					Tasks
				</span>

				{connected && (
					<>
						{/* Team selector */}
						<select
							value={selectedTeamId}
							onChange={(e) => handleTeamChange(e.target.value)}
							style={{
								background: "var(--bg-elevated)",
								color: "var(--text)",
								border: "1px solid var(--border)",
								borderRadius: 4,
								padding: "3px 8px",
								fontSize: 11,
								cursor: "pointer",
								fontFamily: "inherit",
							}}
						>
							{teams.map((t) => (
								<option key={t.id} value={t.id}>
									{t.name} ({t.key})
								</option>
							))}
						</select>

						{/* View toggle */}
						<div style={{ display: "flex", gap: 2, background: "var(--bg-surface)", borderRadius: 4, padding: 1 }}>
							{(["board", "list"] as const).map((v) => (
								<button
									key={v}
									onClick={() => setView(v)}
									style={{
										padding: "3px 10px",
										fontSize: 11,
										borderRadius: 3,
										background: view === v ? "var(--bg-elevated)" : "transparent",
										color: view === v ? "var(--text)" : "var(--muted)",
										cursor: "pointer",
										fontWeight: view === v ? 500 : 400,
										border: view === v ? "1px solid var(--border-muted)" : "1px solid transparent",
									}}
								>
									{v === "board" ? "Board" : "List"}
								</button>
							))}
						</div>

						{/* Filter */}
						<div style={{ display: "flex", gap: 2, background: "var(--bg-surface)", borderRadius: 4, padding: 1 }}>
							{(["active", "all", "backlog"] as const).map((f) => (
								<button
									key={f}
									onClick={() => setFilter(f)}
									style={{
										padding: "3px 10px",
										fontSize: 11,
										borderRadius: 3,
										background: filter === f ? "var(--bg-elevated)" : "transparent",
										color: filter === f ? "var(--text)" : "var(--muted)",
										cursor: "pointer",
										fontWeight: filter === f ? 500 : 400,
										border: filter === f ? "1px solid var(--border-muted)" : "1px solid transparent",
									}}
								>
									{f === "active" ? "Active" : f === "all" ? "All" : "Backlog"}
								</button>
							))}
						</div>

						<div style={{ flex: 1 }} />

						{/* Create + Refresh */}
						<button
							onClick={() => setCreating(!creating)}
							style={{
								padding: "4px 12px",
								fontSize: 11,
								background: "var(--accent)",
								color: "#fff",
								borderRadius: 4,
								cursor: "pointer",
								fontWeight: 500,
							}}
						>
							+ New Issue
						</button>
						<button
							onClick={loadIssues}
							disabled={loading}
							style={{
								padding: "4px 10px",
								fontSize: 11,
								background: "var(--bg-surface)",
								color: "var(--muted)",
								borderRadius: 4,
								border: "1px solid var(--border-muted)",
								cursor: "pointer",
							}}
						>
							{loading ? "..." : "Refresh"}
						</button>
						<button
							onClick={handleDisconnect}
							style={{
								padding: "4px 10px",
								fontSize: 11,
								background: "transparent",
								color: "var(--dim)",
								borderRadius: 4,
								border: "1px solid var(--border-muted)",
								cursor: "pointer",
							}}
						>
							Disconnect
						</button>
					</>
				)}
			</div>

			{error && (
				<div
					style={{
						padding: "8px 20px",
						fontSize: 12,
						color: "#ef4444",
						background: "#ef444411",
						borderBottom: "1px solid var(--border-muted)",
					}}
				>
					{error}
					<button
						onClick={() => setError(null)}
						style={{
							marginLeft: 8,
							color: "#ef4444",
							background: "transparent",
							border: "none",
							cursor: "pointer",
							fontSize: 11,
						}}
					>
						dismiss
					</button>
				</div>
			)}

			{/* Create issue form */}
			{creating && (
				<div
					style={{
						padding: "12px 20px",
						borderBottom: "1px solid var(--border-muted)",
						display: "flex",
						gap: 8,
						alignItems: "flex-start",
					}}
				>
					<div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
						<input
							value={newTitle}
							onChange={(e) => setNewTitle(e.target.value)}
							placeholder="Issue title"
							autoFocus
							onKeyDown={(e) => {
								if (e.key === "Enter" && !e.shiftKey) handleCreateIssue()
								if (e.key === "Escape") setCreating(false)
							}}
							style={{
								padding: "6px 10px",
								background: "var(--bg-elevated)",
								color: "var(--text)",
								border: "1px solid var(--border)",
								borderRadius: 4,
								fontSize: 13,
								fontFamily: "inherit",
							}}
						/>
						<input
							value={newDescription}
							onChange={(e) => setNewDescription(e.target.value)}
							placeholder="Description (optional)"
							style={{
								padding: "6px 10px",
								background: "var(--bg-elevated)",
								color: "var(--text)",
								border: "1px solid var(--border)",
								borderRadius: 4,
								fontSize: 12,
								fontFamily: "inherit",
							}}
						/>
					</div>
					<button
						onClick={handleCreateIssue}
						disabled={!newTitle.trim()}
						style={{
							padding: "6px 16px",
							background: newTitle.trim() ? "var(--accent)" : "var(--bg-elevated)",
							color: newTitle.trim() ? "#fff" : "var(--muted)",
							borderRadius: 4,
							cursor: newTitle.trim() ? "pointer" : "default",
							fontSize: 12,
							fontWeight: 500,
							alignSelf: "flex-start",
						}}
					>
						Create
					</button>
				</div>
			)}

			{/* Main content */}
			<div style={{ flex: 1, overflow: "auto", padding: connected ? 0 : 20 }}>
				{!connected ? (
					/* Connect to Linear */
					<div
						style={{
							maxWidth: 420,
							margin: "40px auto",
							textAlign: "center",
						}}
					>
						{/* Agent tasks section (always visible) */}
						{agentTasks.length > 0 && (
							<div style={{ marginBottom: 32, textAlign: "left" }}>
								<div
									style={{
										fontSize: 10,
										fontWeight: 600,
										color: "var(--muted)",
										textTransform: "uppercase",
										letterSpacing: "0.5px",
										marginBottom: 8,
									}}
								>
									Agent Tasks
								</div>
								{agentTasks.map((task, i) => (
									<div
										key={i}
										style={{
											display: "flex",
											alignItems: "center",
											gap: 8,
											padding: "6px 10px",
											background: "var(--bg-surface)",
											borderRadius: 6,
											marginBottom: 4,
											border: "1px solid var(--border-muted)",
										}}
									>
										<span
											style={{
												fontFamily: "monospace",
												fontSize: 11,
												color:
													task.status === "completed"
														? "var(--success)"
														: task.status === "in_progress"
															? "var(--warning)"
															: "var(--muted)",
											}}
										>
											{task.status === "completed"
												? "[x]"
												: task.status === "in_progress"
													? "[~]"
													: "[ ]"}
										</span>
										<span
											style={{
												fontSize: 12,
												color: "var(--text)",
												opacity: task.status === "completed" ? 0.6 : 1,
												textDecoration:
													task.status === "completed" ? "line-through" : "none",
											}}
										>
											{task.content}
										</span>
									</div>
								))}
							</div>
						)}

						{/* Linear Logo */}
						<div style={{ marginBottom: 16 }}>
							<svg
								width="40"
								height="40"
								viewBox="0 0 100 100"
								fill="none"
								style={{ opacity: 0.6 }}
							>
								<path
									d="M5.22 58.87a47.2 47.2 0 0 1-1.05-5.97l38.93 38.93a47.2 47.2 0 0 1-5.97-1.05L5.22 58.87ZM2.33 46.44a49 49 0 0 0-.3 3.51l48.02 48.02c1.18-.04 2.35-.14 3.5-.3L2.34 46.44Zm1.54 19.18a47.6 47.6 0 0 1-.53-3.6l40.7 40.7c-1.23-.12-2.43-.3-3.6-.53l-36.57-36.57Zm-1.7-9.6 51.77 51.78c1.2-.17 2.39-.4 3.55-.68L3.48 53.1a49 49 0 0 0-.31 2.92Zm45.78 43.7L1.02 52.79c-.02.2-.05.39-.06.58l47.59 47.58c.13-.07.27-.14.4-.23Zm5.71-1.4L4.17 48.82A49.2 49.2 0 0 0 3 52.12l47.06 47.06a47 47 0 0 0 3.6-.86Zm3.4-1.24L8.35 48.37a48 48 0 0 0-1.76 2.84l46.18 46.18a47 47 0 0 0 4.29-1.3Zm4.04-1.69L11.44 45.73c-.8.81-1.56 1.66-2.28 2.53l44.25 44.25a47 47 0 0 0 7.69-3.12Zm5.64-3.63L15.6 41.62c-.93.85-1.82 1.75-2.67 2.68l44.35 44.35a47.4 47.4 0 0 0 9.46-5.9Zm12.48-14.38c9.4-14.87 8.04-34.64-4.1-48.07L24.64 80.59c13.43 12.14 33.2 13.5 48.07 4.09l3.51-3.3ZM73.7 25.64C60.14 10.8 38.5 8.8 22.76 19.04l58.2 58.2C91.2 61.5 89.2 39.86 74.36 26.3l-.66-.66Z"
									fill="var(--muted)"
								/>
							</svg>
						</div>
						<div
							style={{
								fontSize: 15,
								fontWeight: 600,
								color: "var(--text)",
								marginBottom: 6,
							}}
						>
							Connect to Linear
						</div>
						<div
							style={{
								fontSize: 12,
								color: "var(--dim)",
								marginBottom: 20,
								lineHeight: 1.5,
							}}
						>
							Sync your issues, track progress, and manage tasks directly from here.
						</div>

						{/* Primary: Sign in button */}
						<button
							onClick={handleOAuthConnect}
							disabled={connecting}
							style={{
								width: "100%",
								padding: "10px 20px",
								background: connecting ? "var(--bg-elevated)" : "#5E6AD2",
								color: connecting ? "var(--muted)" : "#fff",
								borderRadius: 8,
								cursor: connecting ? "default" : "pointer",
								fontSize: 13,
								fontWeight: 600,
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								gap: 8,
								border: "none",
								transition: "opacity 0.15s",
							}}
						>
							{connecting ? (
								"Connecting..."
							) : (
								<>
									<svg
										width="16"
										height="16"
										viewBox="0 0 100 100"
										fill="currentColor"
									>
										<path d="M5.22 58.87a47.2 47.2 0 0 1-1.05-5.97l38.93 38.93a47.2 47.2 0 0 1-5.97-1.05L5.22 58.87ZM2.33 46.44a49 49 0 0 0-.3 3.51l48.02 48.02c1.18-.04 2.35-.14 3.5-.3L2.34 46.44Zm1.54 19.18a47.6 47.6 0 0 1-.53-3.6l40.7 40.7c-1.23-.12-2.43-.3-3.6-.53l-36.57-36.57Zm-1.7-9.6 51.77 51.78c1.2-.17 2.39-.4 3.55-.68L3.48 53.1a49 49 0 0 0-.31 2.92Zm45.78 43.7L1.02 52.79c-.02.2-.05.39-.06.58l47.59 47.58c.13-.07.27-.14.4-.23Zm5.71-1.4L4.17 48.82A49.2 49.2 0 0 0 3 52.12l47.06 47.06a47 47 0 0 0 3.6-.86Zm3.4-1.24L8.35 48.37a48 48 0 0 0-1.76 2.84l46.18 46.18a47 47 0 0 0 4.29-1.3Zm4.04-1.69L11.44 45.73c-.8.81-1.56 1.66-2.28 2.53l44.25 44.25a47 47 0 0 0 7.69-3.12Zm5.64-3.63L15.6 41.62c-.93.85-1.82 1.75-2.67 2.68l44.35 44.35a47.4 47.4 0 0 0 9.46-5.9Zm12.48-14.38c9.4-14.87 8.04-34.64-4.1-48.07L24.64 80.59c13.43 12.14 33.2 13.5 48.07 4.09l3.51-3.3ZM73.7 25.64C60.14 10.8 38.5 8.8 22.76 19.04l58.2 58.2C91.2 61.5 89.2 39.86 74.36 26.3l-.66-.66Z" />
									</svg>
									Sign in with Linear
								</>
							)}
						</button>

						{/* Divider + API key fallback */}
						{!showApiKeyInput ? (
							<button
								onClick={() => setShowApiKeyInput(true)}
								style={{
									marginTop: 12,
									background: "transparent",
									border: "none",
									color: "var(--dim)",
									cursor: "pointer",
									fontSize: 11,
									padding: "4px 0",
								}}
							>
								Or use a personal API key
							</button>
						) : (
							<div style={{ marginTop: 16 }}>
								<div
									style={{
										display: "flex",
										alignItems: "center",
										gap: 8,
										marginBottom: 8,
									}}
								>
									<div
										style={{
											flex: 1,
											height: 1,
											background: "var(--border-muted)",
										}}
									/>
									<span
										style={{
											fontSize: 10,
											color: "var(--dim)",
											textTransform: "uppercase",
											letterSpacing: "0.5px",
										}}
									>
										API Key
									</span>
									<div
										style={{
											flex: 1,
											height: 1,
											background: "var(--border-muted)",
										}}
									/>
								</div>
								<div
									style={{
										fontSize: 11,
										color: "var(--dim)",
										marginBottom: 8,
										lineHeight: 1.5,
									}}
								>
									Create a key at{" "}
									<button
										onClick={() =>
											window.api.invoke({
												type: "openExternal",
												url: "https://linear.app/settings/api",
											})
										}
										style={{
											background: "transparent",
											border: "none",
											color: "var(--accent)",
											cursor: "pointer",
											fontSize: 11,
											textDecoration: "underline",
											padding: 0,
										}}
									>
										linear.app/settings/api
									</button>
								</div>
								<div style={{ display: "flex", gap: 8 }}>
									<input
										type="password"
										value={linearApiKey}
										onChange={(e) =>
											setLinearApiKey(e.target.value)
										}
										placeholder="lin_api_..."
										onKeyDown={(e) => {
											if (e.key === "Enter")
												handleApiKeyConnect()
										}}
										autoFocus
										style={{
											flex: 1,
											padding: "8px 12px",
											background: "var(--bg-elevated)",
											color: "var(--text)",
											border: "1px solid var(--border)",
											borderRadius: 6,
											fontSize: 12,
											fontFamily: "monospace",
										}}
									/>
									<button
										onClick={handleApiKeyConnect}
										disabled={
											!linearApiKey.trim() || loading
										}
										style={{
											padding: "8px 16px",
											background:
												linearApiKey.trim() && !loading
													? "var(--accent)"
													: "var(--bg-elevated)",
											color:
												linearApiKey.trim() && !loading
													? "#fff"
													: "var(--muted)",
											borderRadius: 6,
											cursor:
												linearApiKey.trim() && !loading
													? "pointer"
													: "default",
											fontSize: 12,
											fontWeight: 500,
											border: "none",
										}}
									>
										{loading ? "..." : "Connect"}
									</button>
								</div>
							</div>
						)}
					</div>
				) : view === "board" ? (
					/* Board view */
					<div
						style={{
							display: "flex",
							gap: 0,
							height: "100%",
							overflow: "auto",
						}}
					>
						{/* Agent tasks column (if any) */}
						{agentTasks.length > 0 && (
							<div
								style={{
									minWidth: 240,
									maxWidth: 280,
									borderRight: "1px solid var(--border-muted)",
									display: "flex",
									flexDirection: "column",
								}}
							>
								<div
									style={{
										padding: "10px 12px",
										fontSize: 11,
										fontWeight: 600,
										color: "var(--muted)",
										textTransform: "uppercase",
										letterSpacing: "0.5px",
										borderBottom: "1px solid var(--border-muted)",
										background: "var(--bg-surface)",
										display: "flex",
										alignItems: "center",
										gap: 6,
									}}
								>
									Agent
									<span
										style={{
											fontSize: 10,
											color: "var(--dim)",
											fontWeight: 400,
											textTransform: "none",
										}}
									>
										{agentTasks.length}
									</span>
								</div>
								<div style={{ flex: 1, overflow: "auto", padding: 8 }}>
									{agentTasks.map((task, i) => (
										<div
											key={i}
											style={{
												padding: "8px 10px",
												background: "var(--bg-surface)",
												borderRadius: 6,
												marginBottom: 6,
												border: "1px solid var(--border-muted)",
											}}
										>
											<div
												style={{
													display: "flex",
													alignItems: "center",
													gap: 6,
													marginBottom: 2,
												}}
											>
												<span
													style={{
														width: 6,
														height: 6,
														borderRadius: "50%",
														background:
															task.status === "completed"
																? "var(--success)"
																: task.status === "in_progress"
																	? "var(--warning)"
																	: "var(--muted)",
														flexShrink: 0,
													}}
												/>
												<span
													style={{
														fontSize: 12,
														color: "var(--text)",
														opacity:
															task.status === "completed" ? 0.6 : 1,
													}}
												>
													{task.content}
												</span>
											</div>
											{task.status === "in_progress" && task.activeForm && (
												<div
													style={{
														fontSize: 10,
														color: "var(--warning)",
														paddingLeft: 12,
													}}
												>
													{task.activeForm}
												</div>
											)}
										</div>
									))}
								</div>
							</div>
						)}

						{/* Linear columns */}
						{columns.map((col) => (
							<div
								key={col.type}
								style={{
									minWidth: 240,
									maxWidth: 280,
									flex: 1,
									borderRight: "1px solid var(--border-muted)",
									display: "flex",
									flexDirection: "column",
								}}
							>
								<div
									style={{
										padding: "10px 12px",
										fontSize: 11,
										fontWeight: 600,
										color: "var(--muted)",
										textTransform: "uppercase",
										letterSpacing: "0.5px",
										borderBottom: "1px solid var(--border-muted)",
										background: "var(--bg-surface)",
										display: "flex",
										alignItems: "center",
										gap: 6,
									}}
								>
									{col.label}
									<span
										style={{
											fontSize: 10,
											color: "var(--dim)",
											fontWeight: 400,
											textTransform: "none",
										}}
									>
										{col.issues.length}
									</span>
								</div>
								<div style={{ flex: 1, overflow: "auto", padding: 8 }}>
									{col.issues.map((issue) => (
										<IssueCard
											key={issue.id}
											issue={issue}
											states={states}
											onUpdateStatus={handleUpdateStatus}
											onStartWork={onStartWork ? () => onStartWork(issue, workflowStates) : undefined}
											linkedWorktree={issueWorktreeMap[issue.id]}
											onSwitchToWorktree={onSwitchToWorktree}
										/>
									))}
									{col.issues.length === 0 && (
										<div
											style={{
												padding: "16px 8px",
												fontSize: 11,
												color: "var(--dim)",
												textAlign: "center",
											}}
										>
											No issues
										</div>
									)}
								</div>
							</div>
						))}
					</div>
				) : (
					/* List view */
					<div style={{ padding: "8px 20px" }}>
						{/* Agent tasks */}
						{agentTasks.length > 0 && (
							<div style={{ marginBottom: 16 }}>
								<div
									style={{
										fontSize: 10,
										fontWeight: 600,
										color: "var(--muted)",
										textTransform: "uppercase",
										letterSpacing: "0.5px",
										padding: "8px 0",
									}}
								>
									Agent Tasks
								</div>
								{agentTasks.map((task, i) => (
									<div
										key={i}
										style={{
											display: "flex",
											alignItems: "center",
											gap: 10,
											padding: "8px 0",
											borderBottom: "1px solid var(--border-muted)",
										}}
									>
										<span
											style={{
												width: 8,
												height: 8,
												borderRadius: "50%",
												background:
													task.status === "completed"
														? "var(--success)"
														: task.status === "in_progress"
															? "var(--warning)"
															: "var(--muted)",
												flexShrink: 0,
											}}
										/>
										<span
											style={{
												fontSize: 13,
												color: "var(--text)",
												flex: 1,
											}}
										>
											{task.content}
										</span>
										<span
											style={{
												fontSize: 10,
												color: "var(--muted)",
												textTransform: "capitalize",
											}}
										>
											{task.status.replace("_", " ")}
										</span>
									</div>
								))}
							</div>
						)}

						{/* Linear issues */}
						{filteredIssues.map((issue) => (
							<div
								key={issue.id}
								style={{
									display: "flex",
									alignItems: "center",
									gap: 10,
									padding: "8px 0",
									borderBottom: "1px solid var(--border-muted)",
								}}
							>
								<span
									style={{
										width: 8,
										height: 8,
										borderRadius: "50%",
										background: issue.state.color,
										flexShrink: 0,
									}}
								/>
								<span
									style={{
										fontSize: 11,
										color: "var(--muted)",
										fontFamily: "monospace",
										flexShrink: 0,
										width: 70,
									}}
								>
									{issue.identifier}
								</span>
								<button
									onClick={() =>
										window.api.invoke({
											type: "openExternal",
											url: issue.url,
										})
									}
									style={{
										fontSize: 13,
										color: "var(--text)",
										flex: 1,
										textAlign: "left",
										background: "transparent",
										border: "none",
										cursor: "pointer",
										padding: 0,
									}}
								>
									{issue.title}
								</button>
								<span
									style={{
										fontSize: 10,
										color: issue.state.color,
										background: issue.state.color + "18",
										padding: "2px 8px",
										borderRadius: 3,
										flexShrink: 0,
									}}
								>
									{issue.state.name}
								</span>
								{issue.priority > 0 && (
									<span
										style={{
											fontSize: 10,
											color: PRIORITY_LABELS[issue.priority]?.color,
											flexShrink: 0,
										}}
									>
										{PRIORITY_LABELS[issue.priority]?.label}
									</span>
								)}
							</div>
						))}
						{filteredIssues.length === 0 && !loading && (
							<div
								style={{
									padding: 32,
									textAlign: "center",
									color: "var(--dim)",
									fontSize: 12,
								}}
							>
								No issues to show
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	)
}

function IssueCard({
	issue,
	states,
	onUpdateStatus,
	onStartWork,
	linkedWorktree,
	onSwitchToWorktree,
}: {
	issue: LinearIssue
	states: LinearState[]
	onUpdateStatus: (issueId: string, stateId: string) => void
	onStartWork?: () => void
	linkedWorktree?: string
	onSwitchToWorktree?: (worktreePath: string) => void
}) {
	const [showStates, setShowStates] = useState(false)
	const priority = PRIORITY_LABELS[issue.priority]
	const isTerminal = issue.state.type === "completed" || issue.state.type === "cancelled"

	return (
		<div
			style={{
				padding: "8px 10px",
				background: "var(--bg-surface)",
				borderRadius: 6,
				marginBottom: 6,
				border: linkedWorktree ? "1px solid var(--accent)" : "1px solid var(--border-muted)",
				cursor: "pointer",
			}}
			onClick={() =>
				window.api.invoke({ type: "openExternal", url: issue.url })
			}
		>
			{/* Identifier + priority */}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 6,
					marginBottom: 4,
				}}
			>
				<span
					style={{
						fontSize: 10,
						color: "var(--muted)",
						fontFamily: "monospace",
					}}
				>
					{issue.identifier}
				</span>
				{issue.priority > 0 && (
					<span
						style={{
							fontSize: 9,
							color: priority?.color,
						}}
					>
						{priority?.label}
					</span>
				)}
				<div style={{ flex: 1 }} />
				{/* State changer */}
				<div
					style={{ position: "relative" }}
					onClick={(e) => e.stopPropagation()}
				>
					<button
						onClick={() => setShowStates(!showStates)}
						style={{
							fontSize: 9,
							color: issue.state.color,
							background: issue.state.color + "18",
							padding: "1px 6px",
							borderRadius: 3,
							cursor: "pointer",
							border: "none",
						}}
					>
						{issue.state.name}
					</button>
					{showStates && (
						<div
							style={{
								position: "absolute",
								top: "100%",
								right: 0,
								zIndex: 10,
								background: "var(--bg-elevated)",
								border: "1px solid var(--border)",
								borderRadius: 6,
								padding: 4,
								marginTop: 2,
								minWidth: 140,
								boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
							}}
						>
							{states
								.sort((a, b) => {
									const ai = STATE_TYPE_ORDER.indexOf(a.type)
									const bi = STATE_TYPE_ORDER.indexOf(b.type)
									return ai - bi || a.position - b.position
								})
								.map((s) => (
									<button
										key={s.id}
										onClick={() => {
											onUpdateStatus(issue.id, s.id)
											setShowStates(false)
										}}
										style={{
											display: "flex",
											alignItems: "center",
											gap: 6,
											padding: "5px 8px",
											fontSize: 11,
											color: s.id === issue.state.id ? "var(--text)" : "var(--muted)",
											background: s.id === issue.state.id ? "var(--bg-surface)" : "transparent",
											cursor: "pointer",
											width: "100%",
											textAlign: "left",
											borderRadius: 3,
											border: "none",
										}}
									>
										<span
											style={{
												width: 6,
												height: 6,
												borderRadius: "50%",
												background: s.color,
												flexShrink: 0,
											}}
										/>
										{s.name}
									</button>
								))}
						</div>
					)}
				</div>
			</div>
			{/* Title */}
			<div style={{ fontSize: 12, color: "var(--text)", lineHeight: 1.4 }}>
				{issue.title}
			</div>
			{/* Labels */}
			{issue.labels.length > 0 && (
				<div
					style={{
						display: "flex",
						gap: 4,
						marginTop: 6,
						flexWrap: "wrap",
					}}
				>
					{issue.labels.map((label) => (
						<span
							key={label.name}
							style={{
								fontSize: 9,
								color: label.color,
								background: label.color + "18",
								padding: "1px 5px",
								borderRadius: 3,
								border: `1px solid ${label.color}33`,
							}}
						>
							{label.name}
						</span>
					))}
				</div>
			)}
			{/* Assignee */}
			{issue.assignee && (
				<div
					style={{
						fontSize: 10,
						color: "var(--dim)",
						marginTop: 4,
					}}
				>
					{issue.assignee.displayName || issue.assignee.name}
				</div>
			)}
			{/* Worktree action */}
			<div onClick={(e) => e.stopPropagation()} style={{ marginTop: 6 }}>
				{linkedWorktree ? (
					<button
						onClick={() => onSwitchToWorktree?.(linkedWorktree)}
						style={{
							width: "100%",
							padding: "4px 8px",
							fontSize: 10,
							fontWeight: 500,
							background: "var(--accent)" + "18",
							color: "var(--accent)",
							border: "1px solid var(--accent)" + "44",
							borderRadius: 4,
							cursor: "pointer",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							gap: 4,
						}}
					>
						<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
							<circle cx="18" cy="18" r="3" /><circle cx="6" cy="6" r="3" /><path d="M6 21V9a9 9 0 0 0 9 9" />
						</svg>
						Switch to worktree
					</button>
				) : onStartWork && !isTerminal ? (
					<button
						onClick={onStartWork}
						style={{
							width: "100%",
							padding: "4px 8px",
							fontSize: 10,
							fontWeight: 500,
							background: "transparent",
							color: "var(--muted)",
							border: "1px solid var(--border-muted)",
							borderRadius: 4,
							cursor: "pointer",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							gap: 4,
						}}
					>
						<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
							<circle cx="18" cy="18" r="3" /><circle cx="6" cy="6" r="3" /><path d="M6 21V9a9 9 0 0 0 9 9" />
						</svg>
						Start work
					</button>
				) : null}
			</div>
		</div>
	)
}
