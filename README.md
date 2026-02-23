# Mastra Code

A desktop coding agent built with [Mastra](https://mastra.ai) and Electron.

## Features

- **Multi-model support** - Use Claude, GPT, Gemini, and 70+ other models via Mastra's unified model router
- **OAuth login** - Authenticate with Anthropic (Claude Max) and OpenAI (ChatGPT Plus/Codex)
- **Persistent conversations** - Threads are saved per-project and resume automatically
- **Coding tools** - View files, edit code, run shell commands
- **Token tracking** - Monitor usage with persistent token counts per thread
- **Multi-panel IDE** - Chat, file explorer, git panel, embedded terminal, and multi-thread tabs

## Installation

```bash
git clone https://github.com/mastra-ai/mastra-code.git
cd mastra-code
pnpm install
```

## Usage

```bash
pnpm dev       # launch with hot-reload
pnpm build     # production build
pnpm preview   # preview production build
```

On first launch, use the login flow to authenticate with your AI providers.

## Configuration

### Project-based threads

Threads are automatically scoped to your project based on:

1. Git remote URL (if available)
2. Absolute path (fallback)

This means conversations are shared across clones, worktrees, and SSH/HTTPS URLs of the same repository.

### Database location

The SQLite database is stored in your system's application data directory:

- **macOS**: `~/Library/Application Support/mastra-code/`
- **Linux**: `~/.local/share/mastra-code/`
- **Windows**: `%APPDATA%/mastra-code/`

### Authentication

OAuth credentials are stored alongside the database in `auth.json`.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                   Electron Desktop App                       │
│               (React + IPC + node-pty)                       │
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
└──────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                      Mastra Agent                            │
│  - Dynamic model selection                                   │
│  - Tool execution (view, edit, bash)                         │
│  - Memory integration                                        │
└──────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                      LibSQL Storage                          │
│  - Thread persistence                                        │
│  - Message history                                           │
│  - Token usage tracking                                      │
└──────────────────────────────────────────────────────────────┘
```

The Electron main process instantiates the Harness and communicates with the React renderer over IPC. Changes to tools, modes, or providers are picked up automatically.

See [src/electron/README.md](src/electron/README.md) for detailed architecture notes.

## Development

```bash
pnpm dev          # run with hot-reload
pnpm build        # production build
pnpm typecheck    # type check
pnpm test         # run tests
pnpm format       # format with prettier
```

## Credits

- [Mastra](https://mastra.ai) - AI agent framework
- [OpenCode](https://github.com/sst/opencode) - OAuth provider patterns

## License

Apache-2.0
