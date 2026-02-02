/**
 * Theme system for the Mastra Code TUI.
 * Simplified from pi-mono's theme system.
 */

import chalk from "chalk"

// =============================================================================
// Theme Colors
// =============================================================================

export type ThemeColor =
  | "accent"
  | "border"
  | "borderAccent"
  | "borderMuted"
  | "success"
  | "error"
  | "warning"
  | "muted"
  | "dim"
  | "text"
  | "thinkingText"
  | "userMessageText"
  | "toolTitle"
  | "toolOutput"
  | "toolBorderPending"
  | "toolBorderSuccess"
  | "toolBorderError"
  | "function"
  | "path"
  | "number"

export type ThemeBg =
  | "selectedBg"
  | "userMessageBg"
  | "toolPendingBg"
  | "toolSuccessBg"
  | "toolErrorBg"
  | "overlayBg"
  | "errorBg"

export interface ThemeColors {
  // Core UI
  accent: string
  border: string
  borderAccent: string
  borderMuted: string
  success: string
  error: string
  warning: string
  muted: string
  dim: string
  text: string
  thinkingText: string
  // User messages
  userMessageBg: string
  userMessageText: string
  // Tool execution
  toolPendingBg: string
  toolSuccessBg: string
  toolErrorBg: string
  toolBorderPending: string
  toolBorderSuccess: string
  toolBorderError: string
  toolTitle: string
  toolOutput: string
  // Selection
  selectedBg: string
  // Overlays
  overlayBg: string
  // Error display
  errorBg: string
  path: string
  number: string
  function: string
}

// =============================================================================
// Default Dark Theme
// =============================================================================

const darkTheme: ThemeColors = {
  // Core UI
  accent: "#7c3aed", // Purple
  border: "#3f3f46",
  borderAccent: "#7c3aed",
  borderMuted: "#27272a",
  success: "#22c55e",
  error: "#ef4444",
  warning: "#f59e0b",
  muted: "#71717a",
  dim: "#52525b",
  text: "#fafafa",
  thinkingText: "#a1a1aa",
  // User messages
  userMessageBg: "#0f172a",  // Slate blue
  userMessageText: "#fafafa",
  // Tool execution
  toolPendingBg: "#18152a",  // Dark purple (matches tool title accent)
  toolSuccessBg: "#18152a",  // Dark purple (same as pending)
  toolErrorBg: "#1f0a0a",    // Dark red tint
  toolBorderPending: "#6366f1",  // Indigo for pending
  toolBorderSuccess: "#22c55e",  // Green for success
  toolBorderError: "#ef4444",    // Red for error
  toolTitle: "#a78bfa",
  toolOutput: "#d4d4d8",
  // Error display
  errorBg: "#291415",      // Slightly lighter than toolErrorBg for contrast
  path: "#9ca3af",         // Gray for file paths
  number: "#fbbf24",       // Yellow for line numbers
  function: "#60a5fa",     // Light blue for function names
  // Selection
  selectedBg: "#3f3f46",
  // Overlays
  overlayBg: "#15131f",  // Darker purple tint for overlays
}

// =============================================================================
// Theme Instance
// =============================================================================

let currentTheme: ThemeColors = darkTheme

/**
 * Get the current theme colors.
 */
export function getTheme(): ThemeColors {
  return currentTheme
}

/**
 * Set the current theme.
 */
export function setTheme(colors: ThemeColors): void {
  currentTheme = colors
}

// =============================================================================
// Theme Helper Functions
// =============================================================================

/**
 * Apply foreground color from theme.
 */
export function fg(color: ThemeColor, text: string): string {
  const hex = currentTheme[color]
  if (!hex) return text
  return chalk.hex(hex)(text)
}

/**
 * Apply background color from theme.
 */
export function bg(color: ThemeBg, text: string): string {
  const hex = currentTheme[color]
  if (!hex) return text
  return chalk.bgHex(hex)(text)
}

/**
 * Apply bold styling.
 */
export function bold(text: string): string {
  return chalk.bold(text)
}

/**
 * Apply italic styling.
 */
