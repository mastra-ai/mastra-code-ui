import type { SlashCommandMetadata } from "./slash-command-loader.js"

export interface ExtractedSlashCommand {
	/** The matched command */
	command: SlashCommandMetadata
	/** Arguments provided after the command name */
	args: string[]
	/** The full text that was matched */
	fullMatch: string
}

/**
 * Extract a slash command from user input
 * Format: /command arg1 arg2 ...
 * Supports namespaced commands: /namespace:command arg1 arg2
 */
export function extractSlashCommand(
	input: string,
	availableCommands: SlashCommandMetadata[],
): ExtractedSlashCommand | null {
	// Check if input starts with /
	if (!input.trim().startsWith("/")) {
		return null
	}

	// Remove leading / and split by whitespace
	const withoutSlash = input.trim().slice(1)
	const parts = withoutSlash.split(/\s+/)

	if (parts.length === 0 || !parts[0]) {
		return null
	}

	const commandName = parts[0]
	const args = parts.slice(1).filter((arg) => arg.length > 0)

	// Find matching command
	const command = availableCommands.find((cmd) => cmd.name === commandName)

	if (!command) {
		return null
	}

	return {
		command,
		args,
		fullMatch: input.trim(),
	}
}

/**
 * Check if input looks like a slash command (starts with /)
 */
export function isSlashCommand(input: string): boolean {
	return input.trim().startsWith("/")
}

/**
 * Get command name from input without extracting full command
 * Returns null if not a slash command
 */
export function getSlashCommandName(input: string): string | null {
	if (!isSlashCommand(input)) {
		return null
	}

	const withoutSlash = input.trim().slice(1)
	const parts = withoutSlash.split(/\s+/)

	return parts[0] || null
}

/**
 * Filter commands by prefix for autocomplete
 */
export function filterCommandsByPrefix(
	prefix: string,
	commands: SlashCommandMetadata[],
): SlashCommandMetadata[] {
	const lowerPrefix = prefix.toLowerCase()

	return commands.filter(
		(cmd) =>
			cmd.name.toLowerCase().startsWith(lowerPrefix) ||
			cmd.name.toLowerCase().includes(lowerPrefix),
	)
}
