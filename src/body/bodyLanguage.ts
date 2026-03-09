/**
 * BodyLanguage — fairy expresses emotions through movement, not text
 * Nod, shake, spin, shrink, bounce, tilt, hug
 */

export type BodyExpression =
  | 'none'
  | 'nod'        // bobbing vertically — agreement
  | 'shake'      // lateral vibration — denial
  | 'spin'       // full rotation — celebration
  | 'shrink'     // scale down + dim — shy / hiding
  | 'bounce'     // joyful vertical bounce — greeting
  | 'tilt'       // slow lean side to side — thinking
  | 'pulse'      // rapid glow pulse — excited
  | 'hug';       // moves toward drag point gently

export interface BodyState {
  offsetX: number;   // additional x offset applied to fairy
  offsetY: number;   // additional y offset
  scaleBonus: number; // multiplier on top of normal scale (1 = normal)
  glowBonus: number;  // extra glow alpha
  angle: number;      // rotation (radians, if supported)
  dimAlpha: number;   // 0=normal, 1=fully dim (for shrink)
}

export class BodyLanguage {
  private current: BodyExpression = 'none';
  private progress = 0; // 0..duration
  private duration = 0;
  private intensity = 1;
  private queue: Array<{ expr: BodyExpression; duration: number; intensity: number }> = [];
  private cooldowns: Partial<Record<BodyExpression, number>> = {};
  private readonly COOLDOWN = 3000;

  trigger(expr: BodyExpression, intensityOverride = 1) {
    const now = Date.now();
    const lastTime = this.cooldowns[expr] ?? 0;
    if (now - lastTime < this.COOLDOWN) return;
    this.cooldowns[expr] = now;

    const durations: Record<BodyExpression, number> = {
      none: 0, nod: 60, shake: 50, spin: 90,
      shrink: 80, bounce: 70, tilt: 100, pulse: 40, hug: 60,
    };
    const d = durations[expr];
    if (!d) return;

    if (this.current === 'none') {
      this.current = expr;
      this.progress = 0;
      this.duration = d;
      this.intensity = intensityOverride;
    } else {
      this.queue.push({ expr, duration: d, intensity: intensityOverride });
      if (this.queue.length > 2) this.queue.shift();
    }
  }

  update(dt: number): BodyState {
    const state: BodyState = {
      offsetX: 0, offsetY: 0,
      scaleBonus: 1, glowBonus: 0,
      angle: 0, dimAlpha: 0,
    };

    if (this.current === 'none') {
      if (this.queue.length > 0) {
        const next = this.queue.shift()!;
        this.current = next.expr;
        this.progress = 0;
        this.duration = next.duration;
        this.intensity = next.intensity;
      }
      return state;
    }

    this.progress += dt;
    const t = Math.min(this.progress / this.duration, 1);
    const ease = Math.sin(t * Math.PI); // 0→1→0 envelope

    switch (this.current) {
      case 'nod':
        state.offsetY = Math.sin(t * Math.PI * 3) * 8 * ease * this.intensity;
        break;
      case 'shake':
        state.offsetX = Math.sin(t * Math.PI * 6) * 9 * ease * this.intensity;
        break;
      case 'spin':
        state.angle = t * Math.PI * 2 * this.intensity;
        state.scaleBonus = 1 + ease * 0.15;
        state.glowBonus = ease * 0.2;
        break;
      case 'shrink':
        state.scaleBonus = 1 - ease * 0.35 * this.intensity;
        state.dimAlpha = ease * 0.5;
        break;
      case 'bounce':
        state.offsetY = -Math.abs(Math.sin(t * Math.PI * 2.5)) * 18 * this.intensity;
        state.scaleBonus = 1 + Math.abs(Math.sin(t * Math.PI * 2.5)) * 0.12;
        break;
      case 'tilt':
        state.angle = Math.sin(t * Math.PI * 2) * 0.3 * this.intensity;
        break;
      case 'pulse':
        state.scaleBonus = 1 + ease * 0.25 * this.intensity;
        state.glowBonus = ease * 0.35;
        break;
      case 'hug':
        state.offsetX = Math.sin(t * Math.PI) * 5 * this.intensity;
        state.glowBonus = ease * 0.15;
        break;
    }

    if (t >= 1) {
      this.current = 'none';
      this.progress = 0;
      if (this.queue.length > 0) {
        const next = this.queue.shift()!;
        this.current = next.expr;
        this.progress = 0;
        this.duration = next.duration;
        this.intensity = next.intensity;
      }
    }

    return state;
  }

  getCurrent(): BodyExpression { return this.current; }
}
