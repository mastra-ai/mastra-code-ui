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

export interface GitHubIssue {
	id: number
	number: number
	title: string
	body?: string
	state: "open" | "closed"
	labels: Array<{ name: string; color: string; description?: string }>
	assignee?: { login: string; avatar_url: string }
	assignees: Array<{ login: string }>
	milestone?: { title: string; number: number }
	html_url: string
	created_at: string
	updated_at: string
	pull_request?: unknown
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

interface HandmadeIssue {
	id: string
	title: string
	description?: string
	status: "todo" | "in_progress" | "done"
	createdAt: string
	updatedAt: string
}

export interface WorkflowStates {
	startedStateId: string
	doneStateId: string
}

// Normalized issue for the unified view
interface UnifiedIssue {
	id: string
	identifier: string
	title: string
	provider: "linear" | "github" | "handmade"
	state: { name: string; color: string; type: string }
	assignee?: string
	priority?: number
	url: string
	labels: Array<{ name: string; color: string }>
	createdAt: string
	updatedAt: string
	linearIssue?: LinearIssue
	githubIssue?: GitHubIssue
}

interface TaskBoardProps {
	agentTasks: AgentTask[]
	onClose?: () => void
	onStartWork?: (issue: LinearIssue, workflowStates: WorkflowStates) => void
	onStartWorkGithub?: (issue: GitHubIssue) => void
	linkedIssues?: Record<string, { issueId: string; issueIdentifier: string; provider?: string }>
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

const DEMO_STATES: LinearState[] = [
	{ id: "s1", name: "Backlog", color: "#bec2c8", type: "backlog", position: 0 },
	{ id: "s2", name: "Todo", color: "#e2e2e2", type: "unstarted", position: 0 },
	{ id: "s3", name: "In Progress", color: "#f2c94c", type: "started", position: 0 },
	{ id: "s4", name: "In Review", color: "#f2994a", type: "started", position: 1 },
	{ id: "s5", name: "Done", color: "#5e6ad2", type: "completed", position: 0 },
	{ id: "s6", name: "Cancelled", color: "#95a2b3", type: "cancelled", position: 0 },
]

const DEMO_ISSUES: LinearIssue[] = [
	{
		id: "d1", identifier: "MAS-42", title: "Add tool-use streaming to agent responses",
		state: DEMO_STATES[2], priority: 1, url: "#",
		labels: [{ name: "feature", color: "#5e6ad2" }, { name: "agents", color: "#26b5ce" }],
		assignee: { name: "Grayson", displayName: "Grayson" },
		createdAt: "2026-02-20T10:00:00Z", updatedAt: "2026-02-24T09:00:00Z",
	},
	{
		id: "d2", identifier: "MAS-41", title: "Implement RAG pipeline with pgvector embeddings",
		state: DEMO_STATES[2], priority: 2, url: "#",
		labels: [{ name: "feature", color: "#5e6ad2" }, { name: "rag", color: "#f2994a" }],
		assignee: { name: "Grayson", displayName: "Grayson" },
		createdAt: "2026-02-19T14:00:00Z", updatedAt: "2026-02-23T16:00:00Z",
	},
	{
		id: "d3", identifier: "MAS-40", title: "Fix memory leak in long-running workflow executions",
		state: DEMO_STATES[3], priority: 1, url: "#",
		labels: [{ name: "bug", color: "#eb5757" }, { name: "workflows", color: "#bb6bd9" }],
		assignee: { name: "Dax", displayName: "Dax" },
		createdAt: "2026-02-18T09:00:00Z", updatedAt: "2026-02-24T08:00:00Z",
	},
	{
		id: "d4", identifier: "MAS-39", title: "Add retry logic to MCP tool connections",
		state: DEMO_STATES[1], priority: 2, url: "#",
		labels: [{ name: "enhancement", color: "#27ae60" }, { name: "mcp", color: "#f2c94c" }],
		createdAt: "2026-02-17T11:00:00Z", updatedAt: "2026-02-22T14:00:00Z",
	},
	{
		id: "d5", identifier: "MAS-38", title: "Design system: unify button variants across app",
		state: DEMO_STATES[1], priority: 3, url: "#",
		labels: [{ name: "design", color: "#bb6bd9" }],
		assignee: { name: "Alex", displayName: "Alex" },
		createdAt: "2026-02-16T16:00:00Z", updatedAt: "2026-02-21T10:00:00Z",
	},
	{
		id: "d6", identifier: "MAS-37", title: "Support custom model providers via plugin system",
		state: DEMO_STATES[0], priority: 3, url: "#",
		labels: [{ name: "feature", color: "#5e6ad2" }],
		createdAt: "2026-02-15T08:00:00Z", updatedAt: "2026-02-20T09:00:00Z",
	},
	{
		id: "d7", identifier: "MAS-36", title: "Write integration tests for workflow engine",
		state: DEMO_STATES[0], priority: 4, url: "#",
		labels: [{ name: "testing", color: "#6fcf97" }],
		createdAt: "2026-02-14T13:00:00Z", updatedAt: "2026-02-19T11:00:00Z",
	},
	{
		id: "d8", identifier: "MAS-35", title: "Migrate auth tokens to secure keychain storage",
		state: DEMO_STATES[4], priority: 2, url: "#",
		labels: [{ name: "security", color: "#eb5757" }],
		assignee: { name: "Grayson", displayName: "Grayson" },
		createdAt: "2026-02-10T10:00:00Z", updatedAt: "2026-02-18T15:00:00Z",
	},
	{
		id: "d9", identifier: "MAS-34", title: "Add webhook support for workflow triggers",
		state: DEMO_STATES[4], priority: 3, url: "#",
		labels: [{ name: "feature", color: "#5e6ad2" }, { name: "workflows", color: "#bb6bd9" }],
		assignee: { name: "Dax", displayName: "Dax" },
		createdAt: "2026-02-08T09:00:00Z", updatedAt: "2026-02-16T17:00:00Z",
	},
	{
		id: "d10", identifier: "MAS-33", title: "Update onboarding flow with interactive tutorial",
		state: DEMO_STATES[1], priority: 3, url: "#",
		labels: [{ name: "design", color: "#bb6bd9" }, { name: "ux", color: "#26b5ce" }],
		createdAt: "2026-02-12T14:00:00Z", updatedAt: "2026-02-20T12:00:00Z",
	},
]

function LinearIcon({ size = 12 }: { size?: number }) {
	return (
		<svg width={size} height={size} viewBox="0 0 100 100" fill="none">
			<path
				d="M5.22 58.87a47.2 47.2 0 0 1-1.05-5.97l38.93 38.93a47.2 47.2 0 0 1-5.97-1.05L5.22 58.87ZM2.33 46.44a49 49 0 0 0-.3 3.51l48.02 48.02c1.18-.04 2.35-.14 3.5-.3L2.34 46.44Zm1.54 19.18a47.6 47.6 0 0 1-.53-3.6l40.7 40.7c-1.23-.12-2.43-.3-3.6-.53l-36.57-36.57Zm-1.7-9.6 51.77 51.78c1.2-.17 2.39-.4 3.55-.68L3.48 53.1a49 49 0 0 0-.31 2.92Zm45.78 43.7L1.02 52.79c-.02.2-.05.39-.06.58l47.59 47.58c.13-.07.27-.14.4-.23Zm5.71-1.4L4.17 48.82A49.2 49.2 0 0 0 3 52.12l47.06 47.06a47 47 0 0 0 3.6-.86Zm3.4-1.24L8.35 48.37a48 48 0 0 0-1.76 2.84l46.18 46.18a47 47 0 0 0 4.29-1.3Zm4.04-1.69L11.44 45.73c-.8.81-1.56 1.66-2.28 2.53l44.25 44.25a47 47 0 0 0 7.69-3.12Zm5.64-3.63L15.6 41.62c-.93.85-1.82 1.75-2.67 2.68l44.35 44.35a47.4 47.4 0 0 0 9.46-5.9Zm12.48-14.38c9.4-14.87 8.04-34.64-4.1-48.07L24.64 80.59c13.43 12.14 33.2 13.5 48.07 4.09l3.51-3.3ZM73.7 25.64C60.14 10.8 38.5 8.8 22.76 19.04l58.2 58.2C91.2 61.5 89.2 39.86 74.36 26.3l-.66-.66Z"
				fill="currentColor"
			/>
		</svg>
	)
}

function GitHubIcon({ size = 12 }: { size?: number }) {
	return (
		<svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor">
			<path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
		</svg>
	)
}

function HandmadeIcon({ size = 12 }: { size?: number }) {
	return (
		<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
			<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
			<path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
		</svg>
	)
}

export function TaskBoard({ agentTasks, onClose, onStartWork, onStartWorkGithub, linkedIssues, onSwitchToWorktree }: TaskBoardProps) {
	// Linear state
	const [linearApiKey, setLinearApiKey] = useState("")
	const [teams, setTeams] = useState<LinearTeam[]>([])
	const [selectedTeamId, setSelectedTeamId] = useState("")
	const [issues, setIssues] = useState<LinearIssue[]>([])
	const [states, setStates] = useState<LinearState[]>([])
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [linearConnected, setLinearConnected] = useState(false)
	const [creating, setCreating] = useState(false)
	const [newTitle, setNewTitle] = useState("")
	const [newDescription, setNewDescription] = useState("")
	const [view, setView] = useState<"board" | "list">("board")
	const [filter, setFilter] = useState<"all" | "active" | "backlog">("active")
	const [showApiKeyInput, setShowApiKeyInput] = useState(false)
	const [connecting, setConnecting] = useState(false)
	const [demo, setDemo] = useState(false)

	// GitHub state
	const [githubToken, setGithubToken] = useState("")
	const [githubConnected, setGithubConnected] = useState(false)
	const [githubOwner, setGithubOwner] = useState("")
	const [githubRepo, setGithubRepo] = useState("")
	const [githubUsername, setGithubUsername] = useState("")
	const [githubIssues, setGithubIssues] = useState<GitHubIssue[]>([])
	const [githubLoading, setGithubLoading] = useState(false)
	const [githubConnecting, setGithubConnecting] = useState(false)
	const [showGithubPATInput, setShowGithubPATInput] = useState(false)
	const [githubPATInput, setGithubPATInput] = useState("")

	// Handmade (local) issues
	const [handmadeIssues, setHandmadeIssues] = useState<HandmadeIssue[]>([])
	const [creatingHandmade, setCreatingHandmade] = useState(false)
	const [newHandmadeTitle, setNewHandmadeTitle] = useState("")

	// Filters
	const [sourceFilter, setSourceFilter] = useState<Set<string> | null>(null)
	const [workspaceFilter, setWorkspaceFilter] = useState<string | null>(null)

	const isDemo = demo && !linearApiKey
	const anyConnected = linearConnected || githubConnected || isDemo
	const activeIssues = isDemo ? DEMO_ISSUES : issues
	const activeStates = isDemo ? DEMO_STATES : states
	const activeTeams = isDemo ? [{ id: "demo", name: "Mastra", key: "MAS" }] : teams
	const activeTeamId = isDemo ? "demo" : selectedTeamId

	// Load saved state
	useEffect(() => {
		async function load() {
			const state = (await window.api.invoke({ type: "getState" })) as Record<string, unknown>
			// Linear
			const key = (state?.linearApiKey as string) ?? ""
			const teamId = (state?.linearTeamId as string) ?? ""
			setLinearApiKey(key)
			if (teamId) setSelectedTeamId(teamId)
			if (key) {
				setLinearConnected(true)
				loadTeams(key)
			}
			// GitHub
			const ghToken = (state?.githubToken as string) ?? ""
			const ghOwner = (state?.githubOwner as string) ?? ""
			const ghRepo = (state?.githubRepo as string) ?? ""
			const ghUser = (state?.githubUsername as string) ?? ""
			if (ghToken) {
				setGithubToken(ghToken)
				setGithubOwner(ghOwner)
				setGithubRepo(ghRepo)
				setGithubUsername(ghUser)
				setGithubConnected(true)
			}
			// Handmade
			const handmade = (state?.handmadeIssues as HandmadeIssue[]) ?? []
			setHandmadeIssues(handmade)
		}
		load()
	}, [])

	// Load Linear issues when team changes
	useEffect(() => {
		if (linearConnected && linearApiKey && selectedTeamId) {
			loadIssues()
			loadStates()
		}
	}, [selectedTeamId, linearConnected])

	// Load GitHub issues when connected
	useEffect(() => {
		if (githubConnected && githubToken && githubOwner && githubRepo) {
			loadGithubIssues()
		}
	}, [githubConnected, githubOwner, githubRepo])

	// ── Linear API helpers ──────────────────────────────────────────

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
				setShowApiKeyInput(true)
				setConnecting(false)
				return
			}

