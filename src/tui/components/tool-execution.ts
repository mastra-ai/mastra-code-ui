/**
 * Component that renders a tool call with its result.
 * Formats output nicely based on tool type.
 */

import * as os from "node:os"
import { Box, Container, Spacer, Text, type TUI } from "@mariozechner/pi-tui"
import { theme } from "../theme.js"

export interface ToolExecutionOptions {
  showImages?: boolean
}

export interface ToolResult {
  content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>
  isError: boolean
}

/**
 * Convert absolute path to tilde notation if it's in home directory
 */
function shortenPath(path: string): string {
  const home = os.homedir()
  if (path.startsWith(home)) {
    return `~${path.slice(home.length)}`
  }
  return path
}

/**
 * Replace tabs with spaces for consistent rendering
 */
function replaceTabs(text: string): string {
  return text.replace(/\t/g, "   ")
}

/**
 * Extract the actual content from tool result text.
 * Tool results often come wrapped in JSON like { "content": [...], "isError": false }
 * where content is an array of { type: "text", text: "..." } parts.
 */
function extractContent(text: string): { content: string; isError: boolean } {
  // Try to parse as JSON first
  try {
    const parsed = JSON.parse(text)
    if (typeof parsed === "object" && parsed !== null) {
      // Handle { content: [...], isError: bool } format
      if ("content" in parsed) {
        const content = parsed.content
        let contentStr: string
        
        if (typeof content === "string") {
          contentStr = content
        } else if (Array.isArray(content)) {
          // Extract text from array of { type: "text", text: "..." } parts
          contentStr = content
            .filter((part: unknown) => 
              typeof part === "object" && part !== null && 
              (part as Record<string, unknown>).type === "text"
            )
            .map((part: unknown) => (part as Record<string, unknown>).text || "")
            .join("")
        } else {
          contentStr = JSON.stringify(content, null, 2)
        }
        
        return {
          content: contentStr,
          isError: Boolean(parsed.isError),
        }
      }
      // Handle other object formats - just stringify nicely
      return { content: JSON.stringify(parsed, null, 2), isError: false }
    }
  } catch {
    // Not JSON, use as-is
  }
  return { content: text, isError: false }
}

/**
 * Component that renders a tool call with its result (updateable).
 */
export class ToolExecutionComponent extends Container {
  private contentBox: Box
  private toolName: string
  private args: unknown
  private expanded = false
  private isPartial = true
  private ui: TUI
  private result?: ToolResult

  constructor(
    toolName: string,
    args: unknown,
    _options: ToolExecutionOptions = {},
    ui: TUI
  ) {
    super()
    this.toolName = toolName
    this.args = args
    this.ui = ui

    this.addChild(new Spacer(1))

    // Content box with background
    this.contentBox = new Box(1, 1, (text: string) =>
      theme.bg("toolPendingBg", text)
    )
    this.addChild(this.contentBox)

    this.updateDisplay()
  }

  updateArgs(args: unknown): void {
    this.args = args
    this.updateDisplay()
  }

  updateResult(result: ToolResult, isPartial = false): void {
    this.result = result
    this.isPartial = isPartial
    this.updateDisplay()
  }

  setExpanded(expanded: boolean): void {
    this.expanded = expanded
    this.updateDisplay()
  }

  override invalidate(): void {
    super.invalidate()
    this.updateDisplay()
  }

  private updateDisplay(): void {
    // Get background color based on state
    const bgColor = this.isPartial
      ? "toolPendingBg"
      : this.result?.isError
        ? "toolErrorBg"
        : "toolSuccessBg"

    this.contentBox.setBgFn((text: string) => theme.bg(bgColor, text))
    this.contentBox.clear()

    // Render based on tool type
    if (this.toolName === "view") {
      this.renderViewTool()
    } else if (this.toolName === "execute_command") {
      this.renderBashTool()
    } else if (this.toolName === "string_replace_lsp") {
      this.renderEditTool()
    } else {
      this.renderGenericTool()
    }
  }

  private renderViewTool(): void {
    const argsObj = this.args as Record<string, unknown> | undefined
    const path = argsObj?.path ? shortenPath(String(argsObj.path)) : "..."
    const range = argsObj?.view_range
      ? theme.fg("muted", `:${String(argsObj.view_range)}`)
      : ""
    
    const status = this.getStatusIndicator()
    const header = `${theme.bold(theme.fg("toolTitle", "view"))} ${theme.fg("accent", path)}${range}${status}`
    this.contentBox.addChild(new Text(header, 0, 0))

    if (this.result) {
      const output = this.getFormattedOutput()
      if (output) {
        this.contentBox.addChild(new Text("", 0, 0))
        this.contentBox.addChild(new Text(this.truncateOutput(output), 0, 0))
      }
    }
  }

