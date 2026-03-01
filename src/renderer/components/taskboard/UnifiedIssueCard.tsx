import { useState } from "react"
import { LinearIcon, GitHubIcon, HandmadeIcon } from "./icons"
import { PRIORITY_LABELS, STATE_TYPE_ORDER } from "./constants"
import type { UnifiedIssue, LinearState } from "../../types/taskboard"

export function UnifiedIssueCard({
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
