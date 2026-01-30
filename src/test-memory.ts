/**
 * Test script to verify memory/message persistence works correctly.
 */

import { Agent } from "@mastra/core/agent"
import { LibSQLStore } from "@mastra/libsql"
import { Memory } from "@mastra/memory"
import { opencodeClaudeMaxProvider } from "./providers/claude-max.js"
import { getDatabasePath } from "./utils/project.js"

async function main() {
    console.log("=== Memory Persistence Test ===\n")

    // Use the shared database
    const dbPath = getDatabasePath()
    console.log(`Database path: ${dbPath}`)

    const storage = new LibSQLStore({
        id: "mastra-code-storage",
        url: `file:${dbPath}`,
    })

    await storage.init()
    console.log("Storage initialized")

    // Create memory with storage
    const memory = new Memory({
        storage,
    })

    console.log("\n--- Memory instance ---")
    console.log("Memory has storage:", memory.storage ? "yes" : "no")

    // Create a simple agent
    const agent = new Agent({
        id: "test-agent",
        name: "Test Agent",
        instructions: "You are a helpful assistant. Keep responses brief.",
        model: opencodeClaudeMaxProvider(),
        memory,
    })

    console.log("\n--- Agent instance ---")
    console.log("Agent has memory:", agent.hasOwnMemory())

    // Use fixed thread/resource IDs for testing
    const threadId = `test-memory-thread-${Date.now()}`
    const resourceId = "test-resource-123"

    console.log(`\nUsing thread: ${threadId}`)
    console.log(`Using resource: ${resourceId}`)

    // Get memory storage for later checking
    const memoryStorage = await storage.getStore("memory")
    if (!memoryStorage) {
        throw new Error("No memory storage domain")
    }

    // Send a message
    console.log("\n--- Sending message ---")
    const response = await agent.stream("Hello! What is 2+2?", {
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

    // Wait a moment for any async saves
    await new Promise((r) => setTimeout(r, 500))

    // Check if messages were saved
    console.log("\n--- Checking saved messages ---")
    const savedMessages = await memoryStorage.listMessages({ threadId })
    console.log(`Found ${savedMessages.messages.length} messages`)

    for (const msg of savedMessages.messages) {
        console.log(`  - ${msg.role}: ${JSON.stringify(msg.content).slice(0, 100)}...`)
    }

    if (savedMessages.messages.length === 0) {
        console.log("\n❌ ERROR: No messages were saved!")
        console.log("\nThis confirms the bug - messages are not being persisted to storage.")
    } else {
        console.log("\n✅ SUCCESS: Messages were saved correctly!")
    }
}

main().catch(console.error)
