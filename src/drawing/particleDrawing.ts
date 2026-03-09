/**
 * ParticleDrawing — the fairy draws shapes with particles when idle.
 * Dynamic: variable speed, size bursts, glow intensity, color shifts,
 * multi-layer trails, sparkle bursts at key points.
 */

export type DrawShape = 'heart' | 'spiral' | 'star' | 'wave' | 'circle' | 'infinity' | 'comet';

interface TrailParticle {
  x: number; y: number;
  vx: number; vy: number;
  alpha: number;
  size: number;
  hue: number;
  born: number;       // progress value when born
  lifetime: number;   // how long in progress units to live
  glowing: boolean;   // is this a key-point sparkle?
}

export class ParticleDrawing {
  private active = false;
  private shape: DrawShape = 'spiral';
  private progress = 0;
  private trail: TrailParticle[] = [];
  private idleTimer = 0;
  private readonly IDLE_THRESHOLD = 420;
  private interrupted = false;
  private cooldown = 0;
  private readonly COOLDOWN_FRAMES = 480;

  // Dynamic speed — varies sinusoidally while drawing
  private baseSpeed = 0.006;
  private speedPhase = 0;

  // Hue shift as drawing progresses
  private hueOffset = 0;

  // Burst accumulator — for key points
  private lastBurstT = -1;

  getActive() { return this.active; }
  getTrail() { return this.trail; }
  getShape() { return this.shape; }
  wasInterrupted() { return this.interrupted; }
  resetInterrupted() { this.interrupted = false; }

  pickShape(personality: string): DrawShape {
    const shapes: Record<string, DrawShape[]> = {
      affectionate: ['heart', 'circle', 'comet'],
      curious:      ['spiral', 'infinity', 'star'],
      sarcastic:    ['wave', 'infinity', 'spiral'],
      independent:  ['circle', 'comet', 'wave'],
      clingy:       ['heart', 'heart', 'circle'],
      distant:      ['wave', 'spiral', 'comet'],
    };
    const pool = shapes[personality] ?? ['spiral', 'star', 'wave', 'heart'];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  interrupt() {
    if (this.active) {
      this.active = false;
      this.interrupted = true;
      this.cooldown = this.COOLDOWN_FRAMES * 0.5;
      // Keep trail to fade out naturally — don't clear it
      this.progress = 0;
      this.idleTimer = 0;
    }
  }

  update(dt: number, fx: number, fy: number, isDragging: boolean, isTalking: boolean, personality: string) {
    if (isDragging || isTalking) {
      if (this.active) this.interrupt();
      this.idleTimer = 0;
      // Still age trail particles
      this.ageTrail(dt * 0.015);
      return;
    }

    if (this.cooldown > 0) {
      this.cooldown -= dt;
      this.ageTrail(dt * 0.015);
      return;
    }

    if (!this.active) {
      this.idleTimer += dt;
      this.ageTrail(dt * 0.015);
      if (this.idleTimer >= this.IDLE_THRESHOLD) {
        this.startDrawing(personality);
      }
      return;
    }

    // Dynamic speed: pulsates while drawing
    this.speedPhase += 0.04 * dt;
    const speedMod = 1 + 0.6 * Math.sin(this.speedPhase); // 0.4x - 1.6x variation
    const currentSpeed = this.baseSpeed * speedMod;

    this.progress += currentSpeed * dt;
    this.hueOffset = this.progress * 80; // hue shifts from start to end

    const pt = this.getPoint(this.progress, fx, fy);
    if (pt) {
      // Main trail particle
      const size = (1.8 + Math.random() * 1.4) * (0.6 + speedMod * 0.4);
      const scatter = speedMod * 2.5;
      this.trail.push({
        x: pt.x + (Math.random() - 0.5) * scatter,
        y: pt.y + (Math.random() - 0.5) * scatter,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3 - 0.05,
        alpha: 0.5 + Math.random() * 0.35,
        size,
        hue: 245 + this.hueOffset + Math.random() * 30,
        born: this.progress,
        lifetime: 0.18 + Math.random() * 0.12,
        glowing: false,
      });

      // Extra glow layer at fast points
      if (speedMod > 1.3) {
        this.trail.push({
          x: pt.x + (Math.random() - 0.5) * scatter * 1.5,
          y: pt.y + (Math.random() - 0.5) * scatter * 1.5,
          vx: (Math.random() - 0.5) * 0.5,
          vy: (Math.random() - 0.5) * 0.5 - 0.1,
          alpha: 0.25 + Math.random() * 0.2,
          size: size * 1.6,
          hue: 220 + this.hueOffset + Math.random() * 60,
          born: this.progress,
          lifetime: 0.14,
          glowing: true,
        });
      }

      // Sparkle burst at key progress points (25%, 50%, 75%)
      const keyPoints = [0.25, 0.5, 0.75, 1.0];
      for (const kp of keyPoints) {
        if (this.lastBurstT < kp && this.progress >= kp) {
          this.lastBurstT = kp;
          this.spawnBurst(pt.x, pt.y);
        }
      }
    }

    this.ageTrail(currentSpeed);

    if (this.progress >= 1) {
      this.active = false;
      this.progress = 0;
      this.cooldown = this.COOLDOWN_FRAMES;
      this.idleTimer = 0;
      this.lastBurstT = -1;
    }
  }

  private startDrawing(personality: string) {
    this.active = true;
    this.interrupted = false;
    this.progress = 0;
    this.trail = [];
    this.shape = this.pickShape(personality);
    this.idleTimer = 0;
    this.speedPhase = Math.random() * Math.PI * 2;
    this.hueOffset = 0;
    this.lastBurstT = -1;
    this.baseSpeed = 0.005 + Math.random() * 0.004;
  }

  private spawnBurst(x: number, y: number) {
    const count = 6 + Math.floor(Math.random() * 5);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.3;
      const speed = 0.4 + Math.random() * 0.8;
      this.trail.push({
        x: x + Math.cos(angle) * 4,
        y: y + Math.sin(angle) * 4,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.15,
        alpha: 0.7 + Math.random() * 0.3,
        size: 2.2 + Math.random() * 1.8,
        hue: 240 + this.hueOffset + Math.random() * 80,
        born: this.progress,
        lifetime: 0.22 + Math.random() * 0.15,
        glowing: true,
      });
    }
  }

