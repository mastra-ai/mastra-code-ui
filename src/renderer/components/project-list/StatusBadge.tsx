import type { WorktreeStatus } from "../../types/project"
import { statusConfig } from "../../utils/project-list"

export function StatusBadge({ status }: { status: WorktreeStatus }) {
	const config = statusConfig[status]
	return (
		<span
			style={{
				fontSize: 9,
				fontWeight: 600,
				color: config.color,
				background: `${config.color}18`,
				padding: "1px 5px",
				borderRadius: 3,
				whiteSpace: "nowrap",
				letterSpacing: "0.3px",
			}}
		>
			{config.label}
		</span>
	)
}
