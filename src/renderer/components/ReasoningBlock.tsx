import { memo, useEffect, useRef, useState } from "react"
import { ChevronRightIcon, SparklesIcon } from "./Icons"
import { MessageMarkdown } from "./MessageMarkdown"
import { ShimmerText } from "./Shimmer"

const PREVIEW_LENGTH = 120

function formatElapsedTime(ms: number): string {
	if (ms < 1000) return ""
	const seconds = Math.floor(ms / 1000)
	if (seconds < 60) return `${seconds}s`
	const minutes = Math.floor(seconds / 60)
	const remainingSeconds = seconds % 60
	return remainingSeconds === 0
		? `${minutes}m`
		: `${minutes}m ${remainingSeconds}s`
}

interface ReasoningBlockProps {
	content: string
	streaming: boolean
	onFileClick?: (filePath: string) => void
}

export const ReasoningBlock = memo(function ReasoningBlock({
	content,
	streaming,
	onFileClick,
}: ReasoningBlockProps) {
	const hasContent = content.trim().length > 0
	const [expanded, setExpanded] = useState(streaming)
	const [elapsedMs, setElapsedMs] = useState(0)
	const [overflowing, setOverflowing] = useState(false)
	const startedAtRef = useRef(Date.now())
	const wasStreamingRef = useRef(streaming)
	const hasStreamedRef = useRef(streaming)
	const scrollRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		if (streaming) {
			hasStreamedRef.current = true
		} else if (wasStreamingRef.current) {
			setExpanded(false)
			setElapsedMs(Date.now() - startedAtRef.current)
		}
		wasStreamingRef.current = streaming
	}, [streaming])

	useEffect(() => {
		if (!streaming) return
		const tick = () => setElapsedMs(Date.now() - startedAtRef.current)
		tick()
		const interval = window.setInterval(tick, 1000)
		return () => window.clearInterval(interval)
	}, [streaming])

	useEffect(() => {
		const el = scrollRef.current
		if (!el || !expanded) return

		const checkOverflow = () => {
			setOverflowing(el.scrollHeight > el.clientHeight + 1)
			if (streaming) {
				el.scrollTop = el.scrollHeight
			}
		}

		checkOverflow()
		const frame = window.requestAnimationFrame(checkOverflow)
		const resizeObserver = new ResizeObserver(checkOverflow)
		resizeObserver.observe(el)

		return () => {
			window.cancelAnimationFrame(frame)
			resizeObserver.disconnect()
		}
	}, [content, expanded, streaming])

	const preview = content.replace(/\s+/g, " ").trim()
	const previewLabel =
		preview.length > PREVIEW_LENGTH
			? `${preview.slice(0, PREVIEW_LENGTH)}\u2026`
			: preview
	const elapsed = streaming ? formatElapsedTime(elapsedMs) : ""
	const label = streaming
		? "Thinking"
		: hasStreamedRef.current
			? `Thought for ${formatElapsedTime(elapsedMs) || "0s"}`
			: "Thought"

	return (
		<div className="reasoning-block">
			<button
				type="button"
				className="reasoning-toggle"
				aria-expanded={hasContent ? expanded : undefined}
				onClick={() => {
					if (hasContent) setExpanded((value) => !value)
				}}
				data-has-content={hasContent || undefined}
			>
				<span className="reasoning-icon" aria-hidden="true">
					<SparklesIcon width="14" height="14" />
				</span>
				{streaming ? (
					<ShimmerText className="reasoning-label">{label}</ShimmerText>
				) : (
					<span className="reasoning-label">{label}</span>
				)}
				{!expanded && previewLabel && (
					<span className="reasoning-preview">{previewLabel}</span>
				)}
				{elapsed && <span className="reasoning-elapsed">{elapsed}</span>}
				<span
					className="reasoning-chevron"
					data-expanded={expanded || undefined}
					aria-hidden="true"
				>
					<ChevronRightIcon width="12" height="12" />
				</span>
			</button>

			{expanded && hasContent && (
				<div className="reasoning-content-shell">
					<div
						className="reasoning-top-fade"
						data-visible={streaming && overflowing ? true : undefined}
					/>
					<div
						ref={scrollRef}
						className="reasoning-content"
						data-streaming={streaming || undefined}
					>
						<div data-component="markdown" data-variant="reasoning">
							<MessageMarkdown
								content={content}
								streaming={streaming}
								onFileClick={onFileClick}
							/>
						</div>
					</div>
				</div>
			)}
		</div>
	)
})