  // Real-time clock for fade-out after interruption/completion
  private realTime = 0;
  private finishedAt = -1; // realTime when drawing stopped

  private ageTrail(progressDelta: number) {
    this.realTime += progressDelta;

    // When drawing stops (interrupted or completed), record the moment
    if (!this.active && this.finishedAt < 0 && this.trail.length > 0) {
      this.finishedAt = this.realTime;
    }
    // Reset when trail is cleared for a new drawing
    if (this.active) {
      this.finishedAt = -1;
    }

    // How long since drawing stopped (in progress units)
    const timeSinceStop = this.finishedAt >= 0 ? this.realTime - this.finishedAt : 0;
    // Fade-out duration after stopping: 0.35 progress units (~3-4 seconds)
    const FADE_AFTER_STOP = 0.35;

    for (let i = this.trail.length - 1; i >= 0; i--) {
      const p = this.trail[i];

      // Age while drawing: based on progress delta from birth
      // Age after stop: fade all particles out over FADE_AFTER_STOP
      let ratio: number;
      if (this.active) {
        const age = this.progress - p.born;
        ratio = age / p.lifetime;
      } else {
        // After stopping: let each particle live its natural life,
        // then fade everything based on time since stop
        const age = this.progress - p.born;
        const naturalRatio = age / p.lifetime;
        // Blend: natural fade OR global fade-out, whichever is further along
        const globalFade = timeSinceStop / FADE_AFTER_STOP;
        ratio = Math.max(naturalRatio, globalFade);
      }

      if (ratio >= 1) {
        this.trail.splice(i, 1);
        continue;
      }

      // Move particles gently
      p.x += p.vx * progressDelta * 40;
      p.y += p.vy * progressDelta * 40;
      p.vx *= 0.97;
      p.vy *= 0.97;

      // Fade: quick fade-in, graceful fade-out
      const fadeIn = Math.min(ratio * 6, 1);
      const fadeOut = ratio > 0.45 ? 1 - (ratio - 0.45) / 0.55 : 1;
      p.alpha = (p.glowing ? 0.55 : 0.45) * fadeIn * fadeOut;
    }

    // Clean up finishedAt once trail is empty
    if (!this.active && this.trail.length === 0) {
      this.finishedAt = -1;
    }
  }

  private getPoint(t: number, cx: number, cy: number): { x: number; y: number } | null {
    const size = 65;
    switch (this.shape) {
      case 'heart': {
        const a = t * Math.PI * 2;
        const x = size * 0.85 * Math.pow(Math.sin(a), 3);
        const y = -size * 0.85 * (
          0.8125 * Math.cos(a) -
          0.3125 * Math.cos(2 * a) -
          0.125  * Math.cos(3 * a) -
          0.0625 * Math.cos(4 * a)
        );
        return { x: cx + x, y: cy + y };
      }
      case 'spiral': {
        const turns = 3;
        const a = t * Math.PI * 2 * turns;
        const r = t * size * 1.1;
        return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
      }
      case 'star': {
        const pts = 5;
        const a = t * Math.PI * 2;
        const r = size * (0.45 + 0.55 * Math.abs(Math.sin(a * pts)));
        return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
      }
      case 'wave': {
        const x = (t - 0.5) * size * 2.8;
        const y = Math.sin(t * Math.PI * 5) * size * 0.45;
        return { x: cx + x, y: cy + y };
      }
      case 'circle': {
        const a = t * Math.PI * 2;
        return { x: cx + Math.cos(a) * size * 0.8, y: cy + Math.sin(a) * size * 0.8 };
      }
      case 'infinity': {
        const a = t * Math.PI * 2;
        const r = size * 0.85;
        return {
          x: cx + r * Math.cos(a) / (1 + Math.sin(a) * Math.sin(a)),
          y: cy + r * Math.sin(a) * Math.cos(a) / (1 + Math.sin(a) * Math.sin(a)),
        };
      }
      case 'comet': {
        // Elongated spiral that accelerates
        const a = t * Math.PI * 6;
        const r = Math.pow(t, 0.5) * size * 1.2;
        return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
      }
      default: return null;
    }
  }
}
