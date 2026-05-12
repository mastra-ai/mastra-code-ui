import { memo, useCallback, useEffect, useMemo, useState } from "react"
import { renderMermaidSVG, type RenderOptions } from "beautiful-mermaid"
import { useIsCodeFenceIncomplete } from "streamdown"
import {
	CheckStrokeIcon,
	CopyStrokeIcon,
	DownloadStrokeIcon,
	FullscreenIcon,
} from "./Icons"

// Render options bound to MastraCode tokens — synchronous, no runtime mermaid.js.
const MERMAID_RENDER_OPTIONS: RenderOptions = {
	bg: "var(--background)",
	fg: "var(--foreground)",
	accent: "var(--primary)",
	line: "color-mix(in oklch, var(--foreground) 48%, var(--background))",
	muted: "var(--muted-foreground)",
	surface: "var(--popover)",
	border: "var(--border)",
	font: "var(--font-sans)",
	padding: 28,
	nodeSpacing: 28,
	layerSpacing: 48,
	componentSpacing: 28,
	transparent: true,
}

// Strip source-level color overrides so the design system always wins.
const THEME_OVERRIDE_DIRECTIVE_LINE =
	/^\s*(?:style\s+\S+\s+|classDef\s+|linkStyle\s+.*\bstroke\s*:)/i

function sanitizeMermaidCode(code: string): string {
	return code
		.split("\n")
		.filter((line) => !THEME_OVERRIDE_DIRECTIVE_LINE.test(line))
		.join("\n")
}

function getStats(source: string): { lines: number; chars: number } {
	const lines = source
		.split("\n")
		.filter((l) => l.trim().length > 0).length
	return { lines, chars: source.length }
}

function downloadSvg(svg: string, filename = "diagram.svg"): void {
	const blob = new Blob([svg], { type: "image/svg+xml" })
	const url = URL.createObjectURL(blob)
	const a = document.createElement("a")
	a.href = url
	a.download = filename
	document.body.appendChild(a)
	a.click()
	a.remove()
	URL.revokeObjectURL(url)
}

function MermaidLoader() {
	return (
		<div className="mermaid-loader" role="status" aria-live="polite">
			<svg
				aria-hidden="true"
				fill="none"
				height="80"
				viewBox="0 0 48 48"
				width="80"
				xmlns="http://www.w3.org/2000/svg"
			>
				<circle className="ml-center" cx="24" cy="19" r="1.2" />
				<rect className="ml-n1" height="11" rx="3.5" width="18" x="15" y="2" />
				<rect className="ml-bar ml-b1" height="2" width="10" x="19" y="5" />
				<rect className="ml-bar ml-b1b" height="1.5" width="7" x="19" y="8.5" />
				<path className="ml-edge ml-e1" d="M19.5 13 C19.5 18 12 18 12 23" />
				<polygon className="ml-arrow ml-a1" points="9.8,21.5 12,24.5 14.2,21.5" />
				<path className="ml-edge ml-e2" d="M28.5 13 C28.5 18 36 18 36 23" />
				<polygon className="ml-arrow ml-a2" points="33.8,21.5 36,24.5 38.2,21.5" />
				<rect className="ml-n2" height="11" rx="3.5" width="18" x="3" y="25" />
				<rect className="ml-bar ml-b2" height="2" width="10" x="7" y="28" />
				<rect className="ml-bar ml-b2b" height="1.5" width="6.5" x="7" y="31.5" />
				<rect className="ml-n3" height="11" rx="3.5" width="18" x="27" y="25" />
				<rect className="ml-bar ml-b3" height="2" width="10" x="31" y="28" />
				<rect className="ml-bar ml-b3b" height="1.5" width="7" x="31" y="31.5" />
				<line className="ml-dash" x1="21" x2="27" y1="30.5" y2="30.5" />
				<rect className="ml-glow ml-g1" height="11" rx="3.5" width="18" x="15" y="2" />
				<rect className="ml-glow ml-g2" height="11" rx="3.5" width="18" x="3" y="25" />
				<rect className="ml-glow ml-g3" height="11" rx="3.5" width="18" x="27" y="25" />
			</svg>
			<span>Rendering diagram…</span>
		</div>
	)
}

