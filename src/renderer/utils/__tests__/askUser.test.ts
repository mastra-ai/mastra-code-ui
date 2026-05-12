import { describe, expect, it } from "vitest"
import {
	normalizeAskUserResult,
	normalizePendingQuestion,
	normalizePendingQuestionFromToolStart,
} from "../askUser"

describe("ask user normalization", () => {
	it("drops selectionMode when there are no options", () => {
		expect(
			normalizePendingQuestion({
				questionId: "q1",
				question: "What should I ask?",
				selectionMode: "single_select",
			}),
		).toEqual({
			questionId: "q1",
			question: "What should I ask?",
			options: undefined,
			selectionMode: undefined,
		})
	})

	it("defaults option questions to single select", () => {
		expect(
			normalizePendingQuestion({
				questionId: "q1",
				question: "Choose one",
				options: [{ label: "Codebase" }],
			}),
		).toEqual({
			questionId: "q1",
			question: "Choose one",
			options: [{ label: "Codebase" }],
			selectionMode: "single_select",
		})
	})

	it("preserves multi select when valid options exist", () => {
		expect(
			normalizePendingQuestion({
				questionId: "q1",
				question: "Choose any",
				options: [{ label: "Search" }, { label: "Test" }],
				selectionMode: "multi_select",
			}),
		).toEqual({
			questionId: "q1",
			question: "Choose any",
			options: [{ label: "Search" }, { label: "Test" }],
			selectionMode: "multi_select",
		})
	})

	it("keeps structured tool failures out of the answer path", () => {
		expect(
			normalizeAskUserResult({
				content: "Failed to ask user: selectionMode requires options.",
				isError: true,
			}),
		).toEqual({
			content: "Failed to ask user: selectionMode requires options.",
			isError: true,
			skipped: false,
			answer: undefined,
			hasResult: true,
		})
	})

	it("extracts successful answers from the core ask_user result contract", () => {
		expect(
			normalizeAskUserResult({
				content: "User answered: Project-specific",
				isError: false,
			}),
		).toEqual({
			content: "User answered: Project-specific",
			isError: false,
			skipped: false,
			answer: "Project-specific",
			hasResult: true,
		})
	})

	it("treats skipped responses as cancellation", () => {
		expect(normalizeAskUserResult("(skipped)")).toEqual({
			content: "(skipped)",
			isError: false,
			skipped: true,
			answer: undefined,
			hasResult: true,
		})
		expect(
			normalizeAskUserResult({
				content: "User answered: (skipped)",
				isError: false,
			}),
		).toEqual({
			content: "User answered: (skipped)",
			isError: false,
			skipped: true,
			answer: undefined,
			hasResult: true,
		})
	})

	it("creates a disabled provisional question from ask_user tool start args", () => {
		expect(
			normalizePendingQuestionFromToolStart("call-1", {
				question: "Which path?",
				options: [{ label: "Project-specific" }],
			}),
		).toEqual({
			questionId: "tool:call-1",
			toolCallId: "call-1",
			responseEnabled: false,
			question: "Which path?",
			options: [{ label: "Project-specific" }],
			selectionMode: "single_select",
		})
	})
})
