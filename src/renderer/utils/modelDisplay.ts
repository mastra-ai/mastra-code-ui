const ACRONYMS = /^(ai|api|cli|ui|om)$/i

interface ModelDisplayInfo {
	id: string
	name?: string | null
}

function stripProvider(value: string): string {
	return value.includes("/") ? (value.split("/").pop() ?? value) : value
}

function formatRawModelName(rawName: string): string {
	if (!rawName) return "No Model"

	const parts = rawName.split(/[-_\s]+/).filter(Boolean)
	const formatted: string[] = []

	for (let i = 0; i < parts.length; i++) {
		const part = parts[i]
		if (/^\d{7,}$/.test(part)) continue

		if (/^gpt$/i.test(part)) {
			const versionParts: string[] = []
			let j = i + 1
			while (
				j < parts.length &&
				/^[0-9][a-z0-9.]*$/i.test(parts[j]) &&
				!/^\d{7,}$/.test(parts[j])
			) {
				versionParts.push(parts[j])
				j++
			}

			formatted.push(
				versionParts.length > 0 ? `GPT-${versionParts.join(".")}` : "GPT",
			)
			i = j - 1
			continue
		}

		if (/^\d+(?:\.\d+)?$/.test(part)) {
			const versionParts = [part]
			let j = i + 1
			while (
				j < parts.length &&
				/^\d+$/.test(parts[j]) &&
				!/^\d{7,}$/.test(parts[j])
			) {
				versionParts.push(parts[j])
				j++
			}
			formatted.push(versionParts.join("."))
			i = j - 1
			continue
		}

		if (ACRONYMS.test(part)) {
			formatted.push(part.toUpperCase())
			continue
		}

		formatted.push(part.charAt(0).toUpperCase() + part.slice(1))
	}

	return formatted.join(" ")
}

function preservesFamilyPrefix(candidate: string, fallback: string): boolean {
	if (/^GPT-/i.test(fallback)) return /^GPT-/i.test(candidate)
	if (/^Claude\b/i.test(fallback)) return /^Claude\b/i.test(candidate)
	if (/^Gemini\b/i.test(fallback)) return /^Gemini\b/i.test(candidate)
	return true
}

export function formatModelName(model: string | ModelDisplayInfo): string {
	if (typeof model === "string") {
		return formatRawModelName(stripProvider(model))
	}

	const idLabel = formatRawModelName(stripProvider(model.id))
	const name = model.name?.trim()
	if (!name) return idLabel

	const nameLabel = formatRawModelName(stripProvider(name))
	return preservesFamilyPrefix(nameLabel, idLabel) ? nameLabel : idLabel
}

export function formatCompactModelName(
	model: string | ModelDisplayInfo,
): string {
	return formatModelName(model)
}
