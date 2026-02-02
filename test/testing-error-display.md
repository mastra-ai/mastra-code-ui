# Testing the Enhanced Error Display

This guide shows how to test the enhanced error display component in Mastra Code.

## Prerequisites

Make sure Mastra Code is running and you're in the project directory.

## Test Scenarios

### 1. Command Execution Errors

Test basic command errors:

```bash
# This will show a simple command not found error
execute_command nonexistentcommand

# This will show a permission denied error (on Unix-like systems)
execute_command chmod +x /etc/passwd

# This will show a timeout error (simulated)
execute_command sleep 60
```

Test with our error scenarios script:

```bash
# Test different error types
execute_command node test/test-error-scenarios.js 1   # Simple error with stack
execute_command node test/test-error-scenarios.js 2   # TypeError with nested calls
execute_command node test/test-error-scenarios.js 3   # ReferenceError
execute_command node test/test-error-scenarios.js 4   # Custom error with code
execute_command node test/test-error-scenarios.js 6   # JSON parse error
execute_command node test/test-error-scenarios.js 7   # File system error
```

### 2. File Operation Errors

Test file reading errors:

```bash
# Try to read a non-existent file
view /path/to/nonexistent/file.txt

# Try to read a directory as a file
view /usr

# Try to view with invalid range
view package.json -1000 2000
```

Test file writing errors:

```bash
# Try to write to a protected location (Unix-like systems)
write_file /etc/protected-file.txt "test content"

# Try to write with invalid path
write_file /nonexistent/directory/file.txt "test"
```

Test file editing errors:

```bash
# Try to edit a non-existent file
string_replace_lsp /nonexistent.txt "old" "new"

# Try to replace non-existent text
string_replace_lsp package.json "this text does not exist in the file" "new text"

# Try to edit with syntax errors
string_replace_lsp test/syntax-error.ts "function processUser(user: User {" "function processUser(user: User) {"
```

### 3. TypeScript/LSP Errors

When you fix the syntax error above, you'll see LSP diagnostics if there are type errors:

```bash
# This file has TypeScript errors
view test/syntax-error.ts

# Try to introduce a type error
string_replace_lsp package.json '"version": "0.1.0"' '"version": 123'
```

### 4. Testing Error Display Features

#### Collapsible Stack Traces

1. Run a command that generates an error with a stack trace:
   ```bash
   execute_command node test/test-error-scenarios.js 1
   ```

2. The stack trace should be:
   - Displayed in a collapsible section
   - Automatically expanded for errors
   - Syntax highlighted with colors

3. Try collapsing/expanding with Enter or Space

#### Error Formatting

Check that errors display:
- Error type in bold red (e.g., "Error:", "TypeError:")
- File paths in gray
- Line numbers in yellow
- Function names in blue
- Error message clearly visible

#### Error Context

Some errors may show code context:
- Lines before and after the error
- Error line highlighted
- Line numbers on the left

### 5. Testing with Real Commands

Try these real-world scenarios:

```bash
# NPM errors
execute_command npm install nonexistent-package-12345

# Git errors  
execute_command git clone https://invalid-url.com/repo.git

# TypeScript compilation errors
execute_command npx tsc --noEmit test/syntax-error.ts

# Permission errors
execute_command rm -rf /System  # Will fail with permission error
```

### 6. Visual Inspection Checklist

When an error appears, check:

- [ ] Error box has dark red background (`toolErrorBg`)
- [ ] Error type/name is prominently displayed
- [ ] Stack trace is collapsible
- [ ] Syntax highlighting works in stack trace
- [ ] File paths are shortened (home -> ~)
- [ ] Error indicator (✗) appears in header
- [ ] Error auto-expands on first display
- [ ] Can collapse/expand with keyboard
- [ ] Long stack traces are truncated appropriately

### 7. Edge Cases

Test these edge cases:

```bash
# Very long error message
execute_command node -e "throw new Error('${'A'.repeat(500)}')"

# No stack trace
execute_command node -e "console.error('Simple error'); process.exit(1)"

# Multiple errors
execute_command node -e "console.error('Error 1'); console.error('Error 2'); throw new Error('Error 3')"

# Non-English characters
execute_command node -e "throw new Error('エラー: 接続できません')"
```

## Cleanup

After testing, clean up test files:

```bash
rm -rf test/
```

## Notes

- The enhanced error display should make errors more readable and actionable
- Stack traces help identify where errors occurred
- Collapsible sections keep the UI clean
- Syntax highlighting improves readability
- Error context helps understand the problem quickly