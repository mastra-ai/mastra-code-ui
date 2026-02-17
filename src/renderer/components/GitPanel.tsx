import { useState, useEffect, useCallback } from "react"

interface GitFile {
	status: string
	path: string
	staged: boolean
	unstaged: boolean
	untracked: boolean
}

interface GitStatus {
	branch: string | null
	files: GitFile[]
	clean: boolean
	error?: string
}

interface GitPanelProps {
	onFileClick?: (filePath: string) => void
	activeFilePath?: string | null
}

export function GitPanel({ onFileClick, activeFilePath }: GitPanelProps) {
	const [status, setStatus] = useState<GitStatus | null>(null)

	const refresh = useCallback(async () => {
		try {
			const result = (await window.api.invoke({
				type: "gitStatus",
			})) as GitStatus
			setStatus(result)
		} catch {
			setStatus({ branch: null, files: [], clean: true, error: "Failed to get git status" })
		}
	}, [])

	useEffect(() => {
		refresh()
		const interval = setInterval(refresh, 3000)
		const unsubscribe = window.api.onEvent((raw: unknown) => {
			const event = raw as { type: string }
			if (event.type === "agent_end") refresh()
		})
		return () => {
			clearInterval(interval)
			unsubscribe()
		}
	}, [refresh])

	if (!status) {
		return (
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
		)
	}

	if (status.error) {
		return (
			<div
				style={{
					padding: "20px 16px",
					color: "var(--dim)",
					fontSize: 12,
					textAlign: "center",
				}}
			>
				{status.error}
			</div>
		)
	}

	const staged = status.files.filter((f) => f.staged)
	const unstaged = status.files.filter((f) => f.unstaged && !f.untracked)
	const untracked = status.files.filter((f) => f.untracked)

	function statusLabel(s: string): string {
		const x = s[0]
		const y = s[1]
		const code = x !== " " && x !== "?" ? x : y
		switch (code) {
			case "M":
				return "modified"
			case "A":
				return "added"
			case "D":
				return "deleted"
			case "R":
				return "renamed"
			case "C":
				return "copied"
			case "?":
				return "untracked"
			default:
				return code
		}
	}

	function statusColor(s: string): string {
		const code = s.trim()[0]
		switch (code) {
			case "M":
				return "var(--warning)"
			case "A":
			case "?":
				return "var(--success)"
			case "D":
				return "var(--error)"
			default:
				return "var(--muted)"
		}
	}

	function renderSection(title: string, files: GitFile[]) {
		if (files.length === 0) return null
		return (
			<div style={{ marginBottom: 8 }}>
				<div
					style={{
						padding: "4px 12px",
						fontSize: 10,
						fontWeight: 600,
						color: "var(--dim)",
						textTransform: "uppercase",
						letterSpacing: "0.5px",
					}}
				>
					{title} ({files.length})
				</div>
				{files.map((file) => {
					const isActive = file.path === activeFilePath
					return (
					<button
						key={file.path + file.status}
						onClick={() => onFileClick?.(file.path)}
						style={{
							display: "flex",
							alignItems: "center",
							width: "100%",
							padding: "3px 12px",
							paddingLeft: isActive ? 10 : 12,
							fontSize: 12,
							textAlign: "left",
							cursor: "pointer",
							gap: 6,
							background: isActive ? "var(--selected-bg)" : "transparent",
							border: "none",
							borderLeft: isActive
								? "2px solid var(--accent)"
								: "2px solid transparent",
						}}
					>
						<span
							style={{
								fontSize: 10,
								color: statusColor(file.status),
								fontWeight: 600,
								width: 14,
								flexShrink: 0,
							}}
						>
							{statusLabel(file.status).charAt(0).toUpperCase()}
						</span>
						<span
							style={{
								color: "var(--text)",
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap",
								flex: 1,
							}}
						>
							{file.path}
						</span>
						<span
							style={{
								fontSize: 10,
								color: statusColor(file.status),
							}}
						>
							{statusLabel(file.status)}
						</span>
					</button>
				)})}
			</div>
		)
	}

	return (
		<div
			style={{
				flex: 1,
				overflowY: "auto",
				padding: "4px 0",
			}}
		>
			{status.branch && (
				<div
					style={{
						padding: "6px 12px 8px",
						fontSize: 11,
						color: "var(--muted)",
						display: "flex",
						alignItems: "center",
						gap: 4,
					}}
				>
					<span style={{ color: "var(--accent)" }}>&#x2387;</span>
					{status.branch}
				</div>
			)}

			{status.clean ? (
				<div
					style={{
						padding: "20px 16px",
						color: "var(--dim)",
						fontSize: 12,
						textAlign: "center",
					}}
				>
					Working tree clean
				</div>
			) : (
				<>
					{renderSection("Staged", staged)}
					{renderSection("Unstaged", unstaged)}
					{renderSection("Untracked", untracked)}
				</>
			)}
		</div>
	)
}
