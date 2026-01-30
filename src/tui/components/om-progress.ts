/**
 * Observational Memory progress indicator component.
 * Shows when OM is observing or reflecting on conversation history.
 */
import { Container, Text } from "@mariozechner/pi-tui"
import chalk from "chalk"
import { fg } from "../theme.js"

export type OMStatus = "idle" | "observing" | "reflecting"

export interface OMProgressState {
    status: OMStatus
    pendingTokens: number
    threshold: number
    thresholdPercent: number
    observationTokens: number
    reflectionThreshold: number
    reflectionThresholdPercent: number
    cycleId?: string
    startTime?: number
}

/**
 * Component that displays OM progress in the status line area.
 * Shows a compact indicator when observation/reflection is happening.
 */
export class OMProgressComponent extends Container {
    private state: OMProgressState = {
        status: "idle",
        pendingTokens: 0,
        threshold: 30000,
        thresholdPercent: 0,
        observationTokens: 0,
        reflectionThreshold: 40000,
        reflectionThresholdPercent: 0,
    }
    private statusText: Text

    constructor() {
        super()
        this.statusText = new Text("")
        this.children.push(this.statusText)
    }

    updateProgress(progress: {
        pendingTokens: number
        threshold: number
        thresholdPercent: number
        observationTokens: number
        reflectionThreshold: number
        reflectionThresholdPercent: number
    }): void {
        this.state.pendingTokens = progress.pendingTokens
        this.state.threshold = progress.threshold
        this.state.thresholdPercent = progress.thresholdPercent
        this.state.observationTokens = progress.observationTokens
        this.state.reflectionThreshold = progress.reflectionThreshold
        this.state.reflectionThresholdPercent = progress.reflectionThresholdPercent
        this.updateDisplay()
    }

    startObservation(cycleId: string, _tokensToObserve: number): void {
        this.state.status = "observing"
        this.state.cycleId = cycleId
        this.state.startTime = Date.now()
        this.updateDisplay()
    }

    endObservation(): void {
        this.state.status = "idle"
        this.state.cycleId = undefined
        this.state.startTime = undefined
        this.updateDisplay()
    }

    startReflection(cycleId: string): void {
        this.state.status = "reflecting"
        this.state.cycleId = cycleId
        this.state.startTime = Date.now()
        this.updateDisplay()
    }

    endReflection(): void {
        this.state.status = "idle"
        this.state.cycleId = undefined
        this.state.startTime = undefined
        this.updateDisplay()
    }

    failOperation(): void {
        this.state.status = "idle"
        this.state.cycleId = undefined
        this.state.startTime = undefined
        this.updateDisplay()
    }

    getStatus(): OMStatus {
        return this.state.status
    }

    private updateDisplay(): void {
        if (this.state.status === "idle") {
            // Show threshold progress when idle (if any pending tokens)
            if (this.state.thresholdPercent > 0) {
                const percent = Math.round(this.state.thresholdPercent)
                const bar = this.renderProgressBar(percent, 10)
                this.statusText.setText(fg("muted", `OM ${bar} ${percent}%`))
            } else {
                this.statusText.setText("")
            }
        } else if (this.state.status === "observing") {
            const elapsed = this.state.startTime ? Math.round((Date.now() - this.state.startTime) / 1000) : 0
            const spinner = this.getSpinner()
            this.statusText.setText(chalk.yellow(`${spinner} Observing... ${elapsed}s`))
        } else if (this.state.status === "reflecting") {
            const elapsed = this.state.startTime ? Math.round((Date.now() - this.state.startTime) / 1000) : 0
            const spinner = this.getSpinner()
            this.statusText.setText(chalk.magenta(`${spinner} Reflecting... ${elapsed}s`))
        }
    }

    private renderProgressBar(percent: number, width: number): string {
        const filled = Math.round((percent / 100) * width)
        const empty = width - filled
        const bar = "█".repeat(filled) + "░".repeat(empty)
        
        // Color based on threshold proximity
        if (percent >= 90) {
            return chalk.red(bar)
        } else if (percent >= 70) {
            return chalk.yellow(bar)
        } else {
            return chalk.dim(bar)
        }
    }

    private spinnerFrame = 0
    private getSpinner(): string {
        const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
        this.spinnerFrame = (this.spinnerFrame + 1) % frames.length
        return frames[this.spinnerFrame]
    }

    render(maxWidth: number): string[] {
        this.updateDisplay()
        return this.statusText.render(maxWidth)
    }
}

function formatTokens(n: number): string {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
    return String(n)
}

function colorByPercent(text: string, percent: number): string {
    if (percent >= 90) return chalk.red(text)
    if (percent >= 70) return chalk.yellow(text)
    return chalk.dim(text)
}

/**
 * Format OM observation threshold for status bar.
 * Shows: msg 12.5k/30.0k (42%)
 */
export function formatObservationStatus(state: OMProgressState): string {
    if (state.status === "observing") {
        return chalk.yellow("⚡ observing")
    }
    const percent = Math.min(100, Math.round(state.thresholdPercent))
    const text = `msg ${formatTokens(state.pendingTokens)}/${formatTokens(state.threshold)} (${percent}%)`
    return colorByPercent(text, percent)
}

/**
 * Format OM reflection threshold for status bar.
 * Shows: obs 8.2k/40.0k (21%)
 */
export function formatReflectionStatus(state: OMProgressState): string {
    if (state.status === "reflecting") {
        return chalk.magenta("🔮 reflecting")
    }
    const percent = Math.min(100, Math.round(state.reflectionThresholdPercent))
    const text = `obs ${formatTokens(state.observationTokens)}/${formatTokens(state.reflectionThreshold)} (${percent}%)`
    return colorByPercent(text, percent)
}

/**
 * @deprecated Use formatObservationStatus and formatReflectionStatus instead
 */
export function formatOMStatus(state: OMProgressState): string {
    return formatObservationStatus(state)
}
