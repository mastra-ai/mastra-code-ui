import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type ReactNode,
} from "react"
import { getFileTypeInfo } from "../utils/fileIcons"

export interface FileMention {
	path: string
	fileName: string
	dirPath: string
}

function toFileMention(filePath: string): FileMention {
	const slashIndex = filePath.lastIndexOf("/")
	return {
		path: filePath,
		fileName: slashIndex === -1 ? filePath : filePath.slice(slashIndex + 1),
		dirPath: slashIndex === -1 ? "" : filePath.slice(0, slashIndex),
	}
}

function scoreFile(filePath: string, filter: string): number {
	const lowerFilter = filter.toLowerCase()
	const fileName = filePath.split("/").pop() || filePath
	const lowerFileName = fileName.toLowerCase()
	const lowerPath = filePath.toLowerCase()

	if (lowerFileName.startsWith(lowerFilter)) return 4
	if (lowerFileName.includes(lowerFilter)) return 3
	if (lowerPath.startsWith(lowerFilter)) return 2
	if (lowerPath.includes(lowerFilter)) return 1

	return 0
}

function FileMentionIcon({ name }: { name: string }) {
	const { label, color } = getFileTypeInfo(name)

	return (
		<span
			style={{
				color,
				fontSize: 9,
				fontWeight: 700,
				width: 15,
				height: 15,
				display: "inline-flex",
				alignItems: "center",
				justifyContent: "center",
				flexShrink: 0,
				lineHeight: 1,
				letterSpacing: "-0.5px",
				fontFamily: "inherit",
			}}
		>
			{label}
		</span>
	)
}

export function useFileMentionAutocomplete(
	filter: string,
	visible: boolean,
	onSelect: (file: FileMention) => void,
	onClose: () => void,
): {
	handleKeyDown: (e: React.KeyboardEvent) => boolean
	element: ReactNode
} {
	const [files, setFiles] = useState<string[]>([])
	const [loading, setLoading] = useState(false)
	const [selectedIndex, setSelectedIndex] = useState(0)
	const cacheRef = useRef<string[] | null>(null)
	const listRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		if (!visible) return
		if (cacheRef.current) {
			setFiles(cacheRef.current)
			setLoading(false)
			return
		}

		let cancelled = false
		setLoading(true)

		async function load() {
			try {
				const result = (await window.api.invoke({
					type: "searchFiles",
				})) as { files?: string[] }
				if (cancelled) return
				cacheRef.current = result.files ?? []
				setFiles(cacheRef.current)
			} catch {
				if (cancelled) return
				cacheRef.current = []
				setFiles([])
			} finally {
				if (!cancelled) setLoading(false)
			}
		}

		load()
		return () => {
			cancelled = true
		}
	}, [visible])

	const filtered = useMemo(() => {
		if (!filter) return files.slice(0, 50).map(toFileMention)

		const scored = files
			.map((filePath) => ({
				filePath,
				score: scoreFile(filePath, filter),
			}))
			.filter((file) => file.score > 0)
			.sort((a, b) => {
				if (a.score !== b.score) return b.score - a.score
				return a.filePath.length - b.filePath.length
			})
			.slice(0, 50)

		return scored.map((file) => toFileMention(file.filePath))
	}, [files, filter])

	useEffect(() => {
		setSelectedIndex(0)
	}, [filter])

	useEffect(() => {
		if (!visible || !listRef.current) return
		const items = listRef.current.querySelectorAll("[data-file-index]")
		const selected = items[selectedIndex] as HTMLElement | undefined
		selected?.scrollIntoView({ block: "nearest" })
	}, [selectedIndex, visible])

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent): boolean => {
			if (!visible) return false

			if (e.key === "Escape") {
				e.preventDefault()
				onClose()
				return true
			}

			if (filtered.length === 0) return false

			if (e.key === "ArrowDown") {
				e.preventDefault()
				setSelectedIndex((i) => (i + 1) % filtered.length)
				return true
			}
			if (e.key === "ArrowUp") {
				e.preventDefault()
				setSelectedIndex((i) => (i - 1 + filtered.length) % filtered.length)
				return true
			}
			if (e.key === "Enter" || e.key === "Tab") {
				e.preventDefault()
				if (filtered[selectedIndex]) {
					onSelect(filtered[selectedIndex])
				}
				return true
			}
			return false
		},
		[visible, filtered, selectedIndex, onSelect, onClose],
	)

	if (!visible) {
		return {
			handleKeyDown,
			element: null,
		}
	}

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
					files
				</div>

				{loading && (
					<div
						style={{
							padding: "10px 8px",
							fontSize: 12,
							color: "var(--muted)",
						}}
					>
						Loading files...
					</div>
				)}

				{!loading && filtered.length === 0 && (
					<div
						style={{
							padding: "10px 8px",
							fontSize: 12,
							color: "var(--muted)",
						}}
					>
						No matching files
					</div>
				)}

				{filtered.map((file, idx) => {
					const isSelected = idx === selectedIndex
					return (
						<button
							key={file.path}
							className="ui-hover-item"
							data-file-index={idx}
							data-selected={isSelected ? "true" : undefined}
							onClick={() => onSelect(file)}
							onMouseDown={(e) => e.preventDefault()}
							onMouseEnter={() => setSelectedIndex(idx)}
							style={{
								display: "flex",
								width: "100%",
								alignItems: "center",
								gap: 6,
								padding: "6px 8px",
								textAlign: "left",
								cursor: "pointer",
								borderRadius: 6,
								background: isSelected ? "var(--accent)" + "22" : "transparent",
								fontSize: 12,
								color: isSelected ? "var(--accent)" : "var(--text)",
								border: "none",
								outline: "none",
								transition: "background 0.1s",
							}}
						>
							<FileMentionIcon name={file.fileName} />
							<span
								style={{
									fontFamily: "var(--font-mono, monospace)",
									flexShrink: 0,
									fontWeight: 500,
								}}
							>
								{file.fileName}
							</span>
							{file.dirPath && (
								<span
									style={{
										color: "var(--muted)",
										fontSize: 11,
										overflow: "hidden",
										textOverflow: "ellipsis",
										whiteSpace: "nowrap",
									}}
								>
									{file.dirPath}
								</span>
							)}
						</button>
					)
				})}
			</div>
		),
	}
}
