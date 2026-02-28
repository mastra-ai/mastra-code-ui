import { useState, useRef, useCallback } from "react"

interface BrowserHistoryEntry {
	url: string
	title: string
	lastVisited: number
}

interface BrowserViewProps {
	url: string
	onNavigate: (newUrl: string) => void
	onClose: () => void
	onTitleChange?: (title: string) => void
}

function loadHistory(): BrowserHistoryEntry[] {
	try {
		const raw = localStorage.getItem("browser-history")
		return raw ? JSON.parse(raw) : []
	} catch {
		return []
	}
}

function saveHistory(entries: BrowserHistoryEntry[]) {
	localStorage.setItem("browser-history", JSON.stringify(entries.slice(0, 200)))
}

function addToHistory(url: string, title: string) {
	if (!url || url === "about:blank") return
	const entries = loadHistory().filter((e) => e.url !== url)
	entries.unshift({ url, title: title || url, lastVisited: Date.now() })
	saveHistory(entries)
}

function normalizeUrl(input: string): string {
	const trimmed = input.trim()
	if (!trimmed) return ""
	if (/^https?:\/\//i.test(trimmed)) return trimmed
	if (/^localhost[:/]|^127\.0\.0\.1[:/]|^0\.0\.0\.0[:/]/.test(trimmed)) return `http://${trimmed}`
	if (/^[\w-]+\.[\w.]+/.test(trimmed)) return `https://${trimmed}`
	return `https://${trimmed}`
}

export function BrowserView({ url, onNavigate, onClose, onTitleChange }: BrowserViewProps) {
	const iframeRef = useRef<HTMLIFrameElement>(null)
	const [addressValue, setAddressValue] = useState(url)
	const [isLoading, setIsLoading] = useState(true)
	const [historyDropdown, setHistoryDropdown] = useState(false)
	const [historyFilter, setHistoryFilter] = useState("")
	const [navStack, setNavStack] = useState<string[]>([url])
	const [navIndex, setNavIndex] = useState(0)
	const addressRef = useRef<HTMLInputElement>(null)
	const [error, setError] = useState<string | null>(null)

	const canGoBack = navIndex > 0
	const canGoForward = navIndex < navStack.length - 1

	const navigateTo = useCallback(
		(input: string, addToStack = true) => {
			const normalized = normalizeUrl(input)
			if (!normalized) return
			setAddressValue(normalized)
			setHistoryDropdown(false)
			setIsLoading(true)
			setError(null)
			if (addToStack) {
				setNavStack((prev) => [...prev.slice(0, navIndex + 1), normalized])
				setNavIndex((prev) => prev + 1)
			}
			onNavigate(normalized)
			addToHistory(normalized, normalized)
		},
		[navIndex, onNavigate],
	)

	const handleBack = useCallback(() => {
		if (navIndex > 0) {
			const newIndex = navIndex - 1
			const prevUrl = navStack[newIndex]
			setNavIndex(newIndex)
			setAddressValue(prevUrl)
			setIsLoading(true)
			setError(null)
			onNavigate(prevUrl)
		}
	}, [navIndex, navStack, onNavigate])

	const handleForward = useCallback(() => {
		if (navIndex < navStack.length - 1) {
			const newIndex = navIndex + 1
			const nextUrl = navStack[newIndex]
			setNavIndex(newIndex)
			setAddressValue(nextUrl)
			setIsLoading(true)
			setError(null)
			onNavigate(nextUrl)
		}
	}, [navIndex, navStack, onNavigate])

	const handleReload = useCallback(() => {
		const iframe = iframeRef.current
		if (!iframe) return
		if (isLoading) {
			// Can't really stop an iframe, just let it finish
			return
		}
		setIsLoading(true)
		setError(null)
		// Force reload by re-setting src
		const currentSrc = iframe.src
		iframe.src = ""
		iframe.src = currentSrc
	}, [isLoading])

	const handleIframeLoad = useCallback(() => {
		setIsLoading(false)
		const iframe = iframeRef.current
		if (!iframe) return
		try {
			const title = iframe.contentDocument?.title
			if (title) {
				onTitleChange?.(title)
				addToHistory(addressValue, title)
			}
		} catch {
			// Cross-origin — can't access contentDocument
		}
	}, [addressValue, onTitleChange])

	const handleIframeError = useCallback(() => {
		setIsLoading(false)
		setError("Failed to load page")
	}, [])

	// The actual URL to load in the iframe (derived from navStack + navIndex)
	const iframeSrc = navStack[navIndex] || url

	// History dropdown items
	const historyItems = historyDropdown
		? loadHistory().filter((e) => {
				if (!historyFilter) return true
				const lower = historyFilter.toLowerCase()
				return (
					e.url.toLowerCase().includes(lower) ||
					e.title.toLowerCase().includes(lower)
				)
			}).slice(0, 20)
		: []

	return (
		<div
			style={{
				flex: 1,
				display: "flex",
				flexDirection: "column",
				overflow: "hidden",
				}}
		>
			{/* Navigation bar */}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 4,
					padding: "6px 8px",
					background: "var(--bg-surface)",
					borderBottom: "1px solid var(--border-muted)",
					flexShrink: 0,
				}}
			>
				{/* Back */}
				<button
					onClick={handleBack}
					disabled={!canGoBack}
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						width: 28,
						height: 28,
						borderRadius: 6,
						color: canGoBack ? "var(--text)" : "var(--dim)",
						cursor: canGoBack ? "pointer" : "default",
						background: "transparent",
					}}
					title="Back"
				>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
						<polyline points="15 18 9 12 15 6" />
					</svg>
				</button>

				{/* Forward */}
				<button
					onClick={handleForward}
					disabled={!canGoForward}
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						width: 28,
						height: 28,
						borderRadius: 6,
						color: canGoForward ? "var(--text)" : "var(--dim)",
						cursor: canGoForward ? "pointer" : "default",
						background: "transparent",
					}}
					title="Forward"
				>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
						<polyline points="9 18 15 12 9 6" />
					</svg>
				</button>

				{/* Reload */}
				<button
					onClick={handleReload}
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						width: 28,
						height: 28,
						borderRadius: 6,
						color: "var(--text)",
						cursor: "pointer",
						background: "transparent",
					}}
					title={isLoading ? "Loading..." : "Reload"}
				>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
						<polyline points="23 4 23 10 17 10" />
						<path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
					</svg>
				</button>

				{/* Address bar */}
				<div style={{ flex: 1, position: "relative" }}>
					<input
						ref={addressRef}
						type="text"
						value={addressValue}
						onChange={(e) => {
							setAddressValue(e.target.value)
							setHistoryFilter(e.target.value)
							setHistoryDropdown(true)
						}}
						onFocus={() => {
							addressRef.current?.select()
							setHistoryDropdown(true)
						}}
						onBlur={() => {
							setTimeout(() => setHistoryDropdown(false), 200)
						}}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								e.preventDefault()
								navigateTo(addressValue)
								addressRef.current?.blur()
							}
							if (e.key === "Escape") {
								e.preventDefault()
								setHistoryDropdown(false)
								addressRef.current?.blur()
							}
						}}
						style={{
							width: "100%",
							padding: "4px 10px",
							background: "var(--bg)",
							border: "1px solid var(--border-muted)",
							borderRadius: 6,
							color: "var(--text)",
							fontSize: 12,
							fontFamily: "inherit",
							outline: "none",
						}}
						placeholder="Enter URL..."
					/>

					{/* History autocomplete dropdown */}
					{historyDropdown && historyItems.length > 0 && (
						<div
							style={{
								position: "absolute",
								top: "100%",
								left: 0,
								right: 0,
								marginTop: 4,
								background: "var(--bg-elevated)",
								border: "1px solid var(--border)",
								borderRadius: 8,
								maxHeight: 240,
								overflowY: "auto",
								zIndex: 10,
							}}
						>
							{historyItems.map((entry) => (
								<div
									key={entry.url}
									onMouseDown={(e) => {
										e.preventDefault()
										navigateTo(entry.url)
									}}
									style={{
										padding: "6px 10px",
										cursor: "pointer",
										display: "flex",
										flexDirection: "column",
										gap: 1,
									}}
									onMouseEnter={(e) => {
										e.currentTarget.style.background = "var(--accent)22"
									}}
									onMouseLeave={(e) => {
										e.currentTarget.style.background = "transparent"
									}}
								>
									<span
										style={{
											fontSize: 12,
											color: "var(--text)",
											overflow: "hidden",
											textOverflow: "ellipsis",
											whiteSpace: "nowrap",
										}}
									>
										{entry.title}
									</span>
									<span
										style={{
											fontSize: 10,
											color: "var(--dim)",
											overflow: "hidden",
											textOverflow: "ellipsis",
											whiteSpace: "nowrap",
										}}
									>
										{entry.url}
									</span>
								</div>
							))}
						</div>
					)}
				</div>

				{/* Open in external browser */}
				<button
					onClick={() => window.api.invoke({ type: "openExternal", url: iframeSrc })}
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						width: 28,
						height: 28,
						borderRadius: 6,
						color: "var(--muted)",
						cursor: "pointer",
						background: "transparent",
					}}
					title="Open in external browser"
				>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
						<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
						<polyline points="15 3 21 3 21 9" />
						<line x1="10" y1="14" x2="21" y2="3" />
					</svg>
				</button>

				{/* Close */}
				<button
					onClick={onClose}
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						width: 28,
						height: 28,
						borderRadius: 6,
						color: "var(--muted)",
						cursor: "pointer",
						background: "transparent",
					}}
					title="Close browser tab"
				>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
						<line x1="18" y1="6" x2="6" y2="18" />
						<line x1="6" y1="6" x2="18" y2="18" />
					</svg>
				</button>
			</div>

			{/* Loading indicator */}
			{isLoading && (
				<div
					style={{
						height: 2,
						background: "var(--accent)",
						animation: "browser-loading 1.5s ease-in-out infinite",
						flexShrink: 0,
					}}
				/>
			)}
			<style>{`
				@keyframes browser-loading {
					0% { width: 0%; margin-left: 0; }
					50% { width: 60%; margin-left: 20%; }
					100% { width: 0%; margin-left: 100%; }
				}
			`}</style>

			{/* Content area */}
			{error ? (
				<div
					style={{
						flex: 1,
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						flexDirection: "column",
						gap: 8,
						color: "var(--muted)",
						fontSize: 13,
					}}
				>
					<span>{error}</span>
					<button
						onClick={() => navigateTo(iframeSrc, false)}
						style={{
							padding: "4px 12px",
							borderRadius: 6,
							background: "var(--bg-surface)",
							border: "1px solid var(--border)",
							color: "var(--text)",
							cursor: "pointer",
							fontSize: 12,
						}}
					>
						Retry
					</button>
				</div>
			) : (
				<iframe
					ref={iframeRef}
					src={iframeSrc}
					onLoad={handleIframeLoad}
					onError={handleIframeError}
					style={{
						flex: 1,
						border: "none",
						background: "white",
					}}
					sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
				/>
			)}
		</div>
	)
}
