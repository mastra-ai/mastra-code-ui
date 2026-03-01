export type FileTypeInfo = { label: string; color: string }

export function getFileTypeInfo(name: string): FileTypeInfo {
	const ext = name.split(".").pop()?.toLowerCase()
	const lname = name.toLowerCase()

	// Special filenames
	if (lname === "dockerfile" || lname.startsWith("dockerfile."))
		return { label: "dk", color: "#2496ed" }
	if (lname === "makefile" || lname === "justfile")
		return { label: "mk", color: "#6d8086" }
	if (
		lname === ".gitignore" ||
		lname === ".gitattributes" ||
		lname === ".gitmodules"
	)
		return { label: "gi", color: "#f05032" }
	if (lname.startsWith(".env")) return { label: "ev", color: "#ecd53f" }
	if (
		lname === "license" ||
		lname === "licence" ||
		lname.startsWith("license.")
	)
		return { label: "li", color: "#d4b106" }

	switch (ext) {
		// TypeScript
		case "ts":
			return { label: "ts", color: "#3178c6" }
		case "tsx":
			return { label: "tx", color: "#1a9c94" }
		// JavaScript
		case "js":
			return { label: "js", color: "#e8d44d" }
		case "jsx":
			return { label: "jx", color: "#61dafb" }
		case "mjs":
		case "cjs":
			return { label: "js", color: "#e8d44d" }
		// Web
		case "html":
		case "htm":
			return { label: "<>", color: "#e44d26" }
		case "css":
			return { label: "cs", color: "#42a5f5" }
		case "scss":
			return { label: "sc", color: "#cd6799" }
		case "less":
			return { label: "le", color: "#1d365d" }
		case "vue":
			return { label: "vu", color: "#41b883" }
		case "svelte":
			return { label: "sv", color: "#ff3e00" }
		case "astro":
			return { label: "as", color: "#ff5d01" }
		// Data / Config
		case "json":
			return { label: "{}", color: "#cbcb41" }
		case "jsonc":
			return { label: "{}", color: "#cbcb41" }
		case "yaml":
		case "yml":
			return { label: "ym", color: "#cb171e" }
		case "toml":
			return { label: "tm", color: "#9c4121" }
		case "xml":
			return { label: "xm", color: "#e37933" }
		case "csv":
			return { label: "cv", color: "#89d185" }
		case "env":
			return { label: "ev", color: "#ecd53f" }
		case "ini":
		case "cfg":
			return { label: "cf", color: "#6d8086" }
		case "lock":
			return { label: "lk", color: "#555555" }
		// Docs
		case "md":
		case "mdx":
			return { label: "md", color: "#519aba" }
		case "txt":
			return { label: "tx", color: "#89929b" }
		case "pdf":
			return { label: "pd", color: "#ec2025" }
		case "rst":
			return { label: "rs", color: "#89929b" }
		// Languages
		case "py":
		case "pyw":
			return { label: "py", color: "#3572a5" }
		case "rs":
			return { label: "rs", color: "#dea584" }
		case "go":
			return { label: "go", color: "#00add8" }
		case "rb":
			return { label: "rb", color: "#cc342d" }
		case "java":
			return { label: "jv", color: "#b07219" }
		case "kt":
		case "kts":
			return { label: "kt", color: "#a97bff" }
		case "swift":
			return { label: "sw", color: "#f05138" }
		case "c":
			return { label: " c", color: "#555555" }
		case "cpp":
		case "cc":
		case "cxx":
			return { label: "c+", color: "#f34b7d" }
		case "h":
		case "hpp":
			return { label: " h", color: "#a074c4" }
		case "cs":
			return { label: "c#", color: "#68217a" }
		case "php":
			return { label: "ph", color: "#4f5d95" }
		case "lua":
			return { label: "lu", color: "#000080" }
		case "zig":
			return { label: "zi", color: "#f7a41d" }
		case "ex":
		case "exs":
			return { label: "ex", color: "#6e4a7e" }
		case "erl":
			return { label: "er", color: "#b83998" }
		case "clj":
		case "cljs":
			return { label: "cl", color: "#63b132" }
		case "dart":
			return { label: "da", color: "#00b4ab" }
		case "r":
			return { label: " r", color: "#276dc3" }
		case "scala":
			return { label: "sc", color: "#dc322f" }
		case "hs":
			return { label: "hs", color: "#5e5086" }
		case "ml":
		case "mli":
			return { label: "ml", color: "#e37933" }
		// Shell
		case "sh":
		case "bash":
		case "zsh":
		case "fish":
			return { label: "sh", color: "#4eaa25" }
		case "ps1":
			return { label: "ps", color: "#012456" }
		// Database & API
		case "sql":
			return { label: "sq", color: "#e38c00" }
		case "graphql":
		case "gql":
			return { label: "gq", color: "#e535ab" }
		case "prisma":
			return { label: "pr", color: "#5a67d8" }
		// Images
		case "svg":
			return { label: "sg", color: "#ffb13b" }
		case "png":
		case "jpg":
		case "jpeg":
		case "gif":
		case "webp":
		case "ico":
		case "bmp":
		case "avif":
			return { label: "im", color: "#a074c4" }
		// Media
		case "mp4":
		case "mov":
		case "avi":
		case "webm":
		case "mkv":
			return { label: "vi", color: "#f44336" }
		case "mp3":
		case "wav":
		case "ogg":
		case "flac":
			return { label: "au", color: "#ff9800" }
		// Archives
		case "zip":
		case "tar":
		case "gz":
		case "rar":
		case "7z":
		case "bz2":
			return { label: "zp", color: "#afb42b" }
		// Fonts
		case "woff":
		case "woff2":
		case "ttf":
		case "otf":
		case "eot":
			return { label: "ft", color: "#f44336" }
		// Wasm
		case "wasm":
		case "wat":
			return { label: "wa", color: "#654ff0" }
		// Maps
		case "map":
			return { label: "mp", color: "#555555" }
		default:
			return { label: "··", color: "#6d8086" }
	}
}
