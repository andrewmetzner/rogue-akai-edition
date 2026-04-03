// Chiptune sound engine — all sounds synthesized with Web Audio API.
// No audio files. Uses oscillators, frequency sweeps, and noise buffers.

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;

  // Lazily create AudioContext (browsers require a user gesture first)
  private getCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.7;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  private get out(): GainNode {
    this.getCtx();
    return this.master!;
  }

  // ── Primitives ──────────────────────────────────────────────────────────

  /** Single oscillator tone with optional frequency sweep and scheduling. */
  private tone(
    freqStart: number,
    freqEnd: number,
    type: OscillatorType,
    duration: number,
    volume: number,
    delay = 0,
  ): void {
    const ctx = this.getCtx();
    const t = ctx.currentTime + delay;

    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(this.out);

    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, t);
    if (freqEnd !== freqStart) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), t + duration);
    }

    const attack = Math.min(0.008, duration * 0.15);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(volume, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  /** White noise burst through a biquad filter. */
  private noise(
    duration: number,
    volume: number,
    filterFreq: number,
    filterType: BiquadFilterType = 'bandpass',
    delay = 0,
  ): void {
    const ctx = this.getCtx();
    const t = ctx.currentTime + delay;
    const len = Math.ceil(ctx.sampleRate * duration);

    const buf  = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    const src    = ctx.createBufferSource();
    src.buffer   = buf;

    const filter = ctx.createBiquadFilter();
    filter.type  = filterType;
    filter.frequency.value = filterFreq;
    filter.Q.value = 1.2;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.out);

    src.start(t);
    src.stop(t + duration + 0.02);
  }

  // ── Sound effects ───────────────────────────────────────────────────────

  /** Subtle footstep tick — plays every move. */
  step(): void {
    this.tone(160, 90, 'triangle', 0.04, 0.05);
  }

  /** Player attacks a monster. */
  attack(): void {
    this.tone(280, 520, 'square',   0.07, 0.18);
    this.noise(0.05, 0.10, 900, 'bandpass');
  }

  /** Player kills a monster. */
  kill(): void {
    this.noise(0.08, 0.22, 700, 'bandpass');
    this.tone(380, 55,  'square',   0.22, 0.14);
    this.tone(500, 200, 'sawtooth', 0.12, 0.08, 0.05);
  }

  /** Monster hits the player. */
  hurt(): void {
    this.tone(320, 75,  'sawtooth', 0.14, 0.28);
    this.noise(0.08, 0.12, 500, 'lowpass');
  }

  /** Player picks up or uses an item. */
  pickup(): void {
    this.tone(660, 660, 'triangle', 0.08, 0.20);
    this.tone(880, 880, 'triangle', 0.10, 0.18, 0.07);
  }

  /** Player gains a level. */
  levelUp(): void {
    // Major arpeggio: C4 E4 G4 C5
    const notes = [261, 330, 392, 523];
    notes.forEach((f, i) => this.tone(f, f, 'square', 0.13, 0.14, i * 0.1));
  }

  /** Player descends stairs. */
  stairs(): void {
    this.tone(520, 90, 'sine',   0.45, 0.18);
    this.noise(0.20, 0.08, 350, 'lowpass', 0.08);
  }

  /** Player dies. */
  death(): void {
    this.tone(220, 110, 'square',   0.35, 0.20);
    this.tone(185,  92, 'square',   0.35, 0.14, 0.18);  // minor third
    this.tone(100,  48, 'sawtooth', 0.55, 0.18, 0.38);
    this.noise(0.65, 0.10, 180, 'lowpass');
  }

  /** Player wins the game. */
  victory(): void {
    // Ascending fanfare: C E G C E G C (two octaves)
    const notes = [261, 330, 392, 523, 659, 784, 1047];
    notes.forEach((f, i) => this.tone(f, f, 'square', 0.18, 0.13, i * 0.09));
    // Long sustain on top note
    this.tone(1047, 880, 'triangle', 0.55, 0.16, notes.length * 0.09);
  }

  /** Player tries to walk into a wall. */
  bump(): void {
    this.tone(85, 50, 'square', 0.06, 0.14);
  }

  /** Short confirm blip on game start. */
  start(): void {
    this.tone(440, 440, 'square', 0.07, 0.14);
    this.tone(660, 660, 'square', 0.10, 0.14, 0.07);
  }

  // ── Biome hazard sounds ─────────────────────────────────────────────────

  /** Sizzle on lava tile. */
  lava(): void {
    this.noise(0.18, 0.18, 800, 'bandpass');
    this.tone(120, 60, 'sawtooth', 0.15, 0.12);
  }

  /** Squelch on slime tile. */
  slime(): void {
    this.tone(90, 130, 'sine', 0.10, 0.14);
    this.noise(0.08, 0.10, 300, 'lowpass');
  }

  /** Ice crack / slide. */
  ice(): void {
    this.tone(1200, 600, 'triangle', 0.10, 0.10);
    this.noise(0.06, 0.06, 2000, 'highpass');
  }

  /** Ice Dragon freeze effect — crystalline high chime. */
  freeze(): void {
    this.tone(1400, 1800, 'triangle', 0.25, 0.12);
    this.tone(1800, 1400, 'triangle', 0.25, 0.10, 0.12);
    this.noise(0.12, 0.06, 3000, 'highpass');
  }

  /** Fire Dragon breathes — deep roar + crackling. */
  fireBreath(): void {
    this.noise(0.40, 0.25, 600, 'bandpass');
    this.tone(80, 50, 'sawtooth', 0.35, 0.20);
    this.tone(160, 80, 'sawtooth', 0.25, 0.15, 0.05);
  }

  /** Save written to disk. */
  save(): void {
    this.tone(660, 880, 'triangle', 0.08, 0.10);
    this.tone(880, 660, 'triangle', 0.08, 0.08, 0.07);
  }
}

export const audio = new AudioEngine();
