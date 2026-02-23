# Upstream Harness Gaps

This document catalogues functionality needed by the Electron app that is missing or
under-typed in the published `Harness` from `@mastra/core/harness`. Each item describes
the current workaround and the ideal upstream API.

---

## 1. `Harness.deleteThread(threadId)`

**Files:** `src/electron/main.ts:620-637, 686-689`

The Electron app lets users delete threads. The published Harness has no `deleteThread`
method. The current mock switches away from the thread but does **not** remove it from
storage, so deleted threads accumulate forever.

**Workaround:** Mock helper that calls `createThread()` if the deleted thread is current.

**Ideal API:**

```ts
harness.deleteThread(threadId: string): Promise<void>
```

Deletes the thread from storage and auto-switches if it was the current thread.

---

## 2. Extensible / Custom Event Types via `emitEvent`

**Files:** `src/tools/todo.ts:59`, `src/tools/ask-user.ts:59`, `src/tools/request-sandbox-access.ts:63`, `src/tools/submit-plan.ts:54`

The app emits custom events (`todo_updated`, `ask_question`, `sandbox_access_request`,
`plan_approval_required`) through `HarnessRequestContext.emitEvent`. The published type
only accepts the core `HarnessEvent` union, so every call requires `as any`.

**Workaround:** `harnessCtx.emitEvent!({ type: "custom_type", ... } as any)`

**Ideal API:** Make `emitEvent` accept an extensible type parameter:

```ts
emitEvent<T extends HarnessEvent = HarnessEvent>(event: T): void
// Or simply accept Record<string, unknown> alongside HarnessEvent
```

---

## 3. Typed Event Payloads (`thread_changed`, `thread_created`, `error`)

**Files:** `src/electron/main.ts:570-572, 1354-1358`

The `thread_changed` event carries a `threadId`, `thread_created` carries a `thread`
object, and `error` carries an `Error` — but none of these fields exist on the published
`HarnessEvent` type.

**Workaround:** `(event as any).threadId`, `(event as any).thread.id`, `(event as any).error`

**Ideal API:** Discriminated union with typed payloads:

```ts
type HarnessEvent =
  | { type: "thread_changed"; threadId: string }
  | { type: "thread_created"; thread: HarnessThread }
  | { type: "error"; error: Error }
  | ...
```

---

## 4. `HarnessRequestContext.registerQuestion` / `registerPlanApproval`

**Files:** `src/tools/ask-user.ts:56`, `src/tools/request-sandbox-access.ts:60`, `src/tools/submit-plan.ts:52`

Tools that need user interaction register a promise resolver so the harness can fulfill
it when the user responds. These methods are not on the published
`HarnessRequestContext` type.

**Workaround:** Optional chaining `harnessCtx.registerQuestion?.(id, resolve)` + non-null
assertions.

**Ideal API:**

```ts
interface HarnessRequestContext {
	registerQuestion(id: string, resolver: (answer: string) => void): void
	registerPlanApproval(
		id: string,
		resolver: (result: PlanApprovalResult) => void,
	): void
}
```

---

## 5. `HarnessRequestContext.getSubagentModelId`

**File:** `src/tools/subagent.ts:131-133`

The subagent tool fetches a per-agent-type model override from harness state. This
method is not on the published type.

**Workaround:** `harnessCtx?.getSubagentModelId?.(agentType)`

**Ideal API:**

```ts
interface HarnessRequestContext {
	getSubagentModelId(agentType?: string): Promise<string | undefined>
}
```

---

## 6. `HarnessRequestContext.getState()` / `setState()` Availability

**Files:** `src/tools/todo-check.ts:33-36`, `src/tools/request-sandbox-access.ts:78-81`, `src/tools/utils.ts:186-193`

Tools need to read and write live harness state during execution (e.g. sandbox allowed
paths, todo list). The published `HarnessRequestContext` may only expose a frozen `state`
snapshot, not `getState()` / `setState()`.

**Workaround:** Fallback chain: `harnessCtx.getState?.() ?? harnessCtx.state`

**Ideal API:**

```ts
interface HarnessRequestContext<TState> {
	getState(): TState
	setState(patch: Partial<TState>): Promise<void>
}
```

---

## 7. `HarnessRequestContext.abortSignal`

**Files:** `src/tools/shell.ts:287`, `src/tools/subagent.ts:108`

Tools need the abort signal to cancel long-running operations when the user interrupts.
It may not be explicitly typed on the published `HarnessRequestContext`.

**Workaround:** `harnessCtx?.abortSignal as AbortSignal | undefined`

**Ideal API:**

```ts
interface HarnessRequestContext {
	abortSignal: AbortSignal
}
```

---

## 8. `HarnessConfig.resolveModel` Type Mismatch

**File:** `src/electron/main.ts:521`

The local `resolveModel` function returns an AI SDK `LanguageModel`, but the published
`HarnessConfig.resolveModel` expects a narrower type. This causes a type error.

