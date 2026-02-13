import { useCallback, useRef } from "react"

interface ResizeHandleProps {
	onResize: (deltaY: number) => void
}

export function ResizeHandle({ onResize }: ResizeHandleProps) {
	const startY = useRef(0)

	const onMouseDown = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault()
			startY.current = e.clientY

			const onMouseMove = (ev: MouseEvent) => {
				const delta = startY.current - ev.clientY
				startY.current = ev.clientY
				onResize(delta)
			}

			const onMouseUp = () => {
				document.removeEventListener("mousemove", onMouseMove)
				document.removeEventListener("mouseup", onMouseUp)
				document.body.style.cursor = ""
				document.body.style.userSelect = ""
			}

			document.addEventListener("mousemove", onMouseMove)
			document.addEventListener("mouseup", onMouseUp)
			document.body.style.cursor = "row-resize"
			document.body.style.userSelect = "none"
		},
		[onResize],
	)

	return (
		<div
			onMouseDown={onMouseDown}
			style={{
				height: 4,
				cursor: "row-resize",
				background: "var(--border-muted)",
				flexShrink: 0,
				transition: "background 0.15s",
			}}
			onMouseEnter={(e) => {
				e.currentTarget.style.background = "var(--accent)"
			}}
			onMouseLeave={(e) => {
				e.currentTarget.style.background = "var(--border-muted)"
			}}
		/>
	)
}
