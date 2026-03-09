/**
 * AmbientWeather — visual weather based on fairy's mood
 * Rain, fireflies, snow, sparks, mist — all procedural canvas effects
 */

export type WeatherType = 'none' | 'rain' | 'fireflies' | 'snow' | 'sparks' | 'mist' | 'electric';

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  alpha: number;
  size: number;
  life: number; maxLife: number;
  hue: number;
  flicker?: number;
}

interface DayNightColors {
  bgR: number; bgG: number; bgB: number;
}

export class AmbientWeather {
  private current: WeatherType = 'none';
  private target: WeatherType = 'none';
  private blend = 1.0;
  private particles: Particle[] = [];
  private spawnAcc = 0;
  private frameCount = 0;

  // Day/night cycle
  private dnColors: DayNightColors = { bgR: 0, bgG: 0, bgB: 0 };
  private dnTarget: DayNightColors = { bgR: 0, bgG: 0, bgB: 0 };

  private fadingOut = false;
  private fadeOutTimer = 0;
  private readonly FADE_OUT_DURATION = 90; // frames

  setWeather(w: WeatherType) {
    if (w === this.target) return;
    this.target = w;
    if (w !== this.current) {
      // Mark all current particles as dying (let them fade naturally)
      for (const p of this.particles) {
        // Push life toward maxLife so they fade out gracefully
        const remaining = p.maxLife - p.life;
        if (remaining > this.FADE_OUT_DURATION) {
          p.maxLife = p.life + this.FADE_OUT_DURATION;
        }
      }
      this.fadingOut = true;
      this.fadeOutTimer = this.FADE_OUT_DURATION;
    }
  }

  updateDayNight() {
    const hour = new Date().getHours();
    const min = new Date().getMinutes();
    const t = hour + min / 60;

    let r = 0, g = 0, b = 0;

    if (t >= 2 && t < 5) {
      // Deep night — pure black, slight cold blue
      r = 0; g = 0; b = 4;
    } else if (t >= 5 && t < 7) {
      // Pre-dawn — deep blue violet
      const p = (t - 5) / 2;
      r = Math.round(p * 6); g = Math.round(p * 3); b = Math.round(8 + p * 10);
    } else if (t >= 7 && t < 12) {
      // Morning — very dark warm grey
      const p = (t - 7) / 5;
      r = Math.round(6 + p * 4); g = Math.round(4 + p * 3); b = Math.round(8 + p * 2);
    } else if (t >= 12 && t < 17) {
      // Afternoon — neutral dark
      r = 6; g = 5; b = 7;
    } else if (t >= 17 && t < 20) {
      // Sunset — dark amber/purple tint
      const p = (t - 17) / 3;
      r = Math.round(10 - p * 4); g = Math.round(5 - p * 3); b = Math.round(7 + p * 4);
    } else if (t >= 20 && t < 22) {
      // Dusk — blue settling
      const p = (t - 20) / 2;
      r = Math.round(6 - p * 6); g = Math.round(2 - p * 2); b = Math.round(11 - p * 7);
    }

    this.dnTarget = { bgR: r, bgG: g, bgB: b };
  }

