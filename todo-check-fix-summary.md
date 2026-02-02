# Todo Check State Synchronization Fix

## Problem

The `todo_check` tool was showing stale todo state (e.g., "3/3 completed") even after clearing or updating todos with `todo_write`. This was happening because:

1. When the agent starts streaming, it creates a `HarnessRuntimeContext` with a snapshot of the current state
2. This context is passed to all tools via the request context
3. The `state` property in the context is a static snapshot created at stream start
4. Any state changes made during the stream (like updating todos) aren't reflected in this snapshot

## Solution Implemented

### 1. Added `getState()` method to HarnessRuntimeContext interface

- File: `src/harness/types.ts`
- Added a new method `getState: () => z.infer<TState>` that returns live state
- Kept the original `state` property for backward compatibility

### 2. Updated buildRequestContext to provide getState function

- File: `src/harness/harness.ts`
- Modified the `buildRequestContext()` method to include `getState: () => this.getState()`
- This ensures tools can access the current state dynamically

### 3. Updated todo_check to use live state

- File: `src/tools/todo-check.ts`
- Changed from using `harnessCtx.state` to `harnessCtx.getState ? harnessCtx.getState() : harnessCtx.state`
- Falls back to snapshot for backward compatibility
- Added debug logging to track which approach is being used

## Testing Required

After rebuilding and restarting mastra-code, the todo_check tool should now show the correct current state of todos instead of stale data.

## Debug Logs Added

The todo_check tool now logs:

- Whether harness context exists
- Whether it's using live state (getState method)
- The current todos array
- The length of todos array

These logs will help verify the fix is working correctly.
