/**
 * Enhanced tool execution component with better collapsible support.
 * This will replace the existing tool-execution.ts
 */

import * as os from "node:os"
import { Box, Container, Spacer, Text, type TUI } from "@mariozechner/pi-tui"
import { theme } from "../theme.js"
import { 
  CollapsibleComponent, 
  CollapsibleFileViewer, 
  CollapsibleDiffViewer,
  CollapsibleCommandOutput 
} from "./collapsible.js"
import type { IToolExecutionComponent, ToolResult } from "./tool-execution-interface.js"
import { ErrorDisplayComponent } from "./error-display.js"

export type { ToolResult }

export interface ToolExecutionOptions {
  showImages?: boolean
  autoCollapse?: boolean
  collapsedByDefault?: boolean
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
 * Extract the actual content from tool result text.
 */
function extractContent(text: string): { content: string; isError: boolean } {
  try {
    const parsed = JSON.parse(text)
    if (typeof parsed === "object" && parsed !== null) {
      if ("content" in parsed) {
        const content = parsed.content
        let contentStr: string
        
        if (typeof content === "string") {
          contentStr = content
        } else if (Array.isArray(content)) {
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
      return { content: JSON.stringify(parsed, null, 2), isError: false }
    }
  } catch {
    // Not JSON, use as-is
  }
  return { content: text, isError: false }
}

/**
 * Enhanced tool execution component with collapsible sections
 */
export class ToolExecutionComponentEnhanced extends Container implements IToolExecutionComponent {
  private contentBox: Box
  private toolName: string
  private args: unknown
  private expanded = false
  private isPartial = true
  private ui: TUI
  private result?: ToolResult
  private options: ToolExecutionOptions
  private collapsible?: CollapsibleComponent

  constructor(
    toolName: string,
    args: unknown,
    options: ToolExecutionOptions = {},
    ui: TUI
  ) {
    super()
    this.toolName = toolName
    this.args = args
    this.ui = ui
    this.options = {
      autoCollapse: true,
      collapsedByDefault: true,
      ...options
    }
    this.expanded = !this.options.collapsedByDefault

    this.addChild(new Spacer(1))

    // Content box with background
    this.contentBox = new Box(1, 1, (text: string) =>
      theme.bg("toolPendingBg", text)
    )
    this.addChild(this.contentBox)

    this.rebuild()
  }

  updateArgs(args: unknown): void {
    this.args = args
    this.rebuild()
  }

  updateResult(result: ToolResult, isPartial = false): void {
    this.result = result
    this.isPartial = isPartial
    this.rebuild()
  }

  setExpanded(expanded: boolean): void {
    this.expanded = expanded
    if (this.collapsible) {
      this.collapsible.setExpanded(expanded)
      this.updateBgColor()
      super.invalidate()
      return
    }
    // No collapsible — need a full rebuild (e.g. write tool, header-only tools)
    this.rebuild()
  }

  toggleExpanded(): void {
    this.setExpanded(!this.expanded)
  }

  override invalidate(): void {
    super.invalidate()
    // invalidate is called by the layout system — only update bg, don't rebuild
    this.updateBgColor()
  }

  private updateBgColor(): void {
    const bgColor = this.isPartial
      ? "toolPendingBg"
      : this.result?.isError
        ? "toolErrorBg"
        : "toolSuccessBg"
    this.contentBox.setBgFn((text: string) => theme.bg(bgColor, text))
  }

  /**
   * Full clear-and-rebuild. Called when:
   * - args change (updateArgs)
   * - result arrives or changes (updateResult)
   * - expand/collapse on a tool with no collapsible child
   * - initial construction
   */
  private rebuild(): void {
    this.updateBgColor()
    this.contentBox.clear()
    this.collapsible = undefined

    switch (this.toolName) {
      case "view":
      case "mastra_workspace_read_file":
        this.renderViewToolEnhanced()
        break
      case "execute_command":
      case "mastra_workspace_execute_command":
        this.renderBashToolEnhanced()
        break
      case "string_replace_lsp":
      case "mastra_workspace_edit_file":
        this.renderEditToolEnhanced()
        break
      case "mastra_workspace_write_file":
        this.renderWriteToolEnhanced()
        break
      case "mastra_workspace_list_files":
        this.renderListFilesEnhanced()
        break
      default:
        this.renderGenericToolEnhanced()
    }
  }

  private renderViewToolEnhanced(): void {
    const argsObj = this.args as Record<string, unknown> | undefined
    const path = argsObj?.path ? shortenPath(String(argsObj.path)) : "..."
    const range = argsObj?.view_range
      ? theme.fg("muted", `:${String(argsObj.view_range)}`)
      : ""
    
    if (!this.result || this.isPartial) {
      const status = this.getStatusIndicator()
      const header = `${theme.bold(theme.fg("toolTitle", "📄 view"))} ${theme.fg("accent", path)}${range}${status}`
      this.contentBox.addChild(new Text(header, 0, 0))
      return
    }

    const output = this.getFormattedOutput()
    if (output) {
      this.collapsible = new CollapsibleFileViewer(
        `${path}${range}`,
        output,
        { 
          expanded: this.expanded,
          collapsedLines: this.result.isError ? 50 : 20
        },
        this.ui
      )
      this.contentBox.addChild(this.collapsible)
    }
  }

  private renderBashToolEnhanced(): void {
    const argsObj = this.args as Record<string, unknown> | undefined
    const command = argsObj?.command ? String(argsObj.command) : "..."
    const timeout = argsObj?.timeout as number | undefined
    const cwd = argsObj?.cwd ? shortenPath(String(argsObj.cwd)) : ""
    
    const timeoutSuffix = timeout ? theme.fg("muted", ` (timeout ${timeout}s)`) : ""
    const cwdSuffix = cwd ? theme.fg("muted", ` in ${cwd}`) : ""
    
    if (!this.result || this.isPartial) {
      const status = this.getStatusIndicator()
      const header = `${theme.fg("toolTitle", theme.bold(`$ ${command}`))}${cwdSuffix}${timeoutSuffix}${status}`
      this.contentBox.addChild(new Text(header, 0, 0))
      return
    }

    // For errors, use enhanced error display
    if (this.result.isError) {
      const status = theme.fg("error", " ✗")
      const header = `${theme.fg("toolTitle", theme.bold(`$ ${command}`))}${cwdSuffix}${timeoutSuffix}${status}`
      this.renderErrorResult(header)
      return
    }
    
    // Also check if output contains common error patterns
    const outputText = this.getFormattedOutput()
    const looksLikeError = outputText.match(/Error:|TypeError:|SyntaxError:|ReferenceError:|command not found|fatal:|error:/i)
    if (looksLikeError) {
      const status = theme.fg("error", " ✗")
      const header = `${theme.fg("toolTitle", theme.bold(`$ ${command}`))}${cwdSuffix}${timeoutSuffix}${status}`
      this.renderErrorResult(header)
      return
    }

    const output = this.getFormattedOutput()
    const exitCode = 0
    
    this.collapsible = new CollapsibleCommandOutput(
      `${command}${cwdSuffix}${timeoutSuffix}`,
      output,
      exitCode,
      { 
        expanded: this.expanded,
        collapsedLines: 10
      },
      this.ui
    )
    this.contentBox.addChild(this.collapsible)
  }

  private renderEditToolEnhanced(): void {
    const argsObj = this.args as Record<string, unknown> | undefined
    const path = argsObj?.path ? shortenPath(String(argsObj.path)) : "..."
    const line = argsObj?.start_line
      ? theme.fg("muted", `:${String(argsObj.start_line)}`)
      : ""
    
    const status = this.getStatusIndicator()
    const header = `${theme.bold(theme.fg("toolTitle", "✏️ edit"))} ${theme.fg("accent", path)}${line}${status}`
    
    if (!this.result || this.isPartial) {
      this.contentBox.addChild(new Text(header, 0, 0))
      return
    }

    // For edits, show the diff
    if (argsObj?.old_str && argsObj?.new_str && !this.result.isError) {
      this.collapsible = new CollapsibleDiffViewer(
        `${path}${line}`,
        String(argsObj.old_str),
        String(argsObj.new_str),
        { 
          expanded: this.expanded,
          collapsedLines: 15
        },
        this.ui
      )
      this.contentBox.addChild(this.collapsible)
    } else {
      // Show error or generic output
      if (this.result.isError) {
        this.renderErrorResult(header)
      } else {
        this.contentBox.addChild(new Text(header, 0, 0))
      }
    }
  }

  private renderWriteToolEnhanced(): void {
    const argsObj = this.args as Record<string, unknown> | undefined
    const path = argsObj?.path ? shortenPath(String(argsObj.path)) : "..."
    
    const status = this.getStatusIndicator()
    const header = `${theme.bold(theme.fg("toolTitle", "💾 write"))} ${theme.fg("accent", path)}${status}`
    
    this.contentBox.addChild(new Text(header, 0, 0))
    
    if (this.result && !this.isPartial) {
      const output = this.getFormattedOutput()
      if (output && (this.result.isError || this.expanded)) {
        this.contentBox.addChild(new Text("", 0, 0))
        const color = this.result.isError ? "error" : "success"
        this.contentBox.addChild(new Text(theme.fg(color, output), 0, 0))
      }
    }
  }

  private renderListFilesEnhanced(): void {
    const argsObj = this.args as Record<string, unknown> | undefined
    const path = argsObj?.path ? shortenPath(String(argsObj.path)) : "/"
    
    if (!this.result || this.isPartial) {
      const status = this.getStatusIndicator()
      const header = `${theme.bold(theme.fg("toolTitle", "📁 list"))} ${theme.fg("accent", path)}${status}`
      this.contentBox.addChild(new Text(header, 0, 0))
      return
    }

    const output = this.getFormattedOutput()
    if (output) {
      const lines = output.split("\n")
      const fileCount = lines.filter(l => l.trim() && !l.includes("└") && !l.includes("├") && !l.includes("│")).length
      
      this.collapsible = new CollapsibleComponent({
        header: `${theme.bold(theme.fg("toolTitle", "📁 list"))} ${theme.fg("accent", path)}`,
        summary: `${fileCount} items`,
        expanded: this.expanded,
        collapsedLines: 15,
        expandedLines: 100,
        showLineCount: false
      }, this.ui)
      
      this.collapsible.setContent(output)
      this.contentBox.addChild(this.collapsible)
    }
  }

  private renderGenericToolEnhanced(): void {
    const status = this.getStatusIndicator()
    
    let argsSummary = ""
    if (this.args && typeof this.args === "object") {
      const argsObj = this.args as Record<string, unknown>
      const keys = Object.keys(argsObj)
      if (keys.length > 0) {
        argsSummary = theme.fg("muted", ` (${keys.length} args)`)
      }
    }

    const header = `${theme.bold(theme.fg("toolTitle", this.toolName))}${argsSummary}${status}`
    
    if (!this.result || this.isPartial) {
      this.contentBox.addChild(new Text(header, 0, 0))
      return
    }

    // Use enhanced error display for errors
    if (this.result.isError) {
      this.renderErrorResult(header)
      return
    }

    const output = this.getFormattedOutput()
    if (output) {
      this.collapsible = new CollapsibleComponent({
        header,
        expanded: this.expanded,
        collapsedLines: 10,
        expandedLines: 200,
        showLineCount: true
      }, this.ui)
      
      this.collapsible.setContent(output)
      this.contentBox.addChild(this.collapsible)
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

    const { content } = extractContent(textContent)
    // Remove excessive blank lines while preserving intentional formatting
    return content.trim().replace(/\n\s*\n\s*\n/g, '\n\n')
  }

  /**
   * Render an error result using the enhanced error display component
   */
  private renderErrorResult(header: string): void {
    if (!this.result) return

    // First add the header
    this.contentBox.addChild(new Text(header, 0, 0))
    
    // Extract error text from result
    const errorText = this.result.content
      .filter((c) => c.type === "text" && c.text)
      .map((c) => c.text!)
      .join("\n")

    if (!errorText) return

    // Try to parse as an error object
    let error: Error | string = errorText
    try {
      const { content } = extractContent(errorText)
      error = content
      
      // Try to create an Error object with better structure
      const errorMatch = content.match(/^([A-Z][a-zA-Z]*Error):\s*(.+)$/m)
      if (errorMatch) {
        const err = new Error(errorMatch[2])
        err.name = errorMatch[1]
        // Try to extract stack trace
        const stackMatch = content.match(/\n\s+at\s+.+/g)
        if (stackMatch) {
          err.stack = `${err.name}: ${err.message}\n${stackMatch.join("\n")}`
        }
        error = err
      }
    } catch {
      // Keep as string
    }

    // Create error display component
    const errorDisplay = new ErrorDisplayComponent(
      error,
      {
        showStack: true,
        showContext: true,
        expanded: this.expanded
      },
      this.ui
    )

    this.contentBox.addChild(errorDisplay)
  }
}