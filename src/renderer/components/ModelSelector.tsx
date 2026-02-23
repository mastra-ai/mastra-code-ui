import { useState, useEffect, useRef } from "react"

interface ModelSelectorProps {
	currentModelId: string
	onSelect: (modelId: string) => void
	onClose: () => void
}

interface ModelInfo {
	id: string
	name: string
	provider: string
	hasAuth: boolean
}

export function ModelSelector({
	currentModelId,
	onSelect,
	onClose,
}: ModelSelectorProps) {
	const [models, setModels] = useState<ModelInfo[]>([])
	const [filter, setFilter] = useState("")
	const [loading, setLoading] = useState(true)
	const inputRef = useRef<HTMLInputElement>(null)

	useEffect(() => {
		inputRef.current?.focus()

		const handleKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose()
		}
		window.addEventListener("keydown", handleKey)
		return () => window.removeEventListener("keydown", handleKey)
	}, [onClose])

	useEffect(() => {
		async function load() {
			try {
				const result = (await window.api.invoke({
					type: "getAvailableModels",
				})) as ModelInfo[]
				setModels(result ?? [])
			} catch {
				// ignore
			} finally {
				setLoading(false)
			}
		}
		load()
	}, [])

	const filtered = models.filter((m) =>
		m.id.toLowerCase().includes(filter.toLowerCase()),
	)

	// Group by provider
	const grouped = filtered.reduce(
		(acc, m) => {
			const provider = m.provider || m.id.split("/")[0] || "other"
			if (!acc[provider]) acc[provider] = []
			acc[provider].push(m)
			return acc
		},
		{} as Record<string, ModelInfo[]>,
	)

	// Derive per-provider auth status
	const providerAuth: Record<string, boolean> = {}
	for (const [provider, providerModels] of Object.entries(grouped)) {
		providerAuth[provider] = providerModels.some((m) => m.hasAuth)
	}

	return (
		<div
			style={{
				position: "fixed",
				inset: 0,
				background: "rgba(0, 0, 0, 0.6)",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				zIndex: 100,
			}}
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose()
			}}
		>
			<div
				style={{
					background: "var(--bg-elevated)",
					border: "1px solid var(--border)",
					borderRadius: 12,
					padding: 0,
					width: 500,
					maxHeight: "70vh",
					display: "flex",
					flexDirection: "column",
					overflow: "hidden",
				}}
			>
				{/* Search */}
				<div style={{ padding: 12, borderBottom: "1px solid var(--border-muted)" }}>
					<input
						ref={inputRef}
						value={filter}
						onChange={(e) => setFilter(e.target.value)}
						placeholder="Search models..."
						style={{
							width: "100%",
							padding: "8px 12px",
							background: "var(--bg-surface)",
							border: "1px solid var(--border)",
							borderRadius: 6,
							color: "var(--text)",
							fontSize: 13,
							fontFamily: "inherit",
							outline: "none",
						}}
					/>
				</div>

				{/* Model list */}
				<div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
					{loading && (
						<div style={{ padding: 20, textAlign: "center", color: "var(--muted)" }}>
							Loading models...
						</div>
					)}
					{!loading && Object.entries(grouped).map(([provider, providerModels]) => (
						<div key={provider}>
							<div
								style={{
									padding: "8px 8px 4px",
									fontSize: 10,
									color: "var(--muted)",
									textTransform: "uppercase",
									fontWeight: 600,
									display: "flex",
									alignItems: "center",
									gap: 6,
								}}
							>
								{provider}
								{providerAuth[provider] ? (
									<span
										style={{
											background: "#05966922",
											color: "#059669",
											padding: "0px 6px",
											borderRadius: 3,
											fontWeight: 500,
											fontSize: 9,
											textTransform: "none",
											border: "1px solid #05966944",
										}}
									>
										Connected
									</span>
								) : (
									<span
										style={{
											background: "#ef444422",
											color: "#ef4444",
											padding: "0px 6px",
											borderRadius: 3,
											fontWeight: 500,
											fontSize: 9,
											textTransform: "none",
											border: "1px solid #ef444444",
										}}
									>
										Not connected
									</span>
								)}
							</div>
							{providerModels.map((m) => (
								<button
									key={m.id}
									onClick={() => onSelect(m.id)}
									style={{
										display: "block",
										width: "100%",
										padding: "6px 8px",
										textAlign: "left",
										cursor: m.hasAuth ? "pointer" : "default",
										borderRadius: 4,
										background:
											m.id === currentModelId
												? "var(--accent)" + "22"
												: "transparent",
										fontSize: 12,
										color:
											m.id === currentModelId
												? "var(--accent)"
												: m.hasAuth
													? "var(--text)"
													: "var(--muted)",
										opacity: m.hasAuth ? 1 : 0.5,
									}}
								>
									{m.name || m.id.split("/").pop()}
									{!m.hasAuth && (
										<span
											style={{
												marginLeft: 6,
												fontSize: 10,
												color: "var(--muted)",
											}}
										>
											(no auth)
										</span>
									)}
								</button>
							))}
						</div>
					))}
					{!loading && filtered.length === 0 && (
						<div
							style={{
								padding: 20,
								textAlign: "center",
								color: "var(--muted)",
							}}
						>
							No models found
						</div>
					)}
				</div>
			</div>
		</div>
	)
}
