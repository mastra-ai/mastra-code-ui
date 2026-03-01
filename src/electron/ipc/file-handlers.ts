import * as path from "path"
import * as fs from "fs"
import { shell, dialog } from "electron"
import type { IpcCommandHandler, HandlerContext } from "./types.js"
import { detectEditor } from "../../utils/editor.js"

export function getFileHandlers(): Record<string, IpcCommandHandler> {
	return {
		listDirectory: async (command, ctx) => {
			const projectRoot = ctx.getActiveSession().projectRoot
			const dirPath = path.resolve(projectRoot, (command.path as string) || ".")
			const entries = fs.readdirSync(dirPath, { withFileTypes: true })
			return entries
				.filter((e) => !e.name.startsWith("."))
				.map((e) => ({
					name: e.name,
					path: path.join((command.path as string) || ".", e.name),
					isDirectory: e.isDirectory(),
					isSymlink: e.isSymbolicLink(),
				}))
				.sort((a, b) => {
					if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
					return a.name.localeCompare(b.name)
				})
		},
		searchFiles: async (_command, ctx) => {
			const { execSync } =
				require("child_process") as typeof import("child_process")
			const projectRoot = ctx.getActiveSession().projectRoot
			try {
				const output = execSync(
					"git ls-files --cached --others --exclude-standard",
					{
						cwd: projectRoot,
						encoding: "utf-8",
						maxBuffer: 10 * 1024 * 1024,
					},
				) as string
				return { files: output.split("\n").filter(Boolean) }
			} catch {
				try {
					const output = execSync(
						'find . -type f -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/dist/*"',
						{
							cwd: projectRoot,
							encoding: "utf-8",
							maxBuffer: 10 * 1024 * 1024,
						},
					) as string
					return {
						files: output
							.split("\n")
							.filter(Boolean)
							.map((f) => f.replace(/^\.\//, "")),
					}
				} catch {
					return { files: [] }
				}
			}
		},
		readFileContents: async (command, ctx) => {
			const projectRoot = ctx.getActiveSession().projectRoot
			const filePath = path.resolve(projectRoot, (command.path as string) || "")
			if (!filePath.startsWith(projectRoot)) {
				throw new Error("Access denied: path outside project root")
			}
			const stat = fs.statSync(filePath)
			if (stat.isDirectory()) {
				throw new Error("Cannot read a directory as a file")
			}
			if (stat.size > 5 * 1024 * 1024) {
				throw new Error("File too large to display (>5MB)")
			}
			const content = fs.readFileSync(filePath, "utf-8")
			const ext = path.extname(filePath).slice(1)
			return {
				content,
				path: command.path as string,
				fileName: path.basename(filePath),
				extension: ext,
				size: stat.size,
				lineCount: content.split("\n").length,
			}
		},
		writeFileContents: async (command, ctx) => {
			const projectRoot = ctx.getActiveSession().projectRoot
			const filePath = path.resolve(projectRoot, (command.path as string) || "")
			if (!filePath.startsWith(projectRoot)) {
				throw new Error("Access denied: path outside project root")
			}
			fs.writeFileSync(filePath, command.content as string, "utf-8")
			return { success: true }
		},
		openFolderDialog: async (_command, ctx) => {
			const result = await dialog.showOpenDialog(ctx.mainWindow!, {
				properties: ["openDirectory"],
				title: "Open Project",
			})
			if (result.canceled || !result.filePaths[0]) return { cancelled: true }
			return { path: result.filePaths[0] }
		},
		browseFolder: async (command, ctx) => {
			const browseResult = await dialog.showOpenDialog(ctx.mainWindow!, {
				properties: ["openDirectory", "createDirectory"],
				title: (command.title as string) || "Choose folder",
				defaultPath: command.defaultPath as string | undefined,
			})
			if (browseResult.canceled || !browseResult.filePaths[0])
				return { cancelled: true }
			return { path: browseResult.filePaths[0] }
		},
		cloneRepository: async (command) => {
			const gitUrl = command.url as string
			const destDir = command.dest as string
			if (!gitUrl) throw new Error("No URL provided")
			if (!destDir) throw new Error("No destination provided")

			const repoName =
				gitUrl
					.replace(/\.git$/, "")
					.split("/")
					.pop()
					?.replace(/[^a-zA-Z0-9._-]/g, "") || "repo"
			const clonePath = path.join(destDir, repoName)

			const { execSync } =
				require("child_process") as typeof import("child_process")
			try {
				execSync(
					`git clone ${JSON.stringify(gitUrl)} ${JSON.stringify(clonePath)}`,
					{
						stdio: "pipe",
						timeout: 120_000,
					},
				)
			} catch (err: unknown) {
				const msg = err instanceof Error ? err.message : String(err)
				throw new Error(`Clone failed: ${msg}`)
			}

			return { path: clonePath }
		},
		openInEditor: async (command, ctx) => {
			const projectRoot = ctx.getActiveSession().projectRoot
			const filePath = path.resolve(projectRoot, command.filePath as string)
			const line = (command.line as number) ?? 1
			const editor = detectEditor()
			if (editor) {
				const { execSync } =
					require("child_process") as typeof import("child_process")
				try {
					if (editor.gotoFlag) {
						execSync(
							`"${editor.cmd}" ${editor.gotoFlag} "${filePath}:${line}"`,
							{
								stdio: "pipe",
							},
						)
					} else {
						execSync(`"${editor.cmd}" "${filePath}:${line}"`, { stdio: "pipe" })
					}
				} catch {
					shell.openPath(filePath)
				}
			} else {
				shell.openPath(filePath)
			}
		},
		openExternal: async (command) => {
			shell.openExternal(command.url as string)
		},
	}
}
