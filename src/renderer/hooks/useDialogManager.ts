import { useState, useCallback } from "react"

interface PendingApproval {
	toolCallId: string
	toolName: string
	args: unknown
	category: string | null
	categoryLabel: string | null
}

interface PendingQuestion {
	questionId: string
	question: string
	options?: Array<{ label: string; description?: string }>
}

interface PendingPlan {
	planId: string
	title: string
	plan: string
}

export function useDialogManager() {
	const [pendingApproval, setPendingApproval] =
		useState<PendingApproval | null>(null)
	const [pendingQuestion, setPendingQuestion] =
		useState<PendingQuestion | null>(null)
	const [pendingPlan, setPendingPlan] = useState<PendingPlan | null>(null)
	const [showModelSelector, setShowModelSelector] = useState(false)
	const [showCommandPalette, setShowCommandPalette] = useState(false)
	const [showQuickFileOpen, setShowQuickFileOpen] = useState(false)

	const handleApprove = useCallback(async (toolCallId: string) => {
		await window.api.invoke({ type: "approveToolCall", toolCallId })
		setPendingApproval(null)
	}, [])

	const handleDecline = useCallback(async (toolCallId: string) => {
		await window.api.invoke({ type: "declineToolCall", toolCallId })
		setPendingApproval(null)
	}, [])

	const handleAlwaysAllow = useCallback(
		async (toolCallId: string, category: string) => {
			await window.api.invoke({
				type: "approveToolCallAlwaysCategory",
				toolCallId,
				category,
			})
			setPendingApproval(null)
		},
		[],
	)

	const handleQuestionResponse = useCallback(
		async (questionId: string, answer: string) => {
			await window.api.invoke({
				type: "respondToQuestion",
				questionId,
				answer,
			})
			setPendingQuestion(null)
		},
		[],
	)

	const handlePlanResponse = useCallback(
		async (
			planId: string,
			response: { action: "approved" | "rejected"; feedback?: string },
		) => {
			await window.api.invoke({
				type: "respondToPlanApproval",
				planId,
				response,
			})
			setPendingPlan(null)
		},
		[],
	)

	const handleSwitchModel = useCallback(async (newModelId: string) => {
		await window.api.invoke({
			type: "switchModel",
			modelId: newModelId,
			scope: "global",
		})
		setShowModelSelector(false)
	}, [])

	const handleOpenModelSelector = useCallback(() => {
		setShowModelSelector(true)
	}, [])

	return {
		pendingApproval,
		setPendingApproval,
		pendingQuestion,
		setPendingQuestion,
		pendingPlan,
		setPendingPlan,
		showModelSelector,
		setShowModelSelector,
		showCommandPalette,
		setShowCommandPalette,
		showQuickFileOpen,
		setShowQuickFileOpen,
		handleApprove,
		handleDecline,
		handleAlwaysAllow,
		handleQuestionResponse,
		handlePlanResponse,
		handleSwitchModel,
		handleOpenModelSelector,
	}
}
