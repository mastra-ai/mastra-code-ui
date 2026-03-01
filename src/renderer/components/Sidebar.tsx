import { useState, useCallback } from "react"
import { ProjectList } from "./ProjectList"
import type { EnrichedProject } from "../types/project-list"
import { ConfirmDialog } from "./ConfirmDialog"
import { ResizeHandle } from "./ResizeHandle"
import type { ThreadInfo } from "../types/ipc"
import type { WorktreeStatus } from "../types/project"

interface SidebarProps {
	threads: ThreadInfo[]
	currentThreadId: string | null
	loggedInProviders: Set<string>
	projectName: string
	sidebarVisible: boolean
	enrichedProjects: EnrichedProject[]
	activeProjectPath: string | null
	isAgentActive: boolean
	activeWorktrees: Set<string>
	unreadWorktrees: Set<string>
	worktreeStatuses: Map<string, WorktreeStatus>
	linkedIssues?: Record<string, { issueId: string; issueIdentifier: string; provider?: string }>
	onSwitchThread: (threadId: string) => void
	onNewThread: () => void
	onDeleteThread: (threadId: string) => void
	onLogin: (providerId: string) => void
	onSwitchProject: (path: string) => void
	onOpenFolder: () => void
	onCloneRepo: () => void
	onRemoveProject: (path: string) => void
	onCreateWorktree: (repoPath: string) => void
	onDeleteWorktree: (worktreePath: string) => void
	onOpenSettings: () => void
	onOpenTasks: () => void
	onOpenAgents: () => void
	onOpenAccounts: () => void
	isSettingsActive: boolean
	isTasksActive: boolean
	isAgentsActive: boolean
	activeAgentCount: number
}

const providers = [
	{ id: "anthropic", label: "Anthropic" },
	{ id: "openai-codex", label: "OpenAI" },
	{ id: "google", label: "Google" },
]

