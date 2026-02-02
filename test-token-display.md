# Testing Token Usage Display

## Test Steps

1. Start mastra-code
2. Send a message to the agent (e.g., "Hello, how are you?")
3. After the response completes, check the status bar for token usage display
   - Should show format: `[input/output]` after the model name
   - Numbers should have comma formatting for thousands
4. Run `/cost` command and verify the numbers match
5. Run `/new` to start a new thread
   - Token usage should reset to 0 (not displayed)
6. Send another message and verify token usage starts fresh

## Expected Results

- Token usage appears in status bar: `anthropic/claude-3-5-sonnet-20241022 [123/456]`
- Only shows when tokens > 0
- Matches `/cost` command output
- Resets properly with `/new` command