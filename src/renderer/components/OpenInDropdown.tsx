import {
	useState,
	useEffect,
	useRef,
	type ComponentType,
	type SVGProps,
} from "react"
import {
	CursorAppIcon,
	FinderAppIcon,
	TerminalAppIcon,
	TinyChevronDownIcon,
	VSCodeAppIcon,
} from "./Icons"

type OpenTargetId = "finder" | "cursor" | "vscode" | "terminal"

type OpenTarget = {
	id: OpenTargetId
	label: string
	Icon: ComponentType<SVGProps<SVGSVGElement>>
}

const OPEN_IN_TARGET_KEY = "mastra-code.openInTarget"
const DEFAULT_TARGET_ID: OpenTargetId = "finder"

const openTargets: OpenTarget[] = [
	{ id: "finder", label: "Finder", Icon: FinderAppIcon },
	{ id: "cursor", label: "Cursor", Icon: CursorAppIcon },
	{ id: "vscode", label: "VS Code", Icon: VSCodeAppIcon },
	{ id: "terminal", label: "Terminal", Icon: TerminalAppIcon },
]

function isOpenTargetId(value: string | null): value is OpenTargetId {
	return openTargets.some((target) => target.id === value)
}

function getInitialTargetId(): OpenTargetId {
	if (typeof window === "undefined") return DEFAULT_TARGET_ID
	const storedTargetId = window.localStorage.getItem(OPEN_IN_TARGET_KEY)
	return isOpenTargetId(storedTargetId) ? storedTargetId : DEFAULT_TARGET_ID
}

export function OpenInDropdown({
	projectPath,
}: {
	projectPath: string | null
}) {
	const [open, setOpen] = useState(false)
	const [selectedTargetId, setSelectedTargetId] =
		useState<OpenTargetId>(getInitialTargetId)
	const ref = useRef<HTMLDivElement>(null)

	const selectedTarget =
		openTargets.find((target) => target.id === selectedTargetId) ??
		openTargets[0]
	const SelectedIcon = selectedTarget.Icon

	useEffect(() => {
		if (!open) return

		const handlePointerDown = (event: MouseEvent) => {
			if (ref.current && !ref.current.contains(event.target as Node)) {
				setOpen(false)
			}
		}

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") setOpen(false)
		}

		document.addEventListener("mousedown", handlePointerDown)
		document.addEventListener("keydown", handleKeyDown)
		return () => {
			document.removeEventListener("mousedown", handlePointerDown)
			document.removeEventListener("keydown", handleKeyDown)
		}
	}, [open])

	if (!projectPath) return null

	const openProjectIn = (targetId: OpenTargetId) => {
		window.api.invoke({
			type: "openProjectIn",
			target: targetId,
			projectPath,
		})
	}

	const selectTarget = (targetId: OpenTargetId) => {
		setSelectedTargetId(targetId)
		window.localStorage.setItem(OPEN_IN_TARGET_KEY, targetId)
		openProjectIn(targetId)
		setOpen(false)
	}

	return (
		<div
			ref={ref}
			className="titlebar-no-drag"
			style={{
				position: "relative",
				display: "flex",
				alignItems: "center",
				height: "100%",
			}}
		>
			<div
				style={{
					display: "flex",
					alignItems: "stretch",
					height: 28,
					border: "1px solid var(--border)",
					borderRadius: 6,
					overflow: "hidden",
					background: "transparent",
				}}
			>
				<button
					onClick={() => openProjectIn(selectedTarget.id)}
					style={{
						display: "flex",
						alignItems: "center",
						gap: 6,
						padding: "0 10px",
						fontSize: 11,
						fontWeight: 500,
						color: "var(--text)",
						cursor: "pointer",
						borderRight: "1px solid var(--border-muted)",
						transition: "background 0.12s, color 0.12s",
						whiteSpace: "nowrap",
					}}
					onMouseEnter={(event) => {
						event.currentTarget.style.background = "var(--bg-elevated)"
					}}
					onMouseLeave={(event) => {
						event.currentTarget.style.background = "transparent"
					}}
					title={`Open project in ${selectedTarget.label}`}
				>
					<span>Open in</span>
					<SelectedIcon width={14} height={14} />
				</button>

				<button
					onClick={() => setOpen((value) => !value)}
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						width: 28,
						padding: 0,
						color: "var(--text)",
						cursor: "pointer",
						transition: "background 0.12s, color 0.12s",
					}}
					onMouseEnter={(event) => {
						event.currentTarget.style.background = "var(--bg-elevated)"
					}}
					onMouseLeave={(event) => {
						event.currentTarget.style.background = "transparent"
					}}
					aria-expanded={open}
					aria-haspopup="menu"
					title="Choose open target"
				>
					<TinyChevronDownIcon />
				</button>
			</div>

			{open && (
				<div
					role="menu"
					style={{
						position: "absolute",
						top: "100%",
						right: 0,
						zIndex: 10,
						background: "var(--bg-elevated)",
						border: "1px solid var(--border)",
						borderRadius: 6,
						padding: 4,
						marginTop: 4,
						minWidth: 166,
						boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
					}}
				>
					<div
						style={{
							padding: "5px 8px",
							fontSize: 10,
							color: "var(--dim)",
							fontWeight: 500,
							textTransform: "uppercase",
							letterSpacing: "0.5px",
						}}
					>
						Open project in
					</div>
					{openTargets.map((target) => {
						const TargetIcon = target.Icon
						const isSelected = target.id === selectedTarget.id

						return (
							<button
								key={target.id}
								role="menuitem"
								onClick={() => selectTarget(target.id)}
								style={{
									display: "flex",
									alignItems: "center",
									gap: 8,
									width: "100%",
									padding: "7px 8px",
									fontSize: 12,
									color: "var(--text)",
									cursor: "pointer",
									borderRadius: 4,
									background: isSelected ? "var(--bg-hover)" : "transparent",
									border: "none",
									textAlign: "left",
								}}
								onMouseEnter={(event) => {
									event.currentTarget.style.background = "var(--bg-hover)"
								}}
								onMouseLeave={(event) => {
									event.currentTarget.style.background = isSelected
										? "var(--bg-hover)"
										: "transparent"
								}}
							>
								<TargetIcon width={14} height={14} />
								<span style={{ flex: 1 }}>{target.label}</span>
								{isSelected && (
									<span
										style={{
											width: 5,
											height: 5,
											borderRadius: "50%",
											background: "var(--accent)",
										}}
									/>
								)}
							</button>
						)
					})}
				</div>
			)}
		</div>
	)
}
