# Project Architecture Blueprint

## 1) System Overview

- Desktop app: Electron + React renderer + TypeScript backend.
- Core orchestration: `Harness` + `Agent` + mode-specific prompt system.
- Extensibility: MCP servers, hooks, slash commands, skills.

## 2) Component Map

- `src/electron/main.ts`: process lifecycle, IPC router, session/worktree manager, integrations bootstrap.
- `src/renderer/*`: UI shell (chat, settings, project/worktree panels).
- `src/prompts/*`: base + mode prompts + AGENTS/CLAUDE instruction injection.
- `src/mcp/*`: global/project MCP config merge + runtime client orchestration.
- `src/hooks/*`: lifecycle hook execution pipeline.
- `src/tools/*`: tool adapters used by harness.

## 3) Data/Control Flow

1. App startup -> create session -> init harness.
2. Renderer sends command via preload bridge -> `ipcMain.handle("harness:command")`.
3. Main process executes command against harness/MCP/hooks/tools.
4. Events stream back via `harness:event` channel.

## 4) New Bootstrap Integration Layer

- Build time:
  - `scripts/build-opencode-bundle.js` snapshots curated integration dirs.
  - Bundle lands at `resources/opencode-bundle`.
  - Electron builder ships it as `opencode-bundle` resource.
- Runtime:
  - `installBundledOpencodeStack()` copies resources into home dir.
  - Marker `~/.mastracode/opencode-bootstrap.json` prevents redundant install per app version.
  - Manual repair available via `installBundledIntegrations` IPC command.

## 5) Architectural Constraints

- Do not mutate existing user sessions/history in bundle snapshot.
- Keep heavy volatile dirs excluded from DMG payload.
- Ensure scripts retain execute bits after deployment.

## 6) Extension Points

- Add more bootstrap targets in `SOURCES` list (`build-opencode-bundle.js`).
- Add post-install health commands from UI command handler.
- Add per-target install strategy (merge/overwrite) in `installBundledOpencodeStack`.
