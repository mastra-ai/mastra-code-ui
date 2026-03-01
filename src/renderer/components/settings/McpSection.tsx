import { useState } from "react"
import type { McpServerStatus } from "../../types/settings"
import { SectionHeader, Select } from "./shared"

interface McpSectionProps {
	mcpStatuses: McpServerStatus[]
	mcpLoading: boolean
	onReload: () => void
	onAddServer: (server: { name: string; command: string; args: string; scope: string }) => void
	onRemoveServer: (serverName: string) => void
}

export function McpSection({
	mcpStatuses,
	mcpLoading,
	onReload,
	onAddServer,
	onRemoveServer,
}: McpSectionProps) {
	const [addingServer, setAddingServer] = useState(false)
	const [newServer, setNewServer] = useState({ name: "", command: "", args: "", scope: "project" })

	const handleAdd = () => {
		if (!newServer.name || !newServer.command) return
		onAddServer(newServer)
		setNewServer({ name: "", command: "", args: "", scope: "project" })
		setAddingServer(false)
	}

	return (
		<>
			<SectionHeader title="MCP Servers" />
			<div
				style={{
					fontSize: 11,
					color: "var(--muted)",
					padding: "4px 0 8px",
					lineHeight: 1.4,
				}}
			>
				External tool servers connected via Model
				Context Protocol.
			</div>

			{mcpLoading && (
				<div
					style={{
						padding: 16,
						textAlign: "center",
						color: "var(--muted)",
						fontSize: 12,
					}}
				>
					Loading...
				</div>
			)}

			{!mcpLoading &&
				mcpStatuses.length === 0 && (
					<div
						style={{
							padding: "16px 0",
							color: "var(--muted)",
							fontSize: 12,
						}}
					>
						No MCP servers configured.
					</div>
				)}

			{!mcpLoading &&
				mcpStatuses.map((server) => (
					<div
						key={server.name}
						style={{
							padding: "10px 0",
							borderBottom:
								"1px solid var(--border-muted)",
						}}
					>
						<div
							style={{
								display: "flex",
								alignItems: "center",
								justifyContent:
									"space-between",
							}}
						>
							<div
								style={{
									display: "flex",
									alignItems:
										"center",
									gap: 8,
								}}
							>
								<span
									style={{
										width: 6,
										height: 6,
										borderRadius:
											"50%",
										background:
											server.connected
												? "#059669"
												: "#ef4444",
										flexShrink: 0,
									}}
								/>
								<span
									style={{
										fontSize: 13,
										fontWeight: 500,
										color: "var(--text)",
									}}
								>
									{server.name}
								</span>
								<span
									style={{
										fontSize: 10,
										color: "var(--muted)",
									}}
								>
									{server.connected
										? `${server.toolCount} tools`
										: "disconnected"}
								</span>
							</div>
							<button
								onClick={() =>
									onRemoveServer(
										server.name,
									)
								}
								style={{
									padding: "2px 8px",
									background:
										"transparent",
									color: "var(--muted)",
									borderRadius: 4,
									border: "1px solid var(--border-muted)",
									cursor: "pointer",
									fontSize: 10,
								}}
							>
								Remove
							</button>
						</div>
						{server.error && (
							<div
								style={{
									fontSize: 11,
									color: "#ef4444",
									marginTop: 4,
									paddingLeft: 14,
								}}
							>
								{server.error}
							</div>
						)}
						{server.connected &&
							server.toolNames
								.length > 0 && (
								<div
									style={{
										fontSize: 10,
										color: "var(--muted)",
										marginTop: 4,
										paddingLeft: 14,
										lineHeight: 1.6,
									}}
								>
									{server.toolNames.join(
										", ",
									)}
								</div>
							)}
					</div>
				))}

			<div
				style={{
					paddingTop: 12,
					display: "flex",
					gap: 8,
				}}
			>
				<button
					onClick={() =>
						setAddingServer(!addingServer)
					}
					style={{
						padding: "6px 12px",
						background:
							"var(--bg-surface)",
						color: "var(--accent)",
						borderRadius: 6,
						border: "1px solid var(--accent)",
						cursor: "pointer",
						fontSize: 11,
					}}
				>
					{addingServer
						? "Cancel"
						: "Add server"}
				</button>
				<button
					onClick={onReload}
					style={{
						padding: "6px 12px",
						background:
							"var(--bg-surface)",
						color: "var(--muted)",
						borderRadius: 6,
						border: "1px solid var(--border)",
						cursor: "pointer",
						fontSize: 11,
					}}
				>
					Reload all
				</button>
			</div>

			{addingServer && (
				<div
					style={{
						marginTop: 12,
						padding: 12,
						background:
							"var(--bg-surface)",
						borderRadius: 8,
						border: "1px solid var(--border-muted)",
					}}
				>
					<div
						style={{
							display: "flex",
							flexDirection: "column",
							gap: 8,
						}}
					>
						<input
							value={newServer.name}
							onChange={(e) =>
								setNewServer((p) => ({
									...p,
									name: e.target
										.value,
								}))
							}
							placeholder="Server name"
							style={{
								padding: "6px 8px",
								background:
									"var(--bg-elevated)",
								color: "var(--text)",
								border: "1px solid var(--border)",
								borderRadius: 4,
								fontSize: 12,
								fontFamily: "inherit",
							}}
						/>
						<input
							value={
								newServer.command
							}
							onChange={(e) =>
								setNewServer((p) => ({
									...p,
									command:
										e.target
											.value,
								}))
							}
							placeholder="Command (e.g., npx)"
							style={{
								padding: "6px 8px",
								background:
									"var(--bg-elevated)",
								color: "var(--text)",
								border: "1px solid var(--border)",
								borderRadius: 4,
								fontSize: 12,
								fontFamily: "inherit",
							}}
						/>
						<input
							value={newServer.args}
							onChange={(e) =>
								setNewServer((p) => ({
									...p,
									args: e.target
										.value,
								}))
							}
							placeholder="Arguments (space-separated)"
							style={{
								padding: "6px 8px",
								background:
									"var(--bg-elevated)",
								color: "var(--text)",
								border: "1px solid var(--border)",
								borderRadius: 4,
								fontSize: 12,
								fontFamily: "inherit",
							}}
						/>
						<div
							style={{
								display: "flex",
								alignItems:
									"center",
								gap: 8,
							}}
						>
							<Select
								value={
									newServer.scope
								}
								options={[
									{
										value: "project",
										label: "Project",
									},
									{
										value: "global",
										label: "Global",
									},
								]}
								onChange={(v) =>
									setNewServer(
										(p) => ({
											...p,
											scope: v,
										}),
									)
								}
							/>
							<button
								onClick={handleAdd}
								disabled={
									!newServer.name ||
									!newServer.command
								}
								style={{
									padding:
										"6px 16px",
									background:
										newServer.name &&
										newServer.command
											? "var(--accent)"
											: "var(--bg-elevated)",
									color:
										newServer.name &&
										newServer.command
											? "#fff"
											: "var(--muted)",
									borderRadius: 6,
									cursor:
										newServer.name &&
										newServer.command
											? "pointer"
											: "default",
									fontSize: 12,
									fontWeight: 500,
								}}
							>
								Add
							</button>
						</div>
					</div>
				</div>
			)}
		</>
	)
}