export function italic(text: string): string {
  return chalk.italic(text)
}

/**
 * Apply dim styling.
 */
export function dim(text: string): string {
  return chalk.dim(text)
}

/**
 * Returns "#ffffff" or "#000000" depending on which has better contrast
 * against the given hex background color (WCAG relative luminance).
 */
export function getContrastText(hexBg: string): string {
  const hex = hexBg.replace("#", "")
  const r = parseInt(hex.slice(0, 2), 16) / 255
  const g = parseInt(hex.slice(2, 4), 16) / 255
  const b = parseInt(hex.slice(4, 6), 16) / 255
  const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
  return luminance > 0.179 ? "#000000" : "#ffffff"
}

// =============================================================================
// Theme Object (for compatibility with pi-tui components)
// =============================================================================

export const theme = {
  fg,
  bg,
  bold,
  italic,
  dim,
  getTheme,
  setTheme,
}

// =============================================================================
// Markdown Theme (for pi-tui Markdown component)
// =============================================================================

import type { MarkdownTheme, EditorTheme } from "@mariozechner/pi-tui"

export function getMarkdownTheme(): MarkdownTheme {
  const t = getTheme()
  return {
    heading: (text: string) => chalk.hex(t.accent).bold(text),
    link: (text: string) => chalk.hex(t.accent)(text),
    linkUrl: (text: string) => chalk.hex(t.muted)(text),
    code: (text: string) => chalk.hex(t.accent)(text),
    codeBlock: (text: string) => text,
    codeBlockBorder: (text: string) => chalk.hex(t.borderMuted)(text),
    quote: (text: string) => chalk.hex(t.muted).italic(text),
    quoteBorder: (text: string) => chalk.hex(t.borderMuted)(text),
    hr: (text: string) => chalk.hex(t.borderMuted)(text),
    listBullet: (text: string) => chalk.hex(t.accent)(text),
    // Required by MarkdownTheme interface
    bold: (text: string) => chalk.bold(text),
    italic: (text: string) => chalk.italic(text),
    strikethrough: (text: string) => chalk.strikethrough(text),
    underline: (text: string) => chalk.underline(text),
  }
}

// =============================================================================
// Editor Theme (for pi-tui Editor component)
// =============================================================================

export function getEditorTheme(): EditorTheme {
  const t = getTheme()
  return {
    borderColor: (text: string) => chalk.hex(t.border)(text),
    selectList: {
      selectedPrefix: (text: string) => chalk.hex(t.accent)(text),
      selectedText: (text: string) => chalk.bgHex(t.selectedBg)(text),
      description: (text: string) => chalk.hex(t.muted)(text),
      scrollInfo: (text: string) => chalk.hex(t.dim)(text),
      noMatch: (text: string) => chalk.hex(t.muted)(text),
    },
  }
}

// =============================================================================
// Settings List Theme (for pi-tui SettingsList component)
// =============================================================================

import type { SettingsListTheme, SelectListTheme } from "@mariozechner/pi-tui"

export function getSettingsListTheme(): SettingsListTheme {
  const t = getTheme()
  return {
    label: (text: string, selected: boolean) =>
      selected ? chalk.hex(t.text).bold(text) : chalk.hex(t.muted)(text),
    value: (text: string, selected: boolean) =>
      selected ? chalk.hex(t.accent)(text) : chalk.hex(t.dim)(text),
    description: (text: string) => chalk.hex(t.muted).italic(text),
    cursor: chalk.hex(t.accent)("→ "),
    hint: (text: string) => chalk.hex(t.dim)(text),
  }
}

export function getSelectListTheme(): SelectListTheme {
  const t = getTheme()
  return {
    selectedPrefix: (text: string) => chalk.hex(t.accent)(text),
    selectedText: (text: string) => chalk.bgHex(t.selectedBg)(text),
    description: (text: string) => chalk.hex(t.muted)(text),
    scrollInfo: (text: string) => chalk.hex(t.dim)(text),
    noMatch: (text: string) => chalk.hex(t.muted)(text),
  }
}
