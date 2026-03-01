import { useState, useCallback } from "react"

interface LoginState {
	providerId: string
	stage: "auth" | "prompt" | "progress" | "success" | "error"
	url?: string
	instructions?: string
	promptMessage?: string
	promptPlaceholder?: string
	progressMessage?: string
	errorMessage?: string
}

export function useAuthManager() {
	const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
	const [loggedInProviders, setLoggedInProviders] = useState<Set<string>>(
		new Set(),
	)
	const [loginState, setLoginState] = useState<LoginState | null>(null)

	const handleLogin = useCallback(async (providerId: string) => {
		setLoginState({ providerId, stage: "auth" })
		await window.api.invoke({ type: "login", providerId })
	}, [])

	const handleApiKey = useCallback(
		async (providerId: string, apiKey: string) => {
			try {
				await window.api.invoke({ type: "setApiKey", providerId, apiKey })
			} catch (err) {
				console.error("Failed to set API key:", err)
			}
		},
		[],
	)

	const handleSkipLogin = useCallback(async () => {
		await window.api.invoke({
			type: "switchModel",
			modelId: "google/gemini-2.5-flash",
			scope: "global",
		})
		setIsAuthenticated(true)
		return "google/gemini-2.5-flash"
	}, [])

	const handleLoginSubmitCode = useCallback((code: string) => {
		window.api.respondToLoginPrompt(code)
	}, [])

	const handleLogout = useCallback(async (providerId: string) => {
		await window.api.invoke({ type: "logout", providerId })
		setLoggedInProviders((prev) => {
			const next = new Set(prev)
			next.delete(providerId)
			return next
		})
	}, [])

	const handleLoginCancel = useCallback(() => {
		window.api.cancelLoginPrompt()
	}, [])

	const handleLoginClose = useCallback(() => {
		setLoginState(null)
	}, [])

	return {
		isAuthenticated,
		setIsAuthenticated,
		loggedInProviders,
		setLoggedInProviders,
		loginState,
		setLoginState,
		handleLogin,
		handleApiKey,
		handleSkipLogin,
		handleLoginSubmitCode,
		handleLogout,
		handleLoginCancel,
		handleLoginClose,
	}
}
