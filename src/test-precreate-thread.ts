/**
 * Test script to verify if pre-creating a thread breaks message persistence.
 * This mimics what the Harness does.
 */

import { Agent } from "@mastra/core/agent"
import { LibSQLStore } from "@mastra/libsql"
import { Memory } from "@mastra/memory"
import { opencodeClaudeMaxProvider } from "./providers/claude-max.js"
import { getDatabasePath } from "./utils/project.js"

async function main() {
    console.log("=== Pre-Create Thread Test ===\n")

    const dbPath = getDatabasePath()
    console.log(`Database path: ${dbPath}`)

    const storage = new LibSQLStore({
        id: "mastra-code-storage",
        url: `file:${dbPath}`,
    })

    await storage.init()
    console.log("Storage initialized")

    const memory = new Memory({ storage })
    const memoryStorage = await storage.getStore("memory")
    if (!memoryStorage) {
        throw new Error("No memory storage domain")
    }

    // PRE-CREATE a thread just like Harness does
    const threadId = `precreate-test-${Date.now()}`
    const resourceId = "precreate-test-resource"
    const now = new Date()

    console.log(`\nPre-creating thread: ${threadId}`)
    await memoryStorage.saveThread({
        thread: {
            id: threadId,
            resourceId: resourceId,
            title: "Pre-Created Thread",
            createdAt: now,
            updatedAt: now,
        },
    })
    console.log("Thread saved via memoryStorage.saveThread()")

    // Verify thread exists
    const savedThread = await memoryStorage.getThreadById({ threadId })
    console.log(`Thread exists in DB: ${savedThread ? "yes" : "no"}`)
    if (savedThread) {
        console.log(`  - id: ${savedThread.id}`)
        console.log(`  - resourceId: ${savedThread.resourceId}`)
        console.log(`  - title: ${savedThread.title}`)
    }

    // Create agent with memory
    const agent = new Agent({
        id: "test-agent",
        name: "Test Agent",
        instructions: "You are a helpful assistant. Keep responses very brief (1-2 sentences).",
        model: opencodeClaudeMaxProvider(),
        memory,
    })

    console.log(`\nAgent has memory: ${agent.hasOwnMemory()}`)

    // Now try to send a message to the pre-created thread
    console.log("\n--- Sending message to pre-created thread ---")
    const response = await agent.stream("Say hello in 5 words.", {
        memory: {
            thread: threadId,
            resource: resourceId,
        },
    })

    // Consume the stream
    let fullText = ""
    for await (const chunk of response.fullStream) {
        if (chunk.type === "text-delta") {
            fullText += chunk.payload.text
            process.stdout.write(chunk.payload.text)
        }
    }
    console.log("\n\n--- Stream complete ---")

    // Wait for any async saves
    await new Promise((r) => setTimeout(r, 1000))

    // Check if messages were saved
    console.log("\n--- Checking saved messages ---")
    const savedMessages = await memoryStorage.listMessages({ threadId })
    console.log(`Found ${savedMessages.messages.length} messages for thread ${threadId}`)

    for (const msg of savedMessages.messages) {
        console.log(`  - ${msg.role}: ${JSON.stringify(msg.content).slice(0, 80)}...`)
    }

    if (savedMessages.messages.length === 0) {
        console.log("\n❌ BUG CONFIRMED: Pre-creating thread breaks message persistence!")
        console.log("When thread is created via memoryStorage.saveThread(), messages are NOT saved.")
    } else {
        console.log("\n✅ Messages saved correctly!")
    }
}

main().catch(console.error)
