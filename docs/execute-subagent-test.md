# Execute Subagent Testing Guide

The execute subagent is now available in Mastra Code! It has full write and execution capabilities, making it suitable for implementing features, fixing bugs, and performing complex coding tasks.

## What is the Execute Subagent?

The execute subagent is a specialized agent type that can:
- Create and edit files (`string_replace_lsp`, `write_file`)
- Execute commands (`execute_command`)
- Track tasks with todo lists (`todo_write`, `todo_check`)
- Read and search code (`view`, `search_content`, `find_files`)

## How to Use It

In the Mastra Code CLI, use the `/subagent` command with the `execute` type:

```
/subagent execute <task description>
```

## Example Tasks

### 1. Simple Script Creation
```
/subagent execute Create a Python script called hello.py that prints "Hello from the execute subagent!" and run it to verify it works.
```

### 2. Utility Module with Tests
```
/subagent execute Create a TypeScript utility module called string-utils.ts with functions to capitalize, reverse, and count words in a string. Also create a test file that verifies these functions work correctly.
```

### 3. Bug Fix Task
```
/subagent execute Find and fix the issue where token usage is showing 0 for input and output tokens in the TUI display. The total usage should be calculated correctly.
```

### 4. Feature Implementation
```
/subagent execute Add a new slash command called /stats that displays statistics about the current coding session including number of files edited, commands run, and time elapsed.
```

## Key Differences from Other Subagent Types

- **explore**: Read-only, for investigating code
- **plan**: Read-only, for creating implementation plans
- **execute**: Full capabilities, can modify files and run commands

## Testing the Execute Subagent

To verify the execute subagent is working correctly:

1. Start Mastra Code CLI
2. Select a model using `/models`
3. Run one of the example tasks above
4. Observe that the subagent:
   - Creates a todo list for the task
   - Works through each step
   - Creates/modifies files as needed
   - Runs commands to verify the work
   - Marks todos as completed
   - Returns a summary of what was accomplished

## Implementation Details

The execute subagent is defined in `src/agents/execute.ts` and has access to:
- `view` - Read files and directories
- `search_content` - Search file contents
- `find_files` - Find files by pattern
- `string_replace_lsp` - Edit files
- `write_file` - Create new files
- `execute_command` - Run shell commands
- `todo_write` - Create task lists
- `todo_check` - Verify task completion

The subagent configuration is in `src/main.ts` where tools are passed to the subagent factory.