/**
 * Test script to see what listMessages actually returns.
 */

import { LibSQLStore } from "@mastra/libsql"
import { getDatabasePath } from "./utils/project.js"

async function main() {
    const dbPath = getDatabasePath()
    console.log(`Database path: ${dbPath}`)

    const storage = new LibSQLStore({
        id: "mastra-code-storage",
        url: `file:${dbPath}`,
    })

    await storage.init()

    const memoryStorage = await storage.getStore("memory")
    if (!memoryStorage) {
        throw new Error("No memory storage domain")
    }

    const threadId = "1769476093874-oz5im2yt9"
    console.log(`\nListing messages for thread: ${threadId}\n`)

    const result = await memoryStorage.listMessages({ threadId })
    console.log(`Found ${result.messages.length} messages\n`)

    for (const msg of result.messages) {
        console.log("=".repeat(60))
        console.log(`ID: ${msg.id}`)
        console.log(`Role: ${msg.role}`)
        console.log(`CreatedAt: ${msg.createdAt}`)
        console.log(`Content type: ${typeof msg.content}`)
        console.log(`Content:`, JSON.stringify(msg.content, null, 2).slice(0, 500))
        console.log()
    }
}

main().catch(console.error)
