/**
 * SoundEngine — Procedural audio via Web Audio API
 * All sounds synthesized. No external files.
 */

export type SoundType =
  | 'tap'
  | 'doubleTap'
  | 'hold'
  | 'rapidTap'
  | 'swipe'
  | 'appear'
  | 'idle'
  | 'curious'
  | 'happy'
  | 'lonely'
  | 'dreamy'
  | 'teaching'
  | 'care'
  | 'discovery'
  | 'comforted'
  | 'playful'
  | 'typing'
  | 'spin'
  | 'secret'
  | 'companion'
  | 'ritual'
  | 'weather';

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private muted = false;
  private lastSoundTime: Map<SoundType, number> = new Map();
  private cooldowns: Partial<Record<SoundType, number>> = {
    tap: 120,
    doubleTap: 300,
    hold: 600,
    rapidTap: 300,
    idle: 8000,
    care: 3000,
    curious: 2000,
    discovery: 3000,
    typing: 30,
    spin: 1000,
    secret: 5000,
    companion: 4000,
    ritual: 5000,
  };

  // Typing note pool — pentatonic scale, soft
  private typingNotes = [
    783.99, 880, 987.77, 1108.73, 1244.51,
    659.25, 739.99, 830.61, 932.33, 1046.50,
  ];
  private lastTypingNoteIdx = -1;

  private getCtx(): AudioContext | null {
    if (this.ctx) return this.ctx;
    try {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.3, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
    } catch { return null; }
    return this.ctx;
  }

  private canPlay(type: SoundType): boolean {
    if (this.muted) return false;
    const cooldown = this.cooldowns[type] ?? 0;
    if (!cooldown) return true;
    const last = this.lastSoundTime.get(type) ?? 0;
    return Date.now() - last >= cooldown;
  }

  private markPlayed(type: SoundType) { this.lastSoundTime.set(type, Date.now()); }

  private osc(freq: number, type: OscillatorType, t: number, duration: number, gain: number, ctx: AudioContext): void {
    const g = ctx.createGain();
    g.connect(this.masterGain!);
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.connect(g);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    o.start(t); o.stop(t + duration + 0.05);
  }

  private oscEnv(freq: number, freqEnd: number, type: OscillatorType, t: number, duration: number, attack: number, gain: number, ctx: AudioContext): void {
    const g = ctx.createGain();
    g.connect(this.masterGain!);
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freqEnd, t + duration);
    o.connect(g);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    o.start(t); o.stop(t + duration + 0.05);
  }

  private noise(t: number, duration: number, gain: number, ctx: AudioContext, lowpass = 800): void {
    const sz = ctx.sampleRate * duration;
    const buf = ctx.createBuffer(1, sz, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < sz; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const flt = ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.setValueAtTime(lowpass, t);
    const g = ctx.createGain();
    g.connect(this.masterGain!);
    src.connect(flt); flt.connect(g);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.start(t); src.stop(t + duration + 0.05);
  }

  private shimmer(freqs: number[], t: number, stagger: number, duration: number, gain: number, ctx: AudioContext): void {
    freqs.forEach((f, i) => {
      this.oscEnv(f, f * 1.002, 'sine', t + i * stagger, duration, 0.03, gain * (1 - i * 0.12), ctx);
    });
  }

  play(type: SoundType): void {
    const ctx = this.getCtx();
    if (!ctx || !this.masterGain) return;
    if (!this.canPlay(type)) return;
    if (ctx.state === 'suspended') ctx.resume();
    this.markPlayed(type);
    const t = ctx.currentTime;

    switch (type) {

      // Single tap — crisp crystal ping, clearly audible
      case 'tap': {
        this.oscEnv(1200, 900, 'sine', t, 0.35, 0.008, 0.11, ctx);
        this.oscEnv(1800, 1400, 'sine', t + 0.01, 0.2, 0.005, 0.06, ctx);
        this.noise(t, 0.05, 0.015, ctx, 3000);
        break;
      }

      // Double tap — two-note sparkle
      case 'doubleTap': {
        this.oscEnv(1046, 1318, 'sine', t, 0.25, 0.01, 0.09, ctx);
        this.oscEnv(1318, 1567, 'sine', t + 0.1, 0.25, 0.01, 0.09, ctx);
        this.noise(t + 0.08, 0.06, 0.012, ctx, 4000);
        break;
      }

      // Hold — warm swelling hum
      case 'hold': {
        this.oscEnv(260, 270, 'sine', t, 1.4, 0.2, 0.08, ctx);
        this.oscEnv(390, 400, 'sine', t, 1.4, 0.25, 0.045, ctx);
        this.oscEnv(520, 525, 'sine', t + 0.1, 1.2, 0.3, 0.028, ctx);
        break;
      }

      // Comforted — warm resolution
      case 'comforted': {
        this.shimmer([523, 659, 784, 1046], t, 0.07, 0.7, 0.08, ctx);
        this.oscEnv(261, 196, 'sine', t, 0.9, 0.05, 0.05, ctx);
        break;
      }

      // Rapid tap — sparkle burst
      case 'rapidTap': {
        [1318, 1567, 1760, 2093].forEach((f, i) => {
          this.oscEnv(f, f * 0.88, 'triangle', t + i * 0.06, 0.18, 0.008, 0.08, ctx);
        });
        break;
      }

      // Playful — joyful arpeggio
      case 'playful': {
        [523, 659, 784, 1046, 1318].forEach((f, i) => {
          this.oscEnv(f, f * 1.05, 'sine', t + i * 0.07, 0.28, 0.01, 0.07, ctx);
        });
        break;
      }

      // Swipe — breathy whoosh
      case 'swipe': {
        this.noise(t, 0.22, 0.04, ctx, 700);
        this.oscEnv(380, 160, 'sine', t, 0.28, 0.015, 0.045, ctx);
        break;
      }

      // Appear — magical ascending shimmer
      case 'appear': {
        [261, 329, 392, 523, 659, 784, 1046].forEach((f, i) => {
          this.oscEnv(f * 0.95, f, 'sine', t + i * 0.11, 0.8, 0.05, 0.065 - i * 0.005, ctx);
        });
        this.noise(t, 0.6, 0.015, ctx, 400);
        break;
      }

      // Idle ambient — soft chime variations
      case 'idle': {
        const v = Math.floor(Math.random() * 3);
        if (v === 0) this.shimmer([880, 1108, 1318, 1760], t, 0.1, 0.9, 0.055, ctx);
        else if (v === 1) {
          this.oscEnv(659, 622, 'sine', t, 1.0, 0.05, 0.05, ctx);
          this.oscEnv(988, 932, 'sine', t + 0.15, 0.8, 0.05, 0.032, ctx);
        } else {
          [523, 784, 1046].forEach((f, i) =>
            this.oscEnv(f, f * 0.97, 'sine', t + i * 0.18, 0.7, 0.04, 0.042, ctx)
          );
        }
        break;
      }

      // Curious — inquisitive rising tone
      case 'curious': {
        this.oscEnv(523, 784, 'sine', t, 0.5, 0.04, 0.065, ctx);
        this.oscEnv(784, 880, 'triangle', t + 0.35, 0.3, 0.02, 0.042, ctx);
        this.osc(1046, 'sine', t + 0.55, 0.2, 0.036, ctx);
        break;
      }

      // Discovery — wonder chime
      case 'discovery': {
        this.shimmer([698, 880, 1047, 1397], t, 0.09, 1.0, 0.07, ctx);
        this.oscEnv(349, 370, 'sine', t, 1.1, 0.06, 0.055, ctx);
        this.noise(t + 0.1, 0.2, 0.013, ctx, 1200);
        break;
      }

      // Happy — bright bouncy
      case 'happy': {
        [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => {
          this.oscEnv(f, f * 1.03, 'sine', t + i * 0.065, 0.4, 0.01, 0.07 - i * 0.007, ctx);
        });
        break;
      }

      // Lonely — descending minor
      case 'lonely': {
        this.oscEnv(523, 466, 'sine', t, 1.2, 0.1, 0.06, ctx);
        this.oscEnv(392, 349, 'sine', t + 0.2, 1.0, 0.1, 0.038, ctx);
        this.oscEnv(311, 277, 'sine', t + 0.45, 0.8, 0.08, 0.026, ctx);
        break;
      }

      // Dreamy — hazy floating
      case 'dreamy': {
        [261, 329, 392].forEach((f, i) => {
          this.oscEnv(f, f * 1.008, 'sine', t + i * 0.22, 1.6, 0.15, 0.048, ctx);
        });
        this.noise(t, 0.8, 0.009, ctx, 300);
        break;
      }

      // Teaching — curious question sound
      case 'teaching': {
        this.oscEnv(523, 659, 'sine', t, 0.3, 0.03, 0.06, ctx);
        this.oscEnv(784, 880, 'triangle', t + 0.2, 0.25, 0.02, 0.042, ctx);
        this.shimmer([880, 1046, 1318], t + 0.38, 0.07, 0.5, 0.052, ctx);
        break;
      }

      // Care — gentle grounding tone
      case 'care': {
        this.oscEnv(196, 185, 'sine', t, 1.5, 0.18, 0.065, ctx);
        this.oscEnv(294, 277, 'sine', t + 0.1, 1.3, 0.18, 0.038, ctx);
        this.oscEnv(392, 370, 'sine', t + 0.25, 1.0, 0.12, 0.024, ctx);
        break;
      }

      // Typing — soft pentatonic note per character
      case 'typing': {
        // Pick a note different from the last
        let idx: number;
        do { idx = Math.floor(Math.random() * this.typingNotes.length); }
        while (idx === this.lastTypingNoteIdx && this.typingNotes.length > 1);
        this.lastTypingNoteIdx = idx;
        const freq = this.typingNotes[idx];
        this.oscEnv(freq, freq * 0.992, 'sine', t, 0.12, 0.005, 0.045, ctx);
        break;
      }

      // Spin — celebration whorl
      case 'spin': {
        this.oscEnv(523, 1046, 'sine', t, 0.6, 0.03, 0.07, ctx);
        this.shimmer([784, 988, 1245, 1568], t + 0.1, 0.06, 0.5, 0.055, ctx);
        this.noise(t, 0.3, 0.012, ctx, 1500);
        break;
      }

      // Secret — whisper-like reveal
      case 'secret': {
        this.noise(t, 0.4, 0.018, ctx, 500);
        this.oscEnv(261, 329, 'sine', t + 0.1, 1.0, 0.2, 0.04, ctx);
        this.oscEnv(392, 440, 'sine', t + 0.3, 0.8, 0.15, 0.028, ctx);
        this.shimmer([523, 622, 740], t + 0.6, 0.12, 0.6, 0.038, ctx);
        break;
      }

      // Companion — small delicate appearance
      case 'companion': {
        [880, 1108, 1397].forEach((f, i) => {
          this.oscEnv(f * 0.9, f, 'sine', t + i * 0.09, 0.5, 0.04, 0.05 - i * 0.01, ctx);
        });
        this.noise(t, 0.3, 0.008, ctx, 2000);
        break;
      }

      // Ritual / milestone — significant moment
      case 'ritual': {
        this.oscEnv(349, 392, 'sine', t, 0.8, 0.08, 0.07, ctx);
        this.oscEnv(523, 587, 'sine', t + 0.1, 0.7, 0.08, 0.055, ctx);
        this.shimmer([698, 880, 1046, 1318], t + 0.3, 0.1, 0.8, 0.06, ctx);
        break;
      }

      // Weather transition
      case 'weather': {
        this.noise(t, 0.5, 0.012, ctx, 400);
        this.oscEnv(196, 220, 'sine', t + 0.1, 0.8, 0.15, 0.035, ctx);
        break;
      }
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.3, this.ctx.currentTime, 0.1);
    }
  }

  isMuted(): boolean { return this.muted; }

  unlock(): void {
    this.getCtx();
    if (this.ctx?.state === 'suspended') this.ctx.resume();
  }
}

export const soundEngine = new SoundEngine();
