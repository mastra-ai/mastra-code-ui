# Custom Slash Commands

Create custom slash commands by adding `.md` files to this directory.

## Skills Commands

This directory also includes skills-related commands:

- `//skills:install <url>` - Install skills from a GitHub URL
- `//skills:list` - List all installed skills

Skills are automatically discovered from these locations (priority order):

1. `.mastracode/skills/` (project-local)
2. `.claude/skills/` (project-local, Claude Code compatible)
3. `~/.mastracode/skills/` (user-wide)
4. `~/.claude/skills/` (user-wide, Claude Code compatible)

## File Format

Each command file uses YAML frontmatter for metadata and markdown content for the template:

```markdown
---
name: mycommand
description: Does something useful
---

Your command template here.
Use $ARGUMENTS for all arguments.
Use $1, $2, etc. for positional arguments.
Include file content with @filename.
Run shell commands with !`command`.
```

## Examples

### Simple command with arguments

```markdown
---
name: explain
description: Explain a concept
---

Please explain: $ARGUMENTS
```

### File content inclusion

```markdown
---
name: review
description: Review a file
---

Please review this file:

@src/main.ts
```

### Shell command output

```markdown
---
name: gitstatus
description: Show git status context
---

Current git status:

!`git status`

Please analyze any issues.
```

### Combined example

```markdown
---
name: analyze
description: Analyze git changes
---

I'm working on: $1

Recent commits:
!`git log --oneline -5`

Changed files:
!`git diff --name-only HEAD~1`

Please analyze the changes.
```

## Namespacing

Use subdirectories for namespaced commands:

- `.mastracode/commands/git/commit.md` → `/git:commit`
- `.mastracode/commands/docs/readme.md` → `/docs:readme`

## Command Locations (Priority Order)

Commands are loaded from multiple locations, with later locations taking precedence:

1. `~/.opencode/command/` - User-wide opencode commands
2. `~/.mastracode/commands/` - User-wide mastra commands
3. `.opencode/command/` - Project-specific opencode commands
4. `.mastracode/commands/` - Project-specific mastra commands (highest priority)

This means mastra commands override opencode commands, and project-specific commands override user-wide commands.
