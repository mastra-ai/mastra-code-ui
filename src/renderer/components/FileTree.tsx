import { useState, useEffect, useCallback } from "react"

interface FileEntry {
	name: string
	path: string
	isDirectory: boolean
	isSymlink: boolean
}

interface FileTreeProps {
	projectName: string
	onFileClick?: (filePath: string) => void
	activeFilePath?: string | null
}

function FileIcon({
	isDirectory,
	name,
}: {
	isDirectory: boolean
	name: string
}) {
	if (isDirectory) {
		return (
			<span style={{ color: "var(--dir-icon)", marginRight: 4 }}>
				&#x1F4C1;
			</span>
		)
	}
	const ext = name.split(".").pop()?.toLowerCase()
	let icon = "\u{1F4C4}" // default file
	if (ext === "ts" || ext === "tsx") icon = "\u{1D54B}" // T
	else if (ext === "js" || ext === "jsx") icon = "\u{1D541}" // J
	else if (ext === "json") icon = "{}"
	else if (ext === "md") icon = "\u{1D544}" // M
	else if (ext === "css") icon = "#"
	return (
		<span
			style={{
				color: "var(--file-icon)",
				marginRight: 4,
				fontSize: 10,
				width: 14,
				display: "inline-block",
				textAlign: "center",
			}}
		>
			{icon}
		</span>
	)
}

function DirectoryNode({
	entry,
	depth,
	onFileClick,
	activeFilePath,
}: {
	entry: FileEntry
	depth: number
	onFileClick?: (filePath: string) => void
	activeFilePath?: string | null
}) {
	const [expanded, setExpanded] = useState(false)
	const [children, setChildren] = useState<FileEntry[] | null>(null)
	const [loading, setLoading] = useState(false)

	const toggle = useCallback(async () => {
		if (!expanded && children === null) {
			setLoading(true)
			try {
				const result = (await window.api.invoke({
					type: "listDirectory",
					path: entry.path,
				})) as FileEntry[]
				setChildren(result || [])
			} catch {
				setChildren([])
			}
			setLoading(false)
		}
		setExpanded(!expanded)
	}, [expanded, children, entry.path])

	return (
		<div>
			<button
				onClick={toggle}
				style={{
					display: "flex",
					alignItems: "center",
					width: "100%",
					padding: "3px 8px",
					paddingLeft: 8 + depth * 16,
					fontSize: 12,
					color: "var(--text)",
					textAlign: "left",
					cursor: "pointer",
					borderRadius: 0,
				}}
			>
				<span
					style={{
						width: 12,
						fontSize: 8,
						color: "var(--muted)",
						flexShrink: 0,
					}}
				>
					{expanded ? "\u25BC" : "\u25B6"}
				</span>
				<FileIcon isDirectory name={entry.name} />
				<span
					style={{
						overflow: "hidden",
						textOverflow: "ellipsis",
						whiteSpace: "nowrap",
					}}
				>
					{entry.name}
				</span>
			</button>
			{expanded && (
				<div>
					{loading && (
						<div
							style={{
								paddingLeft: 24 + depth * 16,
								fontSize: 11,
								color: "var(--dim)",
								padding: "2px 8px",
							}}
						>
							Loading...
						</div>
					)}
					{children?.map((child) =>
						child.isDirectory ? (
							<DirectoryNode
								key={child.path}
								entry={child}
								depth={depth + 1}
								onFileClick={onFileClick}
								activeFilePath={activeFilePath}
							/>
						) : (
							<FileNode
								key={child.path}
								entry={child}
								depth={depth + 1}
								onFileClick={onFileClick}
								isActive={child.path === activeFilePath}
							/>
						),
					)}
					{children?.length === 0 && !loading && (
						<div
							style={{
								paddingLeft: 24 + depth * 16,
								fontSize: 11,
								color: "var(--dim)",
								padding: "2px 8px",
							}}
						>
							Empty
						</div>
					)}
				</div>
			)}
		</div>
	)
}

