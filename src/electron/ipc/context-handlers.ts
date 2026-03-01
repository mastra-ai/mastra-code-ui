import * as path from "path"
import * as os from "os"
import * as fs from "fs"
import type { IpcCommandHandler } from "./types.js"

export function getContextHandlers(): Record<string, IpcCommandHandler> {
	return {
		getContextFiles: async (_command, ctx) => {
			const projectRoot = ctx.getActiveSession().projectRoot
			const home = os.homedir()
			const INSTRUCTION_FILES = ["AGENT.md", "CLAUDE.md"]
			const PROJECT_LOCATIONS = ["", ".claude", ".mastracode"]
			const GLOBAL_LOCATIONS = [
				".claude",
				".mastracode",
				".config/claude",
				".config/mastracode",
			]
			const results: Array<{
				path: string
				content: string
				scope: "global" | "project"
				fileName: string
			}> = []

			for (const location of PROJECT_LOCATIONS) {
				const basePath = location
					? path.join(projectRoot, location)
					: projectRoot
				for (const filename of INSTRUCTION_FILES) {
					const fullPath = path.join(basePath, filename)
					if (fs.existsSync(fullPath)) {
						try {
							const content = fs.readFileSync(fullPath, "utf-8")
							results.push({
								path: fullPath,
								content,
								scope: "project",
								fileName: filename,
							})
						} catch {}
					}
				}
			}

			for (const location of GLOBAL_LOCATIONS) {
				const basePath = path.join(home, location)
				for (const filename of INSTRUCTION_FILES) {
					const fullPath = path.join(basePath, filename)
					if (fs.existsSync(fullPath)) {
						try {
							const content = fs.readFileSync(fullPath, "utf-8")
							results.push({
								path: fullPath,
								content,
								scope: "global",
								fileName: filename,
							})
						} catch {}
					}
				}
			}

			return results
		},
		createContextFile: async (command, ctx) => {
			const projectRoot = ctx.getActiveSession().projectRoot
			const scope = command.scope as "project" | "global"
			let targetDir: string
			if (scope === "project") {
				targetDir = projectRoot
			} else {
				targetDir = path.join(os.homedir(), ".mastracode")
				if (!fs.existsSync(targetDir))
					fs.mkdirSync(targetDir, { recursive: true })
			}
			const targetPath = path.join(targetDir, "AGENT.md")
			if (!fs.existsSync(targetPath)) {
				fs.writeFileSync(targetPath, "# Agent Instructions\n\n", "utf-8")
			}
			return { path: targetPath }
		},
		writeContextFile: async (command, ctx) => {
			const projectRoot = ctx.getActiveSession().projectRoot
			const filePath = command.filePath as string
			const home = os.homedir()
			const isProjectFile = filePath.startsWith(projectRoot)
			const isGlobalFile = filePath.startsWith(home)
			const isContextFile =
				path.basename(filePath) === "AGENT.md" ||
				path.basename(filePath) === "CLAUDE.md"
			if (!isContextFile || (!isProjectFile && !isGlobalFile)) {
				throw new Error("Access denied: can only write to context files")
			}
			fs.writeFileSync(filePath, command.content as string, "utf-8")
			return { success: true }
		},
	}
}
