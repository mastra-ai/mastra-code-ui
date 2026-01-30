/**
 * Custom editor that handles app-level keybindings for Mastra Code.
 */

import { Editor, matchesKey, type EditorTheme, type TUI } from "@mariozechner/pi-tui"

export type AppAction = 
  | "clear"      // Ctrl+C - interrupt
  | "exit"       // Ctrl+D - exit when empty
  | "suspend"    // Ctrl+Z - suspend
  | "toggleThinking"  // Ctrl+T
  | "expandTools"     // Ctrl+E
  | "followUp"        // Alt+Enter - queue follow-up while streaming
  | "cycleMode"       // Shift+Tab - cycle harness modes

export class CustomEditor extends Editor {
  private actionHandlers: Map<AppAction, () => void> = new Map()

  /** Handler for Ctrl+D when editor is empty */
  public onCtrlD?: () => void

  constructor(tui: TUI, theme: EditorTheme) {
    super(tui, theme)
  }

  /**
   * Register a handler for an app action.
   */
  onAction(action: AppAction, handler: () => void): void {
    this.actionHandlers.set(action, handler)
  }

  handleInput(data: string): void {
    // Ctrl+C - interrupt
    if (matchesKey(data, "ctrl+c")) {
      const handler = this.actionHandlers.get("clear")
      if (handler) {
        handler()
        return
      }
    }

    // Ctrl+D - exit when editor is empty
    if (matchesKey(data, "ctrl+d")) {
      if (this.getText().length === 0) {
        const handler = this.onCtrlD ?? this.actionHandlers.get("exit")
        if (handler) handler()
      }
      return // Always consume
    }

    // Ctrl+Z - suspend
    if (matchesKey(data, "ctrl+z")) {
      const handler = this.actionHandlers.get("suspend")
      if (handler) {
        handler()
        return
      }
    }

    // Ctrl+T - toggle thinking
    if (matchesKey(data, "ctrl+t")) {
      const handler = this.actionHandlers.get("toggleThinking")
      if (handler) {
        handler()
        return
      }
    }

    // Ctrl+E - expand tools
    if (matchesKey(data, "ctrl+e")) {
      const handler = this.actionHandlers.get("expandTools")
      if (handler) {
        handler()
        return
      }
    }

    // Ctrl+F - follow-up (queue message while streaming)
    if (matchesKey(data, "ctrl+f")) {
      const handler = this.actionHandlers.get("followUp")
      if (handler) {
        handler()
        return
      }
    }

    // Shift+Tab - cycle harness modes
    if (matchesKey(data, "shift+tab")) {
      const handler = this.actionHandlers.get("cycleMode")
      if (handler) {
        handler()
        return
      }
    }

    // Pass to parent for editor handling
    super.handleInput(data)
  }
}
