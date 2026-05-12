import { memo, useCallback, useMemo, useState } from "react"
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism"
import { CheckStrokeIcon, CopyStrokeIcon, DownloadStrokeIcon } from "./Icons"

const FILE_EXT: Record<string, string> = {
	typescript: "ts",
	ts: "ts",
	javascript: "js",
	js: "js",
	tsx: "tsx",
	jsx: "jsx",
	python: "py",
	py: "py",
	ruby: "rb",
	rb: "rb",
	bash: "sh",
	shell: "sh",
	sh: "sh",
	zsh: "sh",
	fish: "sh",
	json: "json",
	jsonc: "json",
	yaml: "yml",
	yml: "yml",
	toml: "toml",
	xml: "xml",
	html: "html",
	css: "css",
	scss: "scss",
	less: "less",
	markdown: "md",
	md: "md",
	mdx: "mdx",
	sql: "sql",
	go: "go",
	rust: "rs",
	rs: "rs",
	java: "java",
	c: "c",
	cpp: "cpp",
	"c++": "cpp",
	csharp: "cs",
	cs: "cs",
	php: "php",
	swift: "swift",
	kotlin: "kt",
	kt: "kt",
	dart: "dart",
	dockerfile: "dockerfile",
	docker: "dockerfile",
	makefile: "mk",
	make: "mk",
	plaintext: "txt",
	text: "txt",
}

function getStats(source: string): { lines: number; chars: number } {
	const lines = source.split("\n").length
	return { lines, chars: source.length }
}

function downloadText(text: string, filename: string): void {
	const blob = new Blob([text], { type: "text/plain;charset=utf-8" })
	const url = URL.createObjectURL(blob)
	const a = document.createElement("a")
	a.href = url
	a.download = filename
	document.body.appendChild(a)
	a.click()
	a.remove()
	URL.revokeObjectURL(url)
}

const HIGHLIGHTER_STYLE = {
	margin: 0,
	padding: "16px",
	background: "transparent",
	fontFamily: "var(--font-mono)",
	fontSize: 12,
	lineHeight: 1.55,
} as const

const CODE_TAG_PROPS = {
	style: {
		fontFamily: "var(--font-mono)",
		fontSize: 12,
	},
}

interface CodeBlockProps {
	code: string
	language: string
}

export const CodeBlock = memo(function CodeBlock({
	code,
	language,
}: CodeBlockProps) {
	const [copied, setCopied] = useState(false)
	const { lines, chars } = useMemo(() => getStats(code), [code])

	const handleCopy = useCallback(() => {
		navigator.clipboard.writeText(code)
		setCopied(true)
		const timer = setTimeout(() => setCopied(false), 1500)
		return () => clearTimeout(timer)
	}, [code])

	const handleDownload = useCallback(() => {
		const ext = FILE_EXT[language.toLowerCase()] || "txt"
		downloadText(code, `snippet.${ext}`)
	}, [code, language])

	return (
		<div className="code-frame">
			<div className="code-header">
				<span className="code-kicker">{language}</span>
				<span className="code-stats">
					{lines} {lines === 1 ? "line" : "lines"} · {chars} chars
				</span>
				<div className="code-tools">
					<button
						type="button"
						onClick={handleCopy}
						title={copied ? "Copied" : "Copy code"}
						aria-label={copied ? "Copied" : "Copy code"}
						data-copied={copied || undefined}
					>
						{copied ? <CheckStrokeIcon /> : <CopyStrokeIcon />}
					</button>
					<button
						type="button"
						onClick={handleDownload}
						title="Download snippet"
						aria-label="Download snippet"
					>
						<DownloadStrokeIcon />
					</button>
				</div>
			</div>
			<div className="code-body">
				<SyntaxHighlighter
					language={language}
					style={vscDarkPlus}
					customStyle={HIGHLIGHTER_STYLE}
					codeTagProps={CODE_TAG_PROPS}
					wrapLongLines={false}
				>
					{code}
				</SyntaxHighlighter>
			</div>
		</div>
	)
})
