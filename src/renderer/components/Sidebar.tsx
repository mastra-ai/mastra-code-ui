import { useState } from "react"
import { ProjectList, type EnrichedProject } from "./ProjectList"
import type { ThreadInfo } from "../types/ipc"

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
	onSwitchThread: (threadId: string) => void
	onNewThread: () => void
	onDeleteThread: (threadId: string) => void
	onLogin: (providerId: string) => void
	onSwitchProject: (path: string) => void
	onOpenFolder: () => void
	onRemoveProject: (path: string) => void
	onCreateWorktree: (repoPath: string) => void
}

const providers = [
	{ id: "anthropic", label: "Anthropic" },
	{ id: "openai-codex", label: "OpenAI" },
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
	onSwitchThread,
	onNewThread,
	onDeleteThread,
	onLogin,
	onSwitchProject,
	onOpenFolder,
	onRemoveProject,
	onCreateWorktree,
}: SidebarProps) {
	const [hoveredThreadId, setHoveredThreadId] = useState<string | null>(null)
	const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
	const [historyCollapsed, setHistoryCollapsed] = useState(false)

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
					onSwitchProject={onSwitchProject}
					onOpenFolder={onOpenFolder}
					onRemoveProject={onRemoveProject}
					onCreateWorktree={onCreateWorktree}
				/>
			</div>

			{/* Bottom section: threads + providers — pinned to bottom */}
			<div
				style={{
					flexShrink: 0,
					borderTop: "1px solid var(--border-muted)",
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

				{/* Thread list — scrollable, max height */}
				{!historyCollapsed && <div
					style={{
						maxHeight: 160,
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
									{thread.title || thread.id.slice(0, 8)}
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

				{/* Provider login status */}
				<div
					style={{
						padding: "8px 12px",
						display: "flex",
						flexDirection: "column",
						gap: 4,
					}}
				>
					{providers.map((p) => {
						const isLoggedIn = loggedInProviders.has(p.id)
						return (
							<button
								key={p.id}
								onClick={() => {
									if (!isLoggedIn) onLogin(p.id)
								}}
								style={{
									display: "flex",
									alignItems: "center",
									gap: 6,
									padding: "5px 8px",
									background: "transparent",
									borderRadius: 4,
									fontSize: 11,
									color: isLoggedIn
										? "var(--success)"
										: "var(--muted)",
									cursor: isLoggedIn ? "default" : "pointer",
									border: "none",
									textAlign: "left",
									width: "100%",
								}}
							>
								<span
									style={{
										width: 6,
										height: 6,
										borderRadius: "50%",
										background: isLoggedIn
											? "var(--success)"
											: "var(--dim)",
										flexShrink: 0,
									}}
								/>
								{p.label}
								<span
									style={{
										marginLeft: "auto",
										fontSize: 10,
										color: isLoggedIn
											? "var(--success)"
											: "var(--dim)",
									}}
								>
									{isLoggedIn ? "Connected" : "Sign in"}
								</span>
							</button>
						)
					})}
				</div>
			</div>

			{/* Delete confirmation modal */}
			{confirmDeleteId && (
				<div
					style={{
						position: "fixed",
						inset: 0,
						background: "rgba(0,0,0,0.5)",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						zIndex: 9999,
					}}
					onClick={() => setConfirmDeleteId(null)}
				>
					<div
						onClick={(e) => e.stopPropagation()}
						style={{
							background: "var(--bg-surface)",
							border: "1px solid var(--border-muted)",
							borderRadius: 8,
							padding: "20px 24px",
							maxWidth: 320,
							width: "90%",
						}}
					>
						<div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>
							Delete thread?
						</div>
						<div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 16 }}>
							"{threads.find((t) => t.id === confirmDeleteId)?.title || "Untitled"}" will be permanently deleted.
						</div>
						<div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
							<button
								onClick={() => setConfirmDeleteId(null)}
								style={{
									padding: "6px 14px",
									fontSize: 12,
									borderRadius: 4,
									background: "var(--bg)",
									color: "var(--text)",
									cursor: "pointer",
									border: "1px solid var(--border-muted)",
								}}
							>
								Cancel
							</button>
							<button
								onClick={() => {
									onDeleteThread(confirmDeleteId)
									setConfirmDeleteId(null)
								}}
								style={{
									padding: "6px 14px",
									fontSize: 12,
									borderRadius: 4,
									background: "var(--error)",
									color: "#fff",
									cursor: "pointer",
									border: "none",
								}}
							>
								Delete
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	)
}
