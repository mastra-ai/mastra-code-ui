// Cached editor for "open in editor" feature
let detectedEditor: { cmd: string; gotoFlag: string } | null | undefined =
	undefined

export function detectEditor(): { cmd: string; gotoFlag: string } | null {
	if (detectedEditor !== undefined) return detectedEditor
	const { execSync } =
		require("child_process") as typeof import("child_process")
	const editors = [
		{ cmd: "cursor", gotoFlag: "--goto" },
		{ cmd: "code", gotoFlag: "--goto" },
		{ cmd: "subl", gotoFlag: "" },
	]
	for (const editor of editors) {
		try {
			execSync(`which ${editor.cmd}`, { stdio: "pipe" })
			detectedEditor = editor
			return editor
		} catch {
			// Not found
		}
	}
	detectedEditor = null
	return null
}
