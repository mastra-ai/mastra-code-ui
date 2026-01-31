/**
 * Common interface for tool execution components
 */

import type { ToolResult } from "./tool-execution.js"

export interface IToolExecutionComponent {
    updateArgs(args: unknown): void
    updateResult(result: ToolResult, isPartial?: boolean): void
    setExpanded(expanded: boolean): void
}