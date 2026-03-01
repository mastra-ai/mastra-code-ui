import { useState, useCallback } from "react"
import type { TaskBoardProps } from "../types/taskboard"
import { PRIORITY_LABELS } from "./taskboard/constants"
import { LinearIcon, GitHubIcon, HandmadeIcon } from "./taskboard/icons"
import { DisconnectMenu } from "./taskboard/DisconnectMenu"
import { UnifiedIssueCard } from "./taskboard/UnifiedIssueCard"
import { useLinearApi } from "../hooks/useLinearApi"
import { useGithubApi } from "../hooks/useGithubApi"
import { useHandmadeIssues } from "../hooks/useHandmadeIssues"
import { useUnifiedIssues } from "../hooks/useUnifiedIssues"

export type { LinearIssue, GitHubIssue, WorkflowStates } from "../types/taskboard"

export function TaskBoard({ agentTasks, onClose, onStartWork, onStartWorkGithub, linkedIssues, onSwitchToWorktree }: TaskBoardProps) {
	const [error, setError] = useState<string | null>(null)
	const [view, setView] = useState<"board" | "list">("board")
	const [filter, setFilter] = useState<"all" | "active" | "backlog">("active")

	const linear = useLinearApi(setError)
	const github = useGithubApi(setError)
	const handmade = useHandmadeIssues()

	const anyConnected = linear.linearConnected || github.githubConnected || linear.isDemo

	const unified = useUnifiedIssues({
		activeIssues: linear.activeIssues,
		activeStates: linear.activeStates,
		githubIssues: github.githubIssues,
		handmadeIssues: handmade.handmadeIssues,
		linkedIssues,
		filter,
	})

	const handleRefreshAll = useCallback(() => {
		if (linear.linearConnected) linear.loadIssues()
		if (github.githubConnected) github.loadGithubIssues()
	}, [linear.linearConnected, github.githubConnected, linear.loadIssues, github.loadGithubIssues])

	const handleStartWorkUnified = useCallback((issue: { provider: string; linearIssue?: any; githubIssue?: any }) => {
		if (issue.provider === "linear" && issue.linearIssue && onStartWork) {
			onStartWork(issue.linearIssue, unified.workflowStates)
		} else if (issue.provider === "github" && issue.githubIssue && onStartWorkGithub) {
			onStartWorkGithub(issue.githubIssue)
		}
	}, [onStartWork, onStartWorkGithub, unified.workflowStates])

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
							{(linear.linearConnected || linear.isDemo) && (
								<span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--muted)", background: "var(--bg-surface)", padding: "2px 8px", borderRadius: 3, border: "1px solid var(--border-muted)" }}>
									<LinearIcon size={10} />
									{linear.isDemo ? "Demo" : linear.activeTeams.find((t) => t.id === linear.activeTeamId)?.key ?? "Linear"}
								</span>
							)}
							{github.githubConnected && (
								<span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--muted)", background: "var(--bg-surface)", padding: "2px 8px", borderRadius: 3, border: "1px solid var(--border-muted)" }}>
									<GitHubIcon size={10} />
									{github.githubOwner}/{github.githubRepo}
								</span>
							)}
						</div>

						{/* Team selector (Linear) */}
						{(linear.linearConnected || linear.isDemo) && linear.activeTeams.length > 1 && (
							<select
								value={linear.activeTeamId}
								onChange={(e) => !linear.isDemo && linear.handleTeamChange(e.target.value)}
								disabled={linear.isDemo}
								style={{
									background: "var(--bg-elevated)",
									color: "var(--text)",
									border: "1px solid var(--border)",
									borderRadius: 4,
									padding: "3px 8px",
									fontSize: 11,
									cursor: linear.isDemo ? "default" : "pointer",
									fontFamily: "inherit",
								}}
							>
								{linear.activeTeams.map((t) => (
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

						{!linear.isDemo && (
							<>
								<button
									onClick={() => { handmade.setCreatingHandmade(!handmade.creatingHandmade); linear.setCreating(false) }}
									style={{
										padding: "4px 12px",
										fontSize: 11,
										background: handmade.creatingHandmade ? "var(--bg-elevated)" : "var(--bg-surface)",
										color: handmade.creatingHandmade ? "var(--text)" : "var(--muted)",
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
								{linear.linearConnected && (
									<button
										onClick={() => { linear.setCreating(!linear.creating); handmade.setCreatingHandmade(false) }}
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
									disabled={linear.loading || github.githubLoading}
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
									{linear.loading || github.githubLoading ? "..." : "Refresh"}
								</button>
								{!linear.linearConnected && (
									<button
										onClick={linear.handleOAuthConnect}
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
								{!github.githubConnected && (
									<button
										onClick={github.handleGithubCLIConnect}
										disabled={github.githubConnecting}
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
								<DisconnectMenu
									linearConnected={linear.linearConnected}
									githubConnected={github.githubConnected}
									onDisconnectLinear={linear.handleLinearDisconnect}
									onDisconnectGithub={github.handleGithubDisconnect}
								/>
							</>
						)}
						{linear.isDemo && (
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
			{anyConnected && (unified.availableSources.length > 1 || unified.availableWorkspaces.length > 0 || handmade.handmadeIssues.length > 0) && (
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
					<span style={{ fontSize: 10, color: "var(--dim)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.3px" }}>Source</span>
					{unified.availableSources.includes("linear") && (
						<button
							onClick={() => unified.toggleSourceFilter("linear")}
							style={{
								display: "flex",
								alignItems: "center",
								gap: 4,
								padding: "2px 8px",
								fontSize: 10,
								borderRadius: 3,
								cursor: "pointer",
								border: "1px solid",
								borderColor: unified.sourceFilter === null || unified.sourceFilter.has("linear") ? "#5E6AD2" : "var(--border)",
								background: unified.sourceFilter === null || unified.sourceFilter.has("linear") ? "#5E6AD218" : "transparent",
								color: unified.sourceFilter === null || unified.sourceFilter.has("linear") ? "#5E6AD2" : "var(--dim)",
								fontWeight: 600,
							}}
						>
							<LinearIcon size={10} /> Linear
						</button>
					)}
					{unified.availableSources.includes("github") && (
						<button
							onClick={() => unified.toggleSourceFilter("github")}
							style={{
								display: "flex",
								alignItems: "center",
								gap: 4,
								padding: "2px 8px",
								fontSize: 10,
								borderRadius: 3,
								cursor: "pointer",
								border: "1px solid",
								borderColor: unified.sourceFilter === null || unified.sourceFilter.has("github") ? "#8b949e" : "var(--border)",
								background: unified.sourceFilter === null || unified.sourceFilter.has("github") ? "#8b949e18" : "transparent",
								color: unified.sourceFilter === null || unified.sourceFilter.has("github") ? "var(--text)" : "var(--dim)",
								fontWeight: 600,
							}}
						>
							<GitHubIcon size={10} /> GitHub
						</button>
					)}
					{unified.availableSources.includes("handmade") && (
						<button
							onClick={() => unified.toggleSourceFilter("handmade")}
							style={{
								display: "flex",
								alignItems: "center",
								gap: 4,
								padding: "2px 8px",
								fontSize: 10,
								borderRadius: 3,
								cursor: "pointer",
								border: "1px solid",
								borderColor: unified.sourceFilter === null || unified.sourceFilter.has("handmade") ? "#f59e0b" : "var(--border)",
								background: unified.sourceFilter === null || unified.sourceFilter.has("handmade") ? "#f59e0b18" : "transparent",
								color: unified.sourceFilter === null || unified.sourceFilter.has("handmade") ? "#f59e0b" : "var(--dim)",
								fontWeight: 600,
							}}
						>
							<HandmadeIcon size={10} /> Manual
						</button>
					)}

					{unified.availableWorkspaces.length > 0 && (
						<>
							<div style={{ width: 1, height: 16, background: "var(--border-muted)", margin: "0 4px" }} />
							<span style={{ fontSize: 10, color: "var(--dim)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.3px" }}>Workspace</span>
							<select
								value={unified.workspaceFilter ?? ""}
								onChange={(e) => unified.setWorkspaceFilter(e.target.value || null)}
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
								{unified.availableWorkspaces.map(ws => (
									<option key={ws.path} value={ws.path}>{ws.name}</option>
								))}
								<option value="__unlinked__">Unlinked</option>
							</select>
						</>
					)}

					{(unified.sourceFilter !== null || unified.workspaceFilter !== null) && (
						<button
							onClick={() => { unified.setSourceFilter(null); unified.setWorkspaceFilter(null) }}
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
			{handmade.creatingHandmade && (
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
						value={handmade.newHandmadeTitle}
						onChange={(e) => handmade.setNewHandmadeTitle(e.target.value)}
						placeholder="Task title"
						autoFocus
						onKeyDown={(e) => {
							if (e.key === "Enter") handmade.handleCreateHandmade()
							if (e.key === "Escape") handmade.setCreatingHandmade(false)
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
						onClick={handmade.handleCreateHandmade}
						disabled={!handmade.newHandmadeTitle.trim()}
						style={{
							padding: "6px 16px",
							background: handmade.newHandmadeTitle.trim() ? "#f59e0b" : "var(--bg-elevated)",
							color: handmade.newHandmadeTitle.trim() ? "#fff" : "var(--muted)",
							borderRadius: 4,
							cursor: handmade.newHandmadeTitle.trim() ? "pointer" : "default",
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
			{linear.creating && (
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
							value={linear.newTitle}
							onChange={(e) => linear.setNewTitle(e.target.value)}
							placeholder="Issue title"
							autoFocus
							onKeyDown={(e) => {
								if (e.key === "Enter" && !e.shiftKey) linear.handleCreateIssue()
								if (e.key === "Escape") linear.setCreating(false)
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
							value={linear.newDescription}
							onChange={(e) => linear.setNewDescription(e.target.value)}
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
						onClick={linear.handleCreateIssue}
						disabled={!linear.newTitle.trim()}
						style={{
							padding: "6px 16px",
							background: linear.newTitle.trim() ? "var(--accent)" : "var(--bg-elevated)",
							color: linear.newTitle.trim() ? "#fff" : "var(--muted)",
							borderRadius: 4,
							cursor: linear.newTitle.trim() ? "pointer" : "default",
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
							onClick={github.handleGithubCLIConnect}
							disabled={github.githubConnecting}
							style={{
								width: "100%",
								padding: "10px 20px",
								background: github.githubConnecting ? "var(--bg-elevated)" : "#24292e",
								color: github.githubConnecting ? "var(--muted)" : "#fff",
								borderRadius: 8,
								cursor: github.githubConnecting ? "default" : "pointer",
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
							{github.githubConnecting ? (
								"Connecting..."
							) : (
								<>
									<GitHubIcon size={16} />
									Connect with GitHub CLI
								</>
							)}
						</button>

						{!github.showGithubPATInput ? (
							<button
								onClick={() => github.setShowGithubPATInput(true)}
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
										value={github.githubPATInput}
										onChange={(e) => github.setGithubPATInput(e.target.value)}
										placeholder="ghp_..."
										onKeyDown={(e) => {
											if (e.key === "Enter") github.handleGithubPATConnect()
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
										onClick={github.handleGithubPATConnect}
										disabled={!github.githubPATInput.trim() || github.githubConnecting}
										style={{
											padding: "8px 16px",
											background: github.githubPATInput.trim() && !github.githubConnecting ? "#24292e" : "var(--bg-elevated)",
											color: github.githubPATInput.trim() && !github.githubConnecting ? "#fff" : "var(--muted)",
											borderRadius: 6,
											cursor: github.githubPATInput.trim() && !github.githubConnecting ? "pointer" : "default",
											fontSize: 12,
											fontWeight: 500,
											border: "none",
										}}
									>
										{github.githubConnecting ? "..." : "Connect"}
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
							onClick={linear.handleOAuthConnect}
							disabled={linear.connecting}
							style={{
								width: "100%",
								padding: "10px 20px",
								background: linear.connecting ? "var(--bg-elevated)" : "#5E6AD2",
								color: linear.connecting ? "var(--muted)" : "#fff",
								borderRadius: 8,
								cursor: linear.connecting ? "default" : "pointer",
								fontSize: 13,
								fontWeight: 600,
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								gap: 8,
								border: "none",
							}}
						>
							{linear.connecting ? (
								"Connecting..."
							) : (
								<>
									<LinearIcon size={16} />
									Sign in with Linear
								</>
							)}
						</button>

						{!linear.showApiKeyInput ? (
							<button
								onClick={() => linear.setShowApiKeyInput(true)}
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
										value={linear.linearApiKey}
										onChange={(e) =>
											linear.setLinearApiKey(e.target.value)
										}
										placeholder="lin_api_..."
										onKeyDown={(e) => {
											if (e.key === "Enter")
												linear.handleApiKeyConnect()
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
										onClick={linear.handleApiKeyConnect}
										disabled={
											!linear.linearApiKey.trim() || linear.loading
										}
										style={{
											padding: "8px 16px",
											background:
												linear.linearApiKey.trim() && !linear.loading
													? "var(--accent)"
													: "var(--bg-elevated)",
											color:
												linear.linearApiKey.trim() && !linear.loading
													? "#fff"
													: "var(--muted)",
											borderRadius: 6,
											cursor:
												linear.linearApiKey.trim() && !linear.loading
													? "pointer"
													: "default",
											fontSize: 12,
											fontWeight: 500,
											border: "none",
										}}
									>
										{linear.loading ? "..." : "Connect"}
									</button>
								</div>
							</div>
						)}

						{/* Demo toggle */}
						<button
							onClick={() => linear.setDemo(true)}
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
						{unified.columns.map((col) => (
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
											states={linear.activeStates}
											onUpdateStatus={linear.handleUpdateStatus}
											onStartWork={() => handleStartWorkUnified(issue)}
											linkedWorktree={unified.issueWorktreeMap[issue.id]}
											onSwitchToWorktree={onSwitchToWorktree}
											onUpdateHandmadeStatus={handmade.handleUpdateHandmadeStatus}
											onDeleteHandmade={handmade.handleDeleteHandmade}
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
						{unified.filteredIssues.map((issue) => (
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
												handmade.handleUpdateHandmadeStatus(issue.id, next)
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
												handmade.handleDeleteHandmade(issue.id)
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
						{unified.filteredIssues.length === 0 && !linear.loading && !github.githubLoading && (
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
