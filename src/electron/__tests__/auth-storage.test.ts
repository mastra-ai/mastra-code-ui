import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import { afterEach, describe, expect, it } from "vitest"

import { migrateUiAuthToMastracodeRuntimeAuth } from "../auth-storage.js"

const tempDirs: string[] = []

function tempAuthPath(name: string): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mastra-code-auth-"))
	tempDirs.push(dir)
	return path.join(dir, name)
}

function writeJson(filePath: string, value: unknown): void {
	fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf-8")
}

function readJson(filePath: string): Record<string, any> {
	return JSON.parse(fs.readFileSync(filePath, "utf-8"))
}

describe("auth storage sharing", () => {
	afterEach(() => {
		for (const dir of tempDirs.splice(0)) {
			fs.rmSync(dir, { recursive: true, force: true })
		}
	})

	it("migrates provider credentials from the UI auth file", () => {
		const source = tempAuthPath("ui-auth.json")
		const target = tempAuthPath("runtime-auth.json")
		writeJson(source, {
			anthropic: {
				type: "oauth",
				access: "source-access",
				refresh: "source-refresh",
				expires: 200,
			},
			_lastModelId: "anthropic/claude-opus-4-6",
		})

		expect(migrateUiAuthToMastracodeRuntimeAuth(source, target)).toBe(true)

		expect(readJson(target)).toEqual({
			anthropic: {
				type: "oauth",
				access: "source-access",
				refresh: "source-refresh",
				expires: 200,
			},
		})
	})

	it("keeps newer runtime credentials", () => {
		const source = tempAuthPath("ui-auth.json")
		const target = tempAuthPath("runtime-auth.json")
		writeJson(source, {
			anthropic: {
				type: "oauth",
				access: "old-access",
				refresh: "old-refresh",
				expires: 100,
			},
		})
		writeJson(target, {
			anthropic: {
				type: "oauth",
				access: "new-access",
				refresh: "new-refresh",
				expires: 200,
			},
		})

		expect(migrateUiAuthToMastracodeRuntimeAuth(source, target)).toBe(false)

		expect(readJson(target).anthropic.access).toBe("new-access")
	})
})