function StreamingDraft({ code }: { code: string }) {
	const { lines, chars } = useMemo(() => getStats(code), [code])
	return (
		<div className="mermaid-frame" data-state="streaming">
			<div className="mermaid-header">
				<span className="mermaid-kicker">Mermaid</span>
				<span className="mermaid-stats">
					{lines} {lines === 1 ? "line" : "lines"} · {chars} chars
				</span>
				<div className="mermaid-tools" />
			</div>
			<div className="mermaid-body">
				<MermaidLoader />
			</div>
		</div>
	)
}

function MermaidDialog({ svg, onClose }: { svg: string; onClose: () => void }) {
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose()
		}
		window.addEventListener("keydown", onKey)
		return () => window.removeEventListener("keydown", onKey)
	}, [onClose])

	return (
		<div className="mermaid-dialog-backdrop" onClick={onClose}>
			<div
				className="mermaid-dialog-panel"
				onClick={(e) => e.stopPropagation()}
			>
				<button
					className="mermaid-dialog-close"
					onClick={onClose}
					title="Close. Press Esc."
					aria-label="Close dialog"
					type="button"
				>
					&times;
				</button>
				<div
					className="mermaid-dialog-svg"
					dangerouslySetInnerHTML={{ __html: svg }}
				/>
			</div>
		</div>
	)
}

function MermaidBlockReady({ code }: { code: string }) {
	const { svg, error } = useMemo(() => {
		try {
			return {
				svg: renderMermaidSVG(
					sanitizeMermaidCode(code),
					MERMAID_RENDER_OPTIONS,
				),
				error: null as string | null,
			}
		} catch (err) {
			return {
				svg: null as string | null,
				error: err instanceof Error ? err.message : "Failed to render diagram",
			}
		}
	}, [code])

	const [copied, setCopied] = useState(false)
	const [showDialog, setShowDialog] = useState(false)

	const handleCopy = useCallback(() => {
		navigator.clipboard.writeText(code)
		setCopied(true)
		const timer = setTimeout(() => setCopied(false), 1500)
		return () => clearTimeout(timer)
	}, [code])

	const handleDownload = useCallback(() => {
		if (svg) downloadSvg(svg)
	}, [svg])

	const handleExpand = useCallback(() => {
		if (svg) setShowDialog(true)
	}, [svg])

	const handleClose = useCallback(() => setShowDialog(false), [])

	return (
		<>
			<div className="mermaid-frame">
				<div className="mermaid-header">
					<span className="mermaid-kicker">Mermaid</span>
					<span className="mermaid-stats" />
					<div className="mermaid-tools">
						<button
							type="button"
							onClick={handleCopy}
							title={copied ? "Copied" : "Copy source"}
							aria-label={copied ? "Copied" : "Copy source"}
							data-copied={copied || undefined}
						>
							{copied ? <CheckStrokeIcon /> : <CopyStrokeIcon />}
						</button>
						{svg && (
							<>
								<button
									type="button"
									onClick={handleDownload}
									title="Download SVG"
									aria-label="Download SVG"
								>
									<DownloadStrokeIcon />
								</button>
								<button
									type="button"
									onClick={handleExpand}
									title="Open in dialog"
									aria-label="Open in dialog"
								>
									<FullscreenIcon />
								</button>
							</>
						)}
					</div>
				</div>
				<div className="mermaid-body">
					{svg ? (
						<div
							className="mermaid-diagram"
							role="button"
							tabIndex={0}
							onClick={handleExpand}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault()
									handleExpand()
								}
							}}
							aria-label="Open diagram in dialog"
							dangerouslySetInnerHTML={{ __html: svg }}
						/>
					) : (
						<div className="mermaid-error">
							<span>{error || "Couldn't render diagram"}</span>
							<details>
								<summary>Show diagram code</summary>
								<pre>{code}</pre>
							</details>
						</div>
					)}
				</div>
			</div>

			{showDialog && svg && (
				<MermaidDialog svg={svg} onClose={handleClose} />
			)}
		</>
	)
}

interface MermaidBlockProps {
	code: string
}

export const MermaidBlock = memo(function MermaidBlock({
	code,
}: MermaidBlockProps) {
	const isStreaming = useIsCodeFenceIncomplete()
	if (isStreaming) return <StreamingDraft code={code} />
	return <MermaidBlockReady code={code} />
})
