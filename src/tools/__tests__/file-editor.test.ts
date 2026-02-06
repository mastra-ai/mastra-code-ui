import { describe, it, expect, afterAll, afterEach } from "vitest"
import { sharedFileEditor } from "../file-editor.js"
import * as fs from "fs"
import * as path from "path"

const projectRoot = path.resolve(import.meta.dirname, "../../..")
const tmpDir = path.join(projectRoot, ".test-tmp-editor")

function tmpFile(name: string): string {
	return path.join(tmpDir, name)
}

function writeTmpFile(name: string, content: string): string {
	const filePath = tmpFile(name)
	fs.mkdirSync(path.dirname(filePath), { recursive: true })
	fs.writeFileSync(filePath, content, "utf-8")
	return filePath
}

afterEach(() => {
	if (fs.existsSync(tmpDir)) {
		fs.rmSync(tmpDir, { recursive: true })
	}
})

afterAll(() => {
	if (fs.existsSync(tmpDir)) {
		fs.rmSync(tmpDir, { recursive: true })
	}
})

describe("FileEditor.strReplace whitespace-agnostic matching", () => {
	it("matches when old_str uses spaces but file uses tabs", async () => {
		const filePath = writeTmpFile(
			"tabs-vs-spaces.ts",
			`function hello() {\n\tconst x = 1\n\tconst y = 2\n\treturn x + y\n}\n`,
		)

		const result = await sharedFileEditor.strReplace({
			path: filePath,
			old_str: `function hello() {\n    const x = 1\n    const y = 2\n    return x + y\n}`,
			new_str: `function hello() {\n\tconst x = 10\n\tconst y = 20\n\treturn x + y\n}`,
		})

		expect(result).toContain("has been edited")
		const content = fs.readFileSync(filePath, "utf-8")
		expect(content).toContain("const x = 10")
		expect(content).toContain("const y = 20")
	})

	it("matches multi-line blocks with mixed indentation (tabs in file, spaces in old_str)", async () => {
		const filePath = writeTmpFile(
			"mixed-indent.ts",
			[
				"\tprivate renderTodos(",
				"\t\ttodos: TodoItem[],",
				"\t\tinsertIndex = -1,",
				"\t): void {",
				"\t\tconst MAX_VISIBLE = 4",
				"\t\tconst visible = todos.slice(0, MAX_VISIBLE)",
				"",
				"\t\tif (insertIndex >= 0) {",
				"\t\t\tthis.container.splice(insertIndex, 0)",
				"\t\t} else {",
				"\t\t\tthis.container.push()",
				"\t\t}",
				"\t}",
				"",
			].join("\n"),
		)

		const result = await sharedFileEditor.strReplace({
			path: filePath,
			old_str: [
				"    private renderTodos(",
				"        todos: TodoItem[],",
				"        insertIndex = -1,",
				"    ): void {",
				"        const MAX_VISIBLE = 4",
				"        const visible = todos.slice(0, MAX_VISIBLE)",
				"",
				"        if (insertIndex >= 0) {",
			].join("\n"),
			new_str: [
				"\tprivate renderTodos(",
				"\t\ttodos: TodoItem[],",
				"\t\tinsertIndex = -1,",
				"\t\tcollapsed = false,",
				"\t): void {",
				"\t\tconst MAX_VISIBLE = 4",
				"\t\tconst visible = collapsed ? todos.slice(0, MAX_VISIBLE) : todos",
				"",
				"\t\tif (insertIndex >= 0) {",
			].join("\n"),
		})

		expect(result).toContain("has been edited")
		const content = fs.readFileSync(filePath, "utf-8")
		expect(content).toContain("collapsed = false")
		expect(content).toContain("collapsed ? todos.slice")
	})

	it("matches when old_str has different amounts of whitespace than file", async () => {
		const filePath = writeTmpFile(
			"extra-spaces.ts",
			`if (  x  ===  true  ) {\n    doSomething()\n}\n`,
		)

		const result = await sharedFileEditor.strReplace({
			path: filePath,
			old_str: `if (x === true) {\n    doSomething()\n}`,
			new_str: `if (x === false) {\n    doSomething()\n}`,
		})

		expect(result).toContain("has been edited")
		const content = fs.readFileSync(filePath, "utf-8")
		expect(content).toContain("false")
	})

	it("exact match still takes priority over whitespace-normalized match", async () => {
		const filePath = writeTmpFile(
			"exact-priority.ts",
			`const a = 1\nconst b = 2\nconst c = 3\n`,
		)

		const result = await sharedFileEditor.strReplace({
			path: filePath,
			old_str: `const b = 2`,
			new_str: `const b = 99`,
		})

		expect(result).toContain("has been edited")
		const content = fs.readFileSync(filePath, "utf-8")
		expect(content).toContain("const b = 99")
		// Other lines untouched
		expect(content).toContain("const a = 1")
		expect(content).toContain("const c = 3")
	})
	it("re-indents new_str from spaces to tabs when file uses tabs", async () => {
		// File uses tabs
		const filePath = writeTmpFile(
			"reindent-to-tabs.ts",
			[
				"class Foo {",
				"\tprivate bar() {",
				"\t\tconst x = 1",
				"\t\treturn x",
				"\t}",
				"}",
				"",
			].join("\n"),
		)

		// old_str and new_str both use spaces (LLM sends spaces)
		const result = await sharedFileEditor.strReplace({
			path: filePath,
			old_str: [
				"    private bar() {",
				"        const x = 1",
				"        return x",
				"    }",
			].join("\n"),
			new_str: [
				"    private bar() {",
				"        const x = 1",
				"        const y = 2",
				"        return x + y",
				"    }",
			].join("\n"),
		})

		expect(result).toContain("has been edited")
		const content = fs.readFileSync(filePath, "utf-8")
		// new_str should have been re-indented to tabs
		expect(content).toContain("\t\tconst y = 2")
		expect(content).toContain("\t\treturn x + y")
		// Should NOT contain space-indented lines from new_str
		expect(content).not.toContain("        const y = 2")
	})

	it("re-indents new_str from tabs to spaces when file uses spaces", async () => {
		// File uses 2-space indentation
		const filePath = writeTmpFile(
			"reindent-to-spaces.ts",
			[
				"class Foo {",
				"  private bar() {",
				"    const x = 1",
				"    return x",
				"  }",
				"}",
				"",
			].join("\n"),
		)

		// old_str and new_str use tabs (LLM sends tabs)
		const result = await sharedFileEditor.strReplace({
			path: filePath,
			old_str: [
				"\tprivate bar() {",
				"\t\tconst x = 1",
				"\t\treturn x",
				"\t}",
			].join("\n"),
			new_str: [
				"\tprivate bar() {",
				"\t\tconst x = 1",
				"\t\tconst y = 2",
				"\t\treturn x + y",
				"\t}",
			].join("\n"),
		})

		expect(result).toContain("has been edited")
		const content = fs.readFileSync(filePath, "utf-8")
		// new_str should have been re-indented to 2-space
		expect(content).toContain("    const y = 2")
		expect(content).toContain("    return x + y")
		// Should NOT contain tab-indented lines
		expect(content).not.toContain("\t\tconst y = 2")
	})

	it("preserves indentation when new_str already matches file style", async () => {
		// File uses tabs, new_str also uses tabs — no conversion needed
		const filePath = writeTmpFile(
			"no-reindent.ts",
			["function foo() {", "\tconst a = 1", "\treturn a", "}", ""].join("\n"),
		)

		const result = await sharedFileEditor.strReplace({
			path: filePath,
			old_str: ["    const a = 1", "    return a"].join("\n"),
			new_str: ["\tconst a = 10", "\treturn a"].join("\n"),
		})

		expect(result).toContain("has been edited")
		const content = fs.readFileSync(filePath, "utf-8")
		expect(content).toContain("\tconst a = 10")
	})

	it("handles a realistic 30+ line block with tab/space mismatch", async () => {
		// Simulate a real file with tabs
		const fileLines: string[] = []
		for (let i = 0; i < 50; i++) {
			fileLines.push(`\tline${i}: ${i},`)
		}
		const filePath = writeTmpFile(
			"large-block.ts",
			`const obj = {\n${fileLines.join("\n")}\n}\n`,
		)

		// old_str with spaces instead of tabs, targeting lines 10-40
		const oldLines: string[] = []
		for (let i = 10; i < 40; i++) {
			oldLines.push(`    line${i}: ${i},`)
		}

		const newLines: string[] = []
		for (let i = 10; i < 40; i++) {
			newLines.push(`\tline${i}: ${i * 10},`)
		}

		const result = await sharedFileEditor.strReplace({
			path: filePath,
			old_str: oldLines.join("\n"),
			new_str: newLines.join("\n"),
		})

		expect(result).toContain("has been edited")
		const content = fs.readFileSync(filePath, "utf-8")
		expect(content).toContain("line10: 100,")
		expect(content).toContain("line39: 390,")
		// Untouched lines
		expect(content).toContain("line0: 0,")
		expect(content).toContain("line49: 49,")
	})
})
