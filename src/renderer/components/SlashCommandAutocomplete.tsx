import { useState, useEffect, useRef, useCallback, type ReactNode } from "react"

export interface SlashCommand {
	name: string
	description: string
	builtin?: boolean
}

export function useSlashAutocomplete(
	filter: string,
	visible: boolean,
	onSelect: (command: SlashCommand) => void,
	onClose: () => void,
): {
	handleKeyDown: (e: React.KeyboardEvent) => boolean
	element: ReactNode
} {
	const [commands, setCommands] = useState<SlashCommand[]>([])
	const [selectedIndex, setSelectedIndex] = useState(0)
	const cacheRef = useRef<SlashCommand[] | null>(null)
	const listRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		if (!visible) return
		if (cacheRef.current) {
			setCommands(cacheRef.current)
			return
		}
		async function load() {
			try {
				const result = (await window.api.invoke({
					type: "getSlashCommands",
				})) as SlashCommand[]
				cacheRef.current = result ?? []
				setCommands(cacheRef.current)
			} catch {
				cacheRef.current = []
				setCommands([])
			}
		}
		load()
	}, [visible])

	// Reset selection when filter changes
	useEffect(() => {
		setSelectedIndex(0)
	}, [filter])

	const filtered = commands.filter((c) =>
		c.name.toLowerCase().includes(filter.toLowerCase()),
	)

	// Group: builtins first, then by namespace
	const builtins = filtered.filter((c) => c.builtin)
	const custom = filtered.filter((c) => !c.builtin)

	const grouped: Record<string, SlashCommand[]> = {}
	if (builtins.length > 0) {
		grouped["commands"] = builtins
	}
	for (const cmd of custom) {
		const namespace = cmd.name.includes(":")
			? cmd.name.split(":")[0]
			: "custom"
		if (!grouped[namespace]) grouped[namespace] = []
		grouped[namespace].push(cmd)
	}

	// Flat list for keyboard nav
	const flatList = Object.values(grouped).flat()

	// Scroll selected item into view
	useEffect(() => {
		if (!visible || !listRef.current) return
		const items = listRef.current.querySelectorAll("[data-cmd-index]")
		const selected = items[selectedIndex] as HTMLElement | undefined
		if (selected) {
			selected.scrollIntoView({ block: "nearest" })
		}
	}, [selectedIndex, visible])

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent): boolean => {
			if (!visible || flatList.length === 0) return false

			if (e.key === "ArrowDown") {
				e.preventDefault()
				setSelectedIndex((i) => (i + 1) % flatList.length)
				return true
			}
			if (e.key === "ArrowUp") {
				e.preventDefault()
				setSelectedIndex((i) =>
					(i - 1 + flatList.length) % flatList.length,
				)
				return true
			}
			if (e.key === "Enter" || e.key === "Tab") {
				e.preventDefault()
				if (flatList[selectedIndex]) {
					onSelect(flatList[selectedIndex])
				}
				return true
			}
			if (e.key === "Escape") {
				e.preventDefault()
				onClose()
				return true
			}
			return false
		},
		[visible, flatList, selectedIndex, onSelect, onClose],
	)

	if (!visible || flatList.length === 0) {
		return {
			handleKeyDown,
			element: null,
		}
	}

	let itemIndex = 0

	return {
		handleKeyDown,
		element: (
			<div
				ref={listRef}
				style={{
					position: "absolute",
					bottom: "100%",
					left: 0,
					right: 0,
					maxHeight: 280,
					overflowY: "auto",
					background: "var(--bg-elevated)",
					border: "1px solid var(--border)",
					borderRadius: 8,
					padding: 4,
					zIndex: 50,
					boxShadow: "0 -4px 16px rgba(0,0,0,0.3)",
					marginBottom: 4,
				}}
			>
				{Object.entries(grouped).map(([namespace, cmds]) => (
					<div key={namespace}>
						<div
							style={{
								padding: "6px 8px 2px",
								fontSize: 10,
								color: "var(--dim)",
								textTransform: "uppercase",
								fontWeight: 600,
								letterSpacing: "0.5px",
							}}
						>
							{namespace}
						</div>
						{cmds.map((cmd) => {
							const idx = itemIndex++
							const isSelected = idx === selectedIndex
							return (
								<button
									key={cmd.name}
									data-cmd-index={idx}
									onClick={() => onSelect(cmd)}
									onMouseEnter={() => setSelectedIndex(idx)}
									style={{
										display: "flex",
										width: "100%",
										padding: "6px 8px",
										textAlign: "left",
										cursor: "pointer",
										borderRadius: 6,
										background: isSelected
											? "var(--accent)" + "22"
											: "transparent",
										fontSize: 12,
										color: isSelected
											? "var(--accent)"
											: "var(--text)",
										gap: 8,
										alignItems: "center",
										border: "none",
										outline: "none",
										transition: "background 0.1s",
									}}
								>
									<span
										style={{
											fontFamily: "var(--font-mono, monospace)",
											flexShrink: 0,
											fontWeight: 500,
										}}
									>
										/{cmd.name}
									</span>
									{cmd.description && (
										<span
											style={{
												color: "var(--muted)",
												fontSize: 11,
												overflow: "hidden",
												textOverflow: "ellipsis",
												whiteSpace: "nowrap",
											}}
										>
											{cmd.description}
										</span>
									)}
								</button>
							)
						})}
					</div>
				))}
			</div>
		),
	}
}
