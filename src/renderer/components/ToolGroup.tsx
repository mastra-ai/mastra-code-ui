import { useEffect, useRef, useState } from "react"
import type { BuiltinToolId } from "@mastra/core/harness"
import type { MC_TOOLS } from "../../tool-names"
import {
	ChevronRightIcon,
	CustomTerminalIcon,
	ListSearchIcon,
	TasksCheckIcon,
} from "./Icons"
import { ReasoningBlock } from "./ReasoningBlock"
import { ShimmerText } from "./Shimmer"
import { ToolExecution, type ToolExecutionProps } from "./ToolExecution"

export type ToolGroupKind = "explore" | "task" | "thinking"
type NonThinkingToolGroupKind = Exclude<ToolGroupKind, "thinking">

export type ToolGroupTool = ToolExecutionProps["tool"]

interface ToolGroupProps {
	kind: ToolGroupKind
	tools: ToolGroupTool[]
	onFileClick?: (filePath: string) => void
}

const MAX_VISIBLE_TOOLS = 5
const TOOL_HEIGHT_PX = 28

type MastraCodeToolId = (typeof MC_TOOLS)[keyof typeof MC_TOOLS]
type FutureBuiltinToolId = "task_update" | "task_complete"
type SupportedBuiltinToolId = BuiltinToolId | FutureBuiltinToolId
type ThinkingToolId = "think" | "thinking" | "thought" | "reasoning"
type RecallToolId = "recall"
type CompatibilityReadToolId =
	| "glob"
	| "grep"
	| "web_search"
	| "web-search"
	| "web_extract"
	| "web-extract"
	| "web_fetch"
	| "navigate_browser"
	| "navigate-browser"
type CompatibilityCommandToolId =
	| "execute_command"
	| "get_process_output"
	| "kill_process"

const FILE_EXPLORING_TOOL_GROUPS = {
	view: "explore",
	find_files: "explore",
	file_stat: "explore",
	lsp_inspect: "explore",
} as const satisfies Partial<Record<MastraCodeToolId, ToolGroupKind>>

const SEARCH_EXPLORING_TOOL_GROUPS = {
	search_content: "explore",
	glob: "explore",
	grep: "explore",
	web_search: "explore",
	"web-search": "explore",
	web_extract: "explore",
	"web-extract": "explore",
	web_fetch: "explore",
	navigate_browser: "explore",
	"navigate-browser": "explore",
} as const satisfies Record<CompatibilityReadToolId, ToolGroupKind> &
	Partial<Record<MastraCodeToolId, ToolGroupKind>>

const COMMAND_EXPLORING_TOOL_GROUPS = {
	execute_command: "explore",
	get_process_output: "explore",
	kill_process: "explore",
} as const satisfies Record<CompatibilityCommandToolId, ToolGroupKind> &
	Partial<Record<MastraCodeToolId, ToolGroupKind>>

const HARNESS_BUILTIN_TOOL_GROUPS = {
	task_write: "task",
	task_update: "task",
	task_complete: "task",
	task_check: "task",
} as const satisfies Partial<Record<SupportedBuiltinToolId, ToolGroupKind>>

const THINKING_TOOL_GROUPS = {
	think: "thinking",
	thinking: "thinking",
	thought: "thinking",
	reasoning: "thinking",
} as const satisfies Record<ThinkingToolId, ToolGroupKind>

const RECALL_TOOL_GROUPS = {
	recall: "explore",
} as const satisfies Record<RecallToolId, ToolGroupKind>

function readGroup<T extends Record<string, ToolGroupKind>>(
	groups: T,
	name: string,
): ToolGroupKind | null {
	return Object.prototype.hasOwnProperty.call(groups, name)
		? groups[name]!
		: null
}

export function getToolGroupKind(
	tool: Pick<ToolGroupTool, "name">,
): ToolGroupKind | null {
	return (
		readGroup(THINKING_TOOL_GROUPS, tool.name) ??
		readGroup(FILE_EXPLORING_TOOL_GROUPS, tool.name) ??
		readGroup(SEARCH_EXPLORING_TOOL_GROUPS, tool.name) ??
		readGroup(COMMAND_EXPLORING_TOOL_GROUPS, tool.name) ??
		readGroup(RECALL_TOOL_GROUPS, tool.name) ??
		readGroup(HARNESS_BUILTIN_TOOL_GROUPS, tool.name)
	)
}

export function shouldRenderToolGroup(
	kind: ToolGroupKind,
	tools: ToolGroupTool[],
): boolean {
	if (tools.length > 1) return true
	if (kind === "thinking") return true
	return tools.some((tool) => readGroup(RECALL_TOOL_GROUPS, tool.name) !== null)
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === "object"
		? (value as Record<string, unknown>)
		: null
}

function firstString(...values: unknown[]): string {
	for (const value of values) {
		if (typeof value === "string" && value.trim()) return value
	}
	return ""
}

function getThinkingToolText(tool: ToolGroupTool): string {
	const args = asRecord(tool.args)
	const result = asRecord(tool.result)

	return firstString(
		args?.text,
		args?.thinking,
		args?.reasoning,
		args?.content,
		result?.text,
		result?.thinking,
		result?.reasoning,
		result?.content,
		typeof tool.result === "string" ? tool.result : "",
	)
}

function isToolActive(tool: ToolGroupTool): boolean {
	return tool.status === "pending" || tool.status === "running"
}

