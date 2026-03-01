import { BrowserWindow } from "electron"
import type { IpcCommandHandler } from "./types.js"

export function getIntegrationHandlers(): Record<string, IpcCommandHandler> {
	return {
		linearConnect: async (command, ctx) => {
			const h = ctx.getActiveSession().harness
			const clientId = process.env.LINEAR_CLIENT_ID
			const clientSecret = process.env.LINEAR_CLIENT_SECRET
			const hasOAuth = !!(clientId && clientSecret)

			if (hasOAuth) {
				const state =
					Math.random().toString(36).slice(2) +
					Math.random().toString(36).slice(2)
				const redirectUri = "http://127.0.0.1/linear/callback"

				const authUrl = new URL("https://linear.app/oauth/authorize")
				authUrl.searchParams.set("response_type", "code")
				authUrl.searchParams.set("client_id", clientId)
				authUrl.searchParams.set("redirect_uri", redirectUri)
				authUrl.searchParams.set("scope", "read write issues:create")
				authUrl.searchParams.set("state", state)
				authUrl.searchParams.set("prompt", "consent")

				return new Promise((resolve) => {
					const authWindow = new BrowserWindow({
						width: 520,
						height: 700,
						parent: ctx.mainWindow ?? undefined,
						modal: false,
						show: true,
						title: "Sign in to Linear",
						webPreferences: {
							nodeIntegration: false,
							contextIsolation: true,
						},
					})

					let resolved = false

					const handleUrl = async (url: string) => {
						if (!url.startsWith(redirectUri) || resolved) return false
						resolved = true

						const urlObj = new URL(url)
						const code = urlObj.searchParams.get("code")
						const returnedState = urlObj.searchParams.get("state")

						if (returnedState !== state || !code) {
							authWindow.close()
							resolve({
								success: false,
								error: "Authorization failed",
							})
							return true
						}

						try {
							const tokenResponse = await fetch(
								"https://api.linear.app/oauth/token",
								{
									method: "POST",
									headers: {
										"Content-Type": "application/x-www-form-urlencoded",
									},
									body: new URLSearchParams({
										grant_type: "authorization_code",
										code,
										redirect_uri: redirectUri,
										client_id: clientId,
										client_secret: clientSecret,
									}),
								},
							)

							if (!tokenResponse.ok) {
								throw new Error(
									`Token exchange failed: ${tokenResponse.status}`,
								)
							}

							const tokenData = (await tokenResponse.json()) as {
								access_token?: string
							}
							if (!tokenData.access_token) {
								throw new Error("No access token in response")
							}

							await h.setState({
								linearApiKey: tokenData.access_token,
							})
							authWindow.close()
							resolve({
								success: true,
								accessToken: tokenData.access_token,
							})
						} catch (err: any) {
							authWindow.close()
							resolve({
								success: false,
								error: err.message || "Token exchange failed",
							})
						}
						return true
					}

					authWindow.webContents.on("will-redirect", (event, url) => {
						if (url.startsWith(redirectUri)) {
							event.preventDefault()
							handleUrl(url)
						}
					})

					authWindow.webContents.on("will-navigate", (event, url) => {
						if (url.startsWith(redirectUri)) {
							event.preventDefault()
							handleUrl(url)
						}
					})

					authWindow.on("closed", () => {
						if (!resolved) {
							resolved = true
							resolve({
								success: false,
								error: "cancelled",
							})
						}
					})

					authWindow.loadURL(authUrl.toString())
				})
			}

			// No OAuth — open Linear's API key page in a popup
			return new Promise((resolve) => {
				const keyWindow = new BrowserWindow({
					width: 900,
					height: 700,
					parent: ctx.mainWindow ?? undefined,
					modal: false,
					show: true,
					title: "Create a Linear API Key",
					webPreferences: {
						nodeIntegration: false,
						contextIsolation: true,
					},
				})

				keyWindow.on("closed", () => {
					resolve({ success: false, error: "needs_api_key" })
				})

				keyWindow.loadURL("https://linear.app/settings/account/security")
			})
		},
		linearQuery: async (command) => {
			const apiKey = command.apiKey as string
			if (!apiKey) throw new Error("No Linear API key provided")
			const response = await fetch("https://api.linear.app/graphql", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: apiKey,
				},
				body: JSON.stringify({
					query: command.query as string,
					variables: command.variables ?? {},
				}),
			})
			if (!response.ok) {
				throw new Error(
					`Linear API error: ${response.status} ${response.statusText}`,
				)
			}
			return await response.json()
		},
		linkLinearIssue: async (command, ctx) => {
			const h = ctx.getActiveSession().harness
			const issueId = command.issueId as string
			const issueIdentifier = command.issueIdentifier as string
			const doneStateId = command.doneStateId as string
			const startedStateId = command.startedStateId as string
			const parentLinearApiKey = command.linearApiKey as string
			const parentLinearTeamId = command.linearTeamId as string

			await h.setState({
				linkedLinearIssueId: issueId,
				linkedLinearIssueIdentifier: issueIdentifier,
				linkedLinearDoneStateId: doneStateId,
				linearApiKey: parentLinearApiKey,
				linearTeamId: parentLinearTeamId,
			})

			if (startedStateId && parentLinearApiKey) {
				try {
					await fetch("https://api.linear.app/graphql", {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							Authorization: parentLinearApiKey,
						},
						body: JSON.stringify({
							query: `mutation($id: String!, $stateId: String!) {
								issueUpdate(id: $id, input: { stateId: $stateId }) {
									success
								}
							}`,
							variables: { id: issueId, stateId: startedStateId },
						}),
					})
				} catch (e: any) {
					console.warn("Failed to update Linear issue status:", e.message)
				}
			}

			return { success: true }
		},
		getLinkedIssues: async (_command, ctx) => {
			const linked: Record<
				string,
				{
					issueId: string
					issueIdentifier: string
					provider: "linear" | "github"
				}
			> = {}
			for (const [wtPath, session] of ctx.sessions.entries()) {
				try {
					const wtState = session.harness.getState?.() as
						| Record<string, unknown>
						| undefined
					const wtIssueId = (wtState?.linkedLinearIssueId as string) ?? ""
					const wtIssueIdentifier =
						(wtState?.linkedLinearIssueIdentifier as string) ?? ""
					if (wtIssueId && wtIssueIdentifier) {
						linked[wtPath] = {
							issueId: wtIssueId,
							issueIdentifier: wtIssueIdentifier,
							provider: "linear",
						}
					}
					const wtGithubIssue =
						(wtState?.linkedGithubIssueNumber as number) ?? 0
					if (wtGithubIssue > 0 && !linked[wtPath]) {
						linked[wtPath] = {
							issueId: `gh-${wtGithubIssue}`,
							issueIdentifier: `#${wtGithubIssue}`,
							provider: "github",
						}
					}
				} catch {
					// Session may not have these fields
				}
			}
			return linked
		},
		githubConnect: async (command, ctx) => {
			const { execSync } =
				require("child_process") as typeof import("child_process")
			const h = ctx.getActiveSession().harness
			const projectRoot = ctx.getActiveSession().projectRoot
			let ghToken = (command.token as string) || ""

			if (!ghToken) {
				try {
					ghToken = (
						execSync("gh auth token", {
							encoding: "utf-8",
							stdio: ["pipe", "pipe", "pipe"],
							timeout: 5000,
						}) as string
					).trim()
				} catch {
					return { success: false, error: "gh_not_authenticated" }
				}
			}

			try {
				const userResp = await fetch("https://api.github.com/user", {
					headers: {
						Authorization: `Bearer ${ghToken}`,
						Accept: "application/vnd.github+json",
					},
				})
				if (!userResp.ok) throw new Error(`GitHub API: ${userResp.status}`)
				const ghUser = (await userResp.json()) as { login: string }

				let ghOwner = ""
				let ghRepo = ""
				try {
					const remoteUrl = (
						execSync("git remote get-url origin", {
							cwd: projectRoot,
							encoding: "utf-8",
							stdio: ["pipe", "pipe", "pipe"],
						}) as string
					).trim()
					const ghMatch = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)/)
					if (ghMatch) {
						ghOwner = ghMatch[1]
						ghRepo = ghMatch[2].replace(/\.git$/, "")
					}
				} catch {
					// Not a git repo or no remote
				}

				await h.setState({
					githubToken: ghToken,
					githubOwner: ghOwner,
					githubRepo: ghRepo,
					githubUsername: ghUser.login,
				})

				return {
					success: true,
					username: ghUser.login,
					owner: ghOwner,
					repo: ghRepo,
				}
			} catch (err: any) {
				return {
					success: false,
					error: err.message || "Token validation failed",
				}
			}
		},
		githubDisconnect: async (_command, ctx) => {
			await ctx.getActiveSession().harness.setState({
				githubToken: "",
				githubOwner: "",
				githubRepo: "",
				githubUsername: "",
			})
			return { success: true }
		},
		githubApi: async (command) => {
			const ghApiToken = command.token as string
			if (!ghApiToken) throw new Error("No GitHub token provided")
			const ghMethod = (command.method as string) || "GET"
			const ghEndpoint = command.endpoint as string
			const ghBody = command.body as Record<string, unknown> | undefined

			const ghResponse = await fetch(`https://api.github.com${ghEndpoint}`, {
				method: ghMethod,
				headers: {
					Authorization: `Bearer ${ghApiToken}`,
					Accept: "application/vnd.github+json",
					...(ghBody ? { "Content-Type": "application/json" } : {}),
				},
				...(ghBody ? { body: JSON.stringify(ghBody) } : {}),
			})
			if (!ghResponse.ok) {
				throw new Error(
					`GitHub API error: ${ghResponse.status} ${ghResponse.statusText}`,
				)
			}
			return await ghResponse.json()
		},
		linkGithubIssue: async (command, ctx) => {
			const h = ctx.getActiveSession().harness
			await h.setState({
				linkedGithubIssueNumber: command.issueNumber as number,
				linkedGithubIssueTitle: command.issueTitle as string,
				githubToken: command.githubToken as string,
				githubOwner: command.owner as string,
				githubRepo: command.repo as string,
			})
			return { success: true }
		},
	}
}
