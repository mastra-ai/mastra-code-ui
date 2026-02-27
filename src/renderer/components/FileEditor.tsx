import { useState, useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from "react"
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism"

interface FileContents {
	content: string
	path: string
	fileName: string
	extension: string
	size: number
	lineCount: number
}

export interface FileEditorHandle {
	save: () => Promise<void>
}

interface FileEditorProps {
	filePath: string | null
	onClose: () => void
	onDirtyChange?: (dirty: boolean) => void
}

const extToLanguage: Record<string, string> = {
	ts: "typescript",
	tsx: "tsx",
	js: "javascript",
	jsx: "jsx",
	json: "json",
	md: "markdown",
	css: "css",
	scss: "scss",
	html: "html",
	xml: "xml",
	yaml: "yaml",
	yml: "yaml",
	py: "python",
	rb: "ruby",
	rs: "rust",
	go: "go",
	java: "java",
	kt: "kotlin",
	swift: "swift",
	c: "c",
	cpp: "cpp",
	h: "c",
	hpp: "cpp",
	cs: "csharp",
	sh: "bash",
	bash: "bash",
	zsh: "bash",
	sql: "sql",
	graphql: "graphql",
	gql: "graphql",
	toml: "toml",
	ini: "ini",
	dockerfile: "docker",
	makefile: "makefile",
	env: "bash",
}

export const FileEditor = forwardRef<FileEditorHandle, FileEditorProps>(function FileEditor({ filePath, onClose, onDirtyChange }, ref) {
	const [file, setFile] = useState<FileContents | null>(null)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [content, setContent] = useState("")
	const [savedContent, setSavedContent] = useState("")
	const [saving, setSaving] = useState(false)
	const textareaRef = useRef<HTMLTextAreaElement>(null)
	const highlightRef = useRef<HTMLDivElement>(null)
	const lineNumbersRef = useRef<HTMLDivElement>(null)

	const isDirty = content !== savedContent

	useEffect(() => {
		onDirtyChange?.(isDirty)
	}, [isDirty, onDirtyChange])

	useEffect(() => {
		if (!filePath) {
			setFile(null)
			setContent("")
			setSavedContent("")
			return
		}
		setLoading(true)
		setError(null)
		async function load() {
			try {
				const result = (await window.api.invoke({
					type: "readFileContents",
					path: filePath,
				})) as FileContents
				setFile(result)
				setContent(result.content)
				setSavedContent(result.content)
			} catch (err: unknown) {
				setError(
					err instanceof Error ? err.message : "Failed to read file",
				)
			} finally {
				setLoading(false)
			}
		}
		load()
	}, [filePath])

	const handleSave = useCallback(async () => {
		if (!filePath || !isDirty) return
		setSaving(true)
		try {
			await window.api.invoke({
				type: "writeFileContents",
				path: filePath,
				content,
			})
			setSavedContent(content)
		} catch (err: unknown) {
			setError(
				err instanceof Error ? err.message : "Failed to save file",
			)
		} finally {
			setSaving(false)
		}
	}, [filePath, content, isDirty])

	useImperativeHandle(ref, () => ({ save: handleSave }), [handleSave])

	// Cmd+S to save
	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			if ((e.metaKey || e.ctrlKey) && e.key === "s") {
				e.preventDefault()
				handleSave()
			}
		}
		window.addEventListener("keydown", handleKeyDown)
		return () => window.removeEventListener("keydown", handleKeyDown)
	}, [handleSave])

	// Sync scroll between textarea, highlight layer, and line numbers
	const handleScroll = useCallback(() => {
		if (textareaRef.current) {
			const { scrollTop, scrollLeft } = textareaRef.current
			if (highlightRef.current) {
				highlightRef.current.scrollTop = scrollTop
				highlightRef.current.scrollLeft = scrollLeft
			}
			if (lineNumbersRef.current) {
				lineNumbersRef.current.scrollTop = scrollTop
			}
		}
	}, [])

	// Handle tab key for indentation
	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
			if (e.key === "Tab") {
				e.preventDefault()
				const ta = e.currentTarget
				const start = ta.selectionStart
				const end = ta.selectionEnd
				const newContent =
					content.slice(0, start) + "\t" + content.slice(end)
				setContent(newContent)
				requestAnimationFrame(() => {
					ta.selectionStart = ta.selectionEnd = start + 1
				})
			}
		},
		[content],
	)

	if (!filePath) return null

	const lineCount = content.split("\n").length
	const language = file
		? extToLanguage[file.extension.toLowerCase()] ?? "text"
		: "text"

	return (
		<div
			style={{
				flex: 1,
				display: "flex",
				flexDirection: "column",
				overflow: "hidden",
			}}
		>
			{/* Header bar */}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 8,
					padding: "4px 16px",
					background: "var(--bg-surface)",
					borderBottom: "1px solid var(--border-muted)",
					flexShrink: 0,
					fontSize: 11,
				}}
			>
				<span style={{ color: "var(--muted)" }}>{filePath}</span>
				{isDirty && (
					<span
						style={{
							width: 6,
							height: 6,
							borderRadius: "50%",
							background: "var(--text)",
							flexShrink: 0,
						}}
						title="Unsaved changes"
					/>
				)}
				<div style={{ flex: 1 }} />
				{saving && (
					<span style={{ color: "var(--muted)" }}>Saving...</span>
				)}
				<button
					onClick={() => {
						window.api.invoke({
							type: "openInEditor",
							filePath,
							line: 1,
						})
					}}
					title="Open in external editor"
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
				>
					Open in Editor
				</button>
				{isDirty && !saving && (
					<button
						onClick={handleSave}
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
						Save
					</button>
				)}
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
					Loading...
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
			{file && !loading && (
				<div
					style={{
						flex: 1,
						display: "flex",
						overflow: "hidden",
						background: "var(--bg)",
					}}
				>
					{/* Line numbers */}
					<div
						ref={lineNumbersRef}
						style={{
							width: 48,
							flexShrink: 0,
							overflow: "hidden",
							padding: "12px 0",
							background: "var(--bg)",
							borderRight: "1px solid var(--border-muted)",
							userSelect: "none",
						}}
					>
						{Array.from({ length: lineCount }, (_, i) => (
							<div
								key={i}
								style={{
									height: 20,
									lineHeight: "20px",
									textAlign: "right",
									paddingRight: 8,
									color: "var(--dim)",
									fontSize: 12,
									fontFamily: "inherit",
								}}
							>
								{i + 1}
							</div>
						))}
					</div>

					{/* Editor area: highlighted code behind, textarea in front */}
					<div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
						{/* Syntax highlighted layer (behind) */}
						<div
							ref={highlightRef}
							aria-hidden
							style={{
								position: "absolute",
								top: 0,
								left: 0,
								right: 0,
								bottom: 0,
								overflow: "hidden",
								pointerEvents: "none",
							}}
						>
							<SyntaxHighlighter
								language={language}
								style={vscDarkPlus}
								customStyle={{
									margin: 0,
									padding: "12px 12px",
									background: "transparent",
									fontSize: 12,
									lineHeight: "20px",
									fontFamily: "inherit",
									tabSize: 4,
									overflow: "visible",
								}}
								codeTagProps={{
									style: {
										fontSize: "inherit",
										fontFamily: "inherit",
										lineHeight: "inherit",
										position: "static",
									},
								}}
								showLineNumbers={false}
								wrapLongLines={false}
							>
								{content + "\n"}
							</SyntaxHighlighter>
						</div>

						{/* Transparent textarea (in front for editing) */}
						<textarea
							ref={textareaRef}
							value={content}
							onChange={(e) => setContent(e.target.value)}
							onScroll={handleScroll}
							onKeyDown={handleKeyDown}
							spellCheck={false}
							style={{
								position: "relative",
								width: "100%",
								height: "100%",
								resize: "none",
								border: "none",
								outline: "none",
								background: "transparent",
								color: "transparent",
								caretColor: "var(--text)",
								fontFamily: "inherit",
								fontSize: 12,
								lineHeight: "20px",
								padding: "12px 12px",
								tabSize: 4,
								whiteSpace: "pre",
								overflowX: "auto",
								overflowY: "auto",
								margin: 0,
								zIndex: 1,
							}}
						/>
					</div>
				</div>
			)}
		</div>
	)
})
