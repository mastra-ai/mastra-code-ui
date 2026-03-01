import type { SettingsState } from "../../types/settings"
import { SettingRow, Toggle, SectionHeader } from "./shared"

interface AgentSectionProps {
	state: SettingsState
	update: (key: keyof SettingsState, value: unknown) => void
}

export function AgentSection({
	state,
	update,
}: AgentSectionProps) {
	return (
		<>
			<SectionHeader title="Editing" />
			<SettingRow
				label="Smart editing"
				description="Use LSP-based intelligent edits when available"
			>
				<Toggle
					checked={state.smartEditing}
					onChange={(v) =>
						update("smartEditing", v)
					}
				/>
			</SettingRow>
		</>
	)
}