export function Sidebar({
	threads,
	currentThreadId,
	loggedInProviders,
	projectName,
	sidebarVisible,
	enrichedProjects,
	activeProjectPath,
	isAgentActive,
	activeWorktrees,
	unreadWorktrees,
	worktreeStatuses,
	linkedIssues,
	onSwitchThread,
	onNewThread,
	onDeleteThread,
	onLogin,
	onSwitchProject,
	onOpenFolder,
	onCloneRepo,
	onRemoveProject,
	onCreateWorktree,
	onDeleteWorktree,
	onOpenSettings,
	onOpenTasks,
	onOpenAgents,
	onOpenAccounts,
	isSettingsActive,
	isTasksActive,
	isAgentsActive,
	activeAgentCount,
}: SidebarProps) {
	const [hoveredThreadId, setHoveredThreadId] = useState<string | null>(null)
	const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
	const [historyCollapsed, setHistoryCollapsed] = useState(false)
	const [historyHeight, setHistoryHeight] = useState(160)

	const handleResize = useCallback((delta: number) => {
		setHistoryHeight((h) => Math.max(60, Math.min(500, h + delta)))
	}, [])

	if (!sidebarVisible) return null

	return (
		<div
			style={{
				width: 260,
				borderRight: "1px solid var(--border-muted)",
				display: "flex",
				flexDirection: "column",
				background: "var(--bg-surface)",
				flexShrink: 0,
			}}
		>
			{/* Drag region + logo */}
			<div
				className="titlebar-drag"
				style={{
					height: 38,
					display: "flex",
					alignItems: "center",
					paddingLeft: 78,
					borderBottom: "1px solid var(--border-muted)",
					flexShrink: 0,
				}}
			>
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 220 32" style={{ height: 18, color: "var(--text)" }}>
					<path fill="currentColor" d="M5 17.3a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9m5.9-11.6a4.5 4.5 0 0 1 4.4 5.4c-.3 1.4-.6 3 .2 4.2l1.3 1.9.3.2.3-.2 1.3-1.9c.8-1.2.5-2.7.2-4.1a4.5 4.5 0 1 1 8.8.1c-.3 1.3-.6 2.7 0 3.9l1.3 2v.1a4.5 4.5 0 1 1-4.3 3.4c.3-1.3.6-2.7 0-3.9l-1.2-2h-.2L22 16.5c-.8 1.2-.5 2.8-.2 4.2a4.5 4.5 0 1 1-8.8.3q.5-2-.4-3.8l-.9-1.3q-.9-1.2-2.4-1.6a4.5 4.5 0 0 1 1.6-8.7M56.6 22v-6.9q0-1-.7-1.7t-1.7-.7q-1.3 0-2.1 1T51 16v6h-2.8V10.6h2.9v2.2q.6-1 1.6-1.8 1-.6 2.5-.7 1.2 0 2.3.7t1.5 1.8q.6-1.2 1.7-1.8a5 5 0 0 1 2.5-.7q2 0 3.1 1.2 1.3 1.2 1.3 3.2V22h-3v-6.6q0-1.4-.6-2t-1.7-.7q-1.2 0-2.1.9t-.9 2.3V22zm18.6.3q-1.5 0-3-.7a6 6 0 0 1-2-2.2q-.7-1.5-.7-3 0-1.8.7-3.2a6 6 0 0 1 5-3q1.4 0 2.6.7t1.8 1.6v-1.9h3V22h-3v-2q-.6 1.2-1.8 1.8-1.2.5-2.6.5M76 20q1.6 0 2.6-1t1-2.7-1-2.7-2.6-1-2.6 1-1 2.7 1 2.7 2.6 1m14 2.3a7 7 0 0 1-4.1-1q-1.5-1.2-1.6-3L87 18q0 1 .8 1.6t2.2.7a3 3 0 0 0 1.7-.5q.7-.4.7-1a1 1 0 0 0-.6-1l-1.4-.6-3.8-.9q-.8-.3-1.4-.9t-.6-1.7q0-1.6 1.4-2.6t3.8-1 3.6 1a3 3 0 0 1 1.6 2.5l-2.8.1q0-.6-.6-1.2t-1.8-.5q-1 0-1.7.4t-.6 1 .6 1l1.5.4 3.7.9q.8.3 1.5 1 .5.6.5 1.7 0 1.8-1.4 2.8-1.5 1-4 1m12.6 0q-1.9 0-3-1a4 4 0 0 1-1.2-2.8v-5.7h-2.5v-2.2h2.5V7.2h2.9v3.4h3.7v2.2h-3.7V18q0 1 .4 1.4.5.5 1.3.5l1-.2.9-.6.4 2.4q-.3.3-1.1.5-.7.2-1.6.2m4.3-.3V10.6h2.9V13q.5-1.2 1.5-2a4 4 0 0 1 4.2-.4l-.3 2.8-.9-.4-1-.2-1 .2q-.7.2-1.2.6t-1 1.2q-.3.7-.3 2V22zm14.7.3q-1.6 0-3-.7a6 6 0 0 1-2-2.2q-.8-1.5-.8-3 0-1.8.7-3.2a6 6 0 0 1 5-3q1.5 0 2.6.7t1.9 1.6v-1.9h2.9V22h-3v-2q-.6 1.2-1.8 1.8-1.1.5-2.5.5m.7-2.3q1.6 0 2.6-1t1-2.7-1-2.7-2.6-1-2.6 1-1 2.7 1 2.7 2.6 1"/>
					<text x="130" y="22" fill="#00FF41" fontFamily="'Lucida Console', 'Courier New', monospace" fontSize="24" fontWeight="700" letterSpacing="1">code</text>
				</svg>
			</div>

			{/* Tasks — primary navigation, above workspace list */}
			<button
				onClick={onOpenTasks}
				style={{
					display: "flex",
					alignItems: "center",
					gap: 8,
					width: "100%",
					padding: "10px 14px",
					background: isTasksActive ? "var(--selected-bg)" : "transparent",
					borderLeft: isTasksActive
						? "3px solid var(--accent)"
						: "3px solid transparent",
					borderTop: "none",
					borderRight: "none",
					borderBottom: "1px solid var(--border-muted)",
					cursor: "pointer",
					flexShrink: 0,
					textAlign: "left" as const,
				}}
			>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
					<path d="M9 11l3 3L22 4" />
					<path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
				</svg>
				<span style={{
					fontSize: 13,
					fontWeight: 600,
					color: isTasksActive ? "var(--text)" : "var(--muted)",
				}}>
					Tasks
				</span>
			</button>

			{/* Agents — agent dashboard navigation */}
			<button
				onClick={onOpenAgents}
				style={{
					display: "flex",
					alignItems: "center",
					gap: 8,
					width: "100%",
					padding: "10px 14px",
					background: isAgentsActive ? "var(--selected-bg)" : "transparent",
					borderLeft: isAgentsActive
						? "3px solid var(--accent)"
						: "3px solid transparent",
					borderTop: "none",
					borderRight: "none",
					borderBottom: "1px solid var(--border-muted)",
					cursor: "pointer",
					flexShrink: 0,
					textAlign: "left" as const,
				}}
			>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
					<polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
				</svg>
				<span style={{
					fontSize: 13,
					fontWeight: 600,
					color: isAgentsActive ? "var(--text)" : "var(--muted)",
				}}>
					Agents
				</span>
				{activeAgentCount > 0 && (
					<span style={{
						marginLeft: "auto",
						fontSize: 9,
						fontWeight: 600,
						color: "#d97706",
						background: "#d9770618",
						padding: "1px 6px",
						borderRadius: 3,
						minWidth: 16,
						textAlign: "center" as const,
					}}>
						{activeAgentCount}
					</span>
				)}
			</button>

			{/* Project list — primary feature, takes available space */}
			<div
				style={{
					flex: 1,
					overflowY: "auto",
				}}
			>
				<ProjectList
					projects={enrichedProjects}
					activeProjectPath={activeProjectPath}
					isAgentActive={isAgentActive}
					activeWorktrees={activeWorktrees}
					unreadWorktrees={unreadWorktrees}
					worktreeStatuses={worktreeStatuses}
					linkedIssues={linkedIssues}
					onSwitchProject={onSwitchProject}
					onOpenFolder={onOpenFolder}
					onCloneRepo={onCloneRepo}
					onRemoveProject={onRemoveProject}
					onCreateWorktree={onCreateWorktree}
				onDeleteWorktree={onDeleteWorktree}
				/>
			</div>

			{/* Resize handle */}
			<ResizeHandle onResize={handleResize} />

			{/* Bottom section: threads + providers — pinned to bottom */}
			<div
				style={{
					flexShrink: 0,
					display: "flex",
					flexDirection: "column",
					minHeight: 0,
				}}
			>
				{/* Threads header */}
				<div style={{ padding: "6px 12px 4px", display: "flex", alignItems: "center" }}>
					<button
						onClick={() => setHistoryCollapsed(!historyCollapsed)}
						style={{
							display: "flex",
							alignItems: "center",
							gap: 4,
							background: "transparent",
							cursor: "pointer",
							padding: 0,
							border: "none",
						}}
					>
						<span
							style={{
								fontSize: 8,
								color: "var(--dim)",
								display: "inline-block",
								transition: "transform 0.15s ease",
								transform: historyCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
							}}
						>
							&#9660;
						</span>
						<span
							style={{
								fontSize: 10,
								fontWeight: 600,
								color: "var(--dim)",
								textTransform: "uppercase",
								letterSpacing: "0.5px",
							}}
						>
							History
						</span>
					</button>
					<div style={{ flex: 1 }} />
					<button
						onClick={onNewThread}
						style={{
							fontSize: 14,
							color: "var(--muted)",
							cursor: "pointer",
							padding: "0 4px",
							lineHeight: 1,
						}}
						title="New Thread"
					>
						+
					</button>
				</div>

				{/* Thread list — scrollable, resizable height */}
				{!historyCollapsed && <div
					style={{
						height: historyHeight,
						overflowY: "auto",
						padding: "2px 0",
					}}
				>
					{threads.length === 0 && (
						<div
							style={{
								padding: "8px 16px",
								color: "var(--dim)",
								fontSize: 11,
								textAlign: "center",
							}}
						>
							No threads yet
						</div>
					)}
					{threads.map((thread) => (
						<div
							key={thread.id}
							onMouseEnter={() => setHoveredThreadId(thread.id)}
							onMouseLeave={() => setHoveredThreadId(null)}
							style={{
								display: "flex",
								alignItems: "center",
								background:
									thread.id === currentThreadId
										? "var(--selected-bg)"
										: "transparent",
								borderLeft:
									thread.id === currentThreadId
										? "2px solid var(--accent)"
										: "2px solid transparent",
							}}
						>
							<button
								onClick={() => onSwitchThread(thread.id)}
								style={{
									flex: 1,
									minWidth: 0,
									padding: "5px 4px 5px 16px",
									background: "transparent",
									textAlign: "left",
									cursor: "pointer",
									borderRadius: 0,
								}}
							>
								<div
									style={{
										fontSize: 11,
										color:
											thread.id === currentThreadId
												? "var(--text)"
												: "var(--muted)",
										whiteSpace: "nowrap",
										overflow: "hidden",
										textOverflow: "ellipsis",
									}}
								>
									{thread.title || "New Thread"}
								</div>
							</button>
							{hoveredThreadId === thread.id && (
								<button
									onClick={(e) => {
										e.stopPropagation()
										setConfirmDeleteId(thread.id)
									}}
									title="Delete thread"
									style={{
										flexShrink: 0,
										padding: "2px 8px",
										fontSize: 12,
										color: "var(--muted)",
										background: "transparent",
										cursor: "pointer",
										lineHeight: 1,
										opacity: 0.6,
									}}
									onMouseEnter={(e) => { (e.target as HTMLElement).style.opacity = "1"; (e.target as HTMLElement).style.color = "var(--error)" }}
									onMouseLeave={(e) => { (e.target as HTMLElement).style.opacity = "0.6"; (e.target as HTMLElement).style.color = "var(--muted)" }}
								>
									✕
								</button>
							)}
						</div>
					))}
				</div>}

				<div
					style={{
						height: 1,
						background: "var(--border-muted)",
						margin: "0 12px",
					}}
				/>

				{/* Connected providers + Settings gear */}
				<div
					style={{
						padding: "8px 12px",
						borderTop: "1px solid var(--border-muted)",
						display: "flex",
						alignItems: "center",
						gap: 8,
					}}
				>
					{/* Connected provider dots */}
					<button
						onClick={onOpenAccounts}
						title="Manage accounts"
						style={{
							flex: 1,
							display: "flex",
							alignItems: "center",
							gap: 6,
							padding: "4px 0",
							background: "transparent",
							border: "none",
							cursor: "pointer",
							minWidth: 0,
						}}
					>
						{(() => {
							const connected = providers.filter((p) => loggedInProviders.has(p.id))
							if (connected.length === 0) {
								return (
									<span style={{ fontSize: 11, color: "var(--dim)" }}>
										No providers connected
									</span>
								)
							}
							return (
								<>
									<span style={{ display: "flex", gap: 4, alignItems: "center" }}>
										{connected.map((p) => (
											<span
												key={p.id}
												title={p.label}
												style={{
													width: 7,
													height: 7,
													borderRadius: "50%",
													background: "var(--success)",
													flexShrink: 0,
												}}
											/>
										))}
									</span>
									<span
										style={{
											fontSize: 11,
											color: "var(--muted)",
											overflow: "hidden",
											textOverflow: "ellipsis",
											whiteSpace: "nowrap",
										}}
									>
										{connected.map((p) => p.label).join(", ")}
									</span>
								</>
							)
						})()}
						{/* Arrow icon */}
						<svg
							width="12"
							height="12"
							viewBox="0 0 24 24"
							fill="none"
							stroke="var(--dim)"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
							style={{ flexShrink: 0, marginLeft: "auto" }}
						>
							<polyline points="9 18 15 12 9 6" />
						</svg>
					</button>

					<button
						onClick={onOpenSettings}
						title="Settings"
						style={{
							padding: 6,
							background: isSettingsActive ? "var(--selected-bg)" : "transparent",
							borderRadius: 4,
							cursor: "pointer",
							border: "none",
							color: isSettingsActive ? "var(--text)" : "var(--dim)",
							flexShrink: 0,
							display: "flex",
							alignItems: "center",
						}}
					>
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
							<circle cx="12" cy="12" r="3" />
							<path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
						</svg>
					</button>
				</div>
			</div>

			{/* Delete confirmation modal */}
			{confirmDeleteId && (
				<ConfirmDialog
					title="Delete thread?"
					description={`"${threads.find((t) => t.id === confirmDeleteId)?.title || "Untitled"}" will be permanently deleted.`}
					confirmLabel="Delete"
					onConfirm={() => {
						onDeleteThread(confirmDeleteId)
						setConfirmDeleteId(null)
					}}
					onCancel={() => setConfirmDeleteId(null)}
				/>
			)}
		</div>
	)
}