function formatCount(count: number, singular: string, plural = `${singular}s`) {
	if (count === 0) return null
	return `${count} ${count === 1 ? singular : plural}`
}

function getExploreToolCounts(tools: ToolGroupTool[]) {
	let fileCount = 0
	let searchCount = 0
	let recallCount = 0
	let commandCount = 0

	for (const tool of tools) {
		if (readGroup(RECALL_TOOL_GROUPS, tool.name)) recallCount++
		else if (readGroup(FILE_EXPLORING_TOOL_GROUPS, tool.name)) fileCount++
		else if (readGroup(SEARCH_EXPLORING_TOOL_GROUPS, tool.name)) searchCount++
		else if (readGroup(COMMAND_EXPLORING_TOOL_GROUPS, tool.name)) commandCount++
	}

	return { commandCount, fileCount, recallCount, searchCount }
}

function summarizeExploreTools(tools: ToolGroupTool[]): string {
	const { commandCount, fileCount, recallCount, searchCount } =
		getExploreToolCounts(tools)

	return [
		formatCount(fileCount, "file"),
		formatCount(searchCount, "search", "searches"),
		formatCount(recallCount, "recall"),
		commandCount ? `ran ${formatCount(commandCount, "command")}` : null,
	]
		.filter(Boolean)
		.join(", ")
}

function summarizeTaskTools(tools: ToolGroupTool[]): string {
	let updateCount = 0
	let checkCount = 0

	for (const tool of tools) {
		if (
			tool.name === "task_write" ||
			tool.name === "task_update" ||
			tool.name === "task_complete"
		) {
			updateCount++
		} else if (tool.name === "task_check") {
			checkCount++
		}
	}

	return [formatCount(updateCount, "update"), formatCount(checkCount, "check")]
		.filter(Boolean)
		.join(" ")
}

function getGroupCopy(kind: NonThinkingToolGroupKind, tools: ToolGroupTool[]) {
	const isActive = tools.some(isToolActive)

	if (kind === "task") {
		return {
			label: isActive ? "Updating tasks" : "Updated tasks",
			subtitle: summarizeTaskTools(tools),
			isActive,
		}
	}

	return {
		label: isActive ? "Exploring" : "Explored",
		subtitle: summarizeExploreTools(tools),
		isActive,
	}
}

function getGroupIcon(kind: NonThinkingToolGroupKind, tools: ToolGroupTool[]) {
	if (kind === "task") return TasksCheckIcon

	const { commandCount } = getExploreToolCounts(tools)
	return commandCount > 0 ? CustomTerminalIcon : ListSearchIcon
}

export function ToolGroup({ kind, tools, onFileClick }: ToolGroupProps) {
	if (kind === "thinking") {
		const isActive = tools.some(isToolActive)
		const thinkingText = tools
			.map(getThinkingToolText)
			.filter(Boolean)
			.join("\n\n")

		return (
			<ReasoningBlock
				content={thinkingText}
				streaming={isActive}
				onFileClick={onFileClick}
			/>
		)
	}

	return <ToolListGroup kind={kind} tools={tools} onFileClick={onFileClick} />
}

function ToolListGroup({
	kind,
	tools,
	onFileClick,
}: Omit<ToolGroupProps, "kind"> & { kind: NonThinkingToolGroupKind }) {
	const { label, subtitle, isActive } = getGroupCopy(kind, tools)
	const GroupIcon = getGroupIcon(kind, tools)
	const [expanded, setExpanded] = useState(isActive)
	const wasActiveRef = useRef(isActive)
	const scrollRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		if (isActive) {
			setExpanded(true)
		} else if (wasActiveRef.current) {
			setExpanded(false)
		}
		wasActiveRef.current = isActive
	}, [isActive])

	useEffect(() => {
		if (isActive && expanded && scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight
		}
	}, [expanded, isActive, tools.length])

	const displayLabel = label
	const displaySubtitle = subtitle

	return (
		<div className="tool-group">
			<button
				aria-expanded={expanded}
				className="tool-group-toggle"
				onClick={() => {
					setExpanded((value) => !value)
				}}
			>
				<span aria-hidden="true" className="tool-group-icon">
					<GroupIcon width="14" height="14" />
				</span>
				<span className="tool-group-summary">
					{isActive ? (
						<ShimmerText className="tool-group-label">
							{displayLabel}
						</ShimmerText>
					) : (
						<span className="tool-group-label">{displayLabel}</span>
					)}
					{displaySubtitle && (
						<>
							<span className="tool-group-separator">|</span>
							<span className="tool-group-subtitle">{displaySubtitle}</span>
						</>
					)}
				</span>
				<span
					aria-hidden="true"
					className="icon-chevron-toggle tool-group-chevron"
					data-expanded={expanded || undefined}
				>
					<ChevronRightIcon width="13" height="13" />
				</span>
			</button>

			{expanded && (
				<div
					ref={scrollRef}
					style={{
						paddingLeft: 22,
						maxHeight:
							tools.length > MAX_VISIBLE_TOOLS
								? MAX_VISIBLE_TOOLS * TOOL_HEIGHT_PX
								: undefined,
						overflowY: tools.length > MAX_VISIBLE_TOOLS ? "auto" : undefined,
					}}
				>
					{tools.map((tool) => (
						<ToolExecution
							key={tool.id}
							tool={tool}
							onFileClick={onFileClick}
						/>
					))}
				</div>
			)}
		</div>
	)
}
