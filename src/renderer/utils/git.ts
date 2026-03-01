/**
 * Map a two-character git status code to a human-readable label.
 *
 * The status string follows the `XY` format from `git status --porcelain`.
 * We pick the first meaningful character (ignoring spaces and `?`).
 */
export function statusLabel(s: string): string {
	const x = s[0]
	const y = s[1]
	const code = x !== " " && x !== "?" ? x : y
	switch (code) {
		case "M":
			return "modified"
		case "A":
			return "added"
		case "D":
			return "deleted"
		case "R":
			return "renamed"
		case "C":
			return "copied"
		case "?":
			return "untracked"
		default:
			return code
	}
}

/**
 * Map a two-character git status code to a CSS colour variable.
 */
export function statusColor(s: string): string {
	const code = s.trim()[0]
	switch (code) {
		case "M":
			return "var(--warning)"
		case "A":
		case "?":
			return "var(--success)"
		case "D":
			return "var(--error)"
		default:
			return "var(--muted)"
	}
}
