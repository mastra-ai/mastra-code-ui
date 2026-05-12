import type { CSSProperties, HTMLAttributes } from "react"

type ShimmerStyle = CSSProperties & {
	"--shimmer-speed"?: string | number
	"--shimmer-duration"?: string | number
	"--shimmer-repeat-delay"?: string | number
	"--shimmer-spread"?: string
	"--shimmer-angle"?: string
	"--shimmer-color"?: string
	"--shimmer-track-width"?: string
	"--shimmer-track-height"?: string
	"--shimmer-x"?: string | number
	"--shimmer-y"?: string | number
}

export interface ShimmerOptions {
	speed?: number
	duration?: number
	repeatDelay?: number
	spread?: number | string
	angle?: number | string
	shimmerColor?: string
	trackWidth?: number | string
	trackHeight?: number | string
	x?: number
	y?: number
}

export interface ShimmerTextProps
	extends HTMLAttributes<HTMLSpanElement>, ShimmerOptions {
	invert?: boolean
}

export interface ShimmerBlockProps
	extends HTMLAttributes<HTMLDivElement>, ShimmerOptions {
	width?: CSSProperties["width"]
	height?: CSSProperties["height"]
	radius?: CSSProperties["borderRadius"]
}

export interface ShimmerLinesProps
	extends Omit<HTMLAttributes<HTMLDivElement>, "children">, ShimmerOptions {
	count?: number
	widths?: Array<CSSProperties["width"]>
	lineHeight?: CSSProperties["height"]
	gap?: CSSProperties["gap"]
	radius?: CSSProperties["borderRadius"]
}

function cx(...classes: Array<string | false | null | undefined>) {
	return classes.filter(Boolean).join(" ")
}

function lengthValue(value: number | string | undefined) {
	if (value === undefined) return undefined
	return typeof value === "number" ? `${value}px` : value
}

function angleValue(value: number | string | undefined) {
	if (value === undefined) return undefined
	return typeof value === "number" ? `${value}deg` : value
}

function shimmerStyle(
	options: ShimmerOptions,
	style: CSSProperties | undefined,
): ShimmerStyle {
	const nextStyle: ShimmerStyle = { ...style }

	if (options.speed !== undefined) nextStyle["--shimmer-speed"] = options.speed
	if (options.duration !== undefined) {
		nextStyle["--shimmer-duration"] = options.duration
	}
	if (options.repeatDelay !== undefined) {
		nextStyle["--shimmer-repeat-delay"] = options.repeatDelay
	}
	if (options.spread !== undefined) {
		nextStyle["--shimmer-spread"] = lengthValue(options.spread)
	}
	if (options.angle !== undefined) {
		nextStyle["--shimmer-angle"] = angleValue(options.angle)
	}
	if (options.shimmerColor !== undefined) {
		nextStyle["--shimmer-color"] = options.shimmerColor
	}
	if (options.trackWidth !== undefined) {
		nextStyle["--shimmer-track-width"] = lengthValue(options.trackWidth)
	}
	if (options.trackHeight !== undefined) {
		nextStyle["--shimmer-track-height"] = lengthValue(options.trackHeight)
	}
	if (options.x !== undefined) nextStyle["--shimmer-x"] = options.x
	if (options.y !== undefined) nextStyle["--shimmer-y"] = options.y

	return nextStyle
}

export function ShimmerContainer({
	className,
	...props
}: HTMLAttributes<HTMLDivElement>) {
	return <div className={cx("shimmer-container", className)} {...props} />
}

export function ShimmerText({
	className,
	invert,
	speed,
	duration,
	repeatDelay,
	spread,
	angle,
	shimmerColor,
	trackWidth,
	trackHeight,
	x,
	y,
	style,
	...props
}: ShimmerTextProps) {
	return (
		<span
			className={cx(
				"shimmer app-shimmer-text",
				invert && "shimmer-invert",
				className,
			)}
			style={shimmerStyle(
				{
					speed,
					duration,
					repeatDelay,
					spread,
					angle,
					shimmerColor,
					trackWidth,
					trackHeight,
					x,
					y,
				},
				style,
			)}
			{...props}
		/>
	)
}

export function ShimmerBlock({
	className,
	speed,
	duration,
	repeatDelay,
	spread,
	angle,
	shimmerColor,
	trackWidth,
	trackHeight,
	x,
	y,
	style,
	width,
	height,
	radius,
	...props
}: ShimmerBlockProps) {
	const blockStyle: CSSProperties = {
		width,
		height,
		borderRadius: radius,
		...style,
	}

	return (
		<div
			className={cx("shimmer shimmer-bg app-shimmer-block", className)}
			style={shimmerStyle(
				{
					speed,
					duration,
					repeatDelay,
					spread,
					angle,
					shimmerColor,
					trackWidth,
					trackHeight,
					x,
					y,
				},
				blockStyle,
			)}
			{...props}
		/>
	)
}

export function ShimmerLines({
	className,
	count = 3,
	widths = ["100%", "92%", "74%"],
	lineHeight = 10,
	gap = 8,
	radius,
	speed,
	duration,
	repeatDelay,
	spread,
	angle,
	shimmerColor,
	trackWidth,
	trackHeight,
	x,
	y,
	style,
	...props
}: ShimmerLinesProps) {
	const shimmerOptions = {
		speed,
		duration,
		repeatDelay,
		spread,
		angle,
		shimmerColor,
		trackWidth,
		trackHeight,
		x,
		y,
	}

	return (
		<ShimmerContainer
			className={cx("app-shimmer-lines", className)}
			style={{ gap, ...style }}
			{...props}
		>
			{Array.from({ length: count }, (_, index) => (
				<ShimmerBlock
					key={index}
					{...shimmerOptions}
					height={lineHeight}
					radius={radius}
					width={widths[index % widths.length]}
				/>
			))}
		</ShimmerContainer>
	)
}
