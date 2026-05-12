import * as fs from "fs"
import * as os from "os"
import * as path from "path"

import { AuthStorage } from "../auth/storage.js"
import { getAppDataDir } from "../utils/project.js"

type AuthJson = Record<string, unknown>

function readAuthJson(filePath: string): AuthJson {
	if (!fs.existsSync(filePath)) return {}
	try {
		const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"))
		return parsed && typeof parsed === "object" && !Array.isArray(parsed)
			? (parsed as AuthJson)
			: {}
	} catch {
		return {}
	}
}

function isCredentialEntry(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

function shouldUseSourceCredential(
	source: Record<string, unknown>,
	target: unknown,
): boolean {
	if (!isCredentialEntry(target)) return true
	const sourceExpires = source.expires
	const targetExpires = target.expires
	return (
		typeof sourceExpires === "number" &&
		typeof targetExpires === "number" &&
		sourceExpires > targetExpires
	)
}

function writeAuthJson(filePath: string, data: AuthJson): void {
	const dir = path.dirname(filePath)
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
	}
	fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8")
	fs.chmodSync(filePath, 0o600)
}

/**
 * The installed `mastracode` package owns model resolution and hardcodes this
 * app-data directory for its AuthStorage. Electron login must write here too.
 */
export function getMastracodeRuntimeAuthPath(): string {
	const platform = os.platform()
	let baseDir: string

	if (platform === "darwin") {
		baseDir = path.join(os.homedir(), "Library", "Application Support")
	} else if (platform === "win32") {
		baseDir =
			process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming")
	} else {
		baseDir =
			process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share")
	}

	return path.join(baseDir, "mastracode", "auth.json")
}

export function migrateUiAuthToMastracodeRuntimeAuth(
	sourcePath: string = path.join(getAppDataDir(), "auth.json"),
	targetPath: string = getMastracodeRuntimeAuthPath(),
): boolean {
	if (sourcePath === targetPath || !fs.existsSync(sourcePath)) return false

	const source = readAuthJson(sourcePath)
	const target = readAuthJson(targetPath)
	let changed = false

	for (const [key, value] of Object.entries(source)) {
		if (key.startsWith("_") || !isCredentialEntry(value)) continue
		if (!shouldUseSourceCredential(value, target[key])) continue
		target[key] = value
		changed = true
	}

	if (changed) {
		writeAuthJson(targetPath, target)
	}

	return changed
}

export function createSharedAuthStorage(): AuthStorage {
	const authPath = getMastracodeRuntimeAuthPath()
	migrateUiAuthToMastracodeRuntimeAuth(undefined, authPath)
	return new AuthStorage(authPath)
}
