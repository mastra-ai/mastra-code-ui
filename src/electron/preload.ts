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

	platform: process.platform,
}

contextBridge.exposeInMainWorld("api", api)

export type ElectronAPI = typeof api
