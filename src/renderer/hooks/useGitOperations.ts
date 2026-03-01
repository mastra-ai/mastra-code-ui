import { useState, useEffect, useCallback, useMemo } from "react"
import type { GitFile, GitStatus, AheadBehind, GitFeedback } from "../types/git"

export interface UseGitOperationsReturn {
	// State
	status: GitStatus | null
	aheadBehind: AheadBehind | null
	commitMessage: string
	setCommitMessage: (msg: string) => void
	isCommitting: boolean
	isPushing: boolean
	isPulling: boolean
	isSyncing: boolean
	feedback: GitFeedback | null

	// Derived
	staged: GitFile[]
	unstaged: GitFile[]
	untracked: GitFile[]

	// Actions
	refresh: () => Promise<void>
	handleStage: (files: string[]) => Promise<void>
	handleUnstage: (files: string[]) => Promise<void>
	handleStageAll: () => Promise<void>
	handleUnstageAll: () => Promise<void>
	handleCommit: () => Promise<void>
	handlePush: () => Promise<void>
	handlePull: () => Promise<void>
	handleSyncWithMain: () => Promise<void>
}

export function useGitOperations(): UseGitOperationsReturn {
	const [status, setStatus] = useState<GitStatus | null>(null)
	const [aheadBehind, setAheadBehind] = useState<AheadBehind | null>(null)
	const [commitMessage, setCommitMessage] = useState("")
	const [isCommitting, setIsCommitting] = useState(false)
	const [isPushing, setIsPushing] = useState(false)
	const [isPulling, setIsPulling] = useState(false)
	const [isSyncing, setIsSyncing] = useState(false)
	const [feedback, setFeedback] = useState<GitFeedback | null>(null)

	// ── Helpers ──────────────────────────────────────────────────────

	const showFeedback = useCallback(
		(type: "success" | "error", message: string) => {
			setFeedback({ type, message })
			setTimeout(() => setFeedback(null), 3000)
		},
		[],
	)

	// ── Refresh ─────────────────────────────────────────────────────

	const refresh = useCallback(async () => {
		try {
			const result = (await window.api.invoke({
				type: "gitStatus",
			})) as GitStatus
			setStatus(result)
		} catch {
			setStatus({
				branch: null,
				files: [],
				clean: true,
				error: "Failed to get git status",
			})
		}
		try {
			const ab = (await window.api.invoke({
				type: "gitAheadBehind",
			})) as AheadBehind
			setAheadBehind(ab)
		} catch {
			setAheadBehind(null)
		}
	}, [])

	// ── Polling / subscription ──────────────────────────────────────

	useEffect(() => {
		refresh()
		const interval = setInterval(refresh, 3000)
		const unsubscribe = window.api.onEvent((raw: unknown) => {
			const event = raw as { type: string }
			if (event.type === "agent_end") refresh()
		})
		return () => {
			clearInterval(interval)
			unsubscribe()
		}
	}, [refresh])

	// ── Derived lists ───────────────────────────────────────────────

	const staged = useMemo(
		() => (status?.files ?? []).filter((f) => f.staged),
		[status],
	)

	const unstaged = useMemo(
		() => (status?.files ?? []).filter((f) => f.unstaged && !f.untracked),
		[status],
	)

	const untracked = useMemo(
		() => (status?.files ?? []).filter((f) => f.untracked),
		[status],
	)

	// ── Git actions ─────────────────────────────────────────────────

	const handleStage = useCallback(
		async (files: string[]) => {
			try {
				const result = (await window.api.invoke({
					type: "gitStage",
					files,
				})) as { success: boolean; error?: string }
				if (!result.success)
					showFeedback("error", result.error || "Stage failed")
				refresh()
			} catch {
				showFeedback("error", "Failed to stage files")
			}
		},
		[refresh, showFeedback],
	)

	const handleUnstage = useCallback(
		async (files: string[]) => {
			try {
				const result = (await window.api.invoke({
					type: "gitUnstage",
					files,
				})) as { success: boolean; error?: string }
				if (!result.success)
					showFeedback("error", result.error || "Unstage failed")
				refresh()
			} catch {
				showFeedback("error", "Failed to unstage files")
			}
		},
		[refresh, showFeedback],
	)

	const handleStageAll = useCallback(async () => {
		try {
			const result = (await window.api.invoke({
				type: "gitStage",
			})) as { success: boolean; error?: string }
			if (!result.success)
				showFeedback("error", result.error || "Stage all failed")
			refresh()
		} catch {
			showFeedback("error", "Failed to stage all")
		}
	}, [refresh, showFeedback])

	const handleUnstageAll = useCallback(async () => {
		try {
			const result = (await window.api.invoke({
				type: "gitUnstage",
			})) as { success: boolean; error?: string }
			if (!result.success)
				showFeedback("error", result.error || "Unstage all failed")
			refresh()
		} catch {
			showFeedback("error", "Failed to unstage all")
		}
	}, [refresh, showFeedback])

	const handleCommit = useCallback(async () => {
		if (!commitMessage.trim()) return
		setIsCommitting(true)
		try {
			const result = (await window.api.invoke({
				type: "gitCommit",
				message: commitMessage,
			})) as { success: boolean; error?: string }
			if (result.success) {
				setCommitMessage("")
				showFeedback("success", "Committed successfully")
			} else {
				showFeedback("error", result.error || "Commit failed")
			}
			refresh()
		} catch {
			showFeedback("error", "Failed to commit")
		} finally {
			setIsCommitting(false)
		}
	}, [commitMessage, refresh, showFeedback])

	const handlePush = useCallback(async () => {
		setIsPushing(true)
		try {
			const result = (await window.api.invoke({
				type: "gitPush",
			})) as { success: boolean; error?: string }
			if (result.success) {
				showFeedback("success", "Pushed successfully")
			} else {
				showFeedback("error", result.error || "Push failed")
			}
			refresh()
		} catch {
			showFeedback("error", "Push failed")
		} finally {
			setIsPushing(false)
		}
	}, [refresh, showFeedback])

	const handlePull = useCallback(async () => {
		setIsPulling(true)
		try {
			const result = (await window.api.invoke({
				type: "gitPull",
			})) as { success: boolean; error?: string; output?: string }
			if (result.success) {
				showFeedback("success", result.output || "Pulled successfully")
			} else {
				showFeedback("error", result.error || "Pull failed")
			}
			refresh()
		} catch {
			showFeedback("error", "Pull failed")
		} finally {
			setIsPulling(false)
		}
	}, [refresh, showFeedback])

	const handleSyncWithMain = useCallback(async () => {
		setIsSyncing(true)
		try {
			const state = (await window.api.invoke({ type: "getState" })) as {
				projectPath?: string
			}
			const worktreePath = state?.projectPath
			if (!worktreePath) {
				showFeedback("error", "No project path found")
				return
			}
			const result = (await window.api.invoke({
				type: "gitSyncWithMain",
				worktreePath,
			})) as { success: boolean; output?: string; error?: string }
			if (result.success) {
				showFeedback("success", result.output || "Synced with main")
			} else {
				showFeedback("error", result.error || "Sync failed")
			}
			refresh()
		} catch {
			showFeedback("error", "Sync with main failed")
		} finally {
			setIsSyncing(false)
		}
	}, [refresh, showFeedback])

	return {
		status,
		aheadBehind,
		commitMessage,
		setCommitMessage,
		isCommitting,
		isPushing,
		isPulling,
		isSyncing,
		feedback,
		staged,
		unstaged,
		untracked,
		refresh,
		handleStage,
		handleUnstage,
		handleStageAll,
		handleUnstageAll,
		handleCommit,
		handlePush,
		handlePull,
		handleSyncWithMain,
	}
}
