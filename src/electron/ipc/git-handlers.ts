import type { IpcCommandHandler } from "./types.js"

export function getGitHandlers(): Record<string, IpcCommandHandler> {
	return {
		getPRStatus: async (_command, ctx) => {
			const { execSync } = require("child_process")
			const projectRoot = ctx.getActiveSession().projectRoot
			try {
				const json = execSync(
					"gh pr view --json number,title,state,url,statusCheckRollup,mergeable,isDraft,headRefName 2>&1",
					{
						cwd: projectRoot,
						encoding: "utf-8",
						stdio: ["pipe", "pipe", "pipe"],
					},
				) as string
				const pr = JSON.parse(json) as {
					number: number
					title: string
					state: string
					url: string
					isDraft: boolean
					headRefName: string
					mergeable: string
					statusCheckRollup: Array<{
						state: string
						conclusion: string
					}> | null
				}
				let checks: "pending" | "passing" | "failing" | "none" = "none"
				if (pr.statusCheckRollup && pr.statusCheckRollup.length > 0) {
					const hasFailure = pr.statusCheckRollup.some(
						(c) => c.conclusion === "FAILURE" || c.conclusion === "ERROR",
					)
					const hasPending = pr.statusCheckRollup.some(
						(c) => c.state === "PENDING" || c.conclusion === "",
					)
					if (hasFailure) checks = "failing"
					else if (hasPending) checks = "pending"
					else checks = "passing"
				}
				return {
					exists: true,
					number: pr.number,
					title: pr.title,
					state: pr.state.toLowerCase(),
					url: pr.url,
					isDraft: pr.isDraft,
					checks,
					mergeable: pr.mergeable,
				}
			} catch {
				return { exists: false }
			}
		},
		getWorktreePRStatuses: async (command) => {
			const { execSync: execSyncPR } = require("child_process")
			const repoPath = command.repoPath as string
			const worktreeBranches = command.worktrees as Array<{
				path: string
				branch: string
			}>
			const result: Record<
				string,
				{
					exists: boolean
					state?: string
					number?: number
					url?: string
					isDraft?: boolean
				}
			> = {}

			let allPRs: Array<{
				number: number
				headRefName: string
				state: string
				url: string
				isDraft: boolean
			}> = []
			try {
				const json = execSyncPR(
					"gh pr list --state all --json number,headRefName,state,url,isDraft --limit 200 2>&1",
					{
						cwd: repoPath,
						encoding: "utf-8",
						stdio: ["pipe", "pipe", "pipe"],
						timeout: 10000,
					},
				) as string
				allPRs = JSON.parse(json)
			} catch {
				// gh CLI not available or not a GitHub repo
			}

			const branchToPR = new Map<string, (typeof allPRs)[0]>()
			for (const pr of allPRs) {
				const existing = branchToPR.get(pr.headRefName)
				if (!existing || pr.number > existing.number) {
					branchToPR.set(pr.headRefName, pr)
				}
			}

			for (const wt of worktreeBranches) {
				const pr = branchToPR.get(wt.branch)
				if (pr) {
					result[wt.path] = {
						exists: true,
						state: pr.state.toLowerCase(),
						number: pr.number,
						url: pr.url,
						isDraft: pr.isDraft,
					}
				} else {
					result[wt.path] = { exists: false }
				}
			}
			return result
		},
		gitStatus: async (_command, ctx) => {
			const { execSync } = require("child_process")
			const projectRoot = ctx.getActiveSession().projectRoot
			try {
				const status = execSync("git status --porcelain=v1 -uall", {
					cwd: projectRoot,
					encoding: "utf-8",
					maxBuffer: 5 * 1024 * 1024,
				}) as string
				const branch = (
					execSync("git rev-parse --abbrev-ref HEAD", {
						cwd: projectRoot,
						encoding: "utf-8",
					}) as string
				).trim()
				const files = status
					.split("\n")
					.filter(Boolean)
					.map((line: string) => ({
						status: line.substring(0, 2),
						path: line.substring(3),
						staged: line[0] !== " " && line[0] !== "?",
						unstaged: line[1] !== " ",
						untracked: line.startsWith("??"),
					}))
				return { branch, files, clean: files.length === 0 }
			} catch {
				return {
					branch: null,
					files: [],
					clean: true,
					error: "Not a git repo",
				}
			}
		},
		gitDiff: async (command, ctx) => {
			const { execSync } = require("child_process")
			const projectRoot = ctx.getActiveSession().projectRoot
			const args = command.staged ? ["diff", "--cached"] : ["diff"]
			if (command.file) args.push("--", command.file as string)
			try {
				const diff = execSync(`git ${args.join(" ")}`, {
					cwd: projectRoot,
					encoding: "utf-8",
					maxBuffer: 5 * 1024 * 1024,
				}) as string
				return { diff }
			} catch {
				return { diff: "" }
			}
		},
		gitStage: async (command, ctx) => {
			const { execFileSync } = require("child_process")
			const projectRoot = ctx.getActiveSession().projectRoot
			const stageFiles = command.files as string[] | undefined
			try {
				if (stageFiles && stageFiles.length > 0) {
					execFileSync("git", ["add", "--", ...stageFiles], {
						cwd: projectRoot,
						encoding: "utf-8",
						maxBuffer: 5 * 1024 * 1024,
					})
				} else {
					execFileSync("git", ["add", "-A"], {
						cwd: projectRoot,
						encoding: "utf-8",
						maxBuffer: 5 * 1024 * 1024,
					})
				}
				return { success: true }
			} catch (e: any) {
				return { success: false, error: e.message || "Failed to stage" }
			}
		},
		gitUnstage: async (command, ctx) => {
			const { execFileSync } = require("child_process")
			const projectRoot = ctx.getActiveSession().projectRoot
			const unstageFiles = command.files as string[] | undefined
			try {
				if (unstageFiles && unstageFiles.length > 0) {
					execFileSync("git", ["reset", "HEAD", "--", ...unstageFiles], {
						cwd: projectRoot,
						encoding: "utf-8",
						maxBuffer: 5 * 1024 * 1024,
					})
				} else {
					execFileSync("git", ["reset", "HEAD"], {
						cwd: projectRoot,
						encoding: "utf-8",
						maxBuffer: 5 * 1024 * 1024,
					})
				}
				return { success: true }
			} catch (e: any) {
				return { success: false, error: e.message || "Failed to unstage" }
			}
		},
		gitCommit: async (command, ctx) => {
			const { execFileSync } = require("child_process")
			const projectRoot = ctx.getActiveSession().projectRoot
			const commitMsg = command.message as string
			if (!commitMsg || !commitMsg.trim()) {
				return { success: false, error: "Commit message is required" }
			}
			try {
				execFileSync("git", ["commit", "-m", commitMsg.trim()], {
					cwd: projectRoot,
					encoding: "utf-8",
					maxBuffer: 5 * 1024 * 1024,
				})
				return { success: true }
			} catch (e: any) {
				return {
					success: false,
					error: e.stderr?.toString() || e.message || "Commit failed",
				}
			}
		},
		gitPush: async (_command, ctx) => {
			const { execSync } = require("child_process")
			const projectRoot = ctx.getActiveSession().projectRoot
			try {
				execSync("git push", {
					cwd: projectRoot,
					encoding: "utf-8",
					maxBuffer: 5 * 1024 * 1024,
					timeout: 60000,
				})
				return { success: true }
			} catch (e: any) {
				return {
					success: false,
					error: e.stderr?.toString()?.trim() || e.message || "Push failed",
				}
			}
		},
		gitPull: async (_command, ctx) => {
			const { execSync } = require("child_process")
			const projectRoot = ctx.getActiveSession().projectRoot
			try {
				const pullOutput = execSync("git pull", {
					cwd: projectRoot,
					encoding: "utf-8",
					maxBuffer: 5 * 1024 * 1024,
					timeout: 60000,
				}) as string
				return { success: true, output: pullOutput.trim() }
			} catch (e: any) {
				return {
					success: false,
					error: e.stderr?.toString()?.trim() || e.message || "Pull failed",
				}
			}
		},
		gitAheadBehind: async (_command, ctx) => {
			const { execSync } = require("child_process")
			const projectRoot = ctx.getActiveSession().projectRoot
			try {
				execSync("git rev-parse --abbrev-ref @{upstream}", {
					cwd: projectRoot,
					encoding: "utf-8",
					stdio: ["pipe", "pipe", "pipe"],
				})
				const abOutput = (
					execSync("git rev-list --left-right --count HEAD...@{upstream}", {
						cwd: projectRoot,
						encoding: "utf-8",
						stdio: ["pipe", "pipe", "pipe"],
					}) as string
				).trim()
				const [ahead, behind] = abOutput.split(/\s+/).map(Number)
				return { ahead, behind, hasUpstream: true }
			} catch {
				return { ahead: 0, behind: 0, hasUpstream: false }
			}
		},
		gitSyncWithMain: async (command) => {
			const { execSync } = require("child_process")
			const worktreePath = command.worktreePath as string
			try {
				const commonDir = (
					execSync("git rev-parse --git-common-dir", {
						cwd: worktreePath,
						encoding: "utf-8",
						stdio: ["pipe", "pipe", "pipe"],
					}) as string
				).trim()
				const path = require("path")
				const mainRepo = path.dirname(path.resolve(worktreePath, commonDir))

				let defaultBranch = "main"
				try {
					const symbolicRef = (
						execSync("git symbolic-ref refs/remotes/origin/HEAD", {
							cwd: mainRepo,
							encoding: "utf-8",
							stdio: ["pipe", "pipe", "pipe"],
						}) as string
					).trim()
					defaultBranch = symbolicRef.replace("refs/remotes/origin/", "")
				} catch {
					try {
						execSync("git rev-parse --verify refs/heads/main", {
							cwd: mainRepo,
							encoding: "utf-8",
							stdio: ["pipe", "pipe", "pipe"],
						})
						defaultBranch = "main"
					} catch {
						defaultBranch = "master"
					}
				}

				execSync("git fetch origin", {
					cwd: mainRepo,
					encoding: "utf-8",
					timeout: 60000,
					stdio: ["pipe", "pipe", "pipe"],
				})

				const mergeOutput = (
					execSync(`git merge origin/${defaultBranch}`, {
						cwd: worktreePath,
						encoding: "utf-8",
						timeout: 60000,
						stdio: ["pipe", "pipe", "pipe"],
					}) as string
				).trim()

				return { success: true, output: mergeOutput, branch: defaultBranch }
			} catch (e: any) {
				return {
					success: false,
					error:
						e.stderr?.toString()?.trim() ||
						e.message ||
						"Sync with main failed",
				}
			}
		},
	}
}
