#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs")
const path = require("path")
const os = require("os")

const repoRoot = path.resolve(__dirname, "..")
const outRoot = path.join(repoRoot, "resources", "opencode-bundle")

const HOME = os.homedir()

const SOURCES = [
	{
		from: path.join(HOME, ".config", "opencode"),
		to: ".config/opencode",
		excludes: [".git", "node_modules", "*.log", "*.db-shm", "*.db-wal"],
	},
	{
		from: path.join(HOME, ".codex"),
		to: ".codex",
		excludes: [
			".git",
			"sessions",
			"archived_sessions",
			"worktrees",
			"shell_snapshots",
			"log",
			"state_5.sqlite*",
			"history.jsonl",
			"models_cache.json",
		],
	},
	{
		from: path.join(HOME, ".agents"),
		to: ".agents",
		excludes: [".git", "**/*.log"],
	},
	{
		from: path.join(HOME, ".ai-agent-hub"),
		to: ".ai-agent-hub",
		excludes: [".git", "sessions", "state", "mirror", "secrets", "logs", "memory-stack"],
	},
	{
		from: path.join(HOME, "repos", "pi-skills"),
		to: "repos/pi-skills",
		excludes: [".git", "node_modules"],
	},
]

function rmrf(p) {
	fs.rmSync(p, { recursive: true, force: true })
}

function ensureDir(p) {
	fs.mkdirSync(p, { recursive: true })
}

function matchesAny(rel, patterns) {
	return patterns.some((pat) => {
		if (pat.includes("*")) {
			const regex = new RegExp(
				"^" +
					pat
						.replace(/[.+^${}()|[\]\\]/g, "\\$&")
						.replace(/\*\*/g, ".*")
						.replace(/\*/g, "[^/]*") +
					"$",
			)
			return regex.test(rel)
		}
		return rel === pat || rel.startsWith(`${pat}/`)
	})
}

function copyTree(srcRoot, dstRoot, excludes) {
	if (!fs.existsSync(srcRoot)) return { copied: 0, skipped: 0, missing: true }
	let copied = 0
	let skipped = 0

	function walk(current, rel) {
		if (matchesAny(rel, excludes)) {
			skipped++
			return
		}
		const st = fs.statSync(current)
		if (st.isDirectory()) {
			ensureDir(path.join(dstRoot, rel))
			for (const entry of fs.readdirSync(current)) {
				const childRel = rel ? `${rel}/${entry}` : entry
				walk(path.join(current, entry), childRel)
			}
			return
		}
		ensureDir(path.dirname(path.join(dstRoot, rel)))
		fs.copyFileSync(current, path.join(dstRoot, rel))
		copied++
	}

	walk(srcRoot, "")
	return { copied, skipped, missing: false }
}

function removeNestedGitDirs(root) {
	if (!fs.existsSync(root)) return
	const stack = [root]
	while (stack.length > 0) {
		const current = stack.pop()
		if (!current || !fs.existsSync(current)) continue
		const st = fs.statSync(current)
		if (!st.isDirectory()) continue
		for (const entry of fs.readdirSync(current)) {
			const full = path.join(current, entry)
			if (entry === ".git" && fs.statSync(full).isDirectory()) {
				rmrf(full)
				continue
			}
			stack.push(full)
		}
	}
}

rmrf(outRoot)
ensureDir(outRoot)

const manifest = {
	generatedAt: new Date().toISOString(),
	host: os.hostname(),
	user: os.userInfo().username,
	sources: [],
}

for (const source of SOURCES) {
	const dst = path.join(outRoot, source.to)
	const stats = copyTree(source.from, dst, source.excludes)
	manifest.sources.push({
		from: source.from,
		to: source.to,
		excludes: source.excludes,
		...stats,
	})
	console.log(
		`[bundle] ${source.from} -> ${source.to} copied=${stats.copied} skipped=${stats.skipped}${stats.missing ? " (missing)" : ""}`,
	)
}

removeNestedGitDirs(outRoot)

fs.writeFileSync(
	path.join(outRoot, "manifest.json"),
	JSON.stringify(manifest, null, 2),
	"utf-8",
)

console.log(`[bundle] done: ${outRoot}`)
