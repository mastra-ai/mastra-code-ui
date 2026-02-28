# GitHub Copilot Instructions

## Priority

1. Respect exact project versions from `package.json`/lockfile.
2. Follow existing patterns in `src/electron/main.ts`, `src/renderer/components/*`, and `src/prompts/*`.
3. Prefer additive, minimal-risk changes over broad refactors.

## Project Facts

- Runtime: Electron + React + TypeScript.
- Package manager: pnpm (`pnpm-lock.yaml` source of truth).
- Build system: `electron-vite`, packaging via `electron-builder`.

## Required Conventions

- Keep IPC command handling inside `ipcMain.handle("harness:command")` switch.
- For app-wide settings, persist via Harness state (`setState`) and render in `Settings.tsx`.
- For agent behavior changes, implement in `src/prompts/*`, not UI components.
- For bootstrap/install logic, keep side effects in main process only.

## Safety Rules

- Never add destructive git commands.
- Do not introduce plaintext secrets into repo.
- Exclude volatile or large state directories from shipping artifacts.

## Testing/Verification

- Always run `pnpm build` after TypeScript/Electron edits.
- For packaging changes, run `pnpm build:opencode-bundle` then `pnpm package`.

## File Targets

- Main process: `src/electron/main.ts`
- Prompt system: `src/prompts/index.ts`
- UI settings: `src/renderer/components/Settings.tsx`
- Styling: `src/renderer/styles/global.css`
- Packaging: `package.json`, `scripts/build-opencode-bundle.js`
