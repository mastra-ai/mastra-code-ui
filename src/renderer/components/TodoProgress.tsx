interface TodoProgressProps {
	todos: Array<{
		content: string
		status: "pending" | "in_progress" | "completed"
		activeForm: string
	}>
}

const statusIcons: Record<string, { icon: string; color: string }> = {
	pending: { icon: "[ ]", color: "var(--muted)" },
	in_progress: { icon: "[~]", color: "var(--warning)" },
	completed: { icon: "[x]", color: "var(--success)" },
}

export function TodoProgress({ todos }: TodoProgressProps) {
	const completed = todos.filter((t) => t.status === "completed").length
	const total = todos.length
	const pct = total > 0 ? (completed / total) * 100 : 0

	return (
		<div
			style={{
				margin: "8px 0",
				padding: "8px 12px",
				background: "var(--bg-surface)",
				borderRadius: 6,
				border: "1px solid var(--border-muted)",
				fontSize: 12,
			}}
		>
			{/* Progress bar */}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 8,
					marginBottom: 6,
				}}
			>
				<div
					style={{
						flex: 1,
						height: 4,
						background: "var(--border-muted)",
						borderRadius: 2,
						overflow: "hidden",
					}}
				>
					<div
						style={{
							width: `${pct}%`,
							height: "100%",
							background: "var(--success)",
							borderRadius: 2,
							transition: "width 0.3s",
						}}
					/>
				</div>
				<span style={{ color: "var(--muted)", fontSize: 11 }}>
					{completed}/{total}
				</span>
			</div>

			{/* Todo list */}
			{todos.map((todo, i) => {
				const s = statusIcons[todo.status]
				return (
					<div
						key={i}
						style={{
							display: "flex",
							alignItems: "flex-start",
							gap: 6,
							padding: "2px 0",
							color: s.color,
						}}
					>
						<span style={{ fontFamily: "monospace", flexShrink: 0 }}>
							{s.icon}
						</span>
						<span
							style={{
								textDecoration:
									todo.status === "completed"
										? "line-through"
										: "none",
								opacity: todo.status === "completed" ? 0.7 : 1,
							}}
						>
							{todo.content}
						</span>
					</div>
				)
			})}
		</div>
	)
}
