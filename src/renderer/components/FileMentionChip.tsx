import { getFileTypeInfo } from "../utils/fileIcons"

const FILE_TOKEN_PATTERN =
	/@?(?:(?:\.{1,2}\/|\/)?(?:[\w.-]+\/)*[\w.-]+\.[A-Za-z0-9]{1,10}|(?:[\w.-]+\/)+(?:Dockerfile|Makefile|Justfile|LICENSE|LICENCE|README|CHANGELOG))\b/g
const FILE_EXTENSIONS = new Set([
	"astro",
	"bash",
	"c",
	"cc",
	"cfg",
	"cjs",
	"clj",
	"cljs",
	"cpp",
	"css",
	"csv",
	"cxx",
	"dart",
	"env",
	"erl",
	"ex",
	"exs",
	"fish",
	"go",
	"gql",
	"graphql",
	"h",
	"hs",
	"html",
	"htm",
	"ini",
	"java",
	"js",
	"json",
	"jsonc",
	"jsx",
	"kt",
	"kts",
	"less",
	"lock",
	"lua",
	"md",
	"mdx",
	"mjs",
	"ml",
	"mli",
	"pdf",
	"php",
	"prisma",
	"ps1",
	"py",
	"pyw",
	"r",
	"rb",
	"rs",
	"rst",
	"scala",
	"scss",
	"sh",
	"sql",
	"svelte",
	"svg",
	"swift",
	"toml",
	"ts",
	"tsx",
	"txt",
	"vue",
	"xml",
	"yaml",
	"yml",
	"zig",
	"zsh",
])
const SPECIAL_FILE_NAMES = new Set([
	"dockerfile",
	"justfile",
	"license",
	"licence",
	"makefile",
	"readme",
	"changelog",
])

type FileTokenPart =
	| { type: "text"; value: string }
	| { type: "file"; value: string; original: string }

function normalizeFilePath(value: string): string {
	return value.startsWith("@") ? value.slice(1) : value
}

function shouldRenderFileToken(value: string): boolean {
	const path = normalizeFilePath(value)
	const fileName = path.split("/").pop()?.toLowerCase() ?? path.toLowerCase()
	const ext = fileName.includes(".") ? fileName.split(".").pop() : ""
	return (
		value.startsWith("@") ||
		path.includes("/") ||
		SPECIAL_FILE_NAMES.has(fileName) ||
		(!!ext && FILE_EXTENSIONS.has(ext))
	)
}

export function isFileToken(value: string): boolean {
	const trimmed = value.trim()
	const parts = splitFileTokens(trimmed)
	return (
		parts.length === 1 &&
		parts[0].type === "file" &&
		parts[0].original === trimmed
	)
}

export function splitFileTokens(text: string): FileTokenPart[] {
	const parts: FileTokenPart[] = []
	FILE_TOKEN_PATTERN.lastIndex = 0
	let lastIndex = 0
	let match: RegExpExecArray | null

	while ((match = FILE_TOKEN_PATTERN.exec(text))) {
		const original = match[0]
		if (!shouldRenderFileToken(original)) continue

		if (match.index > lastIndex) {
			parts.push({ type: "text", value: text.slice(lastIndex, match.index) })
		}
		parts.push({
			type: "file",
			value: normalizeFilePath(original),
			original,
		})
		lastIndex = match.index + original.length
	}

	if (lastIndex < text.length) {
		parts.push({ type: "text", value: text.slice(lastIndex) })
	}

	return parts
}

interface FileMentionChipProps {
	path: string
	variant?: "editor" | "message"
	onOpen?: (path: string) => void
}

export function FileMentionChip({
	path,
	variant = "editor",
	onOpen,
}: FileMentionChipProps) {
	const fileName = path.split("/").pop() || path
	const fileType = getFileTypeInfo(fileName)
	const className = [
		"editor-file-mention-chip",
		variant === "message" ? "message-file-mention-chip" : "",
		onOpen ? "clickable-file-mention-chip" : "",
	]
		.filter(Boolean)
		.join(" ")
	const children = (
		<>
			<span
				className="editor-file-mention-icon"
				style={{ color: fileType.color }}
			>
				{fileType.label}
			</span>
			<span className="editor-file-mention-label">{fileName}</span>
		</>
	)

	if (onOpen) {
		return (
			<span
				role="button"
				tabIndex={0}
				className={className}
				title={path}
				onClick={(event) => {
					event.stopPropagation()
					onOpen(path)
				}}
				onKeyDown={(event) => {
					if (event.key !== "Enter" && event.key !== " ") return
					event.preventDefault()
					event.stopPropagation()
					onOpen(path)
				}}
			>
				{children}
			</span>
		)
	}

	return (
		<span className={className} title={path}>
			{children}
		</span>
	)
}
