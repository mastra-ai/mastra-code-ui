import * as path from "path"
import * as fs from "fs"
import { getAppDataDir } from "./project.js"

function getRecentProjectsPath(): string {
	return path.join(getAppDataDir(), "recent-projects.json")
}

export function loadRecentProjects(): Array<{
	name: string
	rootPath: string
	lastOpened: string
}> {
	try {
		const data = fs.readFileSync(getRecentProjectsPath(), "utf-8")
		return JSON.parse(data)
	} catch {
		return []
	}
}

export function saveRecentProject(projectPath: string, name: string) {
	const projects = loadRecentProjects()
	const existing = projects.find((p) => p.rootPath === projectPath)
	if (existing) {
		existing.lastOpened = new Date().toISOString()
		existing.name = name
	} else {
		projects.push({
			name,
			rootPath: projectPath,
			lastOpened: new Date().toISOString(),
		})
	}
	if (projects.length > 10) projects.length = 10
	const dir = path.dirname(getRecentProjectsPath())
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
	fs.writeFileSync(getRecentProjectsPath(), JSON.stringify(projects, null, 2))
}

export function removeRecentProject(projectPath: string) {
	const projects = loadRecentProjects().filter(
		(p) => p.rootPath !== projectPath,
	)
	fs.writeFileSync(getRecentProjectsPath(), JSON.stringify(projects, null, 2))
}
