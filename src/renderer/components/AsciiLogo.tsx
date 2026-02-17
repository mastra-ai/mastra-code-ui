import { useState, useEffect } from "react"

const LINES: Array<{ text: string; green: boolean; gapBefore?: boolean }> = [
	{ text: "█▀▄▀█ ▄▀█ █▀ ▀█▀ █▀█ ▄▀█", green: false },
	{ text: "█ ▀ █ █▀█ ▄█  █  █▀▄ █▀█", green: false },
	{ text: "     █▀▀ █▀█ █▀▄ █▀▀", green: true, gapBefore: true },
	{ text: "     █▄▄ █▄█ █▄▀ ██▄", green: true },
]

const PAUSE_TICKS = 12

const CHAR_TOTAL = LINES.reduce((s, l) => s + l.text.length, 0)
const MASTRA_CHARS = LINES.filter((l) => !l.green).reduce((s, l) => s + l.text.length, 0)
const TOTAL = CHAR_TOTAL + PAUSE_TICKS

export function AsciiLogo() {
	const [tick, setTick] = useState(0)
	const done = tick >= TOTAL

	useEffect(() => {
		if (done) return
		const id = setInterval(() => setTick((t) => Math.min(t + 1, TOTAL)), 12)
		return () => clearInterval(id)
	}, [done])

	// Characters revealed for each section
	const mastraRevealed = Math.min(tick, MASTRA_CHARS)
	const codeRevealed = Math.max(0, tick - MASTRA_CHARS - PAUSE_TICKS)

	let mastraRem = mastraRevealed
	let codeRem = codeRevealed

	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				justifyContent: "center",
				height: "100%",
				gap: 16,
			}}
		>
			<pre
				style={{
					fontFamily:
						"'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
					fontSize: 15,
					lineHeight: 1.15,
					margin: 0,
				}}
			>
				{LINES.map((line, i) => {
					const rem = line.green ? codeRem : mastraRem
					const isVisible = rem > 0
					const shown = isVisible
						? Math.min(rem, line.text.length)
						: 0
					const isActiveLine =
						isVisible && rem <= line.text.length
					if (line.green) {
						codeRem -= line.text.length
					} else {
						mastraRem -= line.text.length
					}

					const visibleText = line.text.slice(0, shown).trimEnd()
					const showCursor =
						!done && isActiveLine && visibleText.length > 0

					return (
						<div
							key={i}
							style={{
								color: line.green ? "#00FF41" : "var(--text)",
								textShadow:
									line.green && visibleText
										? "0 0 10px rgba(0,255,65,0.3)"
										: "none",
								height: "1.15em",
								marginTop: line.gapBefore ? 10 : 0,
								whiteSpace: "pre",
							}}
							className={
								done && line.green
									? "ascii-glow-settle"
									: undefined
							}
						>
							{visibleText}
							{showCursor && (
								<span
									className="ascii-cursor"
									style={{
										display: "inline-block",
										width: 2,
										height: "0.85em",
										marginLeft: 1,
										background: "#00FF41",
										boxShadow:
											"0 0 4px rgba(0,255,65,0.6)",
										verticalAlign: "text-bottom",
									}}
								/>
							)}
						</div>
					)
				})}
			</pre>

			<div
				style={{
					fontSize: 13,
					color: "var(--dim)",
					opacity: done ? 1 : 0,
					transition: "opacity 0.8s ease",
				}}
			>
				Send a message to get started
			</div>

			<style>{`
				@keyframes ascii-blink {
					50% { opacity: 0; }
				}
				@keyframes ascii-glow {
					0% { text-shadow: 0 0 20px rgba(0,255,65,0.8), 0 0 40px rgba(0,255,65,0.4); }
					100% { text-shadow: 0 0 10px rgba(0,255,65,0.3); }
				}
				.ascii-cursor {
					animation: ascii-blink 0.53s step-end infinite;
				}
				.ascii-glow-settle {
					animation: ascii-glow 0.8s ease-out forwards;
				}
			`}</style>
		</div>
	)
}