			if (!result.success || !result.accessToken) {
				throw new Error(result.error || "Failed to connect")
			}

			setLinearApiKey(result.accessToken)
			setLinearConnected(true)
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
			setLinearConnected(true)
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

	const handleLinearDisconnect = useCallback(async () => {
		setLinearConnected(false)
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
			await loadIssues()
		} catch (err: any) {
			setError(err.message)
		} finally {
			setLoading(false)
		}
	}, [linearApiKey, selectedTeamId, newTitle, newDescription, loadIssues])

	// ── GitHub API helpers ───────────────────────────────────────────

	const loadGithubIssues = useCallback(async () => {
		if (!githubToken || !githubOwner || !githubRepo) return
		setGithubLoading(true)
		try {
			const endpoint = `/repos/${githubOwner}/${githubRepo}/issues?assignee=${githubUsername}&state=open&per_page=100&sort=updated`
			const data = (await window.api.invoke({
				type: "githubApi",
				token: githubToken,
				method: "GET",
				endpoint,
			})) as GitHubIssue[]
			// Filter out pull requests (GitHub Issues API includes them)
			setGithubIssues(data.filter((i) => !i.pull_request))
		} catch (err: any) {
			setError(err.message)
		} finally {
			setGithubLoading(false)
		}
	}, [githubToken, githubOwner, githubRepo, githubUsername])

