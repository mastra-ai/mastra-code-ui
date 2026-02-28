import { contextBridge, ipcRenderer } from "electron"

export type HarnessCommand = {
	type: string
	[key: string]: unknown
}

const api = {
	invoke: (command: HarnessCommand): Promise<unknown> =>
		ipcRenderer.invoke("harness:command", command),

	onEvent: (callback: (event: unknown) => void): (() => void) => {
		const handler = (_: Electron.IpcRendererEvent, event: unknown) =>
			callback(event)
		ipcRenderer.on("harness:event", handler)
		return () => ipcRenderer.removeListener("harness:event", handler)
	},

	/** Send login prompt response back to main process */
	respondToLoginPrompt: (answer: string): void => {
		ipcRenderer.send("login:prompt-response", { answer })
	},

	/** Cancel a login prompt */
	cancelLoginPrompt: (): void => {
		ipcRenderer.send("login:prompt-response", { cancelled: true })
	},

	/** Set dock badge count (macOS) */
	setBadgeCount: (count: number): void => {
		ipcRenderer.send("set-badge-count", count)
	},

	/** Listen for URLs that should be opened in the app browser */
	onOpenUrl: (callback: (url: string) => void): (() => void) => {
		const handler = (_: Electron.IpcRendererEvent, url: string) => callback(url)
		ipcRenderer.on("open-url", handler)
		return () => ipcRenderer.removeListener("open-url", handler)
	},

	platform: process.platform,
}

contextBridge.exposeInMainWorld("api", api)

export type ElectronAPI = typeof api
