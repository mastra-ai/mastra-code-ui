---
name: example-skill
description: An example skill to demonstrate the skills system
version: 1.0.0
tags:
  - example
---

# Example Skill

This is an example skill. Skills are automatically discovered from these locations (priority order):
1. `.mastracode/skills/` (project-local mastra-code)
2. `.claude/skills/` (project-local Claude Code compatible)
3. `~/.mastracode/skills/` (user-wide mastra-code)
4. `~/.claude/skills/` (user-wide Claude Code)

## How to use

When this skill is activated, follow these instructions:
1. Greet the user
2. Explain what skills are
3. Point them to the Agent Skills specification at https://agentskills.io
