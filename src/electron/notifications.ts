import { Notification } from "electron"
import type { WorktreeSession } from "./ipc/types.js"

export function sendDesktopNotification(
	title: string,
	body: string,
	sessions: Map<string, WorktreeSession>,
	activeSessionPath: string,
) {
	const session = sessions.get(activeSessionPath)
	if (!session) return
	try {
		const state = session.harness.getState()
		const pref = state?.notifications ?? "off"
		if (pref === "system" || pref === "both") {
			new Notification({ title, body }).show()
		}
	} catch {
		// Non-critical
	}
}
