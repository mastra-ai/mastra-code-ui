import { useState, useEffect, useCallback } from "react"
import type { GitHubIssue } from "../types/taskboard"

export function useGithubApi(setError: (msg: string | null) => void) {
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

	// Init effect
	useEffect(() => {
		async function load() {
			const state = (await window.api.invoke({ type: "getState" })) as Record<
				string,
				unknown
			>
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
		}
		load()
	}, [])

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
			setGithubIssues(data.filter((i) => !i.pull_request))
		} catch (err: any) {
			setError(err.message)
		} finally {
			setGithubLoading(false)
		}
	}, [githubToken, githubOwner, githubRepo, githubUsername])

	// Load issues when connected
	useEffect(() => {
		if (githubConnected && githubToken && githubOwner && githubRepo) {
			loadGithubIssues()
		}
	}, [githubConnected, githubOwner, githubRepo])

	const handleGithubCLIConnect = useCallback(async () => {
		setGithubConnecting(true)
		setError(null)
		try {
			const result = (await window.api.invoke({
				type: "githubConnect",
			})) as {
				success: boolean
				username?: string
				owner?: string
				repo?: string
				error?: string
			}
			if (!result.success) {
				if (result.error === "gh_not_authenticated") {
					setShowGithubPATInput(true)
				} else {
					throw new Error(result.error || "Failed to connect")
				}
				return
			}
			setGithubToken("__from_state__")
			setGithubUsername(result.username ?? "")
			setGithubOwner(result.owner ?? "")
			setGithubRepo(result.repo ?? "")
			setGithubConnected(true)
			const state = (await window.api.invoke({ type: "getState" })) as Record<
				string,
				unknown
			>
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
			})) as {
				success: boolean
				username?: string
				owner?: string
				repo?: string
				error?: string
			}
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

	return {
		// State
		githubToken,
		githubConnected,
		githubOwner,
		setGithubOwner,
		githubRepo,
		setGithubRepo,
		githubUsername,
		githubIssues,
		githubLoading,
		githubConnecting,
		showGithubPATInput,
		setShowGithubPATInput,
		githubPATInput,
		setGithubPATInput,

		// Functions
		loadGithubIssues,
		handleGithubCLIConnect,
		handleGithubPATConnect,
		handleGithubDisconnect,
	}
}
