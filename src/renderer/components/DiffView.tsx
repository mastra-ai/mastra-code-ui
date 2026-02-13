import { useState } from "react"

interface DiffViewProps {
	diff: string
	fileName?: string
}

interface DiffLine {
	type: "add" | "del" | "context" | "hunk" | "meta"
	content: string
	oldNum: string
	newNum: string
}

function parseDiff(diff: string): DiffLine[] {
	const raw = diff.split("\n")
	const lines: DiffLine[] = []
	let oldLine = 0
	let newLine = 0

	for (const line of raw) {
		const isMeta =
			line.startsWith("diff ") ||
			line.startsWith("index ") ||
			line.startsWith("+++") ||
			line.startsWith("---")

		if (isMeta) {
			lines.push({ type: "meta", content: line, oldNum: "", newNum: "" })
			continue
		}

		if (line.startsWith("@@")) {
			const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
			if (match) {
				oldLine = parseInt(match[1], 10)
				newLine = parseInt(match[2], 10)
			}
			lines.push({ type: "hunk", content: line, oldNum: "", newNum: "" })
			continue
		}

		if (line.startsWith("+")) {
			lines.push({
				type: "add",
				content: line.slice(1),
				oldNum: "",
				newNum: String(newLine),
			})
			newLine++
		} else if (line.startsWith("-")) {
			lines.push({
				type: "del",
				content: line.slice(1),
				oldNum: String(oldLine),
				newNum: "",
			})
			oldLine++
		} else {
			lines.push({
				type: "context",
				content: line,
				oldNum: String(oldLine),
				newNum: String(newLine),
			})
			oldLine++
			newLine++
		}
	}

	return lines
}

// Group consecutive context lines into collapsible sections
type Segment =
	| { kind: "collapsed"; lines: DiffLine[]; startIdx: number }
	| { kind: "lines"; lines: DiffLine[]; startIdx: number }

function buildSegments(parsed: DiffLine[]): Segment[] {
	const segments: Segment[] = []
	let contextBuffer: DiffLine[] = []
	let contextStartIdx = 0

	function flushContext() {
		if (contextBuffer.length === 0) return
		// Keep 3 context lines at edges, collapse the rest
		if (contextBuffer.length > 6) {
			// Show first 3
			segments.push({
				kind: "lines",
				lines: contextBuffer.slice(0, 3),
				startIdx: contextStartIdx,
			})
			// Collapse middle
			segments.push({
				kind: "collapsed",
				lines: contextBuffer.slice(3, -3),
				startIdx: contextStartIdx + 3,
			})
			// Show last 3
			segments.push({
				kind: "lines",
				lines: contextBuffer.slice(-3),
				startIdx: contextStartIdx + contextBuffer.length - 3,
			})
		} else {
			segments.push({
				kind: "lines",
				lines: contextBuffer,
				startIdx: contextStartIdx,
			})
		}
		contextBuffer = []
	}

	for (let i = 0; i < parsed.length; i++) {
		const line = parsed[i]
		if (line.type === "context") {
			if (contextBuffer.length === 0) contextStartIdx = i
			contextBuffer.push(line)
		} else {
			flushContext()
			// Meta and hunk lines go in their own segment
			if (line.type === "meta") {
				// Skip meta lines from display (file header is shown separately)
				continue
			}
			if (line.type === "hunk") {
				// Don't render hunk headers since we have collapsed sections
				continue
			}
			// Gather consecutive add/del lines
			const changeLines: DiffLine[] = [line]
			while (
				i + 1 < parsed.length &&
				(parsed[i + 1].type === "add" || parsed[i + 1].type === "del")
			) {
				i++
				changeLines.push(parsed[i])
			}
			segments.push({
				kind: "lines",
				lines: changeLines,
				startIdx: i - changeLines.length + 1,
			})
		}
	}
	flushContext()

	return segments
}

