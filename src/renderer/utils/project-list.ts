import type { WorktreeStatus } from "../types/project"

// Stable color palette for worktree branches — visually distinct
export const branchColors = [
	"#7c3aed", // purple
	"#2563eb", // blue
	"#059669", // green
	"#d97706", // amber
	"#dc2626", // red
	"#0891b2", // cyan
	"#c026d3", // fuchsia
	"#ea580c", // orange
	"#16a34a", // emerald
	"#e11d48", // rose
]

// Hash a string to a stable color index so the same branch always gets the same color
export function hashColor(str: string): string {
	let hash = 0
	for (let i = 0; i < str.length; i++) {
		hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
	}
	return branchColors[Math.abs(hash) % branchColors.length]
}

export const statusConfig: Record<
	WorktreeStatus,
	{ label: string; color: string }
> = {
	in_progress: { label: "In Progress", color: "#d97706" },
	in_review: { label: "In Review", color: "#2563eb" },
	done: { label: "Done", color: "#059669" },
	archived: { label: "Archived", color: "#6b7280" },
}

export const statusOrder: WorktreeStatus[] = [
	"in_progress",
	"in_review",
	"done",
	"archived",
]
