# Mastra Code: Task Tracker

> Single source of truth for all improvements, features, and tech debt.
> Tasks are grouped by workstream and ordered by dependency (top-to-bottom).

---

## Completed

### Collapsible Tool Outputs (Phase 1)
- [x] Generic collapsible component (`src/tui/components/collapsible.ts`)
- [x] Specialized components: `CollapsibleFileViewer`, `CollapsibleDiffViewer`, `CollapsibleCommandOutput`
- [x] Enhanced tool execution component (`src/tui/components/tool-execution-enhanced.ts`)
- [x] Integration with TUI, Ctrl+E toggle, smart defaults (errors visible, success collapsed)

---

## Workstream 1: System Prompt Engineering

The current agent instructions are ~15 lines. Claude Code's are 3000+. Highest-leverage change.

### 1.1 Create prompt directory structure
- [x] `src/prompts/base.ts` — shared instructions for all modes
- [x] `src/prompts/build.ts` — build mode instructions
- [x] `src/prompts/plan.ts` — plan mode instructions
- [x] `src/prompts/fast.ts` — fast mode instructions

### 1.2 Write base system prompt (~2000 words)
- [x] Tool usage rules (when to use each tool, anti-patterns)
- [x] Coding philosophy (avoid over-engineering, delete unused code, etc.)
- [x] Git workflow (commit protocol, PR protocol, safety rules)
- [x] Communication style (concise, markdown, no emojis unless asked)
- [x] Planning behavior (plan before executing, read before proposing)
- [x] Environment awareness (inject project path, git branch, OS, date)

### 1.3 Write per-mode prompt overrides
- [x] **Build mode**: Full tool access, debugging/error recovery, testing strategy, "make the change, verify it works"
- [x] **Plan mode**: Read-only constraint, exploration strategy, structured plan output with complexity estimate, approval flow
- [x] **Fast mode**: Quick answers, <200 words, skip planning, tool-vs-knowledge guidance

### 1.4 Wire prompts into agent construction
- [x] Replace hardcoded `instructions` in `src/main.ts` with imported prompt builder
- [x] Make `instructions` mode-aware (read mode from harness state)
- [x] Inject dynamic context (project path, git branch, date)

### 1.5 Wire per-mode instructions into mode configs
- [x] Dynamic `instructions` function in agent reads modeId from harness context
- [x] `buildFullPrompt(modeId, promptCtx)` combines base + mode-specific prompt
- [x] Tools also filtered by mode (plan mode gets read-only tools only)

---

## Workstream 2: New Tools (Grep, Glob, Write)

Dedicated search tools instead of shelling out. Second highest-leverage change.

