import { useState, useEffect } from "react"
import { DiffView } from "./DiffView"

interface DiffEditorProps {
	filePath: string
	onClose: () => void
	onOpenFile: (filePath: string) => void
}

export function DiffEditor({ filePath, onClose, onOpenFile }: DiffEditorProps) {
	const [diff, setDiff] = useState<string | null>(null)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [viewMode, setViewMode] = useState<"inline" | "side-by-side">(
		"inline",
	)

	useEffect(() => {
		if (!filePath) return
		setLoading(true)
		setError(null)
		async function load() {
			try {
				const result = (await window.api.invoke({
					type: "gitDiff",
					file: filePath,
				})) as { diff: string }
				setDiff(result.diff || "")
			} catch (err: unknown) {
				setError(
					err instanceof Error ? err.message : "Failed to load diff",
				)
			} finally {
				setLoading(false)
			}
		}
		load()
	}, [filePath])

	return (
		<div
			style={{
				flex: 1,
				display: "flex",
				flexDirection: "column",
				overflow: "hidden",
			}}
		>
			{/* File path header */}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 8,
					padding: "6px 16px",
					background: "var(--bg-surface)",
					borderBottom: "1px solid var(--border-muted)",
					flexShrink: 0,
				}}
			>
				<span
					style={{
						fontSize: 11,
						color: "var(--bg)",
						background: "var(--accent)",
						padding: "1px 8px",
						borderRadius: 3,
						fontWeight: 500,
					}}
				>
					{filePath}
				</span>
				<div style={{ flex: 1 }} />
				<button
					onClick={() =>
						setViewMode(
							viewMode === "inline" ? "side-by-side" : "inline",
						)
					}
					style={{
						fontSize: 11,
						color: "var(--muted)",
						cursor: "pointer",
						padding: "2px 8px",
						borderRadius: 3,
						border: "1px solid var(--border)",
						background: "transparent",
						fontWeight: 500,
					}}
					title={
						viewMode === "inline"
							? "Switch to side-by-side"
							: "Switch to inline"
					}
				>
					{viewMode === "inline" ? "Side-by-Side" : "Inline"}
				</button>
				<button
					onClick={() => onOpenFile(filePath)}
					style={{
						fontSize: 11,
						color: "var(--accent)",
						cursor: "pointer",
						padding: "2px 8px",
						borderRadius: 3,
						border: "1px solid var(--accent)",
						background: "transparent",
						fontWeight: 500,
					}}
				>
					Open File
				</button>
			</div>

			{loading && (
				<div
					style={{
						flex: 1,
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						color: "var(--dim)",
						fontSize: 12,
					}}
				>
					Loading diff...
				</div>
			)}
			{error && (
				<div
					style={{
						flex: 1,
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						color: "var(--error)",
						fontSize: 12,
					}}
				>
					{error}
				</div>
			)}
			{diff !== null && !loading && (
				<div
					style={{
						flex: 1,
						overflow: "auto",
						background: "var(--bg)",
					}}
				>
					<DiffView
						diff={diff}
						fileName={filePath}
						viewMode={viewMode}
					/>
				</div>
			)}
		</div>
	)
}