function CollapsedSection({
	count,
	onExpand,
}: {
	count: number
	onExpand: () => void
}) {
	return (
		<button
			onClick={onExpand}
			style={{
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				gap: 8,
				width: "100%",
				padding: "4px 0",
				background: "rgba(56, 189, 248, 0.06)",
				border: "none",
				borderTop: "1px solid var(--border-muted)",
				borderBottom: "1px solid var(--border-muted)",
				color: "var(--muted)",
				fontSize: 11,
				cursor: "pointer",
				fontFamily: "inherit",
			}}
		>
			<span style={{ fontSize: 10 }}>&#x2191;</span>
			{count} unchanged line{count !== 1 ? "s" : ""}
			<span style={{ fontSize: 10 }}>&#x2193;</span>
		</button>
	)
}

function DiffLineRow({ line }: { line: DiffLine }) {
	let bg = "transparent"
	let color = "var(--text)"
	let gutterBg = "transparent"
	let gutterChar = " "
	let gutterColor = "var(--dim)"

	if (line.type === "add") {
		bg = "rgba(34, 197, 94, 0.10)"
		color = "var(--text)"
		gutterBg = "rgba(34, 197, 94, 0.20)"
		gutterChar = "+"
		gutterColor = "var(--diff-add)"
	} else if (line.type === "del") {
		bg = "rgba(239, 68, 68, 0.10)"
		color = "var(--text)"
		gutterBg = "rgba(239, 68, 68, 0.20)"
		gutterChar = "-"
		gutterColor = "var(--diff-del)"
	}

	return (
		<div
			style={{
				display: "flex",
				background: bg,
				minHeight: 20,
				lineHeight: "20px",
			}}
		>
			{/* Old line number */}
			<span
				style={{
					width: 44,
					textAlign: "right",
					paddingRight: 6,
					color: "var(--dim)",
					fontSize: 11,
					userSelect: "none",
					flexShrink: 0,
					opacity: 0.5,
				}}
			>
				{line.oldNum}
			</span>
			{/* New line number */}
			<span
				style={{
					width: 44,
					textAlign: "right",
					paddingRight: 6,
					color: "var(--dim)",
					fontSize: 11,
					userSelect: "none",
					flexShrink: 0,
					opacity: 0.5,
				}}
			>
				{line.newNum}
			</span>
			{/* Gutter marker */}
			<span
				style={{
					width: 20,
					textAlign: "center",
					color: gutterColor,
					fontWeight: 700,
					background: gutterBg,
					flexShrink: 0,
					userSelect: "none",
				}}
			>
				{gutterChar}
			</span>
			{/* Content */}
			<span
				style={{
					color,
					whiteSpace: "pre",
					padding: "0 12px",
					flex: 1,
					tabSize: 4,
				}}
			>
				{line.content}
			</span>
		</div>
	)
}

export function DiffView({ diff, fileName }: DiffViewProps) {
	const [expandedSections, setExpandedSections] = useState<Set<number>>(
		new Set(),
	)

	if (!diff.trim()) {
		return (
			<div
				style={{
					padding: "20px 16px",
					color: "var(--dim)",
					fontSize: 12,
					textAlign: "center",
				}}
			>
				No changes
			</div>
		)
	}

	const parsed = parseDiff(diff)
	const segments = buildSegments(parsed)

	function toggleSection(idx: number) {
		setExpandedSections((prev) => {
			const next = new Set(prev)
			if (next.has(idx)) {
				next.delete(idx)
			} else {
				next.add(idx)
			}
			return next
		})
	}

	return (
		<div
			style={{
				fontFamily: "inherit",
				fontSize: 12,
				lineHeight: "20px",
			}}
		>
			{segments.map((seg, i) => {
				if (seg.kind === "collapsed" && !expandedSections.has(i)) {
					return (
						<CollapsedSection
							key={i}
							count={seg.lines.length}
							onExpand={() => toggleSection(i)}
						/>
					)
				}

				return (
					<div key={i}>
						{seg.lines.map((line, j) => (
							<DiffLineRow
								key={seg.startIdx + j}
								line={line}
							/>
						))}
					</div>
				)
			})}
		</div>
	)
}
