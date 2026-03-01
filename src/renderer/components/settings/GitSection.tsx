import type { Dispatch, SetStateAction } from "react"
import type { SettingsState } from "../../types/settings"
import { SectionHeader } from "./shared"

interface GitSectionProps {
	state: SettingsState
	setState: Dispatch<SetStateAction<SettingsState | null>>
	update: (key: keyof SettingsState, value: unknown) => void
}

export function GitSection({
	state,
	setState,
	update,
}: GitSectionProps) {
	return (
		<>
			<SectionHeader title="Pull Requests" />
			<div style={{ padding: "12px 0" }}>
				<div
					style={{
						fontSize: 13,
						fontWeight: 500,
						color: "var(--text)",
						marginBottom: 4,
					}}
				>
					PR instructions
				</div>
				<div
					style={{
						fontSize: 11,
						color: "var(--muted)",
						marginBottom: 8,
						lineHeight: 1.4,
					}}
				>
					Custom instructions the agent follows
					when creating pull requests (e.g.
					format, reviewers, labels, conventions)
				</div>
				<textarea
					value={state.prInstructions}
					onChange={(e) => {
						const v = e.target.value
						setState((prev) =>
							prev
								? {
										...prev,
										prInstructions: v,
									}
								: prev,
						)
					}}
					onBlur={() =>
						update(
							"prInstructions",
							state.prInstructions,
						)
					}
					placeholder={`Example:\n- Always include a "Test plan" section\n- Add the "team/frontend" label\n- Tag @grayson for review`}
					rows={6}
					style={{
						width: "100%",
						background:
							"var(--bg-elevated)",
						color: "var(--text)",
						border: "1px solid var(--border)",
						borderRadius: 6,
						padding: "8px 10px",
						fontSize: 12,
						fontFamily: "inherit",
						lineHeight: 1.5,
						resize: "vertical",
						minHeight: 80,
					}}
				/>
			</div>
		</>
	)
}
