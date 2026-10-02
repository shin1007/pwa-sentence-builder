/**
 * All sound effects are synthesized in real time with the Web Audio API —
 * no audio files are shipped, so the game stays tiny and fully playable
 * offline as an installed PWA.
 */

type OscType = OscillatorType

class SoundEngine {
  private ctx: AudioContext | null = null
  private sfxGain: GainNode | null = null
  private noiseBuffer: AudioBuffer | null = null

  sfxEnabled = true

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.ctx = new Ctor()
      this.sfxGain = this.ctx.createGain()
      this.sfxGain.gain.value = this.sfxEnabled ? 0.8 : 0
      this.sfxGain.connect(this.ctx.destination)
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume()
    }
    return this.ctx
  }

  /** Call from a user gesture (tap) so mobile browsers allow audio to start. */
  unlock() {
    this.ensureContext()
  }

  setSfxEnabled(on: boolean) {
    this.sfxEnabled = on
    if (this.sfxGain) this.sfxGain.gain.value = on ? 0.8 : 0
  }

  private getNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (!this.noiseBuffer) {
      const len = ctx.sampleRate * 0.5
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
      this.noiseBuffer = buffer
    }
    return this.noiseBuffer
  }

  private tone(opts: {
    freq: number
    start?: number
    duration?: number
    type?: OscType
    peak?: number
    attack?: number
    release?: number
    glideTo?: number
    detune?: number
  }) {
    const ctx = this.ensureContext()
    const {
      freq,
      start = 0,
      duration = 0.18,
      type = 'sine',
      peak = 0.5,
      attack = 0.008,
      release = duration * 0.7,
      glideTo,
      detune = 0,
    } = opts

    const t0 = ctx.currentTime + start
    const osc = ctx.createOscillator()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t0)
    osc.detune.value = detune
    if (glideTo) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, glideTo), t0 + duration)
    }

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, t0)
    gain.gain.exponentialRampToValueAtTime(peak, t0 + attack)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + release)

    osc.connect(gain)
    gain.connect(this.sfxGain!)
    osc.start(t0)
    osc.stop(t0 + attack + release + 0.05)
  }

  private noiseBurst(opts: {
    start?: number
    duration?: number
    peak?: number
    filterFreq?: number
    filterType?: BiquadFilterType
    q?: number
  }) {
    const ctx = this.ensureContext()
    const { start = 0, duration = 0.15, peak = 0.35, filterFreq = 900, filterType = 'bandpass', q = 1 } = opts
    const t0 = ctx.currentTime + start

    const src = ctx.createBufferSource()
    src.buffer = this.getNoiseBuffer(ctx)

    const filter = ctx.createBiquadFilter()
    filter.type = filterType
    filter.frequency.value = filterFreq
    filter.Q.value = q

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, t0)
    gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)

    src.connect(filter)
    filter.connect(gain)
    gain.connect(this.sfxGain!)
    src.start(t0)
    src.stop(t0 + duration + 0.05)
  }

  tap() {
    this.tone({ freq: 720, type: 'sine', duration: 0.07, peak: 0.25, release: 0.05 })
  }

  /**
   * Placing a word climbs a pentatonic scale, one step per word already on
   * the board, so building a sentence sounds like playing a little run up a
   * keyboard — and the last word of a long sentence lands on the highest note.
   */
  place(step = 0) {
    const scale = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760, 2093, 2349.32]
    const freq = scale[Math.min(Math.max(step, 0), scale.length - 1)]
    this.tone({ freq: freq * 0.92, glideTo: freq, type: 'triangle', duration: 0.1, peak: 0.32 })
    this.tone({ freq: freq * 2, type: 'sine', duration: 0.05, peak: 0.06, release: 0.04 })
  }

  /** A word being picked up to drag. */
  pickup() {
    this.tone({ freq: 880, glideTo: 990, type: 'sine', duration: 0.05, peak: 0.16, release: 0.04 })
  }

  /** Two placed words trading places. */
  swap() {
    this.tone({ freq: 620, glideTo: 820, type: 'triangle', duration: 0.07, peak: 0.24 })
    this.tone({ freq: 820, glideTo: 620, start: 0.06, type: 'triangle', duration: 0.07, peak: 0.2 })
  }

  remove() {
    this.tone({ freq: 420, glideTo: 260, type: 'triangle', duration: 0.09, peak: 0.25 })
  }

  click() {
    this.tone({ freq: 300, type: 'square', duration: 0.05, peak: 0.18, release: 0.04 })
  }

  /**
   * The fanfare rises a semitone per combo step (capped at a fifth, before it
   * gets shrill), so a streak is something you can hear building. A fast
   * answer adds a sparkle on top.
   */
  correct(combo = 0, sparkle = false) {
    const shift = Math.pow(2, Math.min(Math.max(combo, 0), 7) / 12)
    const notes = [523.25, 659.25, 783.99, 1046.5] // C5 E5 G5 C6
    notes.forEach((f, i) => {
      this.tone({ freq: f * shift, start: i * 0.07, duration: 0.22, type: 'triangle', peak: 0.32 })
    })
    if (sparkle) {
      ;[2093, 2637.02, 3135.96].forEach((f, i) => {
        this.tone({ freq: f * shift, start: 0.3 + i * 0.045, duration: 0.12, type: 'sine', peak: 0.1 })
      })
    }
  }

  wrong() {
    this.tone({ freq: 220, glideTo: 130, type: 'sawtooth', duration: 0.28, peak: 0.28, release: 0.24 })
    this.noiseBurst({ start: 0, duration: 0.12, peak: 0.15, filterFreq: 300, q: 0.7 })
  }

  combo(tier: number) {
    const base = 660 + tier * 60
    const notes = [base, base * 1.26, base * 1.5]
    notes.forEach((f, i) => {
      this.tone({ freq: f, start: i * 0.055, duration: 0.16, type: 'square', peak: 0.22 })
    })
  }

  tick(urgent: boolean) {
    this.tone({
      freq: urgent ? 1200 : 880,
      type: 'square',
      duration: 0.06,
      peak: urgent ? 0.3 : 0.18,
      release: 0.04,
    })
  }

  countIn() {
    this.tone({ freq: 523.25, duration: 0.12, type: 'sine', peak: 0.3 })
  }

  win() {
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5]
    notes.forEach((f, i) => {
      this.tone({ freq: f, start: i * 0.1, duration: 0.35, type: 'triangle', peak: 0.3 })
    })
  }

  lose() {
    const notes = [392, 349.23, 293.66, 246.94]
    notes.forEach((f, i) => {
      this.tone({ freq: f, start: i * 0.14, duration: 0.4, type: 'sawtooth', peak: 0.22 })
    })
  }

  starPop(delaySec: number) {
    this.tone({ freq: 1046.5, start: delaySec, duration: 0.18, type: 'triangle', peak: 0.3 })
  }
}

export const soundEngine = new SoundEngine()
