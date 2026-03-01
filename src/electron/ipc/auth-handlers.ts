import { ipcMain, shell } from "electron"
import type { IpcCommandHandler } from "./types.js"

export function getAuthHandlers(): Record<string, IpcCommandHandler> {
	return {
		login: async (command, ctx) => {
			const s = ctx.getActiveSession()
			const h = s.harness
			const authStorage = s.authStorage

			let pendingPromptResolve: ((value: string) => void) | null = null
			let pendingPromptReject: ((reason: Error) => void) | null = null

			const promptHandler = (
				_ev: Electron.IpcMainEvent,
				response: { answer: string } | { cancelled: true },
			) => {
				if ("cancelled" in response) {
					pendingPromptReject?.(new Error("Login cancelled"))
				} else {
					pendingPromptResolve?.(response.answer)
				}
				pendingPromptResolve = null
				pendingPromptReject = null
			}
			ipcMain.on("login:prompt-response", promptHandler)

			try {
				await authStorage.login(command.providerId, {
					onAuth: (info: any) => {
						shell.openExternal(info.url)
						ctx.mainWindow?.webContents.send("harness:event", {
							type: "login_auth",
							providerId: command.providerId,
							url: info.url,
							instructions: info.instructions,
						})
					},
					onPrompt: (prompt: any) => {
						return new Promise<string>((resolve, reject) => {
							pendingPromptResolve = resolve
							pendingPromptReject = reject
							ctx.mainWindow?.webContents.send("harness:event", {
								type: "login_prompt",
								providerId: command.providerId,
								message: prompt.message,
								placeholder: prompt.placeholder,
							})
						})
					},
					onProgress: (message: string) => {
						ctx.mainWindow?.webContents.send("harness:event", {
							type: "login_progress",
							providerId: command.providerId,
							message,
						})
					},
					onManualCodeInput: () => {
						return new Promise<string>((resolve, reject) => {
							pendingPromptResolve = resolve
							pendingPromptReject = reject
							ctx.mainWindow?.webContents.send("harness:event", {
								type: "login_prompt",
								providerId: command.providerId,
								message: "Paste the authorization code here:",
								placeholder: "Authorization code",
							})
						})
					},
					signal: new AbortController().signal,
				})

				const defaultModel = authStorage.getDefaultModelForProvider(
					command.providerId,
				)
				if (defaultModel) {
					await h.switchModel({ modelId: defaultModel })
				}
				ctx.mainWindow?.webContents.send("harness:event", {
					type: "login_success",
					providerId: command.providerId,
					modelId: h.getFullModelId(),
				})
			} catch (err: any) {
				ctx.mainWindow?.webContents.send("harness:event", {
					type: "login_error",
					providerId: command.providerId,
					error: err?.message ?? String(err),
				})
			} finally {
				ipcMain.removeListener("login:prompt-response", promptHandler)
			}
		},
		logout: async (command, ctx) => {
			ctx.getActiveSession().authStorage.logout(command.providerId)
		},
		setApiKey: async (command, ctx) => {
			const s = ctx.getActiveSession()
			const pid = command.providerId as string
			const key = command.apiKey as string
			if (!pid || !key) {
				return { success: false, error: "Missing providerId or apiKey" }
			}
			s.authStorage.set(pid, { type: "api_key", key })
			const defaultModel = s.authStorage.getDefaultModelForProvider(pid)
			if (defaultModel) {
				await s.harness.switchModel({ modelId: defaultModel })
			}
			ctx.mainWindow?.webContents.send("harness:event", {
				type: "login_success",
				providerId: pid,
				modelId: s.harness.getFullModelId(),
			})
			return { success: true }
		},
		getLoggedInProviders: async (_command, ctx) => {
			const authStorage = ctx.getActiveSession().authStorage
			return authStorage.list().filter((p: string) => authStorage.isLoggedIn(p))
		},
	}
}
