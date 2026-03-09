/**
 * PlayerDrawing — renders a particle trail when the player drags on empty space.
 * Same visual language as ParticleDrawing (fairy drawing), same feel.
 * Driven by raw finger/mouse position instead of a math curve.
 */

interface TrailParticle {
  x: number; y: number;
  vx: number; vy: number;
  alpha: number;
  size: number;
  hue: number;
  born: number;       // timestamp (ms)
  lifetime: number;   // ms
  glowing: boolean;
}

export class PlayerDrawing {
  private trail: TrailParticle[] = [];
  private active = false;

  // Speed tracking for dynamic particle size/scatter
  private lastX = 0;
  private lastY = 0;
  private lastTime = 0;
  private speed = 0;          // px/ms — smoothed
  private speedPhase = 0;

  // Hue shift over time while drawing
  private hueOffset = 0;
  private drawTime = 0;       // ms since drag started

  // Burst tracking
  private lastBurstDist = 0;
  private totalDist = 0;
  private readonly BURST_INTERVAL = 80; // px between bursts

  // Fade-out tracking
  private finishedAt = -1;
  private realTime = 0;

  getTrail() { return this.trail; }
  isActive() { return this.active; }

  startDrag(x: number, y: number) {
    this.active = true;
    this.lastX = x;
    this.lastY = y;
    this.lastTime = performance.now();
    this.speed = 0;
    this.speedPhase = Math.random() * Math.PI * 2;
    this.hueOffset = 0;
    this.drawTime = 0;
    this.lastBurstDist = 0;
    this.totalDist = 0;
    this.trail = [];
    this.finishedAt = -1;
  }

  moveDrag(x: number, y: number) {
    if (!this.active) return;

    const now = performance.now();
    const dt = Math.max(now - this.lastTime, 1);
    const dx = x - this.lastX;
    const dy = y - this.lastY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Smooth speed (px/ms)
    const rawSpeed = dist / dt;
    this.speed = this.speed * 0.7 + rawSpeed * 0.3;

    this.drawTime += dt;
    this.lastTime = now;

    // Hue shifts as we draw
    this.hueOffset = (this.drawTime * 0.02) % 80;

    // Dynamic speed phase
    this.speedPhase += 0.003 * dt;
    const speedMod = 1 + 0.6 * Math.sin(this.speedPhase); // 0.4x – 1.6x

    // How many particles to spawn per move — proportional to distance
    const steps = Math.max(1, Math.floor(dist / 4));
    for (let s = 0; s < steps; s++) {
      const t = steps === 1 ? 1 : s / (steps - 1);
      const px = this.lastX + dx * t;
      const py = this.lastY + dy * t;

      // Speed-dependent size & scatter
      const speedFactor = Math.min(this.speed * 80, 2.5); // cap
      const size = (1.6 + Math.random() * 1.2) * (0.6 + speedFactor * 0.3) * (0.7 + speedMod * 0.3);
      const scatter = (2 + speedFactor * 1.5) * (0.5 + speedMod * 0.5);

      // Perpendicular drift
      const len = dist || 1;
      const perpX = -dy / len;
      const perpY =  dx / len;
      const perpDrift = (Math.random() - 0.5) * scatter;

      this.trail.push({
        x: px + perpX * perpDrift + (Math.random() - 0.5) * scatter * 0.4,
        y: py + perpY * perpDrift + (Math.random() - 0.5) * scatter * 0.4,
        vx: perpX * perpDrift * 0.04 + (Math.random() - 0.5) * 0.3,
        vy: perpY * perpDrift * 0.04 + (Math.random() - 0.5) * 0.3 - 0.04,
        alpha: 0.5 + Math.random() * 0.3,
        size,
        hue: 245 + this.hueOffset + Math.random() * 40,
        born: now,
        lifetime: 700 + Math.random() * 500,
        glowing: false,
      });

      // Extra glow layer at higher speeds
      if (speedFactor > 1.2) {
        this.trail.push({
          x: px + (Math.random() - 0.5) * scatter * 2,
          y: py + (Math.random() - 0.5) * scatter * 2,
          vx: (Math.random() - 0.5) * 0.5,
          vy: (Math.random() - 0.5) * 0.5 - 0.1,
          alpha: 0.2 + Math.random() * 0.15,
          size: size * 1.8,
          hue: 210 + this.hueOffset + Math.random() * 70,
          born: now,
          lifetime: 500 + Math.random() * 300,
          glowing: true,
        });
      }
    }

    // Burst at intervals based on total distance
    this.totalDist += dist;
    if (this.totalDist - this.lastBurstDist >= this.BURST_INTERVAL) {
      this.lastBurstDist = this.totalDist;
      this.spawnBurst(x, y);
    }

    this.lastX = x;
    this.lastY = y;
  }

