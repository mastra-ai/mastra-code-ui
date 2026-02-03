import chalk from "chalk"

const GRADIENT_WIDTH = 30 // Width of the bright spot as percentage of total text
const BASE_COLOR = [124, 58, 237] // #7c3aed purple accent
const MIN_BRIGHTNESS = 0.45 // Dimmest characters (0-1)

/**
 * Applies a sweeping gradient animation to a plain text string.
 * A bright purple spot moves left-to-right across the text.
 *
 * @param text - Plain text to colorize (no ANSI codes)
 * @param offset - Current animation offset (0-1, wraps around)
 * @returns Chalk-colored string
 */
export function applyGradientSweep(text: string, offset: number): string {
    const chars = [...text]
    const totalChars = chars.length
    if (totalChars === 0) return text

    const gradientCenter = (offset % 1) * 100

    return chars
        .map((char, i) => {
            if (char === " ") return " "

            const charPosition = (i / totalChars) * 100
            let distance = Math.abs(charPosition - gradientCenter)

            // Wrap-around for smooth cycling
            if (distance > 50) {
                distance = 100 - distance
            }

            const normalizedDistance = Math.min(
                distance / (GRADIENT_WIDTH / 2),
                1,
            )
            const brightness =
                MIN_BRIGHTNESS + (1 - MIN_BRIGHTNESS) * (1 - normalizedDistance)

            const r = Math.floor(BASE_COLOR[0]! * brightness)
            const g = Math.floor(BASE_COLOR[1]! * brightness)
            const b = Math.floor(BASE_COLOR[2]! * brightness)

            return chalk.rgb(r, g, b)(char)
        })
        .join("")
}

/**
 * Manages the gradient sweep animation state.
 * Call `start()` when agent begins working, `stop()` when idle.
 * On each tick, call `getOffset()` to get the current sweep position.
 */
export class GradientAnimator {
    private offset = 0
    private intervalId: ReturnType<typeof setInterval> | null = null
    private onTick: () => void

    constructor(onTick: () => void) {
        this.onTick = onTick
    }

    start(): void {
        if (this.intervalId) return
        this.offset = 0
        this.intervalId = setInterval(() => {
            this.offset += 0.02 // Speed: full sweep in ~83 ticks
            this.onTick()
        }, 80)
    }

    stop(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId)
            this.intervalId = null
        }
        this.offset = 0
    }

    getOffset(): number {
        return this.offset
    }

    isRunning(): boolean {
        return this.intervalId !== null
    }
}
