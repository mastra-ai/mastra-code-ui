import { promises as fs } from "fs"
import * as path from "path"
import { ToolError } from "./types.js"
import { truncateStringForTokenEstimate } from "../utils/token-estimator.js"

// Per-file write lock to prevent concurrent writes causing corruption
const fileWriteLocks = new Set<string>()

async function withWriteLock<T>(
	filePath: string,
	fn: () => Promise<T>,
): Promise<T> {
	const normalizedPath = path.resolve(filePath)

	// Error immediately if file is already being written
	if (fileWriteLocks.has(normalizedPath)) {
		throw new Error(
			`File "${filePath}" is currently being modified by another operation. ` +
				`Wait for the previous edit to complete before making another change to this file.`,
		)
	}

	// Acquire write lock
	fileWriteLocks.add(normalizedPath)

	try {
		return await fn()
	} finally {
		fileWriteLocks.delete(normalizedPath)
	}
}

export const SNIPPET_LINES = 4
export async function readFile(filePath: string): Promise<string> {
	try {
		return await fs.readFile(filePath, "utf8")
	} catch (e) {
		const error = e instanceof Error ? e : new Error("Unknown error")
		throw new Error(`Failed to read ${filePath}: ${error.message}`)
	}
}
export async function writeFile(
	filePath: string,
	content: string,
): Promise<void> {
	return withWriteLock(filePath, async () => {
		try {
			await fs.mkdir(path.dirname(filePath), { recursive: true })
			await fs.writeFile(filePath, content, "utf8")
		} catch (e) {
			const error = e instanceof Error ? e : new Error("Unknown error")
			throw new Error(`Failed to write to ${filePath}: ${error.message}`)
		}
	})
}
export function makeOutput(
	fileContent: string,
	fileDescriptor: string,
	initLine = 1,
	expandTabs = true,
): string {
	if (expandTabs) {
		fileContent = fileContent.replace(/\t/g, "    ")
	}
	// Convert absolute paths to relative paths from cwd for token efficiency
	const displayPath = path.isAbsolute(fileDescriptor)
		? path.relative(process.cwd(), fileDescriptor)
		: fileDescriptor
	const lines = fileContent.split("\n")
	const numberedLines = lines
		.map((line, i) => `${(i + initLine).toString().padStart(6)}\t${line}`)
		.join("\n")
	return `Here's the result of running \`cat -n\` on ${displayPath}:\n${truncateStringForTokenEstimate(numberedLines, 500, false)}\n`
}
export async function validatePath(
	command: string,
	filePath: string,
): Promise<void> {
	const absolutePath = path.isAbsolute(filePath)
		? filePath
		: path.join(process.cwd(), filePath)
	if (!path.isAbsolute(filePath)) {
		filePath = absolutePath
	}
	try {
		const stats = await fs.stat(filePath)
		if (stats.isDirectory() && command !== "view") {
			throw new ToolError(
				`The path ${filePath} is a directory and only the \`view\` command can be used on directories`,
			)
		}
		if (command === "create" && stats.isFile()) {
			throw new ToolError(
				`File already exists at: ${filePath}. Cannot overwrite files using command \`create\``,
			)
		}
	} catch (e) {
		const error = e instanceof Error ? e : new Error("Unknown error")
		if ("code" in error && error.code === "ENOENT" && command !== "create") {
			throw new ToolError(
				`The path ${filePath} does not exist. Please provide a valid path.`,
			)
		}
		if (command !== "create") {
			throw error
		}
	}
}
export function truncateText(text: string, maxLength = 1000): string {
	if (text.length <= maxLength) return text
	return text.slice(0, maxLength) + "... (truncated)"
}