  private renderBashTool(): void {
    const argsObj = this.args as Record<string, unknown> | undefined
    const command = argsObj?.command ? String(argsObj.command) : "..."
    const timeout = argsObj?.timeout as number | undefined
    const cwd = argsObj?.cwd ? shortenPath(String(argsObj.cwd)) : ""
    
    const status = this.getStatusIndicator()
    const timeoutSuffix = timeout ? theme.fg("muted", ` (timeout ${timeout}s)`) : ""
    const cwdSuffix = cwd ? theme.fg("muted", ` in ${cwd}`) : ""
    const header = `${theme.fg("toolTitle", theme.bold(`$ ${command}`))}${cwdSuffix}${timeoutSuffix}${status}`
    this.contentBox.addChild(new Text(header, 0, 0))

    if (this.result) {
      const output = this.getFormattedOutput()
      if (output.trim()) {
        this.contentBox.addChild(new Text("", 0, 0))
        this.contentBox.addChild(new Text(this.truncateOutput(output), 0, 0))
      }
    }
  }

  private renderEditTool(): void {
    const argsObj = this.args as Record<string, unknown> | undefined
    const path = argsObj?.path ? shortenPath(String(argsObj.path)) : "..."
    const line = argsObj?.start_line
      ? theme.fg("muted", `:${String(argsObj.start_line)}`)
      : ""
    
    const status = this.getStatusIndicator()
    const header = `${theme.bold(theme.fg("toolTitle", "edit"))} ${theme.fg("accent", path)}${line}${status}`
    this.contentBox.addChild(new Text(header, 0, 0))

    // Show old_str -> new_str preview when expanded
    if (this.expanded && argsObj?.old_str && argsObj?.new_str) {
      this.contentBox.addChild(new Text("", 0, 0))
      this.contentBox.addChild(new Text(theme.fg("error", "- " + String(argsObj.old_str).split("\n").join("\n- ")), 0, 0))
      this.contentBox.addChild(new Text(theme.fg("success", "+ " + String(argsObj.new_str).split("\n").join("\n+ ")), 0, 0))
    }

    if (this.result) {
      const output = this.getFormattedOutput()
      if (output && this.result.isError) {
        this.contentBox.addChild(new Text("", 0, 0))
        this.contentBox.addChild(new Text(theme.fg("error", output), 0, 0))
      }
    }
  }

  private renderGenericTool(): void {
    const status = this.getStatusIndicator()
    
    // Format args summary
    let argsSummary = ""
    if (this.args && typeof this.args === "object") {
      const argsObj = this.args as Record<string, unknown>
      const firstStringArg = Object.entries(argsObj).find(
        ([, v]) => typeof v === "string"
      )
      if (firstStringArg) {
        const val = String(firstStringArg[1])
        argsSummary = ` ${val.length > 40 ? val.slice(0, 40) + "..." : val}`
      }
    }

    const header = `${theme.bold(theme.fg("toolTitle", this.toolName))}${theme.fg("muted", argsSummary)}${status}`
    this.contentBox.addChild(new Text(header, 0, 0))

    if (this.result) {
      const output = this.getFormattedOutput()
      if (output) {
        this.contentBox.addChild(new Text("", 0, 0))
        this.contentBox.addChild(new Text(this.truncateOutput(output), 0, 0))
      }
    }
  }

  private getStatusIndicator(): string {
    return this.isPartial
      ? theme.fg("muted", " ⋯")
      : this.result?.isError
        ? theme.fg("error", " ✗")
        : theme.fg("success", " ✓")
  }

  private getFormattedOutput(): string {
    if (!this.result) return ""

    const textContent = this.result.content
      .filter((c) => c.type === "text" && c.text)
      .map((c) => c.text!)
      .join("\n")

    if (!textContent) return ""

    // Extract actual content from JSON wrapper if present
    const { content } = extractContent(textContent)
    
    // Clean up the content - trim trailing whitespace/newlines
    return replaceTabs(content).trim()
  }

  private truncateOutput(output: string): string {
    const lines = output.split("\n")
    const maxLines = this.expanded ? 50 : 8
    
    if (lines.length <= maxLines) {
      return theme.fg("toolOutput", output)
    }

    const truncated = lines.slice(0, maxLines).join("\n")
    const remaining = lines.length - maxLines
    return (
      theme.fg("toolOutput", truncated) +
      `\n${theme.fg("muted", `... ${remaining} more lines (Ctrl+E to expand)`)}`
    )
  }
}
