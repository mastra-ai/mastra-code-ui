import type { GitPanelProps } from "../types/git"
import { useGitOperations } from "../hooks/useGitOperations"
import { FileSection } from "./FileSection"

export function GitPanel({ onFileClick, activeFilePath }: GitPanelProps) {
	const {
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
		handleStage,
		handleUnstage,
		handleStageAll,
		handleUnstageAll,
		handleCommit,
		handlePush,
		handlePull,
		handleSyncWithMain,
	} = useGitOperations()

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
					<FileSection
						title="Staged"
						files={staged}
						sectionType="staged"
						activeFilePath={activeFilePath}
						onFileClick={onFileClick}
						onStage={handleStage}
						onUnstage={handleUnstage}
						onStageAll={handleStageAll}
						onUnstageAll={handleUnstageAll}
					/>
					<FileSection
						title="Unstaged"
						files={unstaged}
						sectionType="unstaged"
						activeFilePath={activeFilePath}
						onFileClick={onFileClick}
						onStage={handleStage}
						onUnstage={handleUnstage}
						onStageAll={handleStageAll}
						onUnstageAll={handleUnstageAll}
					/>
					<FileSection
						title="Untracked"
						files={untracked}
						sectionType="untracked"
						activeFilePath={activeFilePath}
						onFileClick={onFileClick}
						onStage={handleStage}
						onUnstage={handleUnstage}
						onStageAll={handleStageAll}
						onUnstageAll={handleUnstageAll}
					/>
				</>
			)}
		</div>
	)
}
