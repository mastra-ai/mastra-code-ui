import { useState, useEffect, useCallback } from "react"

interface GitFile {
	status: string
	path: string
	staged: boolean
	unstaged: boolean
	untracked: boolean
}

interface GitStatus {
	branch: string | null
	files: GitFile[]
	clean: boolean
	error?: string
}

interface AheadBehind {
	ahead: number
	behind: number
	hasUpstream: boolean
}

interface GitPanelProps {
	onFileClick?: (filePath: string) => void
	activeFilePath?: string | null
}

export function GitPanel({ onFileClick, activeFilePath }: GitPanelProps) {
	const [status, setStatus] = useState<GitStatus | null>(null)
	const [aheadBehind, setAheadBehind] = useState<AheadBehind | null>(null)
	const [commitMessage, setCommitMessage] = useState("")
	const [isCommitting, setIsCommitting] = useState(false)
	const [isPushing, setIsPushing] = useState(false)
	const [isPulling, setIsPulling] = useState(false)
	const [isSyncing, setIsSyncing] = useState(false)
	const [feedback, setFeedback] = useState<{
		type: "success" | "error"
		message: string
	} | null>(null)

	const showFeedback = useCallback(
		(type: "success" | "error", message: string) => {
			setFeedback({ type, message })
			setTimeout(() => setFeedback(null), 3000)
		},
		[],
	)

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

	// ── Git actions ──────────────────────────────────────────────────

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
			// Use the current project root (harness knows the active session path)
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

	// ── Loading / error states ───────────────────────────────────────

	if (!status) {
		return (
			<div
				style={{
					padding: "20px 16px",
					color: "var(--dim)",
					fontSize: 12,
					textAlign: "center",
				}}
			>
				Loading...
			</div>
		)
	}

	if (status.error) {
		return (
			<div
				style={{
					padding: "20px 16px",
					color: "var(--dim)",
					fontSize: 12,
					textAlign: "center",
				}}
			>
				{status.error}
			</div>
		)
	}

	const staged = status.files.filter((f) => f.staged)
	const unstaged = status.files.filter((f) => f.unstaged && !f.untracked)
	const untracked = status.files.filter((f) => f.untracked)

	// ── Helpers ──────────────────────────────────────────────────────

	function statusLabel(s: string): string {
		const x = s[0]
		const y = s[1]
		const code = x !== " " && x !== "?" ? x : y
		switch (code) {
			case "M":
				return "modified"
			case "A":
				return "added"
			case "D":
				return "deleted"
			case "R":
				return "renamed"
			case "C":
				return "copied"
			case "?":
				return "untracked"
			default:
				return code
		}
	}

	function statusColor(s: string): string {
		const code = s.trim()[0]
		switch (code) {
			case "M":
				return "var(--warning)"
			case "A":
			case "?":
				return "var(--success)"
			case "D":
				return "var(--error)"
			default:
				return "var(--muted)"
		}
	}

	// ── File section renderer ────────────────────────────────────────

	function renderSection(
		title: string,
		files: GitFile[],
		sectionType: "staged" | "unstaged" | "untracked",
	) {
		if (files.length === 0) return null
		return (
			<div style={{ marginBottom: 8 }}>
				<div
					style={{
						padding: "4px 12px",
						fontSize: 10,
						fontWeight: 600,
						color: "var(--dim)",
						textTransform: "uppercase",
						letterSpacing: "0.5px",
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
					}}
				>
					<span>
						{title} ({files.length})
					</span>
					{sectionType === "staged" && (
						<button
							onClick={handleUnstageAll}
							style={{
								fontSize: 9,
								color: "var(--muted)",
								cursor: "pointer",
								background: "none",
								border: "none",
								textTransform: "none",
								letterSpacing: "normal",
								padding: "0 2px",
							}}
							title="Unstage all"
						>
							Unstage All
						</button>
					)}
					{(sectionType === "unstaged" || sectionType === "untracked") && (
						<button
							onClick={handleStageAll}
							style={{
								fontSize: 9,
								color: "var(--muted)",
								cursor: "pointer",
								background: "none",
								border: "none",
								textTransform: "none",
								letterSpacing: "normal",
								padding: "0 2px",
							}}
							title="Stage all"
						>
							Stage All
						</button>
					)}
				</div>
				{files.map((file) => {
					const isActive = file.path === activeFilePath
					return (
						<button
							key={file.path + file.status}
							onClick={() => onFileClick?.(file.path)}
							style={{
								display: "flex",
								alignItems: "center",
								width: "100%",
								padding: "3px 12px",
								paddingLeft: isActive ? 10 : 12,
								fontSize: 12,
								textAlign: "left",
								cursor: "pointer",
								gap: 6,
								background: isActive
									? "var(--selected-bg)"
									: "transparent",
								border: "none",
								borderLeft: isActive
									? "2px solid var(--accent)"
									: "2px solid transparent",
							}}
						>
							<span
								style={{
									fontSize: 10,
									color: statusColor(file.status),
									fontWeight: 600,
									width: 14,
									flexShrink: 0,
								}}
							>
								{statusLabel(file.status).charAt(0).toUpperCase()}
							</span>
							<span
								style={{
									color: "var(--text)",
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap",
									flex: 1,
								}}
							>
								{file.path}
							</span>
							<span
								style={{
									fontSize: 10,
									color: statusColor(file.status),
									flexShrink: 0,
								}}
							>
								{statusLabel(file.status)}
							</span>
							<span
								onClick={(e) => {
									e.stopPropagation()
									if (sectionType === "staged") {
										handleUnstage([file.path])
									} else {
										handleStage([file.path])
									}
								}}
								style={{
									fontSize: 13,
									color:
										sectionType === "staged"
											? "var(--error)"
											: "var(--success)",
									cursor: "pointer",
									padding: "0 2px",
									fontWeight: 700,
									flexShrink: 0,
									lineHeight: 1,
								}}
								title={
									sectionType === "staged" ? "Unstage" : "Stage"
								}
							>
								{sectionType === "staged" ? "\u2212" : "+"}
							</span>
						</button>
					)
				})}
			</div>
		)
	}

	// ── Render ────────────────────────────────────────────────────────

	return (
		<div
			style={{
				flex: 1,
				overflowY: "auto",
				padding: "4px 0",
			}}
		>
			{/* Branch */}
			{status.branch && (
				<div
					style={{
						padding: "6px 12px 4px",
						fontSize: 11,
						color: "var(--muted)",
						display: "flex",
						alignItems: "center",
						gap: 4,
					}}
				>
					<span style={{ color: "var(--accent)" }}>&#x2387;</span>
					{status.branch}
				</div>
			)}

			{/* Push / Pull */}
			{aheadBehind?.hasUpstream && (
				<div
					style={{
						padding: "2px 12px 6px",
						display: "flex",
						gap: 6,
					}}
				>
					<button
						onClick={handlePull}
						disabled={isPulling}
						style={{
							flex: 1,
							padding: "3px 8px",
							fontSize: 10,
							color: "var(--text)",
							background: "transparent",
							border: "1px solid var(--border)",
							borderRadius: 4,
							cursor: isPulling ? "default" : "pointer",
							opacity: isPulling ? 0.6 : 1,
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							gap: 4,
						}}
					>
						{isPulling ? (
							"Pulling\u2026"
						) : (
							<>
								&#x2193; Pull
								{aheadBehind.behind > 0 && (
									<span
										style={{
											color: "var(--warning)",
											fontWeight: 600,
										}}
									>
										{aheadBehind.behind}
									</span>
								)}
							</>
						)}
					</button>
					<button
						onClick={handlePush}
						disabled={isPushing}
						style={{
							flex: 1,
							padding: "3px 8px",
							fontSize: 10,
							color: "var(--text)",
							background: "transparent",
							border: "1px solid var(--border)",
							borderRadius: 4,
							cursor: isPushing ? "default" : "pointer",
							opacity: isPushing ? 0.6 : 1,
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							gap: 4,
						}}
					>
						{isPushing ? (
							"Pushing\u2026"
						) : (
							<>
								&#x2191; Push
								{aheadBehind.ahead > 0 && (
									<span
										style={{
											color: "var(--success)",
											fontWeight: 600,
										}}
									>
										{aheadBehind.ahead}
									</span>
								)}
							</>
						)}
					</button>
				</div>
			)}

			{/* Sync with main (only for non-main branches) */}
			{status.branch && status.branch !== "main" && status.branch !== "master" && (
				<div style={{ padding: "2px 12px 6px" }}>
					<button
						onClick={handleSyncWithMain}
						disabled={isSyncing}
						style={{
							width: "100%",
							padding: "3px 8px",
							fontSize: 10,
							color: "var(--text)",
							background: "transparent",
							border: "1px solid var(--border)",
							borderRadius: 4,
							cursor: isSyncing ? "default" : "pointer",
							opacity: isSyncing ? 0.6 : 1,
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							gap: 4,
						}}
					>
						{isSyncing ? "Syncing\u2026" : "\u21BB Sync with main"}
					</button>
				</div>
			)}

			{/* Feedback toast */}
			{feedback && (
				<div
					style={{
						padding: "3px 12px",
						fontSize: 11,
						color:
							feedback.type === "success"
								? "var(--success)"
								: "var(--error)",
						textAlign: "center",
					}}
				>
					{feedback.message}
				</div>
			)}

			{/* Commit area */}
			{staged.length > 0 && (
				<div
					style={{
						padding: "6px 12px 8px",
						borderBottom: "1px solid var(--border-muted)",
					}}
				>
					<textarea
						value={commitMessage}
						onChange={(e) => setCommitMessage(e.target.value)}
						placeholder="Commit message\u2026"
						rows={2}
						style={{
							width: "100%",
							background: "var(--bg)",
							border: "1px solid var(--border-muted)",
							borderRadius: 4,
							color: "var(--text)",
							fontSize: 11,
							fontFamily: "inherit",
							padding: "6px 8px",
							resize: "vertical",
							minHeight: 36,
							maxHeight: 100,
							outline: "none",
							boxSizing: "border-box",
						}}
						onFocus={(e) =>
							(e.target.style.borderColor = "var(--accent)")
						}
						onBlur={(e) =>
							(e.target.style.borderColor = "var(--border-muted)")
						}
						onKeyDown={(e) => {
							if (
								e.key === "Enter" &&
								(e.metaKey || e.ctrlKey)
							) {
								e.preventDefault()
								handleCommit()
							}
						}}
					/>
					<button
						onClick={handleCommit}
						disabled={!commitMessage.trim() || isCommitting}
						style={{
							width: "100%",
							marginTop: 6,
							padding: "4px 8px",
							fontSize: 11,
							fontWeight: 500,
							background: commitMessage.trim()
								? "var(--accent)"
								: "var(--bg-surface)",
							color: commitMessage.trim() ? "#fff" : "var(--dim)",
							borderRadius: 4,
							border: "none",
							cursor: commitMessage.trim()
								? "pointer"
								: "default",
							opacity: isCommitting ? 0.6 : 1,
						}}
					>
						{isCommitting
							? "Committing\u2026"
							: `Commit (${staged.length} file${staged.length !== 1 ? "s" : ""})`}
					</button>
				</div>
			)}

			{status.clean ? (
				<div
					style={{
						padding: "20px 16px",
						color: "var(--dim)",
						fontSize: 12,
						textAlign: "center",
					}}
				>
					Working tree clean
				</div>
			) : (
				<>
					{renderSection("Staged", staged, "staged")}
					{renderSection("Unstaged", unstaged, "unstaged")}
					{renderSection("Untracked", untracked, "untracked")}
				</>
			)}
		</div>
	)
}
