import type { SettingsState, ThinkingLevel } from "../../types/settings"
import { SettingRow, Select, SectionHeader } from "./shared"
import { thinkingOptions } from "./constants"

interface ModelsSectionProps {
	state: SettingsState
	update: (key: keyof SettingsState, value: unknown) => void
}

export function ModelsSection({
	state,
	update,
}: ModelsSectionProps) {
	return (
		<>
			<SectionHeader title="Thinking" />
			<SettingRow
				label="Extended thinking"
				description="Budget for chain-of-thought reasoning (Anthropic models)"
			>
				<Select
					value={state.thinkingLevel}
					options={thinkingOptions}
					onChange={(v) =>
						update(
							"thinkingLevel",
							v as ThinkingLevel,
						)
					}
				/>
			</SettingRow>

			<div
				style={{
					fontSize: 11,
					color: "var(--dim)",
					padding: "12px 0",
					lineHeight: 1.5,
				}}
			>
				Use the model selector in the status bar
				to change the active model and mode.
			</div>
		</>
	)
}
