// R2D2-style completion sound using Web Audio API
// AudioContext must be created during a user gesture (click/keypress) due to
// browser autoplay policy. We lazily create it on the first user interaction
// and reuse it for all subsequent sounds.
let sharedAudioCtx: AudioContext | null = null

export function ensureAudioContext() {
	if (!sharedAudioCtx) {
		try {
			sharedAudioCtx = new AudioContext()
		} catch {
			// Audio not available
		}
	}
	// Resume if suspended (can happen after idle)
	if (sharedAudioCtx?.state === "suspended") {
		sharedAudioCtx.resume().catch(() => {})
	}
}

export function playCompletionSound() {
	if (!sharedAudioCtx) return
	try {
		const ctx = sharedAudioCtx
		if (ctx.state === "suspended") {
			ctx.resume().catch(() => {})
		}
		const now = ctx.currentTime
		const gain = ctx.createGain()
		gain.connect(ctx.destination)
		gain.gain.setValueAtTime(0.15, now)
		gain.gain.linearRampToValueAtTime(0, now + 1.2)

		// Chirp 1: rising sweep
		const o1 = ctx.createOscillator()
		o1.type = "square"
		o1.frequency.setValueAtTime(800, now)
		o1.frequency.exponentialRampToValueAtTime(2400, now + 0.12)
		o1.frequency.exponentialRampToValueAtTime(1800, now + 0.2)
		o1.connect(gain)
		o1.start(now)
		o1.stop(now + 0.2)

		// Chirp 2: warble
		const o2 = ctx.createOscillator()
		o2.type = "sine"
		o2.frequency.setValueAtTime(1200, now + 0.25)
		o2.frequency.exponentialRampToValueAtTime(2800, now + 0.35)
		o2.frequency.exponentialRampToValueAtTime(1600, now + 0.45)
		o2.frequency.exponentialRampToValueAtTime(3200, now + 0.55)
		o2.connect(gain)
		o2.start(now + 0.25)
		o2.stop(now + 0.55)

		// Chirp 3: happy descending trill
		const o3 = ctx.createOscillator()
		o3.type = "square"
		const g3 = ctx.createGain()
		g3.gain.setValueAtTime(0.1, now + 0.6)
		g3.gain.linearRampToValueAtTime(0, now + 1.1)
		o3.connect(g3)
		g3.connect(ctx.destination)
		o3.frequency.setValueAtTime(2600, now + 0.6)
		o3.frequency.exponentialRampToValueAtTime(3400, now + 0.7)
		o3.frequency.exponentialRampToValueAtTime(2000, now + 0.85)
		o3.frequency.exponentialRampToValueAtTime(2800, now + 0.95)
		o3.frequency.exponentialRampToValueAtTime(1400, now + 1.1)
		o3.start(now + 0.6)
		o3.stop(now + 1.1)
	} catch {
		// Audio not available
	}
}
