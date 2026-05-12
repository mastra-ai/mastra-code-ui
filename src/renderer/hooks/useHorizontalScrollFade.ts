import { useEffect, useRef } from "react"

export function useHorizontalScrollFade<T extends HTMLElement>(fadeSize = 24) {
	const ref = useRef<T | null>(null)

	useEffect(() => {
		const viewport = ref.current
		if (!viewport) return

		const updateFade = () => {
			const maxScrollLeft = Math.max(
				0,
				viewport.scrollWidth - viewport.clientWidth,
			)
			const start = Math.min(fadeSize, Math.max(0, viewport.scrollLeft))
			const end = Math.min(
				fadeSize,
				Math.max(0, maxScrollLeft - viewport.scrollLeft),
			)

			viewport.style.setProperty("--scroll-fade-x-start", `${start}px`)
			viewport.style.setProperty("--scroll-fade-x-end", `${end}px`)
			viewport.toggleAttribute("data-has-overflow-x", maxScrollLeft > 0)
			viewport.toggleAttribute("data-overflow-x-start", start > 0)
			viewport.toggleAttribute("data-overflow-x-end", end > 0)
		}

		updateFade()
		const frame = requestAnimationFrame(updateFade)
		const content = viewport.firstElementChild
		const resizeObserver =
			typeof ResizeObserver !== "undefined"
				? new ResizeObserver(updateFade)
				: null

		resizeObserver?.observe(viewport)
		if (content) resizeObserver?.observe(content)
		viewport.addEventListener("scroll", updateFade, { passive: true })
		window.addEventListener("resize", updateFade)

		return () => {
			cancelAnimationFrame(frame)
			resizeObserver?.disconnect()
			viewport.removeEventListener("scroll", updateFade)
			window.removeEventListener("resize", updateFade)
		}
	}, [fadeSize])

	return ref
}
