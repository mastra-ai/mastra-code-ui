import { useState, useCallback, useRef } from "react"
import { FileTree } from "./FileTree"
import { GitPanel } from "./GitPanel"
import { ContextPanel } from "./ContextPanel"
import { TerminalPanel } from "./TerminalPanel"
import { ResizeHandle } from "./ResizeHandle"

export type RightSidebarTab = "files" | "git" | "context"

const tabs: Array<{ id: RightSidebarTab; label: string }> = [
	{ id: "files", label: "Files" },
	{ id: "git", label: "Git" },
	{ id: "context", label: "Context" },
]

interface RightSidebarProps {
	visible: boolean
	activeTab: RightSidebarTab
	onTabChange: (tab: RightSidebarTab) => void
	projectName: string
	projectPath?: string | null
	onFileClick: (filePath: string) => void
	onDiffClick: (filePath: string) => void
	activeFilePath?: string | null
	activeDiffPath?: string | null
	loading?: boolean
}

export function RightSidebar({
	visible,
	activeTab,
	onTabChange,
	projectName,
	projectPath,
	onFileClick,
	onDiffClick,
	activeFilePath,
	activeDiffPath,
	loading,
}: RightSidebarProps) {
	const [terminalHeight, setTerminalHeight] = useState(350)
	const [width, setWidth] = useState(380)
	const dragStartX = useRef(0)

	const handleTerminalResize = useCallback((deltaY: number) => {
		setTerminalHeight((h) => Math.max(100, Math.min(600, h + deltaY)))
	}, [])

	const onDragStart = useCallback((e: React.MouseEvent) => {
		e.preventDefault()
		dragStartX.current = e.clientX

		const onMouseMove = (ev: MouseEvent) => {
			const delta = dragStartX.current - ev.clientX
			dragStartX.current = ev.clientX
			setWidth((w) => Math.max(200, Math.min(600, w + delta)))
		}

		const onMouseUp = () => {
			document.removeEventListener("mousemove", onMouseMove)
			document.removeEventListener("mouseup", onMouseUp)
			document.body.style.cursor = ""
			document.body.style.userSelect = ""
		}

		document.addEventListener("mousemove", onMouseMove)
		document.addEventListener("mouseup", onMouseUp)
		document.body.style.cursor = "col-resize"
		document.body.style.userSelect = "none"
	}, [])

	if (!visible) return null

	return (
		<div
			style={{
				width,
				display: "flex",
				flexDirection: "row",
				flexShrink: 0,
			}}
		>
			{/* Drag handle on left edge */}
			<div
				onMouseDown={onDragStart}
				style={{
					width: 4,
					cursor: "col-resize",
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

			{/* Sidebar content */}
			<div
				style={{
					flex: 1,
					display: "flex",
					flexDirection: "column",
					background: "var(--bg-surface)",
					overflow: "hidden",
					minWidth: 0,
				}}
			>
				{/* Tab strip */}
				<div
					style={{
						display: "flex",
						borderBottom: "1px solid var(--border-muted)",
						flexShrink: 0,
					}}
				>
					{tabs.map((tab) => (
						<button
							key={tab.id}
							onClick={() => onTabChange(tab.id)}
							style={{
								flex: 1,
								padding: "6px 0",
								fontSize: 11,
								fontWeight: 500,
								color:
									activeTab === tab.id
										? "var(--text)"
										: "var(--muted)",
								borderBottom:
									activeTab === tab.id
										? "2px solid var(--accent)"
										: "2px solid transparent",
								cursor: "pointer",
								transition: "color 0.15s",
							}}
						>
							{tab.label}
						</button>
					))}
				</div>

				{/* Tab content + Terminal with loading overlay */}
				<div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
					{/* Loading overlay */}
					{loading && (
						<div
							style={{
								position: "absolute",
								inset: 0,
								zIndex: 10,
								background: "var(--bg-surface)",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								flexDirection: "column",
								gap: 12,
							}}
						>
							<div
								style={{
									width: 24,
									height: 24,
									border: "2px solid var(--border-muted)",
									borderTopColor: "var(--accent)",
									borderRadius: "50%",
									animation: "sidebar-spin 0.8s linear infinite",
								}}
							/>
							<span style={{ fontSize: 12, color: "var(--muted)" }}>
								Switching project...
							</span>
							<style>{`
								@keyframes sidebar-spin {
									to { transform: rotate(360deg); }
								}
							`}</style>
						</div>
					)}

					{/* Tab content */}
					<div style={{ flex: 1, overflow: "hidden" }}>
						{activeTab === "files" && (
							<FileTree projectName={projectName} projectPath={projectPath} onFileClick={onFileClick} activeFilePath={activeFilePath} />
						)}
						{activeTab === "git" && <GitPanel onFileClick={onDiffClick} activeFilePath={activeDiffPath} />}
						{activeTab === "context" && <ContextPanel onFileClick={onFileClick} />}
					</div>

					{/* Terminal pinned to bottom */}
					<ResizeHandle onResize={handleTerminalResize} />
					<TerminalPanel height={terminalHeight} projectPath={projectPath} />
				</div>
			</div>
		</div>
	)
}
