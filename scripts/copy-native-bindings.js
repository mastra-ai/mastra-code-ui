/**
 * Copies platform-specific native bindings into @ast-grep/napi
 * so they can be resolved via local path (./file.node) in the packaged app.
 *
 * pnpm stores optional platform deps in .pnpm/ rather than hoisting them,
 * so electron-builder's extraResources can't find them. This script copies
 * the .node binary directly into the @ast-grep/napi directory before packaging.
 */
import { cpSync, existsSync, readdirSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, "..")
const pnpmDir = join(root, "node_modules", ".pnpm")
const napiDir = join(root, "node_modules", "@ast-grep", "napi")

const platform = process.platform
const arch = process.arch

const platformMap = {
	"darwin-arm64": "ast-grep-napi.darwin-arm64.node",
	"darwin-x64": "ast-grep-napi.darwin-x64.node",
	"linux-x64": "ast-grep-napi.linux-x64-gnu.node",
	"linux-arm64": "ast-grep-napi.linux-arm64-gnu.node",
}

const key = `${platform}-${arch}`
const nodeFile = platformMap[key]

if (!nodeFile) {
	console.warn(`No native binding mapping for ${key}, skipping copy`)
	process.exit(0)
}

// Find the .node file in the pnpm store
const entries = readdirSync(pnpmDir).filter((e) =>
	e.startsWith(`@ast-grep+napi-${platform}`),
)

let copied = false
for (const entry of entries) {
	const searchDir = join(pnpmDir, entry, "node_modules", "@ast-grep")
	if (!existsSync(searchDir)) continue

	for (const sub of readdirSync(searchDir)) {
		const nodeFilePath = join(searchDir, sub, nodeFile)
		if (existsSync(nodeFilePath)) {
			const dest = join(napiDir, nodeFile)
			cpSync(nodeFilePath, dest)
			console.log(`Copied ${nodeFile} to ${napiDir}`)
			copied = true
			break
		}
	}
	if (copied) break
}

if (!copied) {
	console.error(`Could not find ${nodeFile} in pnpm store`)
	process.exit(1)
}
