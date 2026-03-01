import type { SettingsState, NotificationMode, PermissionData } from "../../types/settings"
import { SettingRow, Toggle, Select, SectionHeader } from "./shared"
import { notificationOptions, policyOptions } from "./constants"

interface GeneralSectionProps {
	state: SettingsState
	permissions: PermissionData | null
	update: (key: keyof SettingsState, value: unknown) => void
	updatePermissionPolicy: (category: string, policy: string) => void
	resetSessionGrants: () => void
}

export function GeneralSection({
	state,
	permissions,
	update,
	updatePermissionPolicy,
	resetSessionGrants,
}: GeneralSectionProps) {
	return (
		<>
			<SectionHeader title="Notifications" />
			<SettingRow
				label="Notification mode"
				description="How to notify you when the agent finishes or needs attention"
			>
				<Select
					value={state.notifications}
					options={notificationOptions}
					onChange={(v) =>
						update(
							"notifications",
							v as NotificationMode,
						)
					}
				/>
			</SettingRow>

			<SectionHeader title="Permissions" />
			<SettingRow
				label="Auto-approve all tools"
				description="Skip confirmation dialogs for all tool execution (YOLO mode)"
			>
				<Toggle
					checked={state.yolo}
					onChange={(v) => update("yolo", v)}
				/>
			</SettingRow>

			{!state.yolo && permissions && (
				<div style={{ paddingBottom: 8 }}>
					<div
						style={{
							fontSize: 11,
							color: "var(--muted)",
							padding: "4px 0 8px",
							lineHeight: 1.4,
						}}
					>
						Fine-tune approval per tool category:
					</div>
					{Object.entries(permissions.categories).map(
						([catId, cat]) => (
							<SettingRow
								key={catId}
								label={cat.label}
								description={cat.description}
							>
								<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
									<Select
										value={permissions.rules.categories[catId] ?? "ask"}
										options={policyOptions}
										onChange={(v) => updatePermissionPolicy(catId, v)}
									/>
									{permissions.sessionGrants.includes(catId) && (
										<span
											style={{
												fontSize: 9,
												color: "#059669",
												background: "#05966922",
												padding: "1px 5px",
												borderRadius: 3,
												border: "1px solid #05966944",
												whiteSpace: "nowrap",
											}}
										>
											Session grant
										</span>
									)}
								</div>
							</SettingRow>
						),
					)}
					{permissions.sessionGrants.length > 0 && (
						<div style={{ paddingTop: 8 }}>
							<button
								onClick={resetSessionGrants}
								style={{
									padding: "5px 10px",
									background: "var(--bg-surface)",
									color: "var(--muted)",
									borderRadius: 6,
									border: "1px solid var(--border)",
									cursor: "pointer",
									fontSize: 11,
								}}
							>
								Reset session grants
							</button>
						</div>
					)}
				</div>
			)}
			<SectionHeader title="Workspaces" />
			<SettingRow
				label="Default clone location"
				description="Where repositories are cloned to by default"
			>
				<div style={{ display: "flex", gap: 6, alignItems: "center" }}>
					<input
						type="text"
						value={state.defaultClonePath}
						onChange={(e) => update("defaultClonePath", e.target.value)}
						style={{
							width: 220,
							padding: "6px 10px",
							background: "var(--bg-elevated)",
							border: "1px solid var(--border)",
							borderRadius: 6,
							color: "var(--text)",
							fontSize: 12,
							fontFamily: "inherit",
							outline: "none",
						}}
					/>
					<button
						onClick={async () => {
							try {
								const result = (await window.api.invoke({
									type: "browseFolder",
									title: "Choose default clone location",
									defaultPath: state.defaultClonePath || undefined,
								})) as { path?: string; cancelled?: boolean }
								if (result?.path) update("defaultClonePath", result.path)
							} catch {
								// cancelled
							}
						}}
						style={{
							padding: "6px 12px",
							background: "var(--bg-elevated)",
							color: "var(--text)",
							border: "1px solid var(--border)",
							borderRadius: 6,
							cursor: "pointer",
							fontSize: 12,
							whiteSpace: "nowrap",
						}}
					>
						Browse...
					</button>
				</div>
			</SettingRow>
		</>
	)
}
