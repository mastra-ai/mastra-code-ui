import { useState, useEffect, useRef, useCallback, useMemo } from "react"

interface QuickFileOpenProps {
	onSelect: (filePath: string) => void
	onClose: () => void
}

export function QuickFileOpen({ onSelect, onClose }: QuickFileOpenProps) {
	const [filter, setFilter] = useState("")
	const [files, setFiles] = useState<string[]>([])
	const [loading, setLoading] = useState(true)
	const [selectedIndex, setSelectedIndex] = useState(0)
	const inputRef = useRef<HTMLInputElement>(null)
	const listRef = useRef<HTMLDivElement>(null)

	// Load file list on mount
	useEffect(() => {
		inputRef.current?.focus()
		window.api
			.invoke({ type: "searchFiles" })
			.then((result) => {
				const r = result as { files: string[] }
				setFiles(r.files || [])
			})
			.catch(() => setFiles([]))
			.finally(() => setLoading(false))
	}, [])

	const filtered = useMemo(() => {
		if (!filter) return files.slice(0, 50)
		const lower = filter.toLowerCase()
		const scored: Array<{ path: string; score: number }> = []

		for (const f of files) {
			const fileName = f.split("/").pop() || f
			const fileNameLower = fileName.toLowerCase()
			const pathLower = f.toLowerCase()

			if (fileNameLower.startsWith(lower)) {
				scored.push({ path: f, score: 3 })
			} else if (fileNameLower.includes(lower)) {
				scored.push({ path: f, score: 2 })
			} else if (pathLower.includes(lower)) {
				scored.push({ path: f, score: 1 })
			}
		}

		scored.sort((a, b) => b.score - a.score)
		return scored.slice(0, 50).map((s) => s.path)
	}, [files, filter])

	// Reset selection on filter change
	useEffect(() => {
		setSelectedIndex(0)
	}, [filter])

	// Scroll into view
	useEffect(() => {
		const el = listRef.current?.querySelector("[data-selected='true']") as HTMLElement | null
		el?.scrollIntoView({ block: "nearest" })
	}, [selectedIndex])

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "ArrowDown") {
				e.preventDefault()
				setSelectedIndex((i) => (i + 1) % Math.max(filtered.length, 1))
			} else if (e.key === "ArrowUp") {
				e.preventDefault()
				setSelectedIndex((i) =>
					i <= 0 ? Math.max(filtered.length - 1, 0) : i - 1,
				)
			} else if (e.key === "Enter") {
				e.preventDefault()
				if (filtered[selectedIndex]) {
					onSelect(filtered[selectedIndex])
				}
			} else if (e.key === "Escape") {
				e.preventDefault()
				onClose()
			}
		},
		[filtered, selectedIndex, onSelect, onClose],
	)

	return (
		<div
			style={{
				position: "fixed",
				inset: 0,
				background: "rgba(0, 0, 0, 0.6)",
				display: "flex",
				alignItems: "flex-start",
				justifyContent: "center",
				zIndex: 1000,
				paddingTop: "15vh",
			}}
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose()
			}}
		>
			<div
				style={{
					background: "var(--bg-elevated)",
					border: "1px solid var(--border)",
					borderRadius: 12,
					width: 560,
					maxWidth: "90vw",
					maxHeight: "50vh",
					display: "flex",
					flexDirection: "column",
					overflow: "hidden",
				}}
				onKeyDown={handleKeyDown}
			>
				{/* Search input */}
				<div
					style={{
						padding: "12px 16px",
						borderBottom: "1px solid var(--border-muted)",
						display: "flex",
						alignItems: "center",
						gap: 8,
					}}
				>
					<svg
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="var(--muted)"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<circle cx="11" cy="11" r="8" />
						<line x1="21" y1="21" x2="16.65" y2="16.65" />
					</svg>
					<input
						ref={inputRef}
						type="text"
						value={filter}
						onChange={(e) => setFilter(e.target.value)}
						placeholder="Search files by name..."
						style={{
							flex: 1,
							background: "transparent",
							border: "none",
							outline: "none",
							color: "var(--text)",
							fontSize: 14,
							fontFamily: "inherit",
						}}
					/>
				</div>

				{/* Results */}
				<div
					ref={listRef}
					style={{
						overflowY: "auto",
						padding: "4px 0",
					}}
				>
					{loading && (
						<div
							style={{
								padding: "16px",
								textAlign: "center",
								color: "var(--muted)",
								fontSize: 12,
							}}
						>
							Loading files...
						</div>
					)}

					{!loading && filtered.length === 0 && (
						<div
							style={{
								padding: "16px",
								textAlign: "center",
								color: "var(--muted)",
								fontSize: 12,
							}}
						>
							{filter ? "No matching files" : "No files found"}
						</div>
					)}

					{filtered.map((filePath, idx) => {
						const fileName = filePath.split("/").pop() || filePath
						const dirPath = filePath.includes("/")
							? filePath.slice(0, filePath.lastIndexOf("/"))
							: ""
						const isSelected = idx === selectedIndex
						return (
							<div
								key={filePath}
								data-selected={isSelected}
								onClick={() => onSelect(filePath)}
								onMouseEnter={() => setSelectedIndex(idx)}
								style={{
									display: "flex",
									alignItems: "baseline",
									gap: 8,
									padding: "6px 16px",
									cursor: "pointer",
									background: isSelected
										? "var(--accent)22"
										: "transparent",
									transition: "background 0.05s",
								}}
							>
								<span
									style={{
										fontSize: 13,
										color: "var(--text)",
										fontWeight: 500,
										flexShrink: 0,
									}}
								>
									{fileName}
								</span>
								{dirPath && (
									<span
										style={{
											fontSize: 11,
											color: "var(--dim)",
											overflow: "hidden",
											textOverflow: "ellipsis",
											whiteSpace: "nowrap",
										}}
									>
										{dirPath}
									</span>
								)}
							</div>
						)
					})}
				</div>
			</div>
		</div>
	)
}
