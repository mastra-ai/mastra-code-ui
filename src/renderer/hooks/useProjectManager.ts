import { useState, useCallback, useRef, useEffect } from "react"
import type { EnrichedProject } from "../types/project-list"
import type {
	LinearIssue,
	GitHubIssue,
	WorkflowStates,
} from "../types/taskboard"
import type { ProjectInfo } from "../types/project"
import type { ChatAction } from "../types/chat"

export function useProjectManager(
	dispatch: React.Dispatch<ChatAction>,
	tabSetters: {
		setOpenThreadTabs: React.Dispatch<React.SetStateAction<string[]>>
		setOpenFiles: React.Dispatch<React.SetStateAction<string[]>>
		setActiveTab: React.Dispatch<React.SetStateAction<string>>
		setThreads: React.Dispatch<React.SetStateAction<any[]>>
		setTokenUsage: React.Dispatch<React.SetStateAction<any>>
	},
) {
	const [projectInfo, setProjectInfo] = useState<ProjectInfo | null>(null)
	const [enrichedProjects, setEnrichedProjects] = useState<EnrichedProject[]>(
		[],
	)
	const [unreadWorktrees, setUnreadWorktrees] = useState<Set<string>>(new Set())
	const [activeWorktrees, setActiveWorktrees] = useState<Set<string>>(new Set())
	const [projectSwitching, setProjectSwitching] = useState(false)
	const [prStatus, setPrStatus] = useState<{
		exists: boolean
		number?: number
		title?: string
		state?: string
		url?: string
		isDraft?: boolean
		checks?: "pending" | "passing" | "failing" | "none"
	} | null>(null)
	const [worktreeStatuses, setWorktreeStatuses] = useState<
		Map<string, "in_progress" | "in_review" | "done" | "archived">
	>(new Map())
	const [linkedIssues, setLinkedIssues] = useState<
		Record<
			string,
			{ issueId: string; issueIdentifier: string; provider?: string }
		>
	>({})

	// Clone modal state
	const [showCloneModal, setShowCloneModal] = useState(false)
	const [cloneUrl, setCloneUrl] = useState("")
	const [cloneDest, setCloneDest] = useState("")
	const [cloning, setCloning] = useState(false)

	const projectInfoRef = useRef<ProjectInfo | null>(null)
	const notificationPrefRef = useRef<string>("both")

	// Keep ref in sync
	useEffect(() => {
		projectInfoRef.current = projectInfo
	}, [projectInfo])

	// Sync dock badge count
	useEffect(() => {
		window.api.setBadgeCount(unreadWorktrees.size)
	}, [unreadWorktrees])

	const loadLinkedIssues = useCallback(async () => {
		try {
			const result = (await window.api.invoke({
				type: "getLinkedIssues",
			})) as Record<
				string,
				{ issueId: string; issueIdentifier: string; provider?: string }
			>
			setLinkedIssues(result ?? {})
		} catch {
			// ignore
		}
	}, [])

	useEffect(() => {
		loadLinkedIssues()
	}, [loadLinkedIssues])

	async function loadEnrichedProjects() {
		try {
			const projects = (await window.api.invoke({
				type: "getRecentProjects",
			})) as EnrichedProject[]
			if (projects) {
				setEnrichedProjects(projects)
				loadWorktreeStatuses(projects)
			}
		} catch {
			// ignore
		}
	}

	async function loadPRStatus() {
		try {
			const result = (await window.api.invoke({ type: "getPRStatus" })) as {
				exists: boolean
				number?: number
				title?: string
				state?: string
				url?: string
				isDraft?: boolean
				checks?: "pending" | "passing" | "failing" | "none"
			}
			setPrStatus(result)
		} catch {
			setPrStatus(null)
		}
	}

	async function loadWorktreeStatuses(projects?: EnrichedProject[]) {
		const projectList = projects || enrichedProjects
		if (projectList.length === 0) return

		const statusMap = new Map<
			string,
			"in_progress" | "in_review" | "done" | "archived"
		>()
		for (const project of projectList) {
			if (project.isWorktree || project.worktrees.length === 0) continue
			try {
				const result = (await window.api.invoke({
					type: "getWorktreePRStatuses",
					repoPath: project.rootPath,
					worktrees: project.worktrees,
				})) as Record<string, { exists: boolean; state?: string }>
				for (const [wtPath, pr] of Object.entries(result)) {
					if (!pr.exists) {
						statusMap.set(wtPath, "in_progress")
					} else if (pr.state === "merged") {
						statusMap.set(wtPath, "done")
					} else if (pr.state === "open") {
						statusMap.set(wtPath, "in_review")
					} else if (pr.state === "closed") {
						statusMap.set(wtPath, "archived")
					} else {
						statusMap.set(wtPath, "in_progress")
					}
				}
			} catch {
				// ignore per-repo failures
			}
		}
		setWorktreeStatuses(statusMap)
	}

	// Refresh PR status when project/branch changes, and poll every 30s
	useEffect(() => {
		loadPRStatus()
		const interval = setInterval(loadPRStatus, 30_000)
		return () => clearInterval(interval)
	}, [projectInfo?.rootPath, projectInfo?.gitBranch])

	// Refresh worktree statuses periodically (every 60s)
	useEffect(() => {
		if (enrichedProjects.length === 0) return
		const interval = setInterval(() => loadWorktreeStatuses(), 60_000)
		return () => clearInterval(interval)
	}, [enrichedProjects])

	const handleSwitchProject = useCallback(async (switchPath: string) => {
		setUnreadWorktrees((prev) => {
			if (!prev.has(switchPath)) return prev
			const next = new Set(prev)
			next.delete(switchPath)
			return next
		})
		if (switchPath === projectInfoRef.current?.rootPath) return
		setActiveWorktrees((prev) => {
			const next = new Set(prev)
			next.delete(switchPath)
			return next
		})
		setProjectSwitching(true)
		await window.api.invoke({ type: "switchProject", path: switchPath })
	}, [])

	const handleOpenFolder = useCallback(async () => {
		try {
			const result = (await window.api.invoke({
				type: "openFolderDialog",
			})) as { path: string } | null
			if (result?.path) {
				setProjectSwitching(true)
				await window.api.invoke({ type: "switchProject", path: result.path })
				await loadEnrichedProjects()
			}
		} catch {
			// user cancelled
		}
	}, [])

	const handleShowCloneModal = useCallback(async () => {
		setShowCloneModal(true)
		setCloneUrl("")
		try {
			const st = (await window.api.invoke({ type: "getState" })) as {
				defaultClonePath?: string
			}
			setCloneDest(st?.defaultClonePath || "")
		} catch {
			setCloneDest("")
		}
	}, [])

	const handleBrowseCloneDest = useCallback(async () => {
		try {
			const result = (await window.api.invoke({
				type: "browseFolder",
				title: "Choose clone destination",
				defaultPath: cloneDest || undefined,
			})) as { path?: string; cancelled?: boolean }
			if (result?.path) setCloneDest(result.path)
		} catch {
			// user cancelled
		}
	}, [cloneDest])

	const handleCloneSubmit = useCallback(async () => {
		if (!cloneUrl.trim() || !cloneDest.trim() || cloning) return
		setCloning(true)
		try {
			const result = (await window.api.invoke({
				type: "cloneRepository",
				url: cloneUrl.trim(),
				dest: cloneDest.trim(),
			})) as { path?: string; cancelled?: boolean }
			if (result?.path) {
				setProjectSwitching(true)
				await window.api.invoke({ type: "switchProject", path: result.path })
				await loadEnrichedProjects()
			}
			setShowCloneModal(false)
			setCloneUrl("")
			setCloneDest("")
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err)
			console.error("[CLONE]", msg)
		} finally {
			setCloning(false)
		}
	}, [cloneUrl, cloneDest, cloning])

	const handleRemoveProject = useCallback(async (projectPath: string) => {
		await window.api.invoke({ type: "removeRecentProject", path: projectPath })
		loadEnrichedProjects()
	}, [])

	const handleStartWorkOnIssue = useCallback(
		async (issue: LinearIssue, workflowStates: WorkflowStates) => {
			const rootPath = projectInfoRef.current?.rootPath
			if (!rootPath) return

			const parentState = (await window.api.invoke({
				type: "getState",
			})) as Record<string, unknown>
			const apiKey = (parentState?.linearApiKey as string) ?? ""
			const teamId = (parentState?.linearTeamId as string) ?? ""

			const slug = `${issue.identifier}-${issue.title}`
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, "-")
				.replace(/^-|-$/g, "")
				.slice(0, 60)

			const currentProject = enrichedProjects.find(
				(p) => p.rootPath === rootPath,
			)
			const mainRepoPath = currentProject?.isWorktree
				? (currentProject.mainRepoPath ?? rootPath)
				: rootPath

			const result = (await window.api.invoke({
				type: "createWorktree",
				repoPath: mainRepoPath,
				branchName: slug,
			})) as { success: boolean; path?: string; error?: string }

			if (!result.success || !result.path) {
				console.error("Failed to create worktree:", result.error)
				return
			}

			dispatch({ type: "CLEAR" })
			tabSetters.setOpenThreadTabs([])
			tabSetters.setOpenFiles([])
			tabSetters.setActiveTab("chat")
			tabSetters.setThreads([])
			setProjectSwitching(true)
			await window.api.invoke({ type: "switchProject", path: result.path })

			await window.api.invoke({
				type: "linkLinearIssue",
				issueId: issue.id,
				issueIdentifier: issue.identifier,
				doneStateId: workflowStates.doneStateId,
				startedStateId: workflowStates.startedStateId,
				linearApiKey: apiKey,
				linearTeamId: teamId,
			})

			await loadLinkedIssues()
		},
		[loadLinkedIssues, enrichedProjects, dispatch, tabSetters],
	)

	const handleStartWorkOnGithubIssue = useCallback(
		async (issue: GitHubIssue) => {
			const rootPath = projectInfoRef.current?.rootPath
			if (!rootPath) return

			const parentState = (await window.api.invoke({
				type: "getState",
			})) as Record<string, unknown>
			const token = (parentState?.githubToken as string) ?? ""
			const owner = (parentState?.githubOwner as string) ?? ""
			const repo = (parentState?.githubRepo as string) ?? ""

			const slug = `${issue.number}-${issue.title}`
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, "-")
				.replace(/^-|-$/g, "")
				.slice(0, 60)

			const currentProject = enrichedProjects.find(
				(p) => p.rootPath === rootPath,
			)
			const mainRepoPath = currentProject?.isWorktree
				? (currentProject.mainRepoPath ?? rootPath)
				: rootPath

			const result = (await window.api.invoke({
				type: "createWorktree",
				repoPath: mainRepoPath,
				branchName: slug,
			})) as { success: boolean; path?: string; error?: string }

			if (!result.success || !result.path) {
				console.error("Failed to create worktree:", result.error)
				return
			}

			dispatch({ type: "CLEAR" })
			tabSetters.setOpenThreadTabs([])
			tabSetters.setOpenFiles([])
			tabSetters.setActiveTab("chat")
			tabSetters.setThreads([])
			setProjectSwitching(true)
			await window.api.invoke({ type: "switchProject", path: result.path })

			await window.api.invoke({
				type: "linkGithubIssue",
				issueNumber: issue.number,
				issueTitle: issue.title,
				githubToken: token,
				owner,
				repo,
			})

			await loadLinkedIssues()
		},
		[loadLinkedIssues, enrichedProjects, dispatch, tabSetters],
	)

	const handleDeleteWorktree = useCallback(
		async (worktreePath: string) => {
			const isCurrentProject = projectInfoRef.current?.rootPath === worktreePath
			let switchTo: string | null = null
			if (isCurrentProject) {
				for (const p of enrichedProjects) {
					const parentPath = p.mainRepoPath || p.rootPath
					const siblings =
						p.worktrees?.filter((wt) => wt.path !== worktreePath) ?? []
					const isChild = p.worktrees?.some((wt) => wt.path === worktreePath)
					if (isChild) {
						switchTo = siblings.length > 0 ? siblings[0].path : parentPath
						break
					}
				}
			}

			const result = (await window.api.invoke({
				type: "deleteWorktree",
				worktreePath,
			})) as { success: boolean; error?: string }
			if (result.success) {
				if (switchTo) {
					setProjectSwitching(true)
					await window.api.invoke({ type: "switchProject", path: switchTo })
				}
				await loadEnrichedProjects()
			}
		},
		[enrichedProjects],
	)

	const handleCreateWorktree = useCallback(async (repoPath: string) => {
		const result = (await window.api.invoke({
			type: "createWorktree",
			repoPath,
		})) as { success: boolean; path?: string; error?: string }
		if (result.success && result.path) {
			setProjectSwitching(true)
			await window.api.invoke({ type: "switchProject", path: result.path })
			await loadEnrichedProjects()
		}
	}, [])

	return {
		projectInfo,
		setProjectInfo,
		enrichedProjects,
		setEnrichedProjects,
		unreadWorktrees,
		setUnreadWorktrees,
		activeWorktrees,
		setActiveWorktrees,
		projectSwitching,
		setProjectSwitching,
		prStatus,
		setPrStatus,
		worktreeStatuses,
		linkedIssues,
		projectInfoRef,
		notificationPrefRef,
		showCloneModal,
		setShowCloneModal,
		cloneUrl,
		setCloneUrl,
		cloneDest,
		setCloneDest,
		cloning,
		loadEnrichedProjects,
		loadPRStatus,
		loadWorktreeStatuses,
		loadLinkedIssues,
		handleSwitchProject,
		handleOpenFolder,
		handleShowCloneModal,
		handleBrowseCloneDest,
		handleCloneSubmit,
		handleRemoveProject,
		handleStartWorkOnIssue,
		handleStartWorkOnGithubIssue,
		handleDeleteWorktree,
		handleCreateWorktree,
	}
}
