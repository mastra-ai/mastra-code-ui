import type { IpcCommandHandler } from "./types.js"
import type { HarnessQuestionAnswer } from "@mastra/core/harness"
import {
	TOOL_CATEGORIES,
	DEFAULT_POLICIES,
	YOLO_POLICIES,
	type ToolCategory,
	type PermissionPolicy,
} from "../../permissions.js"

type PlanApprovalResponse = {
	action: "approved" | "rejected"
	feedback?: string
}

export function getPermissionHandlers(): Record<string, IpcCommandHandler> {
	return {
		approveToolCall: async (_command, ctx) => {
			ctx
				.getActiveSession()
				.harness.respondToToolApproval({ decision: "approve" })
		},
		declineToolCall: async (_command, ctx) => {
			ctx
				.getActiveSession()
				.harness.respondToToolApproval({ decision: "decline" })
		},
		approveToolCallAlwaysCategory: async (_command, ctx) => {
			ctx
				.getActiveSession()
				.harness.respondToToolApproval({ decision: "always_allow_category" })
		},
		getPermissionRules: async (_command, ctx) => {
			const h = ctx.getActiveSession().harness
			return {
				rules: h.getPermissionRules(),
				sessionGrants: h.getSessionGrants().categories,
				categories: TOOL_CATEGORIES,
			}
		},
		setPermissionPolicy: async (command, ctx) => {
			const h = ctx.getActiveSession().harness
			const cat = command.category as ToolCategory
			const policy = command.policy as PermissionPolicy
			h.setPermissionForCategory({ category: cat, policy })
			if (policy === "allow") h.grantSessionCategory({ category: cat })
		},
		resetSessionGrants: async () => {
			// No direct reset on Harness — session grants persist until session ends
		},
		respondToQuestion: async (command, ctx) => {
			ctx.getActiveSession().harness.respondToQuestion({
				questionId: command.questionId as string,
				answer: command.answer as HarnessQuestionAnswer,
			})
		},
		respondToPlanApproval: async (command, ctx) => {
			await ctx.getActiveSession().harness.respondToPlanApproval({
				planId: command.planId as string,
				response: command.response as PlanApprovalResponse,
			})
		},
		setYoloMode: async (command, ctx) => {
			const h = ctx.getActiveSession().harness
			const enabled = command.enabled as boolean
			await h.setState({ yolo: enabled })
			const policies = enabled ? YOLO_POLICIES : DEFAULT_POLICIES
			for (const [cat, policy] of Object.entries(policies)) {
				h.setPermissionForCategory({
					category: cat as ToolCategory,
					policy,
				})
			}
		},
	}
}
