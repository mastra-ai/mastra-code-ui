/**
 * Granular tool permission system.
 *
 * Tools are classified into categories by risk level.
 * Each category has a configurable policy: "allow", "ask", or "deny".
 * Session-scoped grants let the user approve a category once per session.
 */

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export type ToolCategory = "read" | "edit" | "execute" | "mcp"

export const TOOL_CATEGORIES: Record<
	ToolCategory,
	{ label: string; description: string }
> = {
	read: {
		label: "Read",
		description: "Read files, search, list directories",
	},
	edit: {
		label: "Edit",
		description: "Create, modify, or delete files",
	},
	execute: {
		label: "Execute",
		description: "Run shell commands",
	},
	mcp: {
		label: "MCP",
		description: "External MCP server tools",
	},
}

// ---------------------------------------------------------------------------
// Tool → Category mapping
// ---------------------------------------------------------------------------

const TOOL_CATEGORY_MAP: Record<string, ToolCategory> = {
	// Read-only tools — always safe
	view: "read",
	search_content: "read",
	find_files: "read",
	web_search: "read",
	"web-search": "read",
	web_extract: "read",
	"web-extract": "read",
	// Edit tools — modify files
	string_replace_lsp: "edit",
	ast_smart_edit: "edit",
	write_file: "edit",
	subagent: "edit",

	// Execute tools — run arbitrary commands
	execute_command: "execute",

	// Interactive / planning tools — always allowed (no category needed)
	// ask_user, task_write, task_check, submit_plan, request_sandbox_access
}

// Tools that never need approval regardless of policy
const ALWAYS_ALLOW_TOOLS = new Set([
	"ask_user",
	"task_write",
	"task_check",
	"submit_plan",
	"request_sandbox_access",
])

/**
 * Get the category for a tool, or null if the tool is always-allowed.
 */
export function getToolCategory(toolName: string): ToolCategory | null {
	if (ALWAYS_ALLOW_TOOLS.has(toolName)) return null
	return TOOL_CATEGORY_MAP[toolName] ?? "mcp"
}
// ---------------------------------------------------------------------------
// Policies
// ---------------------------------------------------------------------------

export type PermissionPolicy = "allow" | "ask" | "deny"

interface PermissionRules {
	/** Policy per category. Missing categories default to their DEFAULT_POLICIES value. */
	categories: Partial<Record<ToolCategory, PermissionPolicy>>
	/** Per-tool overrides. Tool name → policy. Takes precedence over category. */
	tools: Record<string, PermissionPolicy>
}

/** Default policies when no rules are configured (YOLO=false equivalent). */
export const DEFAULT_POLICIES: Record<ToolCategory, PermissionPolicy> = {
	read: "allow",
	edit: "ask",
	execute: "ask",
	mcp: "ask",
}

/** YOLO-mode policies — everything auto-allowed. */
export const YOLO_POLICIES: Record<ToolCategory, PermissionPolicy> = {
	read: "allow",
	edit: "allow",
	execute: "allow",
	mcp: "allow",
}
