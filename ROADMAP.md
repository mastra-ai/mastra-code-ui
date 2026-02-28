# Roadmap

Feature roadmap for Mastra Code UI, informed by the published mastracode harness capabilities and
patterns from [Superset](https://superset.sh/) and [Conductor](https://www.conductor.build/).

Legend: `[x]` done, `[-]` partial, `[ ]` not started

---

## Parallel Agents & Worktrees

Run multiple coding agents simultaneously, each in an isolated Git worktree.

- [-] **Git worktree isolation** — Create a new worktree + branch per agent task so parallel agents never conflict with each other or the main working tree _(worktrees created with issue-based branch names from Linear; linked issues auto-transition to "In Progress" on start and "Done" on agent completion; linked worktree badges in TaskBoard and ProjectList)_
- [x] **Agent dashboard** — Bird's-eye view of all running agents: status, current task, branch, token usage _(AgentDashboard component with summary bar, per-agent cards showing status/branch/task/tokens/cost/duration/model, 3s polling, click-to-switch; "Agents" nav button in sidebar with active count badge; `getAgentDashboardData` IPC handler aggregating all sessions)_
- [ ] **Wire subagents through Harness config** — Use `HarnessConfig.subagents` and the built-in subagent tool instead of manual tool creation
- [x] **Agent notifications** — Desktop notifications when an agent finishes, errors, or needs approval _(desktop `Notification` API, dock badge, in-app bell, and sound all implemented; configurable via Settings)_
- [-] **Agent cost tracking** — Per-agent token usage and cost breakdown across parallel sessions _(cost estimation with static model pricing table, per-agent and global totals displayed in Agent Dashboard; token values depend on upstream `getTokenUsage()` fix landing)_

## Diff Viewer & Code Review

Built-in code review for agent changes without leaving the app.

- [x] **Integrated diff viewer** — Side-by-side and inline diff views with syntax highlighting for agent changes vs main branch _(inline and side-by-side modes with toggle in DiffEditor; working-tree changes against HEAD)_
- [ ] **Turn-by-turn checkpoints** — View changes per agent turn and revert to any previous checkpoint (like Conductor's checkpoint system)
- [ ] **Direct file editing in diff view** — Edit agent changes inline before merging
- [ ] **One-click merge** — Merge agent branch back to main from the UI
- [x] **File staging & commit from UI** — Stage/unstage individual files, write commit messages, and commit directly from the diff viewer (like Superset's integrated git workflow) _(GitPanel with per-file stage/unstage, commit message textarea, and commit button; IPC handlers `gitStage`, `gitUnstage`, `gitCommit`)_
- [x] **Push/pull from UI** — Sync with remote without dropping to terminal _(push/pull buttons in GitPanel with loading states, ahead/behind indicators, and automatic refresh)_
- [ ] **Create PR from UI** — Open a GitHub pull request directly from the diff viewer
- [ ] **Focus mode** — Isolated single-file review with previous/next navigation, section jumping (against base, commits, staged, unstaged), and per-section file counts

## Harness Integration

Use more of the published `@mastra/core/harness` capabilities.

- [ ] **Heartbeat handlers** — Wire `heartbeatHandlers` into Harness config for gateway sync, cache refresh, and periodic cleanup instead of external management
- [x] **Permission system** — Connect `toolCategoryResolver` and use harness permission methods (`grantSessionCategory`, `setPermissionCategory`, `getPermissionRules`) instead of the external permission layer _(permission engine wired into event subscription for auto-approve/deny; "Always allow category" button in ToolApprovalDialog; Permissions settings tab with per-category policies and session grants)_
- [ ] **Observational Memory events** — Call `harness.loadOMProgress()` on thread switch and surface OM events (observation start/end, reflection, buffering, activation) in the UI
- [x] **Available models API** — Use `harness.getAvailableModels()` for the model selector with auth status and usage counts built in _(IPC handler now maps `hasApiKey`→`hasAuth` and `modelName`→`name`; Connected/Not connected badges and per-model auth state rendered in ModelSelector)_
- [ ] **Workspace events** — Listen to `workspace_status_changed`, `workspace_ready`, `workspace_error`, `follow_up_queued` events

## Upstream Harness Gaps

Tracked in [UPSTREAM_HARNESS_GAPS.md](./UPSTREAM_HARNESS_GAPS.md). Key items:

- [ ] `Harness.deleteThread()` — Actually delete threads from storage
- [x] Extensible `emitEvent` — Custom event types without `as any` casts _(resolved in @mastra/core@1.8.0)_
- [x] Typed event payloads — `thread_changed`, `thread_created`, `error` fields _(resolved in @mastra/core@1.8.0)_
- [x] `HarnessRequestContext.registerQuestion` / `registerPlanApproval` in published types _(resolved in @mastra/core@1.8.0)_
- [ ] `HarnessConfig.hookManager` — Pass hook manager through config instead of external wiring
- [ ] `HarnessConfig.mcpManager` — Pass MCP manager through config instead of ad-hoc tool injection
- [ ] `HarnessConfig.getToolsets` — Dynamic toolset injection (e.g. Anthropic web search) at stream time
- [-] `getTokenUsage()` returns zeros — AI SDK v6 field name mismatch; PR merged upstream but not yet released

## Task & Context Management

Structured task tracking and context sharing across agents.

- [x] **Task board** — Visual kanban or list view of todos with status, assignee (agent), and dependencies _(interactive kanban board with Linear integration: connect via API key, browse teams, view/create/update issues with state transitions; agent tasks sidebar column)_
- [x] **Context files** — Persistent markdown specs and plans that live alongside code (like Conductor's context-driven development) _(AGENT.md/CLAUDE.md auto-injected into system prompt; Context tab in right sidebar for browsing, editing, and creating context files with scope badges)_
- [x] **Slash commands** — Custom user-defined slash commands for common workflows _(fully wired end-to-end: EditorInput detects `/` and triggers SlashCommandAutocomplete, App.tsx handleSend processes commands via IPC, main.ts loads and expands command templates)_
- [ ] **Workspace presets** — Scripted environment setup (install deps, start servers, seed data) that runs automatically when creating a new agent workspace
- [ ] **Setup & teardown scripts** — JSON-configured commands that run automatically on workspace creation and deletion, with workspace env vars (`ROOT_PATH`, `WORKSPACE_NAME`), hierarchical config resolution (user overrides > worktree > project defaults), and force-delete on teardown failure (like Superset's `.superset/config.json`)
- [ ] **Worktree import** — Import existing git worktrees from disk into the app, with bulk "Import all" discovery

## IDE & Editor Integration

- [x] **One-click open in editor** — Deep link any file or worktree to VS Code, Cursor, JetBrains, Sublime, or other editors _(editor auto-detection for Cursor/VS Code/Sublime; `openInEditor` IPC handler with `--goto` support; context menu in FileTree)_
- [ ] **Port management** — View active ports per workspace, kill processes by port, workspace-isolated port ranges to prevent conflicts, static port config file (`.mastracode/ports.json`) with labels and auto-detection override, clickable ports open in browser
- [x] **Terminal multiplexing** — Multiple terminal tabs per agent workspace _(multi-tab xterm with node-pty, create/close/switch tabs)_

## MCP & Tool Extensibility

- [x] **MCP server management UI** — Configure, toggle, and monitor MCP servers from the app (user, project, and local scopes) _(MCP tab in Settings shows server statuses with connection indicator, tool count, and tool names; add/remove servers with project or global scope; reload all servers)_
- [ ] **Wire MCP through Harness** — Pass `mcpManager` through `HarnessConfig` instead of external management
- [ ] **Native toolsets** — Wire `getToolsets` through Harness to enable Anthropic native web search and other provider-specific tools
- [x] **Tool confirmation with `always_allow_category`** — Surface the harness's category-level auto-approve in the UI (not just per-call approve/decline) _(ToolApprovalDialog now includes "Always allow [category]" button that grants session-wide auto-approve for the category)_

## Multi-Provider Auth

- [ ] **Google Vertex / Gemini auth** — OAuth flow for Google AI providers
- [ ] **OpenRouter integration** — API key management for OpenRouter models
- [ ] **Bedrock auth** — AWS credential management for Bedrock models
- [x] **Auth status in model selector** — Show login state per provider inline in the model picker (using `harness.getAvailableModels()`) _(field mapping fixed in IPC handler; Connected/Not connected badges per provider displayed in ModelSelector)_

## Platform

- [ ] **Linux support**
- [ ] **Windows support**
- [-] **Electron Builder packaging** — Use `electron-builder` to produce platform-specific installers (`.dmg` for macOS, `.exe`/NSIS for Windows, `.AppImage`/`.deb` for Linux) with code signing and notarization _(macOS DMGs for arm64 and x64 via `pnpm package`; custom icon; pnpm native binding workaround for @ast-grep/napi; separate dev/prod data directories; Windows and Linux installers not yet implemented; code signing and notarization not yet configured)_
- [ ] **Auto-updates** — Integrate `electron-updater` for in-app update mechanism (check for updates on launch, download in background, prompt user to restart); host releases on GitHub Releases or a custom update server
- [ ] **Workspace sharing** — Export/import workspace configs (scripts, MCP servers, slash commands) via a shared config file

## In-App Browser

Built-in browser pane for previewing running services without leaving the app.

- [ ] **Browser pane** — Embedded browser tab with address bar, back/forward/reload, URL autocomplete from history, and favicon display
- [ ] **Port detection integration** — When a port is detected in use (e.g. `localhost:3000`), clicking it opens in the in-app browser instead of the system browser
- [ ] **DevTools pane** — Inspect and debug pages running in the embedded browser
- [ ] **Browsing history** — Save visited URLs locally for autocomplete suggestions, with option to clear history

## Terminal Enhancements

Improvements to the built-in terminal beyond basic tab management.

- [ ] **Right-click context menu** — Copy, paste, split pane, clear, move tab, close tab via context menu
- [ ] **Clickable output** — URLs in terminal output open in browser; file paths open in editor
- [ ] **Workspace environment variables** — Expose `ROOT_PATH` and `WORKSPACE_NAME` env vars so scripts and tools can reference workspace context
- [ ] **Terminal presets** — Save named command configurations with working directory, one or more commands, and launch mode (split pane vs new tab); mark presets as default for auto-apply to new workspaces; quick-add templates for popular AI agents (Claude, Codex, Gemini, OpenCode)
- [ ] **Session persistence** — Terminal sessions survive app restarts with running processes, output history, and scrollback preserved

## Multi-Agent Support

Support for AI agents beyond Claude Code.

- [ ] **Codex integration** — Run OpenAI's Codex agent in isolated workspaces
- [ ] **OpenCode integration** — Run the open-source OpenCode agent
- [ ] **Gemini integration** — Run Google's Gemini CLI agent
- [ ] **Copilot integration** — Run GitHub Copilot agent
- [ ] **Cursor Agent integration** — Launch Cursor Agent sessions within workspaces

## App-Level MCP Server

Expose the app as an MCP server so external AI agents can control it programmatically.

- [ ] **MCP server endpoint** — Expose tasks, workspaces, and app state via Model Context Protocol so any MCP-capable AI agent can interact with the app
- [ ] **Task management via MCP** — Create (batch), update, list, retrieve, and soft-delete tasks; filter by status, assignee, priority, labels
- [ ] **Workspace management via MCP** — Create, rename, switch, delete, and list workspaces; retrieve workspace details including tabs and panes
- [ ] **AI session launching via MCP** — Start autonomous agent sessions with task context in specified workspaces; support subagent panes
- [ ] **OAuth & API key auth** — OAuth 2.1 for interactive use (Claude Desktop, Cursor) and API key auth (`sk_live_*`) for headless/CI environments

## Monorepo Support

First-class support for working with monorepos.

- [ ] **Monorepo detection** — Detect monorepo structure and provide workspace-level access to all packages from repo root
- [ ] **Git submodule support** — Recursive submodule init/install in setup scripts
- [ ] **Multi-service execution** — Run multiple services simultaneously with package filter syntax (e.g. `--filter @myapp/web`)

## Theming & Customization

Visual personalization and workflow customization.

- [ ] **Custom themes** — JSON theme files with UI colors (background, foreground, primary, accent, border) and terminal colors (16 ANSI + bright variants); import/export themes; download base theme template for editing
- [ ] **Keyboard shortcut customization** — Remap any hotkey from settings; import/export shortcut configurations
- [ ] **Project colors** — Color-code projects in the sidebar for quick visual identification
- [ ] **Notification sounds** — Audio alerts when agents finish or terminals exit, with configurable sound selection
- [ ] **Cross-device settings sync** — Settings automatically synchronize across devices when signed in

## Quick Navigation

Fast navigation and layout management.

- [ ] **Quick file opener** — `⌘P` to fuzzy-search and open any file in the workspace
- [ ] **Split pane layouts** — Split panes right (`⌘D`) and down (`⌘⇧D`), auto-arrange (`⌘E`), close active pane (`⌘W`)
- [ ] **Workspace switcher** — `⌘1-9` to jump to workspaces, `⌘⌥↑/↓` for previous/next workspace
- [-] **Sync status display** — Show `↑N` / `↓N` indicators in sidebar for unpushed/behind commits per workspace _(ahead/behind counts displayed on push/pull buttons in GitPanel; not yet shown in sidebar)_
