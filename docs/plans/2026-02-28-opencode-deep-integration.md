# Opencode Deep Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship a DMG that bootstraps Mark's Opencode/Codex/AI-Hub integrations on first launch.

**Architecture:** Add a build-time bundler that snapshots integration directories into app resources; add runtime installer in Electron main process; expose repair action in Settings; set RU locale and Victor Mono defaults.

**Tech Stack:** Electron, TypeScript, Node.js fs/path/os, React.

---

### Task 1: Build-time bundle pipeline

**Files:**

- Create: `scripts/build-opencode-bundle.js`
- Modify: `package.json`

**Step 1: Write failing test**

- N/A (script-level integration)

**Step 2: Implement minimal bundler**

- Copy curated integration directories into `resources/opencode-bundle`
- Exclude volatile/huge dirs (`sessions`, `state`, `node_modules`, logs)

**Step 3: Wire packaging pipeline**

- Add `build:opencode-bundle` script
- Execute it in `package`
- Add `extraResources` mapping for `resources/opencode-bundle`

**Step 4: Verify**
Run: `pnpm build:opencode-bundle`
Expected: generated `resources/opencode-bundle/manifest.json`

### Task 2: Runtime installer

**Files:**

- Modify: `src/electron/main.ts`

**Step 1: Add bootstrap installer function**

- Read bundled manifest from `process.resourcesPath/opencode-bundle`
- Copy directories into user home
- Apply executable bits to scripts
- Persist install marker in `~/.mastracode/opencode-bootstrap.json`

**Step 2: Call on app start and expose IPC repair command**

- Invoke during `app.whenReady()`
- Add IPC command `installBundledIntegrations`

**Step 3: Verify**
Run: `pnpm build`
Expected: TypeScript build passes

### Task 3: UX defaults and controls

**Files:**

- Modify: `src/renderer/styles/global.css`
- Modify: `src/renderer/components/Settings.tsx`
- Modify: `src/prompts/index.ts`
- Modify: `src/electron/main.ts`

**Step 1: RU default language**

- Add `locale` state default `ru`
- Inject language policy in system prompt builder
- Add settings dropdown for locale

**Step 2: Victor Mono default font**

- Put `Victor Mono` first in global monospace stack

**Step 3: Integration repair UI**

- Add Settings section with button calling `installBundledIntegrations`

**Step 4: Verify**
Run: `pnpm build`
Expected: renderer/main compile success

### Task 4: Docs artifacts

**Files:**

- Create: `docs/Project_Architecture_Blueprint.md`
- Create: `.github/copilot/copilot-instructions.md`

**Step 1: Add architecture blueprint**

- Document modules, flow, and extension points

**Step 2: Add copilot instructions**

- Project-specific coding and version constraints

**Step 3: Verify**
Run: `git diff --name-only`
Expected: docs included in changeset
