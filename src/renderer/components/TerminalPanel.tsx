import { useEffect, useRef, useCallback } from "react"
import { Terminal } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import { WebLinksAddon } from "@xterm/addon-web-links"

interface TerminalPanelProps {
	height: number
	isVisible: boolean
}

export function TerminalPanel({ height, isVisible }: TerminalPanelProps) {
	const containerRef = useRef<HTMLDivElement>(null)
	const termRef = useRef<Terminal | null>(null)
	const fitRef = useRef<FitAddon | null>(null)
	const sessionRef = useRef<string | null>(null)
	const unsubRef = useRef<(() => void) | null>(null)

	// Initialize terminal
	useEffect(() => {
		if (!containerRef.current) return

		const term = new Terminal({
			fontSize: 12,
			fontFamily: '"SF Mono", "Menlo", "Monaco", "Consolas", monospace',
			cursorBlink: true,
			theme: {
				background: "#09090b",
				foreground: "#fafafa",
				cursor: "#fafafa",
				selectionBackground: "#7c3aed66",
				black: "#09090b",
				red: "#ef4444",
				green: "#22c55e",
				yellow: "#f59e0b",
				blue: "#3b82f6",
				magenta: "#a855f7",
				cyan: "#06b6d4",
				white: "#fafafa",
				brightBlack: "#71717a",
				brightRed: "#f87171",
				brightGreen: "#4ade80",
				brightYellow: "#fbbf24",
				brightBlue: "#60a5fa",
				brightMagenta: "#c084fc",
				brightCyan: "#22d3ee",
				brightWhite: "#ffffff",
			},
		})

		const fitAddon = new FitAddon()
		const webLinksAddon = new WebLinksAddon()
		term.loadAddon(fitAddon)
		term.loadAddon(webLinksAddon)

		term.open(containerRef.current)
		fitAddon.fit()

		termRef.current = term
		fitRef.current = fitAddon

		// Create PTY session
		async function createPty() {
			const dims = fitAddon.proposeDimensions()
			const result = (await window.api.invoke({
				type: "ptyCreate",
				cols: dims?.cols ?? 80,
				rows: dims?.rows ?? 24,
			})) as { sessionId: string }
			sessionRef.current = result.sessionId

			// Send keystrokes to PTY
			term.onData((data) => {
				if (sessionRef.current) {
					window.api.invoke({
						type: "ptyWrite",
						sessionId: sessionRef.current,
						data,
					})
				}
			})

			// Listen for PTY output
			const unsub = window.api.onEvent((raw: unknown) => {
				const event = raw as {
					type: string
					sessionId?: string
					data?: string
					exitCode?: number
				}
				if (
					event.type === "pty_output" &&
					event.sessionId === sessionRef.current &&
					event.data
				) {
					term.write(event.data)
				} else if (
					event.type === "pty_exit" &&
					event.sessionId === sessionRef.current
				) {
					term.writeln(
						`\r\n\x1b[2m[Process exited with code ${event.exitCode ?? 0}]\x1b[0m`,
					)
					sessionRef.current = null
				}
			})
			unsubRef.current = unsub
		}

		createPty()

		return () => {
			// Cleanup
			if (sessionRef.current) {
				window.api.invoke({
					type: "ptyDestroy",
					sessionId: sessionRef.current,
				})
				sessionRef.current = null
			}
			unsubRef.current?.()
			term.dispose()
		}
	}, [])

	// Re-fit on height or visibility change
	useEffect(() => {
		if (isVisible && fitRef.current && termRef.current) {
			// Small delay for DOM layout to settle
			const timer = setTimeout(() => {
				fitRef.current?.fit()
				const dims = fitRef.current?.proposeDimensions()
				if (dims && sessionRef.current) {
					window.api.invoke({
						type: "ptyResize",
						sessionId: sessionRef.current,
						cols: dims.cols,
						rows: dims.rows,
					})
				}
			}, 50)
			return () => clearTimeout(timer)
		}
	}, [height, isVisible])

	if (!isVisible) return null

	return (
		<div
			style={{
				height,
				flexShrink: 0,
				overflow: "hidden",
				background: "#09090b",
			}}
		>
			<div
				ref={containerRef}
				style={{
					width: "100%",
					height: "100%",
					padding: "4px 0 0 4px",
				}}
			/>
		</div>
	)
}
