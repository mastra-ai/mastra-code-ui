import type { WorktreeStatus } from "./project"

export interface WorktreeInfo {
	path: string
	branch: string
}

export interface EnrichedProject {
	name: string
	rootPath: string
	lastOpened: string
	gitBranch?: string
	isWorktree?: boolean
	mainRepoPath?: string
	worktrees: WorktreeInfo[]
}

export interface ProjectListProps {
	projects: EnrichedProject[]
	activeProjectPath: string | null
	isAgentActive: boolean
	activeWorktrees: Set<string>
	unreadWorktrees: Set<string>
	worktreeStatuses: Map<string, WorktreeStatus>
	linkedIssues?: Record<
		string,
		{ issueId: string; issueIdentifier: string; provider?: string }
	>
	onSwitchProject: (path: string) => void
	onOpenFolder: () => void
	onCloneRepo: () => void
	onRemoveProject: (path: string) => void
	onCreateWorktree: (repoPath: string) => void
	onDeleteWorktree: (worktreePath: string) => void
}