### 2.1 Create Grep tool
- [x] New file: `src/tools/grep.ts`
- [x] Wrap `ripgrep` (rg), fall back to grep
- [x] Input: pattern, path, glob filter, contextLines, maxResults
- [x] Token-aware truncation (like view tool's MAX_VIEW_TOKENS)

### 2.2 Create Glob tool
- [x] New file: `src/tools/glob.ts`
- [x] Use `git ls-files` + glob filter, respect `.gitignore`
- [x] Input: pattern, path
- [x] Output: matching file paths sorted by modification time

### 2.3 Create Write tool
- [x] New file: `src/tools/write.ts`
- [x] Create new files or overwrite entire files
- [x] Guards: refuse paths outside project root, auto-create parent dirs

### 2.4 Improve existing tool descriptions
- [x] `src/tools/file-view.ts` — usage notes with when to use, when NOT to use
- [x] `src/tools/shell.ts` — usage notes: git/npm/docker, NOT for file read/search
- [x] `src/tools/string-replace-lsp.ts` — must read first, exact match, LSP diagnostics

---

## Workstream 3: Subagent / Task System

Let the main agent delegate work to child agents, keeping main context clean.

### 3.1 Design subagent architecture
- [ ] Separate Mastra Agent instances with own context
- [ ] Subset of tools per subagent type
- [ ] Return single text result to parent
- [ ] Support parallel execution

### 3.2 Create Explore subagent
- [ ] New file: `src/agents/explore.ts`
- [ ] Tools: view, grep, glob (read-only)
- [ ] Returns concise summary of findings

### 3.3 Create Plan subagent
- [ ] New file: `src/agents/plan.ts`
- [ ] Tools: view, grep, glob (read-only)
- [ ] Produces step-by-step implementation plan

### 3.4 Create task meta-tool
- [ ] New file: `src/tools/task.ts`
- [ ] Input: description, agentType (explore/plan/bash), prompt
- [ ] Spawns subagent with fresh thread, returns result

### 3.5 Integrate subagent results into stream
- [ ] Emit `subagent_start`/`subagent_end` events from harness
- [ ] TUI shows collapsible section for subagent work

---

## Workstream 4: Real Plan Mode

Currently plan/build/fast are just model-selection presets. Plan mode needs behavioral constraints.

### 4.1 Mode-specific tool filtering
- [ ] Plan mode: only view, grep, glob, task tools
- [ ] Fast mode: all tools except task
- [ ] Build mode: all tools

### 4.2 Plan mode state in harness
- [ ] Add to state: `planModeActive`, `currentPlan`, `planApproved`
- [ ] Add methods: `enterPlanMode()`, `exitPlanMode()`, `approvePlan()`, `rejectPlan()`

### 4.3 Plan approval UX in TUI
- [ ] Show plan in scrollable view when agent calls `exitPlanMode`
- [ ] Prompt: "Approve this plan? (y/n/edit)"
- [ ] On approve: switch to build mode with plan context

### 4.4 Auto-enter plan mode for complex tasks
- [ ] Heuristic: >3 files or architectural decisions → plan mode
- [ ] `enter_plan_mode` tool the agent can call

---

## Workstream 5: TodoWrite / Task Tracking

Give the agent a tool to create visible task lists for multi-step work.

### 5.1 Create TodoWrite tool
- [ ] New file: `src/tools/todo.ts`
- [ ] Input: array of `{ content, status }` items
- [ ] Stores in harness state, emits `todo_updated` event

### 5.2 Todo display in TUI
- [ ] Subscribe to `todo_updated` events
- [ ] Render: checkmarks (completed), spinner (in-progress), dash (pending)

### 5.3 Persist todos per thread
- [ ] Store in thread metadata, load on resume

---

## Workstream 6: Granular Permissions

Replace binary YOLO mode with category-based permission system.

### 6.1 Define permission categories
- [ ] New file: `src/permissions.ts`
- [ ] Categories: read (always), edit (ask), execute (ask), execute_safe (auto), execute_dangerous (always ask)
- [ ] Settings: `always_allow`, `ask`, `always_deny`

### 6.2 Permission checking in harness
- [ ] Categorize tool calls instead of binary YOLO check
- [ ] Parse shell commands to determine risk level
- [ ] Persist per thread

### 6.3 Permission UI
- [ ] `/permissions` slash command
- [ ] "Always allow [category]" option in approval dialog
- [ ] Lock/unlock icon in status bar

### 6.4 Session-scoped permission grants
- [ ] Store approved categories for session
- [ ] Reset on thread switch or restart

---

## Workstream 7: Quick Wins

Small improvements, can be done independently.

### 7.1 File path + line count in view tool output
- [ ] Prepend output with `{path} ({lineCount} lines)`

### 7.2 Truncation message
- [ ] Append `... {N} lines truncated. Use view_range to see specific sections.`

### 7.3 Safety guardrails for execute_command
- [ ] Expand description with safety rules
- [ ] Pattern-match dangerous commands, require confirmation

### 7.4 Auto-inject environment context into system prompt
- [ ] Working directory, git branch, platform, date (data already in state schema)

### 7.5 Token count in status bar
- [ ] Show cumulative prompt/completion tokens (already tracked in harness)

### 7.6 Default YOLO to false
- [ ] Change `yolo: z.boolean().default(true)` to `default(false)`

---

## UI/UX Ideas (Future)

- [ ] Status bar with mode/model/tokens
- [ ] Side panel for file tree/changes (Ctrl+B)
- [ ] Command palette with fuzzy search (Ctrl+P)
- [ ] Multi-pane view for comparing files
- [ ] Syntax highlighting improvements
- [ ] Rich markdown rendering
- [ ] Progress bars for long operations
- [ ] Staged changes preview before applying
- [ ] Checkpoint/rollback system
- [ ] Interactive refinement ("Review changes file by file" / "Apply all" / "Modify plan")

## Performance Ideas (Future)

- [ ] File caching layer (hot files, dependency graph, symbol index)
- [ ] Incremental processing (only re-analyze changed files)
- [ ] Parallel file operations
- [ ] Semantic code search / jump to definition / find references
- [ ] Operation batching (batch multiple edits into single operation)

## Tech Debt

- [ ] Migrate custom tools to Mastra workspace tools
- [ ] Improve error handling and recovery
- [ ] Add comprehensive testing
- [ ] Document the codebase
- [ ] Standardize tool output formats

---

## Suggested Execution Order

```
Phase A — Foundation (do first)
  1.1 → 1.2 → 1.4 → 1.5    System prompt
  2.1 → 2.2 → 2.3 → 2.4    New tools
  7.1 → 7.2 → 7.3 → 7.4    Quick wins (parallel)

Phase B — Intelligence
  3.1 → 3.2 → 3.3 → 3.4    Subagent system
  5.1 → 5.2 → 5.3           TodoWrite
  1.3                        Per-mode prompts

Phase C — Workflow
  4.1 → 4.2 → 4.3 → 4.4    Real plan mode
  6.1 → 6.2 → 6.3 → 6.4    Granular permissions
  7.5 → 7.6                 Remaining quick wins
```

## Key Files Reference

| File | Purpose | Changes Needed |
|------|---------|---------------|
| `src/main.ts` | Agent setup, mode config, tools | Prompt wiring, tool additions, mode filtering |
| `src/harness/harness.ts` | Core orchestration, events, state | Plan mode, permissions, todo, subagent events |
| `src/harness/types.ts` | Type definitions, event types | New events, plan mode state |
| `src/tools/file-view.ts` | View tool | Better descriptions, truncation |
| `src/tools/shell.ts` | Execute command | Safety guardrails, better description |
| `src/tools/string-replace-lsp.ts` | Edit tool | Better description |
| `src/tui/mastra-tui.ts` | Terminal UI | Todo display, plan approval, permissions |
| `src/prompts/*.ts` | System prompts | **New** |
| `src/tools/grep.ts` | Grep tool | **New** |
| `src/tools/glob.ts` | Glob tool | **New** |
| `src/tools/write.ts` | Write tool | **New** |
| `src/tools/todo.ts` | TodoWrite tool | **New** |
| `src/tools/task.ts` | Subagent task tool | **New** |
| `src/agents/explore.ts` | Explore subagent | **New** |
| `src/agents/plan.ts` | Plan subagent | **New** |
| `src/permissions.ts` | Permission categories | **New** |
