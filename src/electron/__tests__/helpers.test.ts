import { describe, expect, it, vi } from "vitest"
import { deleteThread } from "../helpers.js"
import type { ThreadDeletionHarness } from "../helpers.js"

function createHarnessStub(
	currentThreadId: string | null,
): ThreadDeletionHarness {
	return {
		getCurrentThreadId: vi.fn(() => currentThreadId),
		memory: {
			deleteThread: vi.fn(async ({ threadId }: { threadId: string }) => {
				if (currentThreadId === threadId) currentThreadId = null
			}),
		},
		createThread: vi.fn(async ({ title }: { title: string }) => {
			currentThreadId = "replacement-thread"
			return {
				id: currentThreadId,
				resourceId: "test-resource",
				title,
				createdAt: new Date("2026-05-13T00:00:00.000Z"),
				updatedAt: new Date("2026-05-13T00:00:00.000Z"),
			}
		}),
	}
}

describe("deleteThread", () => {
	it("deletes a non-current thread from harness memory", async () => {
		const harness = createHarnessStub("current-thread")

		const result = await deleteThread(harness, "old-thread")

		expect(harness.memory.deleteThread).toHaveBeenCalledWith({
			threadId: "old-thread",
		})
		expect(harness.createThread).not.toHaveBeenCalled()
		expect(result).toEqual({
			deletedThreadId: "old-thread",
			currentThreadId: "current-thread",
		})
	})

	it("creates a replacement thread after deleting the current thread", async () => {
		const harness = createHarnessStub("current-thread")

		const result = await deleteThread(harness, "current-thread")

		expect(harness.memory.deleteThread).toHaveBeenCalledWith({
			threadId: "current-thread",
		})
		expect(harness.createThread).toHaveBeenCalledWith({ title: "New Thread" })
		expect(result).toEqual({
			deletedThreadId: "current-thread",
			currentThreadId: "replacement-thread",
		})
	})
})