function FileNode({
	entry,
	depth,
	onFileClick,
	isActive,
}: {
	entry: FileEntry
	depth: number
	onFileClick?: (filePath: string) => void
	isActive?: boolean
}) {
	const [contextMenu, setContextMenu] = useState<{
		x: number
		y: number
	} | null>(null)

	useEffect(() => {
		if (!contextMenu) return
		const dismiss = () => setContextMenu(null)
		window.addEventListener("click", dismiss)
		window.addEventListener("keydown", (e) => {
			if (e.key === "Escape") dismiss()
		})
		return () => {
			window.removeEventListener("click", dismiss)
		}
	}, [contextMenu])

	return (
		<>
			<button
				onClick={() => onFileClick?.(entry.path)}
				onContextMenu={(e) => {
					e.preventDefault()
					setContextMenu({ x: e.clientX, y: e.clientY })
				}}
				style={{
					display: "flex",
					alignItems: "center",
					width: "100%",
					padding: "3px 8px",
					paddingLeft: isActive ? 18 + depth * 16 : 20 + depth * 16,
					fontSize: 12,
					color: "var(--text)",
					textAlign: "left",
					cursor: "pointer",
					borderRadius: 0,
					background: isActive ? "var(--selected-bg)" : "transparent",
					borderLeft: isActive
						? "2px solid var(--accent)"
						: "2px solid transparent",
				}}
			>
				<FileIcon isDirectory={false} name={entry.name} />
				<span
					style={{
						overflow: "hidden",
						textOverflow: "ellipsis",
						whiteSpace: "nowrap",
					}}
				>
					{entry.name}
				</span>
			</button>
			{contextMenu && (
				<div
					style={{
						position: "fixed",
						left: contextMenu.x,
						top: contextMenu.y,
						background: "var(--bg-elevated)",
						border: "1px solid var(--border)",
						borderRadius: 6,
						padding: 4,
						zIndex: 200,
						boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
					}}
				>
					<button
						onClick={() => {
							window.api.invoke({
								type: "openInEditor",
								filePath: entry.path,
								line: 1,
							})
							setContextMenu(null)
						}}
						style={{
							display: "block",
							width: "100%",
							padding: "6px 12px",
							fontSize: 12,
							color: "var(--text)",
							textAlign: "left",
							cursor: "pointer",
							borderRadius: 4,
							background: "transparent",
							whiteSpace: "nowrap",
						}}
						onMouseEnter={(e) => {
							e.currentTarget.style.background = "var(--accent)" + "22"
						}}
						onMouseLeave={(e) => {
							e.currentTarget.style.background = "transparent"
						}}
					>
						Open in Editor
					</button>
				</div>
			)}
		</>
	)
}

export function FileTree({
	projectName,
	onFileClick,
	activeFilePath,
}: FileTreeProps) {
	const [rootEntries, setRootEntries] = useState<FileEntry[] | null>(null)

	useEffect(() => {
		async function load() {
			try {
				const result = (await window.api.invoke({
					type: "listDirectory",
					path: ".",
				})) as FileEntry[]
				setRootEntries(result || [])
			} catch {
				setRootEntries([])
			}
		}
		load()
	}, [projectName])

	return (
		<div
			style={{
				flex: 1,
				overflowY: "auto",
				padding: "4px 0",
			}}
		>
			{rootEntries === null ? (
				<div
					style={{
						padding: "20px 16px",
						color: "var(--dim)",
						fontSize: 12,
						textAlign: "center",
					}}
				>
					Loading...
				</div>
			) : rootEntries.length === 0 ? (
				<div
					style={{
						padding: "20px 16px",
						color: "var(--dim)",
						fontSize: 12,
						textAlign: "center",
					}}
				>
					No files
				</div>
			) : (
				rootEntries.map((entry) =>
					entry.isDirectory ? (
						<DirectoryNode
							key={entry.path}
							entry={entry}
							depth={0}
							onFileClick={onFileClick}
							activeFilePath={activeFilePath}
						/>
					) : (
						<FileNode
							key={entry.path}
							entry={entry}
							depth={0}
							onFileClick={onFileClick}
							isActive={entry.path === activeFilePath}
						/>
					),
				)
			)}
		</div>
	)
}