	const handleGithubCLIConnect = useCallback(async () => {
		setGithubConnecting(true)
		setError(null)
		try {
			const result = (await window.api.invoke({
				type: "githubConnect",
			})) as { success: boolean; username?: string; owner?: string; repo?: string; error?: string }

			if (!result.success) {
				if (result.error === "gh_not_authenticated") {
					setShowGithubPATInput(true)
				} else {
					throw new Error(result.error || "Failed to connect")
				}
				return
			}

			setGithubToken("__from_state__") // token is stored in state, we just need a truthy value
			setGithubUsername(result.username ?? "")
			setGithubOwner(result.owner ?? "")
			setGithubRepo(result.repo ?? "")
			setGithubConnected(true)

			// Re-read the actual token from state for API calls
			const state = (await window.api.invoke({ type: "getState" })) as Record<string, unknown>
			setGithubToken((state?.githubToken as string) ?? "")
		} catch (err: any) {
			setError(err.message || "Failed to connect to GitHub")
		} finally {
			setGithubConnecting(false)
		}
	}, [])

	const handleGithubPATConnect = useCallback(async () => {
		if (!githubPATInput.trim()) return
		setGithubConnecting(true)
		setError(null)
		try {
			const result = (await window.api.invoke({
				type: "githubConnect",
				token: githubPATInput.trim(),
			})) as { success: boolean; username?: string; owner?: string; repo?: string; error?: string }

			if (!result.success) {
				throw new Error(result.error || "Failed to connect")
			}

			setGithubToken(githubPATInput.trim())
			setGithubUsername(result.username ?? "")
			setGithubOwner(result.owner ?? "")
			setGithubRepo(result.repo ?? "")
			setGithubConnected(true)
			setGithubPATInput("")
		} catch (err: any) {
			setError(err.message || "Failed to connect to GitHub")
		} finally {
			setGithubConnecting(false)
		}
	}, [githubPATInput])

	const handleGithubDisconnect = useCallback(async () => {
		setGithubConnected(false)
		setGithubIssues([])
		setGithubToken("")
		setGithubOwner("")
		setGithubRepo("")
		setGithubUsername("")
		await window.api.invoke({ type: "githubDisconnect" })
	}, [])

	// ── Handmade issue helpers ──────────────────────────────────────

