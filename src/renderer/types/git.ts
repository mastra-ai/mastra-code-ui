export interface GitFile {
	status: string
	path: string
	staged: boolean
	unstaged: boolean
	untracked: boolean
}

export interface GitStatus {
	branch: string | null
	files: GitFile[]
	clean: boolean
	error?: string
}

export interface AheadBehind {
	ahead: number
	behind: number
	hasUpstream: boolean
}

export interface GitPanelProps {
	onFileClick?: (filePath: string) => void
	activeFilePath?: string | null
}

export interface GitFeedback {
	type: "success" | "error"
	message: string
}
