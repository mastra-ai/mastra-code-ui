import { defineConfig, externalizeDepsPlugin } from "electron-vite"
import react from "@vitejs/plugin-react"
import { resolve } from "path"

export default defineConfig({
	main: {
		plugins: [
			externalizeDepsPlugin({ include: ["@ast-grep/napi", "node-pty"] }),
		],
		build: {
			outDir: "dist/main",
			rollupOptions: {
				input: "src/electron/main.ts",
				external: ["@ast-grep/napi", "node-pty"],
				output: {
					format: "cjs",
				},
			},
		},
	},
	preload: {
		plugins: [externalizeDepsPlugin()],
		build: {
			outDir: "dist/preload",
			rollupOptions: {
				input: "src/electron/preload.ts",
				output: {
					format: "cjs",
				},
			},
		},
	},
	renderer: {
		root: "src/renderer",
		plugins: [react()],
		build: {
			outDir: resolve(__dirname, "dist/renderer"),
			rollupOptions: {
				input: resolve(__dirname, "src/renderer/index.html"),
			},
		},
	},
})
