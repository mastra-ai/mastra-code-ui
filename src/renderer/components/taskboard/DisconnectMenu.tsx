import { useState } from "react"
import { LinearIcon, GitHubIcon } from "./icons"

export function DisconnectMenu({
	linearConnected,
	githubConnected,
	onDisconnectLinear,
	onDisconnectGithub,
}: {
	linearConnected: boolean
	githubConnected: boolean
	onDisconnectLinear: () => void
	onDisconnectGithub: () => void
}) {
	const [open, setOpen] = useState(false)
	if (!linearConnected && !githubConnected) return null

	return (
		<div style={{ position: "relative" }}>
			<button
				onClick={() => setOpen(!open)}
				style={{
					padding: "4px 10px",
					fontSize: 11,
					background: "transparent",
					color: "var(--dim)",
					borderRadius: 4,
					border: "1px solid var(--border-muted)",
					cursor: "pointer",
				}}
			>
				Disconnect
			</button>
			{open && (
				<div
					style={{
						position: "absolute",
						top: "100%",
						right: 0,
						zIndex: 10,
						background: "var(--bg-elevated)",
						border: "1px solid var(--border)",
						borderRadius: 6,
						padding: 4,
						marginTop: 2,
						minWidth: 160,
						boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
					}}
				>
					{linearConnected && (
						<button
							onClick={() => { onDisconnectLinear(); setOpen(false) }}
							style={{
								display: "flex",
								alignItems: "center",
								gap: 6,
								padding: "5px 8px",
								fontSize: 11,
								color: "var(--muted)",
								background: "transparent",
								cursor: "pointer",
								width: "100%",
								textAlign: "left",
								borderRadius: 3,
								border: "none",
							}}
						>
							<LinearIcon size={10} /> Disconnect Linear
						</button>
					)}
					{githubConnected && (
						<button
							onClick={() => { onDisconnectGithub(); setOpen(false) }}
							style={{
								display: "flex",
								alignItems: "center",
								gap: 6,
								padding: "5px 8px",
								fontSize: 11,
								color: "var(--muted)",
								background: "transparent",
								cursor: "pointer",
								width: "100%",
								textAlign: "left",
								borderRadius: 3,
								border: "none",
							}}
						>
							<GitHubIcon size={10} /> Disconnect GitHub
						</button>
					)}
				</div>
			)}
		</div>
	)
}
