import { SidebarTabs, type SidebarTab } from "./SidebarTabs"
import { FileTree } from "./FileTree"
import { GitPanel } from "./GitPanel"
import type { ThreadInfo } from "../types/ipc"

interface SidebarProps {
	threads: ThreadInfo[]
	currentThreadId: string | null
	modeId: string
	loggedInProviders: Set<string>
	activeTab: SidebarTab
	projectName: string
	sidebarVisible: boolean
	onSwitchThread: (threadId: string) => void
	onNewThread: () => void
	onSwitchMode: (modeId: string) => void
	onOpenModelSelector: () => void
	onLogin: (providerId: string) => void
	onTabChange: (tab: SidebarTab) => void
	onOpenProjectSwitcher: () => void
}

const modes = [
	{ id: "build", name: "Build", color: "var(--mode-build)" },
	{ id: "plan", name: "Plan", color: "var(--mode-plan)" },
	{ id: "fast", name: "Fast", color: "var(--mode-fast)" },
]

const providers = [
	{ id: "anthropic", label: "Anthropic" },
	{ id: "openai-codex", label: "OpenAI" },
]

export function Sidebar({
	threads,
	currentThreadId,
	modeId,
	loggedInProviders,
	activeTab,
	projectName,
	sidebarVisible,
	onSwitchThread,
	onNewThread,
	onSwitchMode,
	onOpenModelSelector,
	onLogin,
	onTabChange,
	onOpenProjectSwitcher,
}: SidebarProps) {
	if (!sidebarVisible) return null

	return (
		<div
			style={{
				width: 260,
				borderRight: "1px solid var(--border-muted)",
				display: "flex",
				flexDirection: "column",
				background: "var(--bg-surface)",
				flexShrink: 0,
			}}
		>
			{/* Drag region + project name */}
			<button
				className="titlebar-drag"
				onClick={onOpenProjectSwitcher}
				style={{
					height: 38,
					display: "flex",
					alignItems: "center",
					paddingLeft: 78,
					borderBottom: "1px solid var(--border-muted)",
					fontSize: 12,
					fontWeight: 600,
					color: "var(--text)",
					flexShrink: 0,
					cursor: "pointer",
					width: "100%",
					textAlign: "left",
					background: "transparent",
					border: "none",
					borderBottomStyle: "solid",
					borderBottomWidth: 1,
					borderBottomColor: "var(--border-muted)",
				}}
			>
				{projectName || "Mastra Code"}
			</button>

			{/* Tab strip */}
			<SidebarTabs activeTab={activeTab} onTabChange={onTabChange} />

			{/* Mode switcher + model selector (always visible) */}
			<div
				style={{
					display: "flex",
					gap: 4,
					padding: "8px 12px 4px",
				}}
			>
				{modes.map((mode) => (
					<button
						key={mode.id}
						onClick={() => onSwitchMode(mode.id)}
						style={{
							flex: 1,
							padding: "5px 0",
							borderRadius: 4,
							fontSize: 11,
							fontWeight: 500,
							background:
								modeId === mode.id ? mode.color + "22" : "transparent",
							color: modeId === mode.id ? mode.color : "var(--muted)",
							border:
								modeId === mode.id
									? `1px solid ${mode.color}44`
									: "1px solid transparent",
							cursor: "pointer",
							transition: "all 0.15s",
						}}
					>
						{mode.name}
					</button>
				))}
			</div>

			<div style={{ padding: "4px 12px 8px" }}>
				<button
					onClick={onOpenModelSelector}
					className="titlebar-no-drag"
					style={{
						width: "100%",
						padding: "6px 10px",
						background: "var(--bg-elevated)",
						borderRadius: 4,
						fontSize: 11,
						color: "var(--muted)",
						textAlign: "left",
						cursor: "pointer",
						border: "1px solid var(--border-muted)",
					}}
				>
					Models...
				</button>
			</div>

			<div
				style={{
					height: 1,
					background: "var(--border-muted)",
					margin: "0 12px",
				}}
			/>

			{/* Tab content */}
			{activeTab === "threads" && (
				<>
					{/* New thread button */}
					<div style={{ padding: "8px 12px" }}>
						<button
							onClick={onNewThread}
							style={{
								width: "100%",
								padding: "8px 12px",
								background: "var(--accent)",
								color: "#fff",
								borderRadius: 6,
								fontSize: 12,
								fontWeight: 500,
								cursor: "pointer",
							}}
						>
							+ New Thread
						</button>
					</div>

					{/* Provider login status */}
					<div
						style={{
							padding: "0 12px 8px",
							display: "flex",
							flexDirection: "column",
							gap: 4,
						}}
					>
						{providers.map((p) => {
							const isLoggedIn = loggedInProviders.has(p.id)
							return (
								<button
									key={p.id}
									onClick={() => {
										if (!isLoggedIn) onLogin(p.id)
									}}
									style={{
										display: "flex",
										alignItems: "center",
										gap: 6,
										padding: "5px 8px",
										background: "transparent",
										borderRadius: 4,
										fontSize: 11,
										color: isLoggedIn
											? "var(--success)"
											: "var(--muted)",
										cursor: isLoggedIn ? "default" : "pointer",
										border: "none",
										textAlign: "left",
										width: "100%",
									}}
								>
									<span
										style={{
											width: 6,
											height: 6,
											borderRadius: "50%",
											background: isLoggedIn
												? "var(--success)"
												: "var(--dim)",
											flexShrink: 0,
										}}
									/>
									{p.label}
									<span
										style={{
											marginLeft: "auto",
											fontSize: 10,
											color: isLoggedIn
												? "var(--success)"
												: "var(--dim)",
										}}
									>
										{isLoggedIn ? "Connected" : "Sign in"}
									</span>
								</button>
							)
						})}
					</div>

					<div
						style={{
							height: 1,
							background: "var(--border-muted)",
							margin: "0 12px",
						}}
					/>

					{/* Thread list */}
					<div
						style={{
							flex: 1,
							overflowY: "auto",
							padding: "8px 0",
						}}
					>
						{threads.length === 0 && (
							<div
								style={{
									padding: "20px 16px",
									color: "var(--dim)",
									fontSize: 12,
									textAlign: "center",
								}}
							>
								No threads yet
							</div>
						)}
						{threads.map((thread) => (
							<button
								key={thread.id}
								onClick={() => onSwitchThread(thread.id)}
								style={{
									display: "block",
									width: "100%",
									padding: "8px 16px",
									background:
										thread.id === currentThreadId
											? "var(--selected-bg)"
											: "transparent",
									textAlign: "left",
									cursor: "pointer",
									borderRadius: 0,
									borderLeft:
										thread.id === currentThreadId
											? "2px solid var(--accent)"
											: "2px solid transparent",
								}}
							>
								<div
									style={{
										fontSize: 12,
										color:
											thread.id === currentThreadId
												? "var(--text)"
												: "var(--muted)",
										whiteSpace: "nowrap",
										overflow: "hidden",
										textOverflow: "ellipsis",
									}}
								>
									{thread.title || thread.id.slice(0, 8)}
								</div>
								<div
									style={{
										fontSize: 10,
										color: "var(--dim)",
										marginTop: 2,
									}}
								>
									{new Date(thread.updatedAt).toLocaleDateString()}
								</div>
							</button>
						))}
					</div>
				</>
			)}

			{activeTab === "files" && (
				<FileTree projectName={projectName} />
			)}

			{activeTab === "git" && <GitPanel />}
		</div>
	)
}
