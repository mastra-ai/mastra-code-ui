import { useEffect, useRef, useCallback, useState } from "react"
import { Terminal } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import { WebLinksAddon } from "@xterm/addon-web-links"

interface TerminalInstance {
	id: string
	term: Terminal
	fitAddon: FitAddon
	sessionId: string | null
	unsub: (() => void) | null
	exited: boolean
	opened: boolean
	starting: boolean
}

const THEME = {
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
}

interface TerminalPanelProps {
	height: number
	projectPath?: string | null
}

let termCounter = 0

export function TerminalPanel({ height, projectPath }: TerminalPanelProps) {
	const containerRef = useRef<HTMLDivElement>(null)
	const instancesRef = useRef<Map<string, TerminalInstance>>(new Map())
	const [tabs, setTabs] = useState<string[]>(() => {
		const id = `term-${++termCounter}`
		return [id]
	})
	const [activeTab, setActiveTab] = useState<string>(tabs[0])

	// Create a TerminalInstance object (xterm + addons, no DOM yet)
	const ensureInstance = useCallback((id: string): TerminalInstance => {
		const existing = instancesRef.current.get(id)
		if (existing) return existing

		const term = new Terminal({
			fontSize: 12,
			fontFamily: '"SF Mono", "Menlo", "Monaco", "Consolas", monospace',
			cursorBlink: true,
			theme: THEME,
		})

		const fitAddon = new FitAddon()
		term.loadAddon(fitAddon)
		term.loadAddon(new WebLinksAddon())

		const instance: TerminalInstance = {
			id,
			term,
			fitAddon,
			sessionId: null,
			unsub: null,
			exited: false,
			opened: false,
			starting: false,
		}

		instancesRef.current.set(id, instance)
		return instance
	}, [])

	// Start a PTY session for an instance (idempotent, retries if IPC not ready)
	const startPty = useCallback((inst: TerminalInstance, retries = 0) => {
		console.log("[terminal] startPty called", {
			id: inst.id,
			hasSession: !!inst.sessionId,
			exited: inst.exited,
			starting: inst.starting,
			retries,
		})
		if (inst.sessionId || inst.exited || inst.starting) return
		inst.starting = true

		const dims = inst.fitAddon.proposeDimensions()
		console.log("[terminal] invoking ptyCreate", { dims })
		window.api
			.invoke({
				type: "ptyCreate",
				cols: dims?.cols ?? 80,
				rows: dims?.rows ?? 24,
			})
			.then((result) => {
				console.log("[terminal] ptyCreate result:", result)
				const { sessionId } = result as { sessionId: string }
				inst.sessionId = sessionId
				inst.starting = false

				inst.term.onData((data) => {
					if (inst.sessionId) {
						window.api.invoke({
							type: "ptyWrite",
							sessionId: inst.sessionId,
							data,
						})
					}
				})

				const unsub = window.api.onEvent((raw: unknown) => {
					const ev = raw as {
						type: string
						sessionId?: string
						data?: string
						exitCode?: number
					}
					if (
						ev.type === "pty_output" &&
						ev.sessionId === inst.sessionId &&
						ev.data
					) {
						inst.term.write(ev.data)
					} else if (
						ev.type === "pty_exit" &&
						ev.sessionId === inst.sessionId
					) {
						inst.term.writeln(
							`\r\n\x1b[2m[Process exited with code ${ev.exitCode ?? 0}]\x1b[0m`,
						)
						inst.sessionId = null
						inst.exited = true
					}
				})
				inst.unsub = unsub
			})
			.catch((err: unknown) => {
				console.error("[terminal] ptyCreate failed:", err)
				inst.starting = false
				// Only retry if it looks like IPC isn't ready yet (not a spawn error)
				const msg = String(err)
				if (retries < 10 && (msg.includes("No handler") || msg.includes("not registered"))) {
					setTimeout(() => startPty(inst, retries + 1), 500)
				} else {
					inst.term.writeln(`\r\n\x1b[31m[Terminal error: ${msg}]\x1b[0m`)
				}
			})
	}, [])

	const addTerminal = useCallback(() => {
		const id = `term-${++termCounter}`
		setTabs((prev) => [...prev, id])
		setActiveTab(id)
	}, [])

	const closeTerminal = useCallback(
		(id: string) => {
			const instance = instancesRef.current.get(id)
			if (instance) {
				if (instance.sessionId) {
					window.api.invoke({
						type: "ptyDestroy",
						sessionId: instance.sessionId,
					})
				}
				instance.unsub?.()
				instance.term.dispose()
				instancesRef.current.delete(id)
			}

			setTabs((prev) => {
				const next = prev.filter((t) => t !== id)
				if (next.length === 0) {
					const newId = `term-${++termCounter}`
					setActiveTab(newId)
					return [newId]
				}
				setActiveTab((current) =>
					current === id ? next[next.length - 1] : current,
				)
				return next
			})
		},
		[],
	)

	// Mount/switch: open xterm into DOM, start PTY, focus
	useEffect(() => {
		const container = containerRef.current
		console.log("[terminal] mount effect", {
			hasContainer: !!container,
			activeTab,
			containerSize: container
				? `${container.offsetWidth}x${container.offsetHeight}`
				: "n/a",
		})
		if (!container || !activeTab) return

		const instance = ensureInstance(activeTab)

		// Clear container
		while (container.firstChild) {
			container.removeChild(container.firstChild)
		}

		// Open xterm into DOM or re-attach
		if (!instance.opened) {
			instance.term.open(container)
			instance.opened = true
		} else if (instance.term.element) {
			container.appendChild(instance.term.element)
		}

		// Fit + start PTY + focus
		const raf = requestAnimationFrame(() => {
			try {
				instance.fitAddon.fit()
			} catch {
				// ignore
			}
			startPty(instance)
			instance.term.focus()
		})

		return () => cancelAnimationFrame(raf)
	}, [activeTab, ensureInstance, startPty])

	// Re-fit on height change
	useEffect(() => {
		if (!activeTab) return
		const instance = instancesRef.current.get(activeTab)
		if (!instance) return

		const timer = setTimeout(() => {
			try {
				instance.fitAddon.fit()
			} catch {
				return
			}
			const dims = instance.fitAddon.proposeDimensions()
			if (dims && instance.sessionId) {
				window.api.invoke({
					type: "ptyResize",
					sessionId: instance.sessionId,
					cols: dims.cols,
					rows: dims.rows,
				})
			}
		}, 50)
		return () => clearTimeout(timer)
	}, [height, activeTab])

	// Reset terminals when project path changes (e.g. switching worktrees)
	const prevProjectPath = useRef(projectPath)
	useEffect(() => {
		if (prevProjectPath.current === projectPath) return
		prevProjectPath.current = projectPath

		// Tear down all existing terminal instances
		for (const instance of instancesRef.current.values()) {
			if (instance.sessionId) {
				window.api.invoke({ type: "ptyDestroy", sessionId: instance.sessionId })
			}
			instance.unsub?.()
			instance.term.dispose()
		}
		instancesRef.current.clear()

		// Create a fresh terminal tab
		const newId = `term-${++termCounter}`
		setTabs([newId])
		setActiveTab(newId)
	}, [projectPath])

	// Cleanup all on unmount
	useEffect(() => {
		return () => {
			for (const instance of instancesRef.current.values()) {
				if (instance.sessionId) {
					window.api.invoke({
						type: "ptyDestroy",
						sessionId: instance.sessionId,
					})
				}
				instance.unsub?.()
				instance.term.dispose()
			}
			instancesRef.current.clear()
		}
	}, [])

	return (
		<div
			style={{
				height,
				flexShrink: 0,
				display: "flex",
				flexDirection: "column",
				overflow: "hidden",
				background: "#09090b",
			}}
		>
			{/* Terminal tab bar */}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					borderTop: "1px solid var(--border-muted)",
					borderBottom: "1px solid var(--border-muted)",
					background: "var(--bg-surface)",
					flexShrink: 0,
					height: 28,
					overflow: "hidden",
				}}
			>
				<span
					style={{
						fontSize: 10,
						fontWeight: 600,
						color: "var(--muted)",
						padding: "0 8px",
						textTransform: "uppercase",
						letterSpacing: "0.5px",
						flexShrink: 0,
					}}
				>
					Terminal
				</span>

				{tabs.length > 1 && (
					<div
						style={{
							display: "flex",
							alignItems: "center",
							flex: 1,
							overflow: "hidden",
							gap: 1,
						}}
					>
						{tabs.map((id, i) => (
							<div
								key={id}
								style={{
									display: "flex",
									alignItems: "center",
									gap: 2,
									padding: "0 2px 0 8px",
									fontSize: 11,
									color:
										activeTab === id
											? "var(--text)"
											: "var(--muted)",
									background:
										activeTab === id
											? "#09090b"
											: "transparent",
									borderRadius: "3px 3px 0 0",
									cursor: "pointer",
									flexShrink: 0,
									height: 22,
								}}
								onClick={() => setActiveTab(id)}
							>
								<span style={{ fontSize: 11 }}>{i + 1}</span>
								<button
									onClick={(e) => {
										e.stopPropagation()
										closeTerminal(id)
									}}
									style={{
										background: "transparent",
										border: "none",
										color: "var(--dim)",
										cursor: "pointer",
										fontSize: 11,
										padding: "0 2px",
										lineHeight: 1,
									}}
									title="Close terminal"
								>
									&times;
								</button>
							</div>
						))}
					</div>
				)}

				{tabs.length <= 1 && <div style={{ flex: 1 }} />}

				{/* Add terminal button */}
				<button
					onClick={addTerminal}
					style={{
						background: "transparent",
						border: "none",
						color: "var(--muted)",
						cursor: "pointer",
						fontSize: 14,
						padding: "0 6px",
						lineHeight: 1,
						flexShrink: 0,
					}}
					title="New terminal"
				>
					+
				</button>
			</div>

			{/* Terminal content */}
			<div
				ref={containerRef}
				onClick={() => {
					if (activeTab) {
						instancesRef.current.get(activeTab)?.term.focus()
					}
				}}
				style={{
					flex: 1,
					overflow: "hidden",
					padding: "4px 0 4px 4px",
				}}
			/>
		</div>
	)
}
