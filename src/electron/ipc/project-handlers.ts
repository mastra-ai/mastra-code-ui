import * as path from "path"
import * as os from "os"
import * as fs from "fs"
import type { IpcCommandHandler, WorktreeSession } from "./types.js"
import { detectProject } from "../../utils/project.js"
import {
	loadRecentProjects,
	saveRecentProject,
	removeRecentProject,
} from "../../utils/recent-projects.js"

export function getProjectHandlers(): Record<string, IpcCommandHandler> {
	return {
		getProjectInfo: async (_command, ctx) => {
			const projectRoot = ctx.getActiveSession().projectRoot
			const project = detectProject(projectRoot)
			return {
				name: project.name,
				rootPath: project.rootPath,
				gitBranch: project.gitBranch,
				isWorktree: project.isWorktree,
			}
		},
		getRecentProjects: async (_command, ctx) => {
			const { execSync } = require("child_process")
			const projects = loadRecentProjects()

			const enriched = projects.map((p) => {
				let gitBranch: string | undefined
				let isWorktree = false
				let mainRepoPath: string | undefined
				const worktrees: Array<{ path: string; branch: string }> = []
				let exists = true
				try {
					if (!fs.existsSync(p.rootPath)) {
						exists = false
						return {
							...p,
							gitBranch,
							isWorktree,
							mainRepoPath,
							worktrees,
							exists,
						}
					}
					const info = detectProject(p.rootPath)
					gitBranch = info.gitBranch
					isWorktree = info.isWorktree
					mainRepoPath = info.mainRepoPath
					const repoPath = info.mainRepoPath || p.rootPath
					const output = execSync("git worktree list --porcelain", {
						cwd: repoPath,
						encoding: "utf-8",
						stdio: ["pipe", "pipe", "pipe"],
					}) as string
					const blocks = output.split("\n\n").filter(Boolean)
					for (const block of blocks) {
						const lines = block.split("\n")
						const wt: Record<string, string | boolean> = {}
						for (const line of lines) {
							if (line.startsWith("worktree ")) wt.path = line.slice(9)
							else if (line.startsWith("branch "))
								wt.branch = (line.slice(7) as string).replace("refs/heads/", "")
							else if (line === "bare") wt.isBare = true
						}
						if (wt.path && !wt.isBare && wt.path !== repoPath) {
							worktrees.push({
								path: wt.path as string,
								branch: (wt.branch as string) || "detached",
							})
						}
					}
				} catch {
					// not a git repo or worktree detection failed
				}
				return {
					...p,
					gitBranch,
					isWorktree,
					mainRepoPath,
					worktrees,
					exists,
				}
			})

			const rootPaths = new Set(
				enriched
					.filter((p) => !p.isWorktree && p.exists)
					.map((p) => p.rootPath),
			)
			const worktreePathsUnderRoots = new Set<string>()
			for (const p of enriched) {
				if (!p.isWorktree && p.exists) {
					for (const wt of p.worktrees) {
						worktreePathsUnderRoots.add(wt.path)
					}
				}
			}

			const result = enriched.filter((p) => {
				if (!p.exists) return false
				if (p.isWorktree && p.mainRepoPath && rootPaths.has(p.mainRepoPath))
					return false
				if (p.isWorktree && worktreePathsUnderRoots.has(p.rootPath))
					return false
				return true
			})

			// Prune sessions whose paths no longer exist on disk
			const validPaths = new Set(result.map((p) => p.rootPath))
			for (const p of result) {
				for (const wt of p.worktrees) validPaths.add(wt.path)
			}
			for (const sessionPath of ctx.sessions.keys()) {
				if (!validPaths.has(sessionPath) && !fs.existsSync(sessionPath)) {
					ctx.cleanupSession(sessionPath)
				}
			}

			return result
		},
		removeRecentProject: async (command) => {
			removeRecentProject(command.path as string)
			return { success: true }
		},
		createWorktree: async (command) => {
			const { execSync } = require("child_process")
			const repoPath = command.repoPath as string
			const requestedBranch = command.branchName as string | undefined

			const usedNames = new Set<string>()
			try {
				const output = execSync("git worktree list --porcelain", {
					cwd: repoPath,
					encoding: "utf-8",
					stdio: ["pipe", "pipe", "pipe"],
				}) as string
				for (const block of output.split("\n\n").filter(Boolean)) {
					for (const line of block.split("\n")) {
						if (line.startsWith("branch ")) {
							usedNames.add(line.slice(7).replace("refs/heads/", ""))
						}
					}
				}
			} catch {
				return { success: false, error: "Not a git repository" }
			}

			const flowerNames = [
				"acacia",
				"aconite",
				"agapanthus",
				"alchemilla",
				"allium",
				"aloe",
				"alstroemeria",
				"amaranth",
				"amaryllis",
				"anemone",
				"angelica",
				"anise",
				"anthurium",
				"aster",
				"astilbe",
				"azalea",
				"banksia",
				"begonia",
				"bellflower",
				"bergamot",
				"bluebell",
				"bougainvillea",
				"buttercup",
				"calendula",
				"camellia",
				"campanula",
				"candytuft",
				"carnation",
				"celosia",
				"chamomile",
				"chrysanthemum",
				"clematis",
				"clover",
				"columbine",
				"coneflower",
				"coral",
				"coreopsis",
				"cornflower",
				"cosmos",
				"crocus",
				"cyclamen",
				"daffodil",
				"dahlia",
				"daisy",
				"dandelion",
				"daphne",
				"delphinium",
				"dianthus",
				"echinacea",
				"edelweiss",
				"elderflower",
				"eucalyptus",
				"evening",
				"fennel",
				"fern",
				"feverfew",
				"flax",
				"forget",
				"forsythia",
				"foxglove",
				"freesia",
				"fuchsia",
				"gardenia",
				"gentian",
				"geranium",
				"gerbera",
				"gladiolus",
				"goldenrod",
				"hawthorne",
				"heather",
				"hellebore",
				"hemlock",
				"hibiscus",
				"holly",
				"hollyhock",
				"honeysuckle",
				"hyacinth",
				"hydrangea",
				"hyssop",
				"impatiens",
				"iris",
				"ivy",
				"jasmine",
				"juniper",
				"kalmia",
				"lantana",
				"larkspur",
				"laurel",
				"lavender",
				"lilac",
				"lily",
				"linden",
				"lobelia",
				"lotus",
				"lupin",
				"magnolia",
				"mallow",
				"marigold",
				"meadow",
				"mint",
				"moonflower",
				"myrtle",
				"narcissus",
				"nasturtium",
				"nettle",
				"nightshade",
				"oleander",
				"orchid",
				"oregano",
				"osmanthus",
				"pansy",
				"passionflower",
				"peony",
				"periwinkle",
				"petunia",
				"phlox",
				"plumeria",
				"poppy",
				"primrose",
				"protea",
				"ranunculus",
				"rhododendron",
				"rose",
				"rosemary",
				"rudbeckia",
				"rue",
				"saffron",
				"sage",
				"sakura",
				"salvia",
				"snapdragon",
				"snowdrop",
				"sorrel",
				"stargazer",
				"statice",
				"stephanotis",
				"stock",
				"sunflower",
				"sweetpea",
				"tansy",
				"thistle",
				"thyme",
				"trillium",
				"tuberose",
				"tulip",
				"valerian",
				"verbena",
				"veronica",
				"viburnum",
				"viola",
				"violet",
				"wisteria",
				"yarrow",
				"yucca",
				"zinnia",
			]
			let branchName: string
			if (requestedBranch) {
				if (usedNames.has(requestedBranch)) {
					return {
						success: false,
						error: `Branch "${requestedBranch}" already exists`,
					}
				}
				branchName = requestedBranch
			} else {
				const available = flowerNames.filter((n) => !usedNames.has(n))
				if (available.length === 0) {
					return { success: false, error: "No available workspace names" }
				}
				branchName = available[Math.floor(Math.random() * available.length)]
			}

			const repoName = path.basename(repoPath)
			const workspacesDir = path.join(
				os.homedir(),
				"mastra-code",
				"workspaces",
				repoName,
			)
			const worktreePath = path.join(workspacesDir, branchName)

			try {
				if (!fs.existsSync(workspacesDir)) {
					fs.mkdirSync(workspacesDir, { recursive: true })
				}
				execSync(`git worktree add "${worktreePath}" -b "${branchName}"`, {
					cwd: repoPath,
					encoding: "utf-8",
					stdio: ["pipe", "pipe", "pipe"],
				})
				return { success: true, path: worktreePath, branch: branchName }
			} catch (e: any) {
				const msg = e.stderr?.trim() || e.message || "Failed to create worktree"
				return { success: false, error: msg }
			}
		},
		switchProject: async (command, ctx) => {
			const newPath = command.path as string

			if (ctx.sessions.has(newPath)) {
				// Fast path: session already exists
				ctx.setActiveSessionPath(newPath)
				if (ctx.mainWindow) ctx.bridgeAllEvents(ctx.mainWindow)

				const cachedState = ctx.sessions.get(newPath)!.harness.getState?.() as
					| { projectName?: string; gitBranch?: string }
					| undefined
				const fastProject = {
					name: cachedState?.projectName || path.basename(newPath),
					rootPath: newPath,
					gitBranch: cachedState?.gitBranch,
					isWorktree: true,
				}
				const currentThreadId = ctx.sessions
					.get(newPath)!
					.harness.getCurrentThreadId()
				ctx.mainWindow?.webContents.send("harness:event", {
					type: "project_changed",
					project: fastProject,
					currentThreadId,
				})
				saveRecentProject(newPath, fastProject.name)
				return { project: fastProject, currentThreadId }
			}

			// Slow path: first visit — create harness
			const project = detectProject(newPath)
			ctx.mainWindow?.webContents.send("harness:event", {
				type: "project_changed",
				project: {
					name: project.name,
					rootPath: project.rootPath,
					gitBranch: project.gitBranch,
					isWorktree: project.isWorktree,
				},
			})

			const result = await ctx.createHarness(newPath)
			const newSession: WorktreeSession = {
				harness: result.harness,
				mcpManager: result.mcpManager,
				resolveModel: result.resolveModel,
				authStorage: result.authStorage,
				projectRoot: newPath,
				unsubscribe: null,
				ptySessions: new Map(),
			}
			ctx.sessions.set(newPath, newSession)
			ctx.setActiveSessionPath(newPath)
			if (ctx.mainWindow) ctx.bridgeAllEvents(ctx.mainWindow)
			await newSession.harness.init()
			await ctx.ensureAuthenticatedModel(
				newSession.harness,
				newSession.authStorage,
			)
			await newSession.harness.loadOMProgress?.().catch(() => {})
			if (newSession.mcpManager.hasServers()) await newSession.mcpManager.init()

			saveRecentProject(newPath, project.name)
			return { project }
		},
		deleteWorktree: async (command, ctx) => {
			const { execSync } = require("child_process")
			const wtPath = command.worktreePath as string
			console.log("[deleteWorktree] Deleting worktree at:", wtPath)

			ctx.cleanupSession(wtPath)

			if (ctx.activeSessionPath === wtPath) {
				const remaining = [...ctx.sessions.keys()].filter((p) => p !== wtPath)
				const fallback = remaining[0] || process.cwd()
				ctx.setActiveSessionPath(fallback)
			}

			try {
				const gitCommonDir = execSync("git rev-parse --git-common-dir", {
					cwd: wtPath,
					encoding: "utf-8",
					stdio: ["pipe", "pipe", "pipe"],
				}).trim()
				const mainRepo = path.resolve(wtPath, gitCommonDir, "..")

				execSync(`git worktree remove "${wtPath}" --force`, {
					cwd: mainRepo,
					encoding: "utf-8",
					stdio: ["pipe", "pipe", "pipe"],
				})

				removeRecentProject(wtPath)
				return { success: true }
			} catch (e: any) {
				const msg = e.stderr?.trim() || e.message || "Failed to delete worktree"
				console.error("[deleteWorktree] Error:", msg)
				return { success: false, error: msg }
			}
		},
	}
}
