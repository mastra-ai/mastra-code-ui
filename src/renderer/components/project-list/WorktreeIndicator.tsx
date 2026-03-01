export function WorktreeIndicator({ color, isSpinning, isGlowing }: { color: string; isSpinning: boolean; isGlowing: boolean }) {
	if (isSpinning) {
		return (
			<span
				style={{
					width: 10,
					height: 10,
					flexShrink: 0,
					display: "inline-block",
					borderRadius: "50%",
					border: `2px solid transparent`,
					borderTopColor: color,
					borderRightColor: color,
					animation: "wt-spin 0.8s linear infinite",
				}}
			/>
		)
	}

	return (
		<span
			style={{
				width: 10,
				height: 10,
				borderRadius: "50%",
				background: color,
				flexShrink: 0,
				boxShadow: isGlowing ? `0 0 6px 2px ${color}, 0 0 12px 4px ${color}60` : "none",
			}}
		/>
	)
}
