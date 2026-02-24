import { useState, useEffect, useCallback } from "react"

interface ContextFile {
	path: string
	content: string
	scope: "global" | "project"
	fileName: string
}

interface ContextPanelProps {
	onFileClick?: (filePath: string) => void
}

export function ContextPanel({ onFileClick }: ContextPanelProps) {
	const [files, setFiles] = useState<ContextFile[]>([])
	const [loading, setLoading] = useState(true)
	const [expanded, setExpanded] = useState<string | null>(null)
	const [creating, setCreating] = useState(false)
	const [editingPath, setEditingPath] = useState<string | null>(null)
	const [editContent, setEditContent] = useState("")
	const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle")

	const loadFiles = useCallback(async () => {
		setLoading(true)
		try {
			const result = (await window.api.invoke({
				type: "getContextFiles",
			})) as ContextFile[]
			setFiles(result ?? [])
		} catch {
			// ignore
		} finally {
			setLoading(false)
		}
	}, [])

	useEffect(() => {
		loadFiles()
	}, [loadFiles])

	const handleCreate = useCallback(
		async (scope: "project" | "global") => {
			try {
				await window.api.invoke({
					type: "createContextFile",
					scope,
				})
				setCreating(false)
				await loadFiles()
			} catch {
				// ignore
			}
		},
		[loadFiles],
	)

	const handleStartEdit = useCallback((file: ContextFile) => {
		setEditingPath(file.path)
		setEditContent(file.content)
		setExpanded(file.path)
	}, [])

	const handleSave = useCallback(
		async (filePath: string) => {
			setSaveStatus("saving")
			try {
				await window.api.invoke({
					type: "writeContextFile",
					filePath,
					content: editContent,
				})
				setSaveStatus("saved")
				setEditingPath(null)
				await loadFiles()
				setTimeout(() => setSaveStatus("idle"), 1500)
			} catch {
				setSaveStatus("idle")
			}
		},
		[editContent, loadFiles],
	)

	return (
		<div
			style={{
				height: "100%",
				display: "flex",
				flexDirection: "column",
				overflow: "hidden",
			}}
		>
			{/* Header */}
			<div
				style={{
					padding: "8px 12px",
					display: "flex",
					alignItems: "center",
					gap: 6,
					borderBottom: "1px solid var(--border-muted)",
					flexShrink: 0,
				}}
			>
				<span
					style={{
						fontSize: 10,
						fontWeight: 600,
						color: "var(--dim)",
						textTransform: "uppercase",
						letterSpacing: "0.5px",
						flex: 1,
					}}
				>
					Context Files
				</span>
				<button
					onClick={() => setCreating(!creating)}
					style={{
						fontSize: 14,
						color: "var(--muted)",
						cursor: "pointer",
						padding: "0 4px",
						lineHeight: 1,
						background: "transparent",
						border: "none",
					}}
					title="Create context file"
				>
					+
				</button>
				<button
					onClick={loadFiles}
					style={{
						fontSize: 10,
						color: "var(--muted)",
						cursor: "pointer",
						padding: "2px 4px",
						background: "transparent",
						border: "none",
					}}
					title="Refresh"
				>
					&#x21bb;
				</button>
			</div>

			{/* Create menu */}
			{creating && (
				<div
					style={{
						padding: "6px 12px",
						borderBottom: "1px solid var(--border-muted)",
						display: "flex",
						gap: 6,
					}}
				>
					<button
						onClick={() => handleCreate("project")}
						style={{
							flex: 1,
							padding: "4px 8px",
							fontSize: 11,
							background: "var(--bg-elevated)",
							color: "var(--accent)",
							borderRadius: 4,
							border: "1px solid var(--accent)",
							cursor: "pointer",
						}}
					>
						Project AGENT.md
					</button>
					<button
						onClick={() => handleCreate("global")}
						style={{
							flex: 1,
							padding: "4px 8px",
							fontSize: 11,
							background: "var(--bg-elevated)",
							color: "var(--muted)",
							borderRadius: 4,
							border: "1px solid var(--border)",
							cursor: "pointer",
						}}
					>
						Global AGENT.md
					</button>
				</div>
			)}

			{/* File list */}
			<div style={{ flex: 1, overflow: "auto" }}>
				{loading ? (
					<div
						style={{
							padding: 16,
							textAlign: "center",
							color: "var(--muted)",
							fontSize: 11,
						}}
					>
						Loading...
					</div>
				) : files.length === 0 ? (
					<div
						style={{
							padding: "24px 16px",
							textAlign: "center",
							color: "var(--dim)",
							fontSize: 11,
							lineHeight: 1.6,
						}}
					>
						<div style={{ marginBottom: 8 }}>
							No context files found.
						</div>
						<div>
							Create an <code style={{ color: "var(--muted)" }}>AGENT.md</code>{" "}
							file to give the agent project-specific instructions.
						</div>
					</div>
				) : (
					files.map((file) => {
						const isExpanded = expanded === file.path
						const isEditing = editingPath === file.path
						return (
							<div key={file.path}>
								{/* File header */}
								<div
									style={{
										display: "flex",
										alignItems: "center",
										gap: 6,
										padding: "6px 12px",
										cursor: "pointer",
										borderBottom: "1px solid var(--border-muted)",
									}}
									onClick={() =>
										setExpanded(isExpanded ? null : file.path)
									}
								>
									<span
										style={{
											fontSize: 8,
											color: "var(--dim)",
											display: "inline-block",
											transition: "transform 0.15s ease",
											transform: isExpanded
												? "rotate(90deg)"
												: "rotate(0deg)",
										}}
									>
										&#9654;
									</span>
									<span
										style={{
											fontSize: 12,
											color: "var(--text)",
											flex: 1,
										}}
									>
										{file.fileName}
									</span>
									<span
										style={{
											fontSize: 9,
											color:
												file.scope === "global"
													? "var(--accent)"
													: "var(--success)",
											background:
												file.scope === "global"
													? "var(--accent)" + "18"
													: "var(--success)" + "18",
											padding: "1px 6px",
											borderRadius: 3,
										}}
									>
										{file.scope}
									</span>
								</div>

								{/* Expanded content */}
								{isExpanded && (
									<div
										style={{
											padding: "8px 12px",
											borderBottom: "1px solid var(--border-muted)",
											background: "var(--bg)",
										}}
									>
										<div
											style={{
												fontSize: 10,
												color: "var(--dim)",
												marginBottom: 6,
												fontFamily: "monospace",
												wordBreak: "break-all",
											}}
										>
											{file.path}
										</div>
										{isEditing ? (
											<>
												<textarea
													value={editContent}
													onChange={(e) =>
														setEditContent(e.target.value)
													}
													style={{
														width: "100%",
														minHeight: 200,
														background: "var(--bg-elevated)",
														color: "var(--text)",
														border: "1px solid var(--border)",
														borderRadius: 4,
														padding: "8px 10px",
														fontSize: 12,
														fontFamily:
															"'SF Mono', 'Fira Code', monospace",
														lineHeight: 1.5,
														resize: "vertical",
													}}
													autoFocus
												/>
												<div
													style={{
														display: "flex",
														gap: 6,
														marginTop: 6,
													}}
												>
													<button
														onClick={() =>
															handleSave(file.path)
														}
														style={{
															padding: "4px 12px",
															fontSize: 11,
															background: "var(--accent)",
															color: "#fff",
															borderRadius: 4,
															cursor: "pointer",
															fontWeight: 500,
														}}
													>
														{saveStatus === "saving"
															? "Saving..."
															: "Save"}
													</button>
													<button
														onClick={() =>
															setEditingPath(null)
														}
														style={{
															padding: "4px 12px",
															fontSize: 11,
															background:
																"var(--bg-surface)",
															color: "var(--muted)",
															borderRadius: 4,
															border: "1px solid var(--border)",
															cursor: "pointer",
														}}
													>
														Cancel
													</button>
												</div>
											</>
										) : (
											<>
												<pre
													style={{
														fontSize: 11,
														color: "var(--text)",
														background: "var(--bg-elevated)",
														padding: "8px 10px",
														borderRadius: 4,
														border: "1px solid var(--border-muted)",
														overflow: "auto",
														maxHeight: 300,
														lineHeight: 1.5,
														whiteSpace: "pre-wrap",
														wordBreak: "break-word",
														fontFamily:
															"'SF Mono', 'Fira Code', monospace",
													}}
												>
													{file.content ||
														"(empty file)"}
												</pre>
												<div
													style={{
														display: "flex",
														gap: 6,
														marginTop: 6,
													}}
												>
													<button
														onClick={() =>
															handleStartEdit(file)
														}
														style={{
															padding: "4px 12px",
															fontSize: 11,
															background:
																"var(--bg-surface)",
															color: "var(--accent)",
															borderRadius: 4,
															border: "1px solid var(--accent)",
															cursor: "pointer",
														}}
													>
														Edit
													</button>
													{onFileClick && (
														<button
															onClick={() =>
																onFileClick(
																	file.path,
																)
															}
															style={{
																padding: "4px 12px",
																fontSize: 11,
																background:
																	"var(--bg-surface)",
																color: "var(--muted)",
																borderRadius: 4,
																border: "1px solid var(--border)",
																cursor: "pointer",
															}}
														>
															Open in Editor
														</button>
													)}
												</div>
											</>
										)}
									</div>
								)}
							</div>
						)
					})
				)}
			</div>
		</div>
	)
}
