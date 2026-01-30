import { createTool } from "@mastra/core/tools"
import { z } from "zod/v3"
import { sharedFileEditor } from "./file-editor.js"
import { lspManager } from "../lsp/manager.js"
import { findWorkspaceRoot } from "../lsp/workspace.js"
import * as path from "path"
import * as fs from "fs"
import { truncateStringForTokenEstimate } from "../utils/token-estimator.js"

export const stringReplaceLspTool = createTool({
	id: "string_replace_lsp",
	description:
		"Replaces text in a file with fuzzy matching and LSP diagnostics",
	// requireApproval: true, // TODO: re-enable when Mastra workflow suspension is stable
	inputSchema: z.object({
		path: z.string(),
		old_str: z.string(),
		new_str: z.string().optional(),
		start_line: z.number().optional(),
	}),
	async execute(context) {
		const { path: filePath, old_str, new_str, start_line } = context

		try {
			// Convert relative paths to absolute (same logic as validatePath in utils.ts)
			const absoluteFilePath = path.isAbsolute(filePath)
				? filePath
				: path.join(process.cwd(), filePath)

			// Create relative path for display
			const cwd = process.cwd()
			const relativeFilePath = absoluteFilePath.startsWith(cwd)
				? "./" + absoluteFilePath.slice(cwd.length + 1)
				: filePath

			// Call the FileEditor strReplace method
			const result = await sharedFileEditor.strReplace({
				path: filePath,
				old_str,
				new_str: new_str || "",
				start_line,
			})

			// Get LSP diagnostics
			let diagnosticOutput = ""
			try {
				const workspaceRoot = findWorkspaceRoot(absoluteFilePath)
				const client = await lspManager.getClient(
					absoluteFilePath,
					workspaceRoot,
				)
				if (client) {
					// Read the modified file content
					const contentNew = fs.readFileSync(absoluteFilePath, "utf-8")
					const languageId = path.extname(absoluteFilePath).slice(1)

					client.notifyOpen(absoluteFilePath, contentNew, languageId)
					client.notifyChange(absoluteFilePath, contentNew, 1)

					const diagnostics = await client
						.waitForDiagnostics(absoluteFilePath, 3000)
						.catch(() => [])

					if (diagnostics.length > 0) {
						const errors = diagnostics.filter((d) => d.severity === 1)
						const warnings = diagnostics.filter((d) => d.severity === 2)
						const info = diagnostics.filter((d) => d.severity === 3)
						const hints = diagnostics.filter((d) => d.severity === 4)

						let diagnosticText = ""
						if (errors.length > 0) {
							diagnosticText += `\nErrors:\n${errors
								.map(
									(d) =>
										`  ${relativeFilePath}:${d.range.start.line + 1}:${d.range.start.character + 1} - ${d.message}`,
								)
								.join("\n")}`
						}
						if (warnings.length > 0) {
							diagnosticText += `\nWarnings:\n${warnings
								.map(
									(d) =>
										`  ${relativeFilePath}:${d.range.start.line + 1}:${d.range.start.character + 1} - ${d.message}`,
								)
								.join("\n")}`
						}
						if (info.length > 0) {
							diagnosticText += `\nInfo:\n${info
								.map(
									(d) =>
										`  ${relativeFilePath}:${d.range.start.line + 1}:${d.range.start.character + 1} - ${d.message}`,
								)
								.join("\n")}`
						}
						if (hints.length > 0) {
							diagnosticText += `\nHints:\n${hints
								.map(
									(d) =>
										`  ${relativeFilePath}:${d.range.start.line + 1}:${d.range.start.character + 1} - ${d.message}`,
								)
								.join("\n")}`
						}

						if (diagnosticText) {
							diagnosticOutput = truncateStringForTokenEstimate(
								`\n\nLSP Diagnostics:${diagnosticText}`,
								500,
								false,
							)
						}
					} else {
						diagnosticOutput = `\n\nLSP Diagnostics:\nNo errors or warnings`
					}
				}
			} catch (error) {
				// LSP errors are non-fatal
				// LSP errors are non-fatal — diagnostics just won't be available
			}

			return {
				content: [
					{
						type: "text",
						text: result + diagnosticOutput,
					},
				],
			}
		} catch (e) {
			return {
				error: e instanceof Error ? e.message : JSON.stringify(e, null, 2),
			}
		}
	},
})