**Workaround:** `resolveModel: resolveModel as any`

**Ideal API:** Accept the standard `LanguageModel` type from the `ai` SDK:

```ts
interface HarnessConfig {
	resolveModel: (modelId: string) => LanguageModel
}
```

---

## 9. `HarnessConfig.hookManager`

**File:** `src/electron/main.ts:522-525, 1617-1632`

A `HookManager` runs lifecycle hooks (pre-send, post-send, tool-use, session start/stop).
It cannot be passed through the Harness constructor, so it is manually subscribed to
harness events externally.

**Workaround:** External event subscription wiring.

**Ideal API:**

```ts
interface HarnessConfig {
	hookManager?: HookManager
}
```

---

## 10. `HarnessConfig.mcpManager`

**File:** `src/electron/main.ts:522-525, 1617-1632`

MCP tool servers are managed via an external `MCPManager`. The harness cannot init,
disconnect, or inject MCP tools at config time.

**Workaround:** MCP tools injected ad-hoc via the agent's `tools` callback.

**Ideal API:**

```ts
interface HarnessConfig {
	mcpManager?: MCPManager
}
```

---

## 11. `HarnessConfig.getToolsets`

**File:** `src/electron/main.ts:497-507, 522-525`

A function that injects provider-native toolsets (e.g. Anthropic web search) based on the
current model. It is defined in the app but **never wired** because `HarnessConfig` has
no `getToolsets` field. Anthropic native web search is silently disabled.

**Workaround:** The function exists but is dead code.

**Ideal API:**

```ts
interface HarnessConfig {
	getToolsets?: (modelId: string) => Record<string, ToolSet> | undefined
}
```

---

## 12. Dedicated `setYoloMode` / `setThinkingLevel` Methods

**File:** `src/electron/main.ts:703-707`

Yolo mode (auto-approve tools) and thinking level (extended thinking budget) are stored
as generic state keys. The harness does not understand or enforce them — tools must read
raw state.

**Workaround:** `h.setState({ yolo: enabled })`, `h.setState({ thinkingLevel: level })`

**Ideal API:**

```ts
harness.setYoloMode(enabled: boolean): Promise<void>
harness.getYoloMode(): boolean
harness.setThinkingLevel(level: "off" | "low" | "medium" | "high"): Promise<void>
harness.getThinkingLevel(): string
```

---

## 13. Tool Context Type Missing `requestContext` and `agent`

**File:** `src/tools/shell.ts:286, 296`

The shell tool accesses `toolContext.requestContext` and `toolContext.agent.toolCallId`,
neither of which is on the published tool context type.

**Workaround:** `(toolContext as any)?.requestContext?.get("harness")`

**Ideal API:**

```ts
interface ToolContext {
	requestContext: RequestContext
	agent?: { toolCallId?: string }
}
```

---

## 14. Auth Integration

**File:** `src/electron/main.ts:727-813`

The entire login/logout/OAuth PKCE flow is reimplemented externally in `AuthStorage`
(`src/auth/storage.ts`). The only Harness connection is `modelAuthChecker` in config.

This is noted as intentionally external — auth is not the harness's concern — but if
other Harness consumers need auth, a pluggable auth provider interface would reduce
duplication.

**Current connection:**

```ts
modelAuthChecker: (provider: string) =>
	authStorage.isLoggedIn(provider) || undefined
```

---

## 15. Tool Approval API

**File:** `src/electron/main.ts:691-696`

The published Harness uses `resolveToolApprovalDecision("approve" | "decline")`. The
renderer sends `approveToolCall` / `declineToolCall` with a `toolCallId` — but the
harness ignores the ID and queues one approval at a time.

For parallel tool execution, the API may need to accept a `toolCallId`:

```ts
harness.resolveToolApprovalDecision(
  decision: "approve" | "decline" | "always_allow_category",
  toolCallId?: string
): void
```

---

## 16. Tool Execute Return Type Inconsistency

**File:** `src/lsp/__tests__/string-replace-lsp.test.ts:66, 91, 116`

Tool `execute()` may return `{ content: string }` or `{ content: Array<{ type: "text"; text: string }> }`
depending on the Mastra version. Tests require `(result as any).content[0].text` casts.

**Ideal API:** Consistent, documented return type.

---

## Priority

| Priority | Items      | Rationale                                                               |
| -------- | ---------- | ----------------------------------------------------------------------- |
| High     | 2, 3, 6, 7 | Type safety — every tool call and event handler requires `as any` casts |
| High     | 1          | Data integrity — deleted threads persist in storage forever             |
| Medium   | 4, 5, 8    | Missing context methods that tools depend on at runtime                 |
| Medium   | 9, 10, 11  | Config extensibility — features defined but can't be wired              |
| Low      | 12, 14, 15 | Naming/ergonomics — functional but awkward                              |
| Low      | 13, 16     | Type inconsistencies in test/edge cases                                 |
