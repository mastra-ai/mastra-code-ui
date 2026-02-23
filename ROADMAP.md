# Roadmap

Feature roadmap for Mastra Code UI, informed by the published mastracode harness capabilities and
patterns from [Superset](https://superset.sh/) and [Conductor](https://www.conductor.build/).

Legend: `[x]` done, `[-]` partial, `[ ]` not started

---

## Parallel Agents & Worktrees

Run multiple coding agents simultaneously, each in an isolated Git worktree.

- [ ] **Git worktree isolation** — Create a new worktree + branch per agent task so parallel agents never conflict with each other or the main working tree
- [ ] **Agent dashboard** — Bird's-eye view of all running agents: status, current task, branch, token usage
- [ ] **Wire subagents through Harness config** — Use `HarnessConfig.subagents` and the built-in subagent tool instead of manual tool creation
- [-] **Agent notifications** — Desktop notifications when an agent finishes, errors, or needs approval _(dock badge and in-app audio implemented; `Notification` API imported but not wired up for desktop alerts)_
- [ ] **Agent cost tracking** — Per-agent token usage and cost breakdown across parallel sessions

## Diff Viewer & Code Review

Built-in code review for agent changes without leaving the app.

- [-] **Integrated diff viewer** — Side-by-side and inline diff views with syntax highlighting for agent changes vs main branch _(inline single-file diff exists for working-tree changes; no side-by-side, no branch comparison)_
- [ ] **Turn-by-turn checkpoints** — View changes per agent turn and revert to any previous checkpoint (like Conductor's checkpoint system)
- [ ] **Direct file editing in diff view** — Edit agent changes inline before merging
- [ ] **One-click merge** — Merge agent branch back to main from the UI

## Harness Integration

Use more of the published `@mastra/core/harness` capabilities.

- [ ] **Heartbeat handlers** — Wire `heartbeatHandlers` into Harness config for gateway sync, cache refresh, and periodic cleanup instead of external management
- [-] **Permission system** — Connect `toolCategoryResolver` and use harness permission methods (`grantSessionCategory`, `setPermissionCategory`, `getPermissionRules`) instead of the external permission layer _(full permission engine in `src/permissions.ts` with category resolver and session grants, but it's orphaned — not wired into the harness or UI)_
- [ ] **Observational Memory events** — Call `harness.loadOMProgress()` on thread switch and surface OM events (observation start/end, reflection, buffering, activation) in the UI
- [-] **Available models API** — Use `harness.getAvailableModels()` for the model selector with auth status and usage counts built in _(`hasAuth` is fetched per provider but not rendered in the model selector UI)_
- [ ] **Workspace events** — Listen to `workspace_status_changed`, `workspace_ready`, `workspace_error`, `follow_up_queued` events

## Upstream Harness Gaps

Tracked in [UPSTREAM_HARNESS_GAPS.md](./UPSTREAM_HARNESS_GAPS.md). Key items:

- [ ] `Harness.deleteThread()` — Actually delete threads from storage
- [ ] Extensible `emitEvent` — Custom event types without `as any` casts
- [ ] Typed event payloads — `thread_changed`, `thread_created`, `error` fields
- [ ] `HarnessRequestContext.registerQuestion` / `registerPlanApproval` in published types
- [ ] `HarnessConfig.hookManager`, `mcpManager`, `getToolsets` support

## Task & Context Management

Structured task tracking and context sharing across agents.

- [-] **Task board** — Visual kanban or list view of todos with status, assignee (agent), and dependencies _(read-only todo progress widget exists; no interactive kanban, no assignment or dependency tracking)_
- [-] **Context files** — Persistent markdown specs and plans that live alongside code (like Conductor's context-driven development) _(AGENT.md/CLAUDE.md auto-injected into system prompt via `agent-instructions.ts`; no UI for browsing or editing context files)_
- [-] **Slash commands** — Custom user-defined slash commands for common workflows _(backend loader and processor fully implemented in `slash-command-loader.ts` / `slash-command-processor.ts`; never called from the UI)_
- [ ] **Workspace presets** — Scripted environment setup (install deps, start servers, seed data) that runs automatically when creating a new agent workspace

## IDE & Editor Integration

- [ ] **One-click open in editor** — Deep link any file or worktree to VS Code, Cursor, JetBrains, Sublime, or other editors
- [ ] **Port forwarding** — Manage dev server ports across parallel agent sessions
- [x] **Terminal multiplexing** — Multiple terminal tabs per agent workspace _(multi-tab xterm with node-pty, create/close/switch tabs)_

## MCP & Tool Extensibility

- [-] **MCP server management UI** — Configure, toggle, and monitor MCP servers from the app (user, project, and local scopes) _(backend config management in `src/mcp/` supports all three scopes; no UI to configure or monitor)_
- [ ] **Wire MCP through Harness** — Pass `mcpManager` through `HarnessConfig` instead of external management
- [ ] **Native toolsets** — Wire `getToolsets` through Harness to enable Anthropic native web search and other provider-specific tools
- [-] **Tool confirmation with `always_allow_category`** — Surface the harness's category-level auto-approve in the UI (not just per-call approve/decline) _(permission categories defined and resolvers written; UI only shows per-call approve/decline)_

## Multi-Provider Auth

- [ ] **Google Vertex / Gemini auth** — OAuth flow for Google AI providers
- [ ] **OpenRouter integration** — API key management for OpenRouter models
- [ ] **Bedrock auth** — AWS credential management for Bedrock models
- [-] **Auth status in model selector** — Show login state per provider inline in the model picker (using `harness.getAvailableModels()`) _(`hasAuth` fetched but not displayed in `ModelSelector.tsx`)_

## Platform

- [ ] **Linux support**
- [ ] **Windows support**
- [ ] **Auto-updates** — In-app update mechanism
- [ ] **Workspace sharing** — Export/import workspace configs (scripts, MCP servers, slash commands) via a shared config file