	const handleCreateHandmade = useCallback(async () => {
		if (!newHandmadeTitle.trim()) return
		const issue: HandmadeIssue = {
			id: `handmade-${Date.now()}`,
			title: newHandmadeTitle.trim(),
			status: "todo",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		}
		const next = [...handmadeIssues, issue]
		setHandmadeIssues(next)
		setNewHandmadeTitle("")
		setCreatingHandmade(false)
		await window.api.invoke({ type: "setState", patch: { handmadeIssues: next } })
	}, [newHandmadeTitle, handmadeIssues])

	const handleUpdateHandmadeStatus = useCallback(async (id: string, status: HandmadeIssue["status"]) => {
		const next = handmadeIssues.map(i => i.id === id ? { ...i, status, updatedAt: new Date().toISOString() } : i)
		setHandmadeIssues(next)
		await window.api.invoke({ type: "setState", patch: { handmadeIssues: next } })
	}, [handmadeIssues])

	const handleDeleteHandmade = useCallback(async (id: string) => {
		const next = handmadeIssues.filter(i => i.id !== id)
		setHandmadeIssues(next)
		await window.api.invoke({ type: "setState", patch: { handmadeIssues: next } })
	}, [handmadeIssues])

	// ── Unified issue normalization ─────────────────────────────────

	const workflowStates = useMemo<WorkflowStates>(() => {
		const started = activeStates.find((s) => s.type === "started")
		const done = activeStates.find((s) => s.type === "completed")
		return {
			startedStateId: started?.id ?? "",
			doneStateId: done?.id ?? "",
		}
	}, [activeStates])

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

	// Normalize all issues into UnifiedIssue[]
	const unifiedIssues = useMemo<UnifiedIssue[]>(() => {
		const result: UnifiedIssue[] = []

		// Linear issues
		for (const issue of activeIssues) {
			result.push({
				id: issue.id,
				identifier: issue.identifier,
				title: issue.title,
				provider: "linear",
				state: { name: issue.state.name, color: issue.state.color, type: issue.state.type },
				assignee: issue.assignee?.displayName || issue.assignee?.name,
				priority: issue.priority,
				url: issue.url,
				labels: issue.labels,
				createdAt: issue.createdAt,
				updatedAt: issue.updatedAt,
				linearIssue: issue,
			})
		}

		// GitHub issues
		for (const issue of githubIssues) {
			const ghId = `gh-${issue.number}`
			const isLinkedToWorktree = !!issueWorktreeMap[ghId]
			// Map GitHub state: open → unstarted (or started if linked to worktree), closed → completed
			const stateType = issue.state === "closed" ? "completed" : isLinkedToWorktree ? "started" : "unstarted"
			const stateColor = issue.state === "closed" ? "#5e6ad2" : isLinkedToWorktree ? "#f2c94c" : "#e2e2e2"
			const stateName = issue.state === "closed" ? "Done" : isLinkedToWorktree ? "In Progress" : "Open"

			result.push({
				id: ghId,
				identifier: `#${issue.number}`,
				title: issue.title,
				provider: "github",
				state: { name: stateName, color: stateColor, type: stateType },
				assignee: issue.assignee?.login,
				url: issue.html_url,
				labels: issue.labels.map((l) => ({
					name: l.name,
					color: `#${l.color}`,
				})),
				createdAt: issue.created_at,
				updatedAt: issue.updated_at,
				githubIssue: issue,
			})
		}

		// Handmade issues
		for (const issue of handmadeIssues) {
			const stateType = issue.status === "done" ? "completed" : issue.status === "in_progress" ? "started" : "unstarted"
			const stateColor = issue.status === "done" ? "#5e6ad2" : issue.status === "in_progress" ? "#f2c94c" : "#e2e2e2"
			const stateName = issue.status === "done" ? "Done" : issue.status === "in_progress" ? "In Progress" : "Todo"

			result.push({
				id: issue.id,
				identifier: `T-${handmadeIssues.indexOf(issue) + 1}`,
				title: issue.title,
				provider: "handmade",
				state: { name: stateName, color: stateColor, type: stateType },
				url: "#",
				labels: [],
				createdAt: issue.createdAt,
				updatedAt: issue.updatedAt,
			})
		}

		return result
	}, [activeIssues, githubIssues, issueWorktreeMap, handmadeIssues])

	// Available sources for filter chips
	const availableSources = useMemo(() => {
		const sources = new Set<string>()
		for (const issue of unifiedIssues) sources.add(issue.provider)
		return Array.from(sources)
	}, [unifiedIssues])

	// Available workspaces for filter dropdown
	const availableWorkspaces = useMemo(() => {
		if (!linkedIssues) return []
		return Object.keys(linkedIssues).map(path => ({
			path,
			name: path.split("/").pop() || path,
		}))
	}, [linkedIssues])

	// Source filter toggle
	const toggleSourceFilter = useCallback((source: string) => {
		setSourceFilter(prev => {
			if (prev === null) {
				return new Set([source])
			}
			const next = new Set(prev)
			if (next.has(source)) {
				next.delete(source)
				if (next.size === 0) return null
			} else {
				next.add(source)
			}
			return next
		})
	}, [])

	// Filter issues
	const filteredIssues = unifiedIssues.filter((issue) => {
		// Status filter
		if (filter === "active" && issue.state.type !== "started" && issue.state.type !== "unstarted") return false
		if (filter === "backlog" && issue.state.type !== "backlog") return false

		// Source filter
		if (sourceFilter !== null && !sourceFilter.has(issue.provider)) return false

		// Workspace filter
		if (workspaceFilter !== null) {
			const linkedWt = issueWorktreeMap[issue.id]
			if (workspaceFilter === "__unlinked__") {
				if (linkedWt) return false
			} else {
				if (linkedWt !== workspaceFilter) return false
			}
		}

		return true
	})

