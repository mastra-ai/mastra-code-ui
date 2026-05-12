import http from "node:http"
import { afterEach, describe, expect, it } from "vitest"

const blockers: http.Server[] = []

async function closeServer(server: http.Server): Promise<void> {
	await new Promise<void>((resolve) => server.close(() => resolve()))
}

async function getFreePort(): Promise<number> {
	const server = http.createServer()
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject)
		server.listen(0, "127.0.0.1", resolve)
	})
	const address = server.address()
	await closeServer(server)
	if (!address || typeof address === "string") {
		throw new Error("Failed to allocate a test port")
	}
	return address.port
}

async function getTestPorts(): Promise<{
	defaultPort: number
	fallbackPort: number
}> {
	return {
		defaultPort: await getFreePort(),
		fallbackPort: await getFreePort(),
	}
}

async function blockPort(port: number): Promise<void> {
	const server = http.createServer((_, res) => {
		res.statusCode = 200
		res.end("blocked")
	})
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject)
		server.listen(port, "127.0.0.1", resolve)
	})
	blockers.push(server)
}

describe("OpenAI Codex OAuth callback port selection", () => {
	afterEach(async () => {
		while (blockers.length > 0) {
			const server = blockers.pop()
			if (server) await closeServer(server)
		}
	})

	it("uses the Codex default callback port first", async () => {
		const ports = await getTestPorts()
		const { __testing } = await import("./openai-codex.js")

		const server = await __testing.startLocalOAuthServer("state", ports)
		try {
			expect(server.redirectUri).toBe(
				`http://localhost:${ports.defaultPort}/auth/callback`,
			)
		} finally {
			server.close()
		}
	})

	it("falls back when the default callback port is busy", async () => {
		const ports = await getTestPorts()
		await blockPort(ports.defaultPort)
		const { __testing } = await import("./openai-codex.js")

		const server = await __testing.startLocalOAuthServer("state", ports)
		try {
			expect(server.redirectUri).toBe(
				`http://localhost:${ports.fallbackPort}/auth/callback`,
			)
		} finally {
			server.close()
		}
	})

	it("does not point the auth URL at a busy default callback port", async () => {
		const ports = await getTestPorts()
		await blockPort(ports.defaultPort)
		const { __testing } = await import("./openai-codex.js")

		const server = await __testing.startLocalOAuthServer("state", ports)
		try {
			const { url } = await __testing.createAuthorizationFlow(
				server.redirectUri,
				"state",
			)

			expect(new URL(url).searchParams.get("redirect_uri")).toBe(
				`http://localhost:${ports.fallbackPort}/auth/callback`,
			)
		} finally {
			server.close()
		}
	})
})
