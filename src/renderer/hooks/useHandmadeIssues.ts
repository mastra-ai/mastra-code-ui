import { useState, useEffect, useCallback } from "react"
import type { HandmadeIssue } from "../types/taskboard"

export function useHandmadeIssues() {
	const [handmadeIssues, setHandmadeIssues] = useState<HandmadeIssue[]>([])
	const [creatingHandmade, setCreatingHandmade] = useState(false)
	const [newHandmadeTitle, setNewHandmadeTitle] = useState("")

	// Init effect loads handmade issues from state
	useEffect(() => {
		async function load() {
			const state = (await window.api.invoke({ type: "getState" })) as Record<
				string,
				unknown
			>
			const handmade = (state?.handmadeIssues as HandmadeIssue[]) ?? []
			setHandmadeIssues(handmade)
		}
		load()
	}, [])

	const handleCreateHandmade = useCallback(async () => {
		if (!newHandmadeTitle.trim()) return
		const issue: HandmadeIssue = {
			id: `handmade-${Date.now()}`,
			title: newHandmadeTitle.trim(),
			status: "todo",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		}
		const next = [...handmadeIssues, issue]
		setHandmadeIssues(next)
		setNewHandmadeTitle("")
		setCreatingHandmade(false)
		await window.api.invoke({
			type: "setState",
			patch: { handmadeIssues: next },
		})
	}, [newHandmadeTitle, handmadeIssues])

	const handleUpdateHandmadeStatus = useCallback(
		async (id: string, status: HandmadeIssue["status"]) => {
			const next = handmadeIssues.map((i) =>
				i.id === id ? { ...i, status, updatedAt: new Date().toISOString() } : i,
			)
			setHandmadeIssues(next)
			await window.api.invoke({
				type: "setState",
				patch: { handmadeIssues: next },
			})
		},
		[handmadeIssues],
	)

	const handleDeleteHandmade = useCallback(
		async (id: string) => {
			const next = handmadeIssues.filter((i) => i.id !== id)
			setHandmadeIssues(next)
			await window.api.invoke({
				type: "setState",
				patch: { handmadeIssues: next },
			})
		},
		[handmadeIssues],
	)

	return {
		handmadeIssues,
		creatingHandmade,
		setCreatingHandmade,
		newHandmadeTitle,
		setNewHandmadeTitle,
		handleCreateHandmade,
		handleUpdateHandmadeStatus,
		handleDeleteHandmade,
	}
}