  update(dt: number, w: number, h: number, mood: string) {
    this.frameCount += dt;

    // Lerp day/night colors
    const s = 0.005 * dt;
    this.dnColors.bgR += (this.dnTarget.bgR - this.dnColors.bgR) * s;
    this.dnColors.bgG += (this.dnTarget.bgG - this.dnColors.bgG) * s;
    this.dnColors.bgB += (this.dnTarget.bgB - this.dnColors.bgB) * s;

    // Auto-set weather from mood
    const moodWeather: Partial<Record<string, WeatherType>> = {
      lonely: 'rain',
      happy: 'fireflies',
      calm: 'snow',
      excited: 'sparks',
      curious: 'electric',
      comforted: 'fireflies',
      dreamy: 'snow',
      playful: 'sparks',
    };
    const desired = moodWeather[mood] ?? 'none';
    this.setWeather(desired);

    // Transition: switch to new weather type only after old particles fade
    if (this.fadingOut) {
      this.fadeOutTimer -= dt;
      if (this.fadeOutTimer <= 0 || this.particles.length === 0) {
        this.fadingOut = false;
        this.current = this.target;
        // Only clear particles that haven't faded yet (shouldn't be many)
        this.particles = this.particles.filter(p => p.life < p.maxLife * 0.9);
      }
    } else if (this.current !== this.target) {
      this.current = this.target;
    }

    if (this.blend < 1) this.blend = Math.min(1, this.blend + 0.01 * dt);

    // Spawn particles
    this.spawnAcc += dt;
    const spawnInterval = this.getSpawnInterval();
    while (this.spawnAcc >= spawnInterval) {
      this.spawnAcc -= spawnInterval;
      this.spawnParticle(w, h);
    }

    // Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) { this.particles.splice(i, 1); continue; }

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      if (this.current === 'fireflies') {
        p.flicker = (p.flicker ?? 0) + 0.08 * dt;
        p.vx += (Math.random() - 0.5) * 0.05 * dt;
        p.vy += (Math.random() - 0.5) * 0.05 * dt;
        p.vx *= Math.pow(0.98, dt);
        p.vy *= Math.pow(0.98, dt);
      }

      if (this.current === 'electric') {
        p.x += (Math.random() - 0.5) * 1.5 * dt;
      }

      // Remove if out of bounds
      if (p.y > h + 20 || p.y < -20 || p.x < -20 || p.x > w + 20) {
        this.particles.splice(i, 1);
      }
    }
  }

  private getSpawnInterval(): number {
    switch (this.current) {
      case 'rain': return 1.5;
      case 'fireflies': return 12;
      case 'snow': return 6;
      case 'sparks': return 3;
      case 'mist': return 8;
      case 'electric': return 4;
      default: return 9999;
    }
  }

  private spawnParticle(w: number, h: number) {
    if (this.current === 'none') return;
    switch (this.current) {
      case 'rain':
        this.particles.push({
          x: Math.random() * w, y: -10,
          vx: 0.3 + Math.random() * 0.4, vy: 2.5 + Math.random() * 2,
          alpha: 0.06 + Math.random() * 0.08,
          size: 0.5 + Math.random() * 0.8,
          life: 0, maxLife: 80 + Math.random() * 40,
          hue: 220,
        });
        break;
      case 'fireflies':
        this.particles.push({
          x: Math.random() * w, y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4,
          alpha: 0.4 + Math.random() * 0.3,
          size: 1.5 + Math.random() * 2,
          life: 0, maxLife: 300 + Math.random() * 200,
          hue: 60 + Math.random() * 40,
          flicker: Math.random() * Math.PI * 2,
        });
        break;
      case 'snow':
        this.particles.push({
          x: Math.random() * w, y: -10,
          vx: (Math.random() - 0.5) * 0.3, vy: 0.3 + Math.random() * 0.5,
          alpha: 0.12 + Math.random() * 0.15,
          size: 1.5 + Math.random() * 2.5,
          life: 0, maxLife: 400 + Math.random() * 200,
          hue: 210,
        });
        break;
      case 'sparks':
        this.particles.push({
          x: Math.random() * w, y: h + 5,
          vx: (Math.random() - 0.5) * 1.5, vy: -(1.5 + Math.random() * 2.5),
          alpha: 0.3 + Math.random() * 0.3,
          size: 0.8 + Math.random() * 1.2,
          life: 0, maxLife: 60 + Math.random() * 60,
          hue: 280 + Math.random() * 60,
        });
        break;
      case 'electric':
        this.particles.push({
          x: Math.random() * w, y: Math.random() * h * 0.5,
          vx: (Math.random() - 0.5) * 0.2, vy: 0.1 + Math.random() * 0.3,
          alpha: 0.08 + Math.random() * 0.12,
          size: 0.6 + Math.random() * 1,
          life: 0, maxLife: 30 + Math.random() * 30,
          hue: 260 + Math.random() * 40,
        });
        break;
      case 'mist':
        this.particles.push({
          x: Math.random() * w, y: h - Math.random() * h * 0.3,
          vx: 0.1 + Math.random() * 0.2, vy: -0.1 - Math.random() * 0.2,
          alpha: 0.02 + Math.random() * 0.03,
          size: 20 + Math.random() * 30,
          life: 0, maxLife: 300 + Math.random() * 200,
          hue: 260,
        });
        break;
    }
  }

  getBgColor() {
    return `rgb(${Math.round(this.dnColors.bgR)},${Math.round(this.dnColors.bgG)},${Math.round(this.dnColors.bgB)})`;
  }

  draw(ctx: CanvasRenderingContext2D, _w: number, _h: number) {
    if (this.particles.length === 0) return;
    const alpha = this.blend;

    for (const p of this.particles) {
      const lifeRatio = p.life / p.maxLife;
      const fadeIn = Math.min(lifeRatio * 5, 1);
      const fadeOut = lifeRatio > 0.7 ? 1 - (lifeRatio - 0.7) / 0.3 : 1;
      let finalAlpha = p.alpha * fadeIn * fadeOut * alpha;

      if (this.current === 'fireflies') {
        finalAlpha *= 0.5 + 0.5 * Math.sin((p.flicker ?? 0));
      }
      if (finalAlpha <= 0.005) continue;

      if (this.current === 'rain') {
        // Draw as thin line
        ctx.save();
        ctx.strokeStyle = `hsla(${p.hue},50%,70%,${finalAlpha})`;
        ctx.lineWidth = p.size;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + p.vx * 4, p.y + p.vy * 4);
        ctx.stroke();
        ctx.restore();
      } else if (this.current === 'mist') {
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
        g.addColorStop(0, `hsla(${p.hue},40%,60%,${finalAlpha})`);
        g.addColorStop(1, `hsla(${p.hue},30%,50%,0)`);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
      } else {
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 2);
        g.addColorStop(0, `hsla(${p.hue},60%,80%,${finalAlpha})`);
        g.addColorStop(1, `hsla(${p.hue},50%,70%,0)`);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 2, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
      }
    }
  }
}
