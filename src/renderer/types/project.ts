export interface ProjectInfo {
	name: string
	rootPath: string
	gitBranch?: string
	isWorktree?: boolean
}

export type WorktreeStatus = "in_progress" | "in_review" | "done" | "archived"
