interface DiffViewProps {
	diff: string
	fileName?: string
}

export function DiffView({ diff, fileName }: DiffViewProps) {
	if (!diff.trim()) {
		return (
			<div
				style={{
					padding: "8px 12px",
					color: "var(--dim)",
					fontSize: 12,
				}}
			>
				No changes
			</div>
		)
	}

	const lines = diff.split("\n")

	return (
		<div
			style={{
				fontFamily: "inherit",
				fontSize: 11,
				lineHeight: 1.5,
				overflowX: "auto",
			}}
		>
			{fileName && (
				<div
					style={{
						padding: "4px 8px",
						color: "var(--text)",
						fontWeight: 600,
						fontSize: 11,
						borderBottom: "1px solid var(--border-muted)",
					}}
				>
					{fileName}
				</div>
			)}
			{lines.map((line, i) => {
				let color = "var(--muted)"
				let bg = "transparent"

				if (line.startsWith("+++") || line.startsWith("---")) {
					color = "var(--text)"
				} else if (line.startsWith("@@")) {
					color = "var(--diff-hunk)"
				} else if (line.startsWith("+")) {
					color = "var(--diff-add)"
					bg = "var(--diff-add-bg)"
				} else if (line.startsWith("-")) {
					color = "var(--diff-del)"
					bg = "var(--diff-del-bg)"
				} else if (
					line.startsWith("diff ") ||
					line.startsWith("index ")
				) {
					color = "var(--dim)"
				}

				return (
					<div
						key={i}
						style={{
							color,
							background: bg,
							padding: "0 8px",
							whiteSpace: "pre",
							minHeight: 18,
						}}
					>
						{line || " "}
					</div>
				)
			})}
		</div>
	)
}
