import type { SettingsState } from "../../types/settings"
import { ModelPickerInline, type ModelInfo } from "../ModelSelector"
import { SettingRow, SectionHeader } from "./shared"

interface MemorySectionProps {
	state: SettingsState
	models: ModelInfo[]
	modelsLoaded: boolean
	update: (key: keyof SettingsState, value: unknown) => void
}

export function MemorySection({
	state,
	models,
	modelsLoaded,
	update,
}: MemorySectionProps) {
	return (
		<>
			<SectionHeader title="Observational Memory" />
			<SettingRow
				label="Observer model"
				description="Model used to analyze conversation and extract observations"
			>
				<ModelPickerInline
					currentModelId={state.observerModelId}
					models={models}
					loading={!modelsLoaded}
					onSelect={(v) =>
						update("observerModelId", v)
					}
				/>
			</SettingRow>
			<SettingRow
				label="Reflector model"
				description="Model used to synthesize observations into memory"
			>
				<ModelPickerInline
					currentModelId={state.reflectorModelId}
					models={models}
					loading={!modelsLoaded}
					onSelect={(v) =>
						update("reflectorModelId", v)
					}
				/>
			</SettingRow>

			<SectionHeader title="Thresholds" />
			<SettingRow
				label="Observation threshold"
				description="Token count that triggers observation extraction"
			>
				<input
					type="number"
					value={state.observationThreshold}
					onChange={(e) => {
						const v = parseInt(e.target.value, 10)
						if (!isNaN(v) && v > 0)
							update("observationThreshold", v)
					}}
					style={{
						width: 80,
						background: "var(--bg-elevated)",
						color: "var(--text)",
						border: "1px solid var(--border)",
						borderRadius: 4,
						padding: "4px 8px",
						fontSize: 12,
						fontFamily: "inherit",
						textAlign: "right",
					}}
				/>
			</SettingRow>
			<SettingRow
				label="Reflection threshold"
				description="Token count that triggers memory reflection"
			>
				<input
					type="number"
					value={state.reflectionThreshold}
					onChange={(e) => {
						const v = parseInt(e.target.value, 10)
						if (!isNaN(v) && v > 0)
							update("reflectionThreshold", v)
					}}
					style={{
						width: 80,
						background: "var(--bg-elevated)",
						color: "var(--text)",
						border: "1px solid var(--border)",
						borderRadius: 4,
						padding: "4px 8px",
						fontSize: 12,
						fontFamily: "inherit",
						textAlign: "right",
					}}
				/>
			</SettingRow>
		</>
	)
}
