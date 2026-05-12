import { describe, expect, it } from "vitest"
import {
	getToolGroupKind,
	shouldRenderToolGroup,
	type ToolGroupTool,
} from "../ToolGroup"

function tool(name: string): ToolGroupTool {
	return {
		id: name,
		name,
		args: {},
		status: "complete",
	}
}

describe("ToolGroup classification", () => {
	it("groups exact workspace and harness tool ids", () => {
		expect(getToolGroupKind(tool("view"))).toBe("explore")
		expect(getToolGroupKind(tool("find_files"))).toBe("explore")
		expect(getToolGroupKind(tool("search_content"))).toBe("explore")
		expect(getToolGroupKind(tool("lsp_inspect"))).toBe("explore")
		expect(getToolGroupKind(tool("execute_command"))).toBe("explore")
		expect(getToolGroupKind(tool("get_process_output"))).toBe("explore")
		expect(getToolGroupKind(tool("task_write"))).toBe("task")
		expect(getToolGroupKind(tool("task_update"))).toBe("task")
		expect(getToolGroupKind(tool("task_complete"))).toBe("task")
		expect(getToolGroupKind(tool("task_check"))).toBe("task")
	})

	it("groups exact thinking and recall aliases without substring guessing", () => {
		expect(getToolGroupKind(tool("think"))).toBe("thinking")
		expect(getToolGroupKind(tool("thinking"))).toBe("thinking")
		expect(getToolGroupKind(tool("thought"))).toBe("thinking")
		expect(getToolGroupKind(tool("reasoning"))).toBe("thinking")
		expect(getToolGroupKind(tool("recall"))).toBe("explore")

		expect(getToolGroupKind(tool("sequential_thinking"))).toBeNull()
		expect(getToolGroupKind(tool("memory_recall"))).toBeNull()
		expect(getToolGroupKind(tool("mcp__memory__recall"))).toBeNull()
	})

	it("keeps single ordinary explore tools ungrouped but renders single thinking and recall groups", () => {
		expect(shouldRenderToolGroup("explore", [tool("view")])).toBe(false)
		expect(shouldRenderToolGroup("thinking", [tool("thinking")])).toBe(true)
		expect(shouldRenderToolGroup("explore", [tool("recall")])).toBe(true)
		expect(shouldRenderToolGroup("explore", [tool("view"), tool("grep")])).toBe(
			true,
		)
	})
})
