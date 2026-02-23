import { useState, useEffect, useRef, useCallback, type ReactNode } from "react"

interface SlashCommand {
	name: string
	description: string
}

export function useSlashAutocomplete(
	filter: string,
	visible: boolean,
	onSelect: (commandName: string) => void,
	onClose: () => void,
): {
	handleKeyDown: (e: React.KeyboardEvent) => boolean
	element: ReactNode
} {
	const [commands, setCommands] = useState<SlashCommand[]>([])
	const [selectedIndex, setSelectedIndex] = useState(0)
	const cacheRef = useRef<SlashCommand[] | null>(null)

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

	// Group by namespace
	const grouped: Record<string, SlashCommand[]> = {}
	for (const cmd of filtered) {
		const namespace = cmd.name.includes(":")
			? cmd.name.split(":")[0]
			: "general"
		if (!grouped[namespace]) grouped[namespace] = []
		grouped[namespace].push(cmd)
	}

	// Flat list for keyboard nav
	const flatList = Object.values(grouped).flat()

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
					onSelect(flatList[selectedIndex].name)
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
				style={{
					position: "absolute",
					bottom: "100%",
					left: 0,
					right: 0,
					maxHeight: 240,
					overflowY: "auto",
					background: "var(--bg-elevated)",
					border: "1px solid var(--border)",
					borderRadius: 8,
					padding: 4,
					zIndex: 50,
					boxShadow: "0 -4px 12px rgba(0,0,0,0.2)",
					marginBottom: 4,
				}}
			>
				{Object.entries(grouped).map(([namespace, cmds]) => (
					<div key={namespace}>
						<div
							style={{
								padding: "6px 8px 2px",
								fontSize: 10,
								color: "var(--muted)",
								textTransform: "uppercase",
								fontWeight: 600,
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
									onClick={() => onSelect(cmd.name)}
									onMouseEnter={() => setSelectedIndex(idx)}
									style={{
										display: "flex",
										width: "100%",
										padding: "4px 8px",
										textAlign: "left",
										cursor: "pointer",
										borderRadius: 4,
										background: isSelected
											? "var(--accent)" + "22"
											: "transparent",
										fontSize: 12,
										color: isSelected
											? "var(--accent)"
											: "var(--text)",
										gap: 8,
										alignItems: "baseline",
									}}
								>
									<span
										style={{
											fontFamily: "monospace",
											flexShrink: 0,
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
