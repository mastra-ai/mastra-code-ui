import type { WorktreeStatus } from "../types/project"

// Stable color palette for worktree branches — visually distinct
export const branchColors = [
	"var(--project-branch-1)",
	"var(--project-branch-2)",
	"var(--project-branch-3)",
	"var(--project-branch-4)",
	"var(--project-branch-5)",
	"var(--project-branch-6)",
	"var(--project-branch-7)",
	"var(--project-branch-8)",
	"var(--project-branch-9)",
	"var(--project-branch-10)",
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
	in_progress: { label: "In Progress", color: "var(--color-amber)" },
	in_review: { label: "In Review", color: "var(--color-blue)" },
	done: { label: "Done", color: "var(--color-green)" },
	archived: { label: "Archived", color: "var(--color-gray-muted)" },
}

export const statusOrder: WorktreeStatus[] = [
	"in_progress",
	"in_review",
	"done",
	"archived",
]
