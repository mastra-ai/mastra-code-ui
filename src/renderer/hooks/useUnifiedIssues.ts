import { useState, useMemo, useCallback } from "react"
import type {
	LinearIssue,
	LinearState,
	GitHubIssue,
	HandmadeIssue,
	UnifiedIssue,
	WorkflowStates,
} from "../types/taskboard"
import { STATE_TYPE_ORDER } from "../components/taskboard/constants"

export function useUnifiedIssues(params: {
	activeIssues: LinearIssue[]
	activeStates: LinearState[]
	githubIssues: GitHubIssue[]
	handmadeIssues: HandmadeIssue[]
	linkedIssues?: Record<
		string,
		{ issueId: string; issueIdentifier: string; provider?: string }
	>
	filter: "all" | "active" | "backlog"
}) {
	const {
		activeIssues,
		activeStates,
		githubIssues,
		handmadeIssues,
		linkedIssues,
		filter,
	} = params

	const workflowStates = useMemo<WorkflowStates>(() => {
		const started = activeStates.find((s) => s.type === "started")
		const done = activeStates.find((s) => s.type === "completed")
		return {
			startedStateId: started?.id ?? "",
			doneStateId: done?.id ?? "",
		}
	}, [activeStates])

	const issueWorktreeMap = useMemo(() => {
		const map: Record<string, string> = {}
		if (linkedIssues) {
			for (const [wtPath, info] of Object.entries(linkedIssues)) {
				map[info.issueId] = wtPath
			}
		}
		return map
	}, [linkedIssues])

	const unifiedIssues = useMemo<UnifiedIssue[]>(() => {
		const result: UnifiedIssue[] = []

		// Linear issues
		for (const issue of activeIssues) {
			result.push({
				id: issue.id,
				identifier: issue.identifier,
				title: issue.title,
				provider: "linear",
				state: {
					name: issue.state.name,
					color: issue.state.color,
					type: issue.state.type,
				},
				assignee: issue.assignee?.displayName || issue.assignee?.name,
				priority: issue.priority,
				url: issue.url,
				labels: issue.labels,
				createdAt: issue.createdAt,
				updatedAt: issue.updatedAt,
				linearIssue: issue,
			})
		}

		// GitHub issues
		for (const issue of githubIssues) {
			const ghId = `gh-${issue.number}`
			const isLinkedToWorktree = !!issueWorktreeMap[ghId]
			const stateType =
				issue.state === "closed"
					? "completed"
					: isLinkedToWorktree
						? "started"
						: "unstarted"
			const stateColor =
				issue.state === "closed"
					? "#5e6ad2"
					: isLinkedToWorktree
						? "#f2c94c"
						: "#e2e2e2"
			const stateName =
				issue.state === "closed"
					? "Done"
					: isLinkedToWorktree
						? "In Progress"
						: "Open"

			result.push({
				id: ghId,
				identifier: `#${issue.number}`,
				title: issue.title,
				provider: "github",
				state: { name: stateName, color: stateColor, type: stateType },
				assignee: issue.assignee?.login,
				url: issue.html_url,
				labels: issue.labels.map((l) => ({
					name: l.name,
					color: `#${l.color}`,
				})),
				createdAt: issue.created_at,
				updatedAt: issue.updated_at,
				githubIssue: issue,
			})
		}

		// Handmade issues
		for (const issue of handmadeIssues) {
			const stateType =
				issue.status === "done"
					? "completed"
					: issue.status === "in_progress"
						? "started"
						: "unstarted"
			const stateColor =
				issue.status === "done"
					? "#5e6ad2"
					: issue.status === "in_progress"
						? "#f2c94c"
						: "#e2e2e2"
			const stateName =
				issue.status === "done"
					? "Done"
					: issue.status === "in_progress"
						? "In Progress"
						: "Todo"

			result.push({
				id: issue.id,
				identifier: `T-${handmadeIssues.indexOf(issue) + 1}`,
				title: issue.title,
				provider: "handmade",
				state: { name: stateName, color: stateColor, type: stateType },
				url: "#",
				labels: [],
				createdAt: issue.createdAt,
				updatedAt: issue.updatedAt,
			})
		}

		return result
	}, [activeIssues, githubIssues, issueWorktreeMap, handmadeIssues])

	// Source and workspace filter state
	const [sourceFilter, setSourceFilter] = useState<Set<string> | null>(null)
	const [workspaceFilter, setWorkspaceFilter] = useState<string | null>(null)

	const availableSources = useMemo(() => {
		const sources = new Set<string>()
		for (const issue of unifiedIssues) sources.add(issue.provider)
		return Array.from(sources)
	}, [unifiedIssues])

	const availableWorkspaces = useMemo(() => {
		if (!linkedIssues) return []
		return Object.keys(linkedIssues).map((path) => ({
			path,
			name: path.split("/").pop() || path,
		}))
	}, [linkedIssues])

	const toggleSourceFilter = useCallback((source: string) => {
		setSourceFilter((prev) => {
			if (prev === null) {
				return new Set([source])
			}
			const next = new Set(prev)
			if (next.has(source)) {
				next.delete(source)
				if (next.size === 0) return null
			} else {
				next.add(source)
			}
			return next
		})
	}, [])

	const filteredIssues = unifiedIssues.filter((issue) => {
		// Status filter
		if (
			filter === "active" &&
			issue.state.type !== "started" &&
			issue.state.type !== "unstarted"
		)
			return false
		if (filter === "backlog" && issue.state.type !== "backlog") return false

		// Source filter
		if (sourceFilter !== null && !sourceFilter.has(issue.provider)) return false

		// Workspace filter
		if (workspaceFilter !== null) {
			const linkedWt = issueWorktreeMap[issue.id]
			if (workspaceFilter === "__unlinked__") {
				if (linkedWt) return false
			} else {
				if (linkedWt !== workspaceFilter) return false
			}
		}

		return true
	})

	const columns = STATE_TYPE_ORDER.filter((type) =>
		filter === "all" ? true : type !== "cancelled",
	).map((type) => {
		const columnStates = activeStates
			.filter((s) => s.type === type)
			.sort((a, b) => a.position - b.position)
		const columnIssues = filteredIssues.filter((i) => i.state.type === type)
		const label =
			type === "backlog"
				? "Backlog"
				: type === "unstarted"
					? "Todo"
					: type === "started"
						? "In Progress"
						: type === "completed"
							? "Done"
							: "Cancelled"
		return { type, label, states: columnStates, issues: columnIssues }
	})

	return {
		workflowStates,
		issueWorktreeMap,
		unifiedIssues,
		filteredIssues,
		availableSources,
		availableWorkspaces,
		columns,
		sourceFilter,
		workspaceFilter,
		toggleSourceFilter,
		setWorkspaceFilter,
	}
}