  endDrag() {
    this.active = false;
    // Trail fades out naturally — don't clear
  }

  private spawnBurst(x: number, y: number) {
    const count = 5 + Math.floor(Math.random() * 5);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const speed = 0.3 + Math.random() * 0.7;
      const now = performance.now();
      this.trail.push({
        x: x + Math.cos(angle) * 5,
        y: y + Math.sin(angle) * 5,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.15,
        alpha: 0.7 + Math.random() * 0.3,
        size: 2 + Math.random() * 2,
        hue: 240 + this.hueOffset + Math.random() * 80,
        born: now,
        lifetime: 600 + Math.random() * 400,
        glowing: true,
      });
    }
  }

  update(dtMs: number) {
    const now = performance.now();
    this.realTime += dtMs;

    // Record when drawing stopped
    if (!this.active && this.finishedAt < 0 && this.trail.length > 0) {
      this.finishedAt = this.realTime;
    }
    if (this.active) {
      this.finishedAt = -1;
    }

    const timeSinceStop = this.finishedAt >= 0 ? this.realTime - this.finishedAt : 0;
    // Global fade-out over 1200ms after drag ends
    const FADE_DURATION = 1200;

    for (let i = this.trail.length - 1; i >= 0; i--) {
      const p = this.trail[i];
      const age = now - p.born;
      let ratio: number;

      if (this.active) {
        ratio = age / p.lifetime;
      } else {
        const naturalRatio = age / p.lifetime;
        const globalFade = timeSinceStop / FADE_DURATION;
        ratio = Math.max(naturalRatio, globalFade);
      }

      if (ratio >= 1) {
        this.trail.splice(i, 1);
        continue;
      }

      // Move particles
      p.x += p.vx * 0.6;
      p.y += p.vy * 0.6;
      p.vx *= 0.96;
      p.vy *= 0.96;

      // Fade: quick fade-in (first 15%), graceful fade-out
      const fadeIn  = Math.min(ratio * 6.5, 1);
      const fadeOut = ratio > 0.4 ? 1 - (ratio - 0.4) / 0.6 : 1;
      p.alpha = (p.glowing ? 0.5 : 0.42) * fadeIn * fadeOut;
    }

    if (!this.active && this.trail.length === 0) {
      this.finishedAt = -1;
    }
  }

  /** Render the trail on the given canvas context */
  render(ctx: CanvasRenderingContext2D) {
    if (this.trail.length === 0) return;

    for (const p of this.trail) {
      if (p.alpha <= 0.01) continue;

      ctx.save();

      if (p.glowing) {
        // Outer glow
        const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 2.2);
        grd.addColorStop(0, `hsla(${p.hue}, 80%, 72%, ${p.alpha * 0.55})`);
        grd.addColorStop(1, `hsla(${p.hue}, 80%, 72%, 0)`);
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 2.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Core particle
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
      grad.addColorStop(0, `hsla(${p.hue}, 85%, 88%, ${p.alpha})`);
      grad.addColorStop(0.5, `hsla(${p.hue}, 75%, 68%, ${p.alpha * 0.7})`);
      grad.addColorStop(1, `hsla(${p.hue}, 70%, 60%, 0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }
}
