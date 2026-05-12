# MastraCode

A desktop coding agent. Open a folder, connect a provider, and the agent reads, edits, and runs code from there. Built on [Mastra](https://mastra.ai) and Electron.

## Features

- **Multi-model support** - Claude, GPT, Gemini, and 70+ other models via Mastra's unified model router
- **OAuth login** - Authenticate with Anthropic (Claude Max) and OpenAI (ChatGPT Plus/Codex)
- **Persistent conversations** - Threads saved per-project, resume automatically across clones and worktrees
- **Coding tools** - File viewing, AST-aware smart editing, grep, glob, shell execution, web search, and more
- **MCP support** - Connect external tool servers via Model Context Protocol with per-project or global config
- **Permission system** - Granular allow/ask/deny policies per tool category (read, edit, execute, MCP) with YOLO mode
- **Linear integration** - Kanban board with issue tracking, status updates, and worktree linking
- **GitHub integration** - Issue linking, PR generation, and API access
- **Git worktree management** - Isolated sessions per worktree with automatic project detection
- **Observational memory** - Observer/reflector models extract and synthesize context from conversations
- **Subagent execution** - Spawn nested agents for parallel task execution
- **Token tracking** - Persistent token counts and cost estimates per thread
- **Multi-panel IDE** - Chat, file explorer, git panel, embedded terminal, diff viewer, and multi-thread tabs
- **Slash commands** - Custom commands loaded from project and global config directories
- **Desktop notifications** - Native alerts for agent completion, tool approval, and errors

## Installation

```bash
git clone https://github.com/mastra-ai/mastra-code-ui.git
cd mastra-code-ui
pnpm install
```

## Usage

```bash
pnpm dev       # launch with hot-reload
pnpm build     # production build
pnpm preview   # preview production build
pnpm package   # build DMGs for macOS (arm64 + x64)
```

On first launch, use the login flow to authenticate with your AI providers.

## Configuration

### Project-based threads

Threads are automatically scoped to your project based on:

1. Git remote URL (if available)
2. Absolute path (fallback)

This means conversations are shared across clones, worktrees, and SSH/HTTPS URLs of the same repository.

### Database

The LibSQL database is stored in the platform-specific application data directory:

- **Dev** (`pnpm dev`): `~/Library/Application Support/mastra-code-dev/mastra.db`
- **Production** (packaged app): `~/Library/Application Support/mastra-code/mastra.db`

Override with:

- `MASTRA_DB_PATH` environment variable
- `MASTRA_DB_URL` + `MASTRA_DB_AUTH_TOKEN` for remote databases
- Project-level `.mastracode/database.json`
- Global `~/.mastracode/database.json`

### MCP Servers

MCP servers can be configured per-project (`.mastracode/mcp.json`) or globally (`~/.mastracode/mcp.json`). Tools from MCP servers are automatically namespaced as `serverName_toolName` and integrated into the permission system.

### Permissions

Tool permissions are configured per category:

| Category | Default | Covers               |
| -------- | ------- | -------------------- |
| read     | allow   | File search, viewing |
| edit     | ask     | File modification    |
| execute  | ask     | Shell commands       |
| mcp      | ask     | External MCP tools   |

Enable **YOLO mode** in Settings to auto-approve all tool calls.

### Authentication

OAuth credentials are stored alongside the database in `auth.json`.

### Settings

Accessible from the app UI:

- **Notifications** - Off, bell, system, or both
- **Extended thinking** - Off, minimal, low, medium, high
- **Smart editing** - AST-aware code edits
- **Observer/Reflector models** - Configure memory extraction models and token thresholds
- **PR instructions** - Custom instructions for pull request generation
- **MCP servers** - Add, remove, reload, and monitor server connections

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                       React Renderer                         │
│   Chat, FileEditor, DiffEditor, Terminal, TaskBoard, etc.    │
│                   (src/renderer/)                             │
└──────────────────────────┬───────────────────────────────────┘
                           │ IPC (window.api)
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                  Electron Main Process                        │
│                    (src/electron/)                            │
│                                                              │
│  ┌────────────────────┐  ┌───────────────────────────────┐   │
│  │   IPC Dispatcher   │  │    ElectronStateManager       │   │
│  │  14 handler files  │  │  Linear/GitHub integration    │   │
│  │  (src/electron/    │  │  state per session            │   │
│  │   ipc/)            │  │  (src/electron/               │   │
│  │                    │  │   electron-state.ts)           │   │
│  └────────────────────┘  └───────────────────────────────┘   │
│                                                              │
│  Window management · PTY terminals · Desktop notifications   │
│  Permission UI · Event bridging · Session lifecycle          │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                   createMastraCode()                          │
│                    (mastracode pkg)                           │
│                                                              │
│  Returns: { harness, mcpManager, hookManager, authStorage }  │
│                                                              │
│  Handles internally:                                         │
│  - Agent creation with dynamic model/tools/memory/workspace  │
│  - Auth storage + OAuth provider wiring                      │
│  - LibSQL storage for threads/messages/tokens                │
│  - Tool registration (file, grep, glob, shell, web, etc.)    │
│  - MCP server lifecycle and tool namespacing                 │
│  - Hook manager for pre/post tool execution                  │
│  - Mode management (plan, build, fast)                       │
│  - Observational memory (observer + reflector)               │
│  - LSP workspace integration                                 │
│  - Subagent spawning                                         │
└──────────────────────────┬───────────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
┌──────────────────────┐  ┌─────────────────────────────────┐
│     Harness           │  │          MCP Manager             │
│  (@mastra/core)       │  │  - Server lifecycle              │
│  - Thread persistence │  │  - Tool namespacing              │
│  - Event system       │  │  - Per-project/global config     │
│  - State management   │  │                                  │
│  - Mode switching     │  │                                  │
└───────────────────────┘  └─────────────────────────────────┘
```

The Electron main process calls `createMastraCode()` from the `mastracode` package, which returns a fully configured Harness with agent, tools, storage, MCP, and auth already wired up. The Electron layer is a thin shell that adds window management, IPC routing, PTY terminals, desktop notifications, and integration state (Linear/GitHub) on top.

Each worktree gets an isolated session with its own Harness instance, MCP connections, ElectronState, and permission grants.

### Source layout

```
src/
├── electron/              Main process
│   ├── main.ts            App lifecycle, createHarness via createMastraCode
│   ├── electron-state.ts  Per-session state for Linear/GitHub integrations
│   ├── helpers.ts         Auth, thread title generation, thread deletion
│   ├── notifications.ts   Native desktop notifications
│   └── ipc/               IPC command handlers (14 files)
│       ├── harness-handlers.ts      Messages, threads, modes, models, state
│       ├── project-handlers.ts      Project switching, worktree management
│       ├── integration-handlers.ts  Linear/GitHub connect, link, query
│       ├── dashboard-handlers.ts    Agent dashboard data aggregation
│       ├── settings-handlers.ts     Thinking level, notifications, smart editing
│       ├── permission-handlers.ts   Tool approval, YOLO mode
│       ├── auth-handlers.ts         OAuth login flows
│       ├── git-handlers.ts          Git status, diff, branches
│       ├── file-handlers.ts         File reading for editor panels
│       ├── context-handlers.ts      Context/file attachment
│       ├── mcp-handlers.ts          MCP server management
│       ├── pty-handlers.ts          Terminal sessions via node-pty
│       ├── slash-command-handlers.ts Custom command loading
│       └── types.ts                 Shared types
│
├── renderer/              React UI (Vite + React 19)
│   ├── App.tsx            Root layout, state, keyboard shortcuts
│   ├── main.tsx           Entry point
│   ├── components/        37 components + subdirectories
│   │   ├── ChatView.tsx           Streaming chat with tool executions
│   │   ├── FileEditor.tsx         Syntax-highlighted file viewer
│   │   ├── DiffEditor.tsx         Side-by-side diff viewer
│   │   ├── TerminalPanel.tsx      xterm.js terminal
│   │   ├── FileTree.tsx           Project file explorer
│   │   ├── GitPanel.tsx           Git status and changes
│   │   ├── TaskBoard.tsx          Linear/GitHub issue kanban
│   │   ├── AgentDashboard.tsx     Multi-agent monitoring
│   │   ├── Settings.tsx           App settings panel
│   │   ├── ModelSelector.tsx      Model picker with auth status
│   │   ├── CommandPalette.tsx     Cmd+K command palette
│   │   └── ...
│   ├── hooks/             Custom React hooks
│   │   ├── useChatReducer.ts      Chat state machine
│   │   ├── useHarnessEvents.ts    IPC event subscription
│   │   ├── useLinearApi.ts        Linear API client
│   │   ├── useGithubApi.ts        GitHub API client
│   │   └── ...
│   ├── types/             TypeScript type definitions
│   └── styles/            CSS
│
├── permissions.ts         Tool permission system (categories, policies, YOLO)
└── utils/                 Shared utilities
    ├── project.ts         Git detection, app data paths
    ├── cost.ts            Token cost estimation
    ├── recent-projects.ts Recent project tracking
    └── ...
```

## Development

```bash
pnpm dev          # run with hot-reload
pnpm build        # production build
pnpm package      # build DMGs (arm64 + x64)
pnpm typecheck    # type check
pnpm test         # run tests (vitest)
pnpm format       # format with prettier
```

### Keyboard shortcuts

| Shortcut      | Action          |
| ------------- | --------------- |
| `Cmd+N`       | New thread      |
| `Cmd+O`       | Open project    |
| `Cmd+B`       | Toggle sidebar  |
| `` Cmd+` ``   | Toggle terminal |
| `Cmd+Shift+E` | Toggle explorer |
| `Cmd+Shift+G` | Git changes     |

## Credits

- [Mastra](https://mastra.ai) - AI agent framework
- [OpenCode](https://github.com/sst/opencode) - OAuth provider patterns

## License

Apache-2.0
