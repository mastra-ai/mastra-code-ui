export interface LinearIssue {
	id: string
	identifier: string
	title: string
	description?: string
	state: { id: string; name: string; color: string; type: string }
	assignee?: { name: string; displayName: string }
	priority: number
	url: string
	labels: Array<{ name: string; color: string }>
	createdAt: string
	updatedAt: string
}

export interface GitHubIssue {
	id: number
	number: number
	title: string
	body?: string
	state: "open" | "closed"
	labels: Array<{ name: string; color: string; description?: string }>
	assignee?: { login: string; avatar_url: string }
	assignees: Array<{ login: string }>
	milestone?: { title: string; number: number }
	html_url: string
	created_at: string
	updated_at: string
	pull_request?: unknown
}

export interface LinearTeam {
	id: string
	name: string
	key: string
}

export interface LinearState {
	id: string
	name: string
	color: string
	type: string
	position: number
}

export interface AgentTask {
	content: string
	status: "pending" | "in_progress" | "completed"
	activeForm: string
}

export interface HandmadeIssue {
	id: string
	title: string
	description?: string
	status: "todo" | "in_progress" | "done"
	createdAt: string
	updatedAt: string
}

export interface WorkflowStates {
	startedStateId: string
	doneStateId: string
}

export interface UnifiedIssue {
	id: string
	identifier: string
	title: string
	provider: "linear" | "github" | "handmade"
	state: { name: string; color: string; type: string }
	assignee?: string
	priority?: number
	url: string
	labels: Array<{ name: string; color: string }>
	createdAt: string
	updatedAt: string
	linearIssue?: LinearIssue
	githubIssue?: GitHubIssue
}

export interface TaskBoardProps {
	agentTasks: AgentTask[]
	onClose?: () => void
	onStartWork?: (issue: LinearIssue, workflowStates: WorkflowStates) => void
	onStartWorkGithub?: (issue: GitHubIssue) => void
	linkedIssues?: Record<
		string,
		{ issueId: string; issueIdentifier: string; provider?: string }
	>
	onSwitchToWorktree?: (worktreePath: string) => void
}