	// Group issues by state type for board view
	const columns = STATE_TYPE_ORDER.filter((type) =>
		filter === "all" ? true : type !== "cancelled",
	).map((type) => {
		const columnStates = activeStates
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

	const handleRefreshAll = useCallback(() => {
		if (linearConnected) loadIssues()
		if (githubConnected) loadGithubIssues()
	}, [linearConnected, githubConnected, loadIssues, loadGithubIssues])

	const handleStartWorkUnified = useCallback((issue: UnifiedIssue) => {
		if (issue.provider === "linear" && issue.linearIssue && onStartWork) {
			onStartWork(issue.linearIssue, workflowStates)
		} else if (issue.provider === "github" && issue.githubIssue && onStartWorkGithub) {
			onStartWorkGithub(issue.githubIssue)
		}
	}, [onStartWork, onStartWorkGithub, workflowStates])

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

				{anyConnected && (
					<>
						{/* Connected provider badges */}
						<div style={{ display: "flex", gap: 6, alignItems: "center" }}>
							{(linearConnected || isDemo) && (
								<span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--muted)", background: "var(--bg-surface)", padding: "2px 8px", borderRadius: 3, border: "1px solid var(--border-muted)" }}>
									<LinearIcon size={10} />
									{isDemo ? "Demo" : activeTeams.find((t) => t.id === activeTeamId)?.key ?? "Linear"}
								</span>
							)}
							{githubConnected && (
								<span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--muted)", background: "var(--bg-surface)", padding: "2px 8px", borderRadius: 3, border: "1px solid var(--border-muted)" }}>
									<GitHubIcon size={10} />
									{githubOwner}/{githubRepo}
								</span>
							)}
						</div>

						{/* Team selector (Linear) */}
						{(linearConnected || isDemo) && activeTeams.length > 1 && (
							<select
								value={activeTeamId}
								onChange={(e) => !isDemo && handleTeamChange(e.target.value)}
								disabled={isDemo}
								style={{
									background: "var(--bg-elevated)",
									color: "var(--text)",
									border: "1px solid var(--border)",
									borderRadius: 4,
									padding: "3px 8px",
									fontSize: 11,
									cursor: isDemo ? "default" : "pointer",
									fontFamily: "inherit",
								}}
							>
								{activeTeams.map((t) => (
									<option key={t.id} value={t.id}>
										{t.name} ({t.key})
									</option>
								))}
							</select>
						)}

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

						{!isDemo && (
							<>
								<button
									onClick={() => { setCreatingHandmade(!creatingHandmade); setCreating(false) }}
									style={{
										padding: "4px 12px",
										fontSize: 11,
										background: creatingHandmade ? "var(--bg-elevated)" : "var(--bg-surface)",
										color: creatingHandmade ? "var(--text)" : "var(--muted)",
										borderRadius: 4,
										cursor: "pointer",
										fontWeight: 500,
										border: "1px solid var(--border-muted)",
										display: "flex",
										alignItems: "center",
										gap: 4,
									}}
								>
									<HandmadeIcon size={10} /> + Task
								</button>
								{linearConnected && (
									<button
										onClick={() => { setCreating(!creating); setCreatingHandmade(false) }}
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
								)}
								<button
									onClick={handleRefreshAll}
									disabled={loading || githubLoading}
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
									{loading || githubLoading ? "..." : "Refresh"}
								</button>
								{/* Connect more providers */}
								{!linearConnected && (
									<button
										onClick={handleOAuthConnect}
										style={{
											padding: "4px 10px",
											fontSize: 11,
											background: "transparent",
											color: "var(--dim)",
											borderRadius: 4,
											border: "1px solid var(--border-muted)",
											cursor: "pointer",
											display: "flex",
											alignItems: "center",
											gap: 4,
										}}
									>
										<LinearIcon size={10} /> + Linear
									</button>
								)}
								{!githubConnected && (
									<button
										onClick={handleGithubCLIConnect}
										disabled={githubConnecting}
										style={{
											padding: "4px 10px",
											fontSize: 11,
											background: "transparent",
											color: "var(--dim)",
											borderRadius: 4,
											border: "1px solid var(--border-muted)",
											cursor: "pointer",
											display: "flex",
											alignItems: "center",
											gap: 4,
										}}
									>
										<GitHubIcon size={10} /> + GitHub
									</button>
								)}
								{/* Disconnect dropdown */}
								<DisconnectMenu
									linearConnected={linearConnected}
									githubConnected={githubConnected}
									onDisconnectLinear={handleLinearDisconnect}
									onDisconnectGithub={handleGithubDisconnect}
								/>
							</>
						)}
						{isDemo && (
							<span style={{ fontSize: 10, color: "var(--dim)", fontStyle: "italic" }}>
								Demo data
							</span>
						)}
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

			{/* Source + Workspace filter bar */}
			{anyConnected && (availableSources.length > 1 || availableWorkspaces.length > 0 || handmadeIssues.length > 0) && (
				<div
					style={{
						display: "flex",
						alignItems: "center",
						padding: "6px 20px",
						gap: 8,
						borderBottom: "1px solid var(--border-muted)",
						flexShrink: 0,
						flexWrap: "wrap",
					}}
				>
					{/* Source filter */}
					<span style={{ fontSize: 10, color: "var(--dim)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.3px" }}>Source</span>
					{availableSources.includes("linear") && (
						<button
							onClick={() => toggleSourceFilter("linear")}
							style={{
								display: "flex",
								alignItems: "center",
								gap: 4,
								padding: "2px 8px",
								fontSize: 10,
								borderRadius: 3,
								cursor: "pointer",
								border: "1px solid",
								borderColor: sourceFilter === null || sourceFilter.has("linear") ? "#5E6AD2" : "var(--border)",
								background: sourceFilter === null || sourceFilter.has("linear") ? "#5E6AD218" : "transparent",
								color: sourceFilter === null || sourceFilter.has("linear") ? "#5E6AD2" : "var(--dim)",
								fontWeight: 600,
							}}
						>
							<LinearIcon size={10} /> Linear
						</button>
					)}
					{availableSources.includes("github") && (
						<button
							onClick={() => toggleSourceFilter("github")}
							style={{
								display: "flex",
								alignItems: "center",
								gap: 4,
								padding: "2px 8px",
								fontSize: 10,
								borderRadius: 3,
								cursor: "pointer",
								border: "1px solid",
								borderColor: sourceFilter === null || sourceFilter.has("github") ? "#8b949e" : "var(--border)",
								background: sourceFilter === null || sourceFilter.has("github") ? "#8b949e18" : "transparent",
								color: sourceFilter === null || sourceFilter.has("github") ? "var(--text)" : "var(--dim)",
								fontWeight: 600,
							}}
						>
							<GitHubIcon size={10} /> GitHub
						</button>
					)}
					{availableSources.includes("handmade") && (
						<button
							onClick={() => toggleSourceFilter("handmade")}
							style={{
								display: "flex",
								alignItems: "center",
								gap: 4,
								padding: "2px 8px",
								fontSize: 10,
								borderRadius: 3,
								cursor: "pointer",
								border: "1px solid",
								borderColor: sourceFilter === null || sourceFilter.has("handmade") ? "#f59e0b" : "var(--border)",
								background: sourceFilter === null || sourceFilter.has("handmade") ? "#f59e0b18" : "transparent",
								color: sourceFilter === null || sourceFilter.has("handmade") ? "#f59e0b" : "var(--dim)",
								fontWeight: 600,
							}}
						>
							<HandmadeIcon size={10} /> Manual
						</button>
					)}

					{/* Workspace filter */}
					{availableWorkspaces.length > 0 && (
						<>
							<div style={{ width: 1, height: 16, background: "var(--border-muted)", margin: "0 4px" }} />
							<span style={{ fontSize: 10, color: "var(--dim)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.3px" }}>Workspace</span>
							<select
								value={workspaceFilter ?? ""}
								onChange={(e) => setWorkspaceFilter(e.target.value || null)}
								style={{
									background: "var(--bg-elevated)",
									color: "var(--text)",
									border: "1px solid var(--border)",
									borderRadius: 4,
									padding: "2px 6px",
									fontSize: 10,
									cursor: "pointer",
									fontFamily: "inherit",
								}}
							>
								<option value="">All</option>
								{availableWorkspaces.map(ws => (
									<option key={ws.path} value={ws.path}>{ws.name}</option>
								))}
								<option value="__unlinked__">Unlinked</option>
							</select>
						</>
					)}

					{(sourceFilter !== null || workspaceFilter !== null) && (
						<button
							onClick={() => { setSourceFilter(null); setWorkspaceFilter(null) }}
							style={{
								fontSize: 10,
								color: "var(--dim)",
								background: "transparent",
								border: "none",
								cursor: "pointer",
								padding: "2px 4px",
								textDecoration: "underline",
							}}
						>
							Clear filters
						</button>
					)}
				</div>
			)}

			{/* Create handmade task form */}
			{creatingHandmade && (
				<div
					style={{
						padding: "12px 20px",
						borderBottom: "1px solid var(--border-muted)",
						display: "flex",
						gap: 8,
						alignItems: "center",
					}}
				>
					<HandmadeIcon size={14} />
					<input
						value={newHandmadeTitle}
						onChange={(e) => setNewHandmadeTitle(e.target.value)}
						placeholder="Task title"
						autoFocus
						onKeyDown={(e) => {
							if (e.key === "Enter") handleCreateHandmade()
							if (e.key === "Escape") setCreatingHandmade(false)
						}}
						style={{
							flex: 1,
							padding: "6px 10px",
							background: "var(--bg-elevated)",
							color: "var(--text)",
							border: "1px solid var(--border)",
							borderRadius: 4,
							fontSize: 13,
							fontFamily: "inherit",
						}}
					/>
					<button
						onClick={handleCreateHandmade}
						disabled={!newHandmadeTitle.trim()}
						style={{
							padding: "6px 16px",
							background: newHandmadeTitle.trim() ? "#f59e0b" : "var(--bg-elevated)",
							color: newHandmadeTitle.trim() ? "#fff" : "var(--muted)",
							borderRadius: 4,
							cursor: newHandmadeTitle.trim() ? "pointer" : "default",
							fontSize: 12,
							fontWeight: 500,
							border: "none",
						}}
					>
						Create
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
			<div style={{ flex: 1, overflow: "auto", padding: anyConnected ? 0 : 20 }}>
				{!anyConnected ? (
					/* Connect to providers */
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

						<div
							style={{
								fontSize: 15,
								fontWeight: 600,
								color: "var(--text)",
								marginBottom: 6,
							}}
						>
							Connect your issue tracker
						</div>
						<div
							style={{
								fontSize: 12,
								color: "var(--dim)",
								marginBottom: 24,
								lineHeight: 1.5,
							}}
						>
							Pull issues from Linear and GitHub into a unified dashboard.
						</div>

						{/* GitHub connect */}
						<button
							onClick={handleGithubCLIConnect}
							disabled={githubConnecting}
							style={{
								width: "100%",
								padding: "10px 20px",
								background: githubConnecting ? "var(--bg-elevated)" : "#24292e",
								color: githubConnecting ? "var(--muted)" : "#fff",
								borderRadius: 8,
								cursor: githubConnecting ? "default" : "pointer",
								fontSize: 13,
								fontWeight: 600,
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								gap: 8,
								border: "none",
								marginBottom: 8,
							}}
						>
							{githubConnecting ? (
								"Connecting..."
							) : (
								<>
									<GitHubIcon size={16} />
									Connect with GitHub CLI
								</>
							)}
						</button>

						{!showGithubPATInput ? (
							<button
								onClick={() => setShowGithubPATInput(true)}
								style={{
									background: "transparent",
									border: "none",
									color: "var(--dim)",
									cursor: "pointer",
									fontSize: 11,
									padding: "4px 0",
									marginBottom: 16,
								}}
							>
								Or paste a GitHub token
							</button>
						) : (
							<div style={{ marginBottom: 16 }}>
								<div style={{ display: "flex", gap: 8, marginTop: 8 }}>
									<input
										type="password"
										value={githubPATInput}
										onChange={(e) => setGithubPATInput(e.target.value)}
										placeholder="ghp_..."
										onKeyDown={(e) => {
											if (e.key === "Enter") handleGithubPATConnect()
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
										onClick={handleGithubPATConnect}
										disabled={!githubPATInput.trim() || githubConnecting}
										style={{
											padding: "8px 16px",
											background: githubPATInput.trim() && !githubConnecting ? "#24292e" : "var(--bg-elevated)",
											color: githubPATInput.trim() && !githubConnecting ? "#fff" : "var(--muted)",
											borderRadius: 6,
											cursor: githubPATInput.trim() && !githubConnecting ? "pointer" : "default",
											fontSize: 12,
											fontWeight: 500,
											border: "none",
										}}
									>
										{githubConnecting ? "..." : "Connect"}
									</button>
								</div>
							</div>
						)}

						{/* Divider */}
						<div style={{ display: "flex", alignItems: "center", gap: 8, margin: "8px 0 16px" }}>
							<div style={{ flex: 1, height: 1, background: "var(--border-muted)" }} />
							<span style={{ fontSize: 10, color: "var(--dim)", textTransform: "uppercase", letterSpacing: "0.5px" }}>or</span>
							<div style={{ flex: 1, height: 1, background: "var(--border-muted)" }} />
						</div>

						{/* Linear connect */}
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
							}}
						>
							{connecting ? (
								"Connecting..."
							) : (
								<>
									<LinearIcon size={16} />
									Sign in with Linear
								</>
							)}
						</button>

						{!showApiKeyInput ? (
							<button
								onClick={() => setShowApiKeyInput(true)}
								style={{
									marginTop: 8,
									background: "transparent",
									border: "none",
									color: "var(--dim)",
									cursor: "pointer",
									fontSize: 11,
									padding: "4px 0",
								}}
							>
								Or use a Linear API key
							</button>
						) : (
							<div style={{ marginTop: 12 }}>
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

						{/* Demo toggle */}
						<button
							onClick={() => setDemo(true)}
							style={{
								marginTop: 32,
								width: "100%",
								padding: "12px 20px",
								background: "var(--bg-surface)",
								border: "1px solid var(--border-muted)",
								borderRadius: 8,
								color: "var(--text)",
								cursor: "pointer",
								fontSize: 13,
								fontWeight: 500,
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								gap: 8,
								transition: "border-color 0.15s",
							}}
							onMouseOver={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
							onMouseOut={(e) => (e.currentTarget.style.borderColor = "var(--border-muted)")}
						>
							Preview with demo data
						</button>
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

						{/* Issue columns */}
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
										<UnifiedIssueCard
											key={issue.id}
											issue={issue}
											states={activeStates}
											onUpdateStatus={handleUpdateStatus}
											onStartWork={() => handleStartWorkUnified(issue)}
											linkedWorktree={issueWorktreeMap[issue.id]}
											onSwitchToWorktree={onSwitchToWorktree}
											onUpdateHandmadeStatus={handleUpdateHandmadeStatus}
											onDeleteHandmade={handleDeleteHandmade}
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

						{/* Unified issues */}
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
								{/* Provider icon */}
								<span style={{ color: issue.provider === "handmade" ? "#f59e0b" : "var(--dim)", flexShrink: 0, display: "flex" }}>
									{issue.provider === "github" ? <GitHubIcon size={11} /> : issue.provider === "handmade" ? <HandmadeIcon size={11} /> : <LinearIcon size={11} />}
								</span>
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
									onClick={() => {
										if (issue.provider !== "handmade") {
											window.api.invoke({
												type: "openExternal",
												url: issue.url,
											})
										}
									}}
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
								{issue.provider === "handmade" ? (
									<>
										<button
											onClick={(e) => {
												e.stopPropagation()
												const next = issue.state.type === "unstarted" ? "in_progress" : issue.state.type === "started" ? "done" : "todo"
												handleUpdateHandmadeStatus(issue.id, next)
											}}
											style={{
												fontSize: 10,
												color: issue.state.color,
												background: issue.state.color + "18",
												padding: "2px 8px",
												borderRadius: 3,
												flexShrink: 0,
												cursor: "pointer",
												border: "none",
												fontFamily: "inherit",
											}}
											title="Cycle status"
										>
											{issue.state.name} &#8634;
										</button>
										<button
											onClick={(e) => {
												e.stopPropagation()
												handleDeleteHandmade(issue.id)
											}}
											style={{
												fontSize: 10,
												color: "var(--dim)",
												background: "transparent",
												border: "none",
												cursor: "pointer",
												padding: "2px 4px",
												flexShrink: 0,
											}}
											title="Delete task"
										>
											&#10005;
										</button>
									</>
								) : (
									<>
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
										{issue.priority != null && issue.priority > 0 && (
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
									</>
								)}
							</div>
						))}
						{filteredIssues.length === 0 && !loading && !githubLoading && (
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

function DisconnectMenu({
	linearConnected,
	githubConnected,
	onDisconnectLinear,
	onDisconnectGithub,
}: {
	linearConnected: boolean
	githubConnected: boolean
	onDisconnectLinear: () => void
	onDisconnectGithub: () => void
}) {
	const [open, setOpen] = useState(false)
	if (!linearConnected && !githubConnected) return null

	return (
		<div style={{ position: "relative" }}>
			<button
				onClick={() => setOpen(!open)}
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
			{open && (
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
						minWidth: 160,
						boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
					}}
				>
					{linearConnected && (
						<button
							onClick={() => { onDisconnectLinear(); setOpen(false) }}
							style={{
								display: "flex",
								alignItems: "center",
								gap: 6,
								padding: "5px 8px",
								fontSize: 11,
								color: "var(--muted)",
								background: "transparent",
								cursor: "pointer",
								width: "100%",
								textAlign: "left",
								borderRadius: 3,
								border: "none",
							}}
						>
							<LinearIcon size={10} /> Disconnect Linear
						</button>
					)}
					{githubConnected && (
						<button
							onClick={() => { onDisconnectGithub(); setOpen(false) }}
							style={{
								display: "flex",
								alignItems: "center",
								gap: 6,
								padding: "5px 8px",
								fontSize: 11,
								color: "var(--muted)",
								background: "transparent",
								cursor: "pointer",
								width: "100%",
								textAlign: "left",
								borderRadius: 3,
								border: "none",
							}}
						>
							<GitHubIcon size={10} /> Disconnect GitHub
						</button>
					)}
				</div>
			)}
		</div>
	)
}

function UnifiedIssueCard({
	issue,
	states,
	onUpdateStatus,
	onStartWork,
	linkedWorktree,
	onSwitchToWorktree,
	onUpdateHandmadeStatus,
	onDeleteHandmade,
}: {
	issue: UnifiedIssue
	states: LinearState[]
	onUpdateStatus: (issueId: string, stateId: string) => void
	onStartWork?: () => void
	linkedWorktree?: string
	onSwitchToWorktree?: (worktreePath: string) => void
	onUpdateHandmadeStatus?: (id: string, status: "todo" | "in_progress" | "done") => void
	onDeleteHandmade?: (id: string) => void
}) {
	const [showStates, setShowStates] = useState(false)
	const priority = issue.priority != null ? PRIORITY_LABELS[issue.priority] : undefined
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
			onClick={() => {
				if (issue.provider !== "handmade") {
					window.api.invoke({ type: "openExternal", url: issue.url })
				}
			}}
		>
			{/* Identifier + priority + provider */}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 6,
					marginBottom: 4,
				}}
			>
				{/* Provider icon */}
				<span style={{ color: issue.provider === "handmade" ? "#f59e0b" : "var(--dim)", display: "flex", flexShrink: 0 }}>
					{issue.provider === "github" ? <GitHubIcon size={10} /> : issue.provider === "handmade" ? <HandmadeIcon size={10} /> : <LinearIcon size={10} />}
				</span>
				<span
					style={{
						fontSize: 10,
						color: "var(--muted)",
						fontFamily: "monospace",
					}}
				>
					{issue.identifier}
				</span>
				{priority && issue.priority != null && issue.priority > 0 && (
					<span
						style={{
							fontSize: 9,
							color: priority.color,
						}}
					>
						{priority.label}
					</span>
				)}
				<div style={{ flex: 1 }} />
				{/* State changer */}
				{issue.provider === "handmade" ? (
					<div style={{ display: "flex", gap: 2 }} onClick={(e) => e.stopPropagation()}>
						<button
							onClick={() => {
								const next = issue.state.type === "unstarted" ? "in_progress" : issue.state.type === "started" ? "done" : "todo"
								onUpdateHandmadeStatus?.(issue.id, next)
							}}
							style={{
								fontSize: 9,
								color: issue.state.color,
								background: issue.state.color + "18",
								padding: "1px 6px",
								borderRadius: 3,
								cursor: "pointer",
								border: "none",
								display: "flex",
								alignItems: "center",
								gap: 3,
							}}
							title="Cycle status"
						>
							{issue.state.name} &#8634;
						</button>
						<button
							onClick={() => onDeleteHandmade?.(issue.id)}
							style={{
								fontSize: 9,
								color: "var(--dim)",
								background: "transparent",
								padding: "1px 4px",
								borderRadius: 3,
								cursor: "pointer",
								border: "none",
							}}
							title="Delete task"
						>
							&#10005;
						</button>
					</div>
				) : issue.provider === "linear" && issue.linearIssue ? (
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
												onUpdateStatus(issue.linearIssue!.id, s.id)
												setShowStates(false)
											}}
											style={{
												display: "flex",
												alignItems: "center",
												gap: 6,
												padding: "5px 8px",
												fontSize: 11,
												color: s.id === issue.linearIssue!.state.id ? "var(--text)" : "var(--muted)",
												background: s.id === issue.linearIssue!.state.id ? "var(--bg-surface)" : "transparent",
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
				) : (
					<span
						style={{
							fontSize: 9,
							color: issue.state.color,
							background: issue.state.color + "18",
							padding: "1px 6px",
							borderRadius: 3,
						}}
					>
						{issue.state.name}
					</span>
				)}
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
					{issue.assignee}
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
