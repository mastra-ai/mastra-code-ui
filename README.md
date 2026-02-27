# Mastra Code

A desktop coding agent built with [Mastra](https://mastra.ai) and Electron.

## Features

- **Multi-model support** - Claude, GPT, Gemini, and 70+ other models via Mastra's unified model router
- **OAuth login** - Authenticate with Anthropic (Claude Max) and OpenAI (ChatGPT Plus/Codex)
- **Persistent conversations** - Threads saved per-project, resume automatically across clones and worktrees
- **Coding tools** - File viewing, AST-aware smart editing, grep, glob, shell execution, web search, and more
- **MCP support** - Connect external tool servers via Model Context Protocol with per-project or global config
- **Permission system** - Granular allow/ask/deny policies per tool category (read, edit, execute, MCP) with YOLO mode
- **Linear integration** - Kanban board with issue tracking, status updates, and worktree linking
- **Git worktree management** - Isolated sessions per worktree with automatic project detection
- **Observational memory** - Observer/reflector models extract and synthesize context from conversations
- **Subagent execution** - Spawn nested agents for parallel task execution
- **Token tracking** - Persistent token counts per thread
- **Multi-panel IDE** - Chat, file explorer, git panel, embedded terminal, and multi-thread tabs

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
│                   Electron Desktop App                       │
│               (React + IPC + node-pty)                       │
├──────────────────────────────────────────────────────────────┤
│                    Permission System                         │
│  - Per-category policies (read, edit, execute, mcp)          │
│  - Session grants and YOLO mode                              │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                        Harness                               │
│  (@mastra/core/harness)                                      │
│  - Mode management (plan, build, fast)                       │
│  - Thread/message persistence                                │
│  - Event system for UI updates                               │
│  - State management with Zod schemas                         │
│  - Observational memory (observer + reflector)               │
└──────────┬───────────────────────────────┬───────────────────┘
           │                               │
           ▼                               ▼
┌────────────────────────┐   ┌─────────────────────────────────┐
│      Mastra Agent      │   │          MCP Manager             │
│  - Dynamic model       │   │  - Server lifecycle              │
│  - Tool execution      │   │  - Tool namespacing              │
│  - Subagent spawning   │   │  - Per-project/global config     │
│  - Memory integration  │   │                                  │
└──────────┬─────────────┘   └─────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────────┐
│                      LibSQL Storage                          │
│  - Thread persistence                                        │
│  - Message history                                           │
│  - Token usage tracking                                      │
└──────────────────────────────────────────────────────────────┘
```

The Electron main process instantiates the Harness and communicates with the React renderer over IPC. Each worktree gets an isolated session with its own state, MCP connections, and permission grants.

## Development

```bash
pnpm dev          # run with hot-reload
pnpm build        # production build
pnpm package      # build DMGs (arm64 + x64)
pnpm typecheck    # type check
pnpm test         # run tests (vitest)
pnpm format       # format with prettier
```

## Credits

- [Mastra](https://mastra.ai) - AI agent framework
- [OpenCode](https://github.com/sst/opencode) - OAuth provider patterns

## License

Apache-2.0
