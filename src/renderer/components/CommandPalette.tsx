import { useState, useEffect, useRef, useCallback, useMemo } from "react"

export interface CommandItem {
	id: string
	label: string
	description?: string
	group: string
	shortcut?: string
	action: () => void
}

interface CommandPaletteProps {
	commands: CommandItem[]
	onClose: () => void
}

export function CommandPalette({ commands, onClose }: CommandPaletteProps) {
	const [filter, setFilter] = useState("")
	const [selectedIndex, setSelectedIndex] = useState(0)
	const inputRef = useRef<HTMLInputElement>(null)
	const listRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		inputRef.current?.focus()
	}, [])

	const filtered = useMemo(() => {
		if (!filter) return commands
		const lower = filter.toLowerCase()
		return commands.filter(
			(c) =>
				c.label.toLowerCase().includes(lower) ||
				(c.description?.toLowerCase().includes(lower)),
		)
	}, [commands, filter])

	// Group filtered items
	const groups = useMemo(() => {
		const map = new Map<string, CommandItem[]>()
		for (const item of filtered) {
			const list = map.get(item.group) || []
			list.push(item)
			map.set(item.group, list)
		}
		return map
	}, [filtered])

	// Reset selection when filter changes
	useEffect(() => {
		setSelectedIndex(0)
	}, [filter])

	// Scroll selected item into view
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
					filtered[selectedIndex].action()
				}
			} else if (e.key === "Escape") {
				e.preventDefault()
				onClose()
			}
		},
		[filtered, selectedIndex, onClose],
	)

	// Flat index counter for rendering
	let flatIndex = 0

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
					}}
				>
					<input
						ref={inputRef}
						type="text"
						value={filter}
						onChange={(e) => setFilter(e.target.value)}
						placeholder="Type a command..."
						style={{
							width: "100%",
							background: "transparent",
							border: "none",
							outline: "none",
							color: "var(--text)",
							fontSize: 14,
							fontFamily: "inherit",
						}}
					/>
				</div>

				{/* Results list */}
				<div
					ref={listRef}
					style={{
						overflowY: "auto",
						padding: "4px 0",
					}}
				>
					{filtered.length === 0 && (
						<div
							style={{
								padding: "16px",
								textAlign: "center",
								color: "var(--muted)",
								fontSize: 12,
							}}
						>
							No matching commands
						</div>
					)}

					{Array.from(groups.entries()).map(([group, items]) => (
						<div key={group}>
							<div
								style={{
									padding: "8px 16px 4px",
									fontSize: 10,
									fontWeight: 600,
									color: "var(--muted)",
									textTransform: "uppercase",
									letterSpacing: "0.5px",
								}}
							>
								{group}
							</div>
							{items.map((item) => {
								const idx = flatIndex++
								const isSelected = idx === selectedIndex
								return (
									<div
										key={item.id}
										data-selected={isSelected}
										onClick={() => item.action()}
										onMouseEnter={() => setSelectedIndex(idx)}
										style={{
											display: "flex",
											alignItems: "center",
											gap: 8,
											padding: "8px 16px",
											cursor: "pointer",
											background: isSelected
												? "var(--accent)22"
												: "transparent",
											transition: "background 0.05s",
										}}
									>
										<span
											style={{
												flex: 1,
												fontSize: 13,
												color: "var(--text)",
												overflow: "hidden",
												textOverflow: "ellipsis",
												whiteSpace: "nowrap",
											}}
										>
											{item.label}
										</span>
										{item.description && (
											<span
												style={{
													fontSize: 11,
													color: "var(--dim)",
													overflow: "hidden",
													textOverflow: "ellipsis",
													whiteSpace: "nowrap",
													maxWidth: 200,
													flexShrink: 0,
												}}
											>
												{item.description}
											</span>
										)}
										{item.shortcut && (
											<span
												style={{
													fontSize: 10,
													color: "var(--muted)",
													background: "var(--bg-surface)",
													padding: "2px 6px",
													borderRadius: 3,
													border: "1px solid var(--border-muted)",
													flexShrink: 0,
													fontFamily: "inherit",
												}}
											>
												{item.shortcut}
											</span>
										)}
									</div>
								)
							})}
						</div>
					))}
				</div>
			</div>
		</div>
	)
}
