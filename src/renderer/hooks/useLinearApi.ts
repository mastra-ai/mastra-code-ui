import { useState, useEffect, useCallback } from "react"
import type { LinearIssue, LinearTeam, LinearState } from "../types/taskboard"
import { DEMO_STATES, DEMO_ISSUES } from "../components/taskboard/constants"

export function useLinearApi(setError: (msg: string | null) => void) {
	// Linear state
	const [linearApiKey, setLinearApiKey] = useState("")
	const [teams, setTeams] = useState<LinearTeam[]>([])
	const [selectedTeamId, setSelectedTeamId] = useState("")
	const [issues, setIssues] = useState<LinearIssue[]>([])
	const [states, setStates] = useState<LinearState[]>([])
	const [loading, setLoading] = useState(false)
	const [linearConnected, setLinearConnected] = useState(false)
	const [creating, setCreating] = useState(false)
	const [newTitle, setNewTitle] = useState("")
	const [newDescription, setNewDescription] = useState("")
	const [showApiKeyInput, setShowApiKeyInput] = useState(false)
	const [connecting, setConnecting] = useState(false)
	const [demo, setDemo] = useState(false)

	const isDemo = demo && !linearApiKey
	const activeIssues = isDemo ? DEMO_ISSUES : issues
	const activeStates = isDemo ? DEMO_STATES : states
	const activeTeams = isDemo
		? [{ id: "demo", name: "Mastra", key: "MAS" }]
		: teams
	const activeTeamId = isDemo ? "demo" : selectedTeamId

	const loadTeams = useCallback(
		async (key?: string) => {
			try {
				const data = (await window.api.invoke({
					type: "linearQuery",
					apiKey: key || linearApiKey,
					query: `{ teams { nodes { id name key } } }`,
				})) as {
					data?: { teams?: { nodes: LinearTeam[] } }
					errors?: Array<{ message: string }>
				}
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
			})) as {
				data?: { team?: { issues?: { nodes: any[] } } }
				errors?: Array<{ message: string }>
			}
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
			})) as {
				data?: { team?: { states?: { nodes: LinearState[] } } }
				errors?: Array<{ message: string }>
			}
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
			})) as {
				data?: { teams?: { nodes: LinearTeam[] } }
				errors?: Array<{ message: string }>
			}
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

	const handleTeamChange = useCallback(async (teamId: string) => {
		setSelectedTeamId(teamId)
		await window.api.invoke({
			type: "setState",
			patch: { linearTeamId: teamId },
		})
	}, [])

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

	// Load saved state (Linear portion)
	useEffect(() => {
		async function load() {
			const state = (await window.api.invoke({ type: "getState" })) as Record<
				string,
				unknown
			>
			const key = (state?.linearApiKey as string) ?? ""
			const teamId = (state?.linearTeamId as string) ?? ""
			setLinearApiKey(key)
			if (teamId) setSelectedTeamId(teamId)
			if (key) {
				setLinearConnected(true)
				loadTeams(key)
			}
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

	return {
		// State
		linearApiKey,
		setLinearApiKey,
		teams,
		selectedTeamId,
		setSelectedTeamId,
		issues,
		states,
		loading,
		linearConnected,
		creating,
		setCreating,
		newTitle,
		setNewTitle,
		newDescription,
		setNewDescription,
		showApiKeyInput,
		setShowApiKeyInput,
		connecting,
		demo,
		setDemo,

		// Derived
		isDemo,
		activeIssues,
		activeStates,
		activeTeams,
		activeTeamId,

		// Functions
		loadTeams,
		loadIssues,
		loadStates,
		handleOAuthConnect,
		handleApiKeyConnect,
		handleLinearDisconnect,
		handleTeamChange,
		handleUpdateStatus,
		handleCreateIssue,
	}
}
