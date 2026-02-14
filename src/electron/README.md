# Mastra Code — Electron App

The Electron app is a native macOS desktop frontend for Mastra Code. It wraps the shared [Harness](../harness/) layer in a multi-panel IDE-style interface built with React.

## Architecture

```
src/electron/main.ts    Electron main process — bootstraps the Harness, handles IPC
src/electron/preload.ts Context bridge — exposes a safe `window.api` to the renderer
src/renderer/            React UI (Vite + React)
```

The Electron app does **not** fork or duplicate the Harness. It imports `Harness` from `src/harness/` and communicates with it over IPC, the same way the TUI instantiates it directly. Any improvements to the Harness (new tools, modes, providers) are automatically available in both frontends.

### How it extends the Harness

The Electron layer adds a thin IPC bridge on top of the Harness's public API:

- **`main.ts`** instantiates `Harness`, subscribes to its events, and exposes commands (`sendMessage`, `createThread`, `deleteThread`, `switchThread`, `listThreads`, etc.) via `ipcMain.handle`.
- **`preload.ts`** exposes `window.api.invoke(command)` and `window.api.onEvent(callback)` to the renderer process.
- **Renderer** (`src/renderer/`) is a standalone React app that calls `window.api` — it has no direct dependency on Node or the Harness.

The only Harness modifications made for Electron are generic capabilities (deferred thread metadata, `deleteThread`) that the TUI can also use.

## Running

```bash
# Development (hot-reload)
pnpm dev:electron

# Production build
pnpm build:electron
pnpm preview:electron
```

## Renderer UI

The React frontend lives in `src/renderer/` and provides:

- **Chat view** — streaming messages, tool approvals, plan approvals, subagent display
- **Multi-thread tabs** — open multiple conversation threads as tabs
- **File explorer** — browse project files, open in editor
- **File/diff editor** — syntax-highlighted code viewer with diff support
- **Git panel** — branch info, staged/unstaged changes, diffs
- **Embedded terminal** — PTY-backed terminal via `node-pty`
- **Model selector** — switch models on the fly
- **Project switcher** — load different worktrees/projects

## Key files

| File                            | Purpose                                                  |
| ------------------------------- | -------------------------------------------------------- |
| `main.ts`                       | Electron main process, IPC handlers, Harness bootstrap   |
| `preload.ts`                    | Context bridge (`window.api`)                            |
| `../renderer/App.tsx`           | Root layout — sidebar, tabs, chat, panels                |
| `../renderer/components/`       | All UI components (ChatView, FileTree, DiffEditor, etc.) |
| `../../electron.vite.config.ts` | Build config for main, preload, and renderer             |
| `../../resources/icon.png`      | App icon (also `.icns` and `.svg`)                       |
