import { Text } from "@mariozechner/pi-tui"
import type { TUI } from "@mariozechner/pi-tui"
import chalk from "chalk"

const SPIN = ["☲", "☴"]

// Gradient colors from dim to bright purple
const GRADIENT = [
    "#2d1854",
    "#3b1d70",
    "#4c2590",
    "#5e2db0",
    "#7c3aed",
    "#9b5bf5",
    "#b88dff",
    "#9b5bf5",
    "#7c3aed",
    "#5e2db0",
    "#4c2590",
    "#3b1d70",
]

const WAVE_WIDTH = GRADIENT.length

export class ObiLoader extends Text {
    private message: string
    private currentFrame = 0
    private waveOffset = 0
    private intervalId: ReturnType<typeof setInterval> | null = null
    private waveIntervalId: ReturnType<typeof setInterval> | null = null
    private ui: TUI

    constructor(ui: TUI, message = "Working...") {
        super("", 1, 0)
        this.ui = ui
        this.message = message
        this.start()
    }

    render(width: number): string[] {
        return ["", ...super.render(width)]
    }

    start(): void {
        this.currentFrame = 0
        this.waveOffset = 0
        this.updateDisplay()
        this.intervalId = setInterval(() => {
            this.currentFrame = (this.currentFrame + 1) % SPIN.length
            this.updateDisplay()
        }, 100)
        this.waveIntervalId = setInterval(() => {
            this.waveOffset++
            this.updateDisplay()
        }, 60)
    }

    stop(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId)
            this.intervalId = null
        }
        if (this.waveIntervalId) {
            clearInterval(this.waveIntervalId)
            this.waveIntervalId = null
        }
    }

    setMessage(message: string): void {
        this.message = message
        this.updateDisplay()
    }

    private colorizeChar(char: string, position: number): string {
        const gradientIndex =
            ((position + this.waveOffset) % WAVE_WIDTH + WAVE_WIDTH) % WAVE_WIDTH
        const color = GRADIENT[gradientIndex] as string
        return chalk.hex(color)(char)
    }

    private updateDisplay(): void {
        const frame = SPIN[this.currentFrame] as string
        const fullText = `${frame} ${this.message}`
        const colored = [...fullText]
            .map((char, i) => this.colorizeChar(char, i))
            .join("")
        this.setText(colored)
        this.ui.requestRender()
    }
}
