/**
 * ===================================================
 * ParticleSystem — Sistema de partículas completo
 * ===================================================
 * Pool de 40 partículas reciclables con 3 tipos:
 *
 *   AMBIENT  — Siempre presentes, flotan suavemente
 *   EMOTION  — Cambian según mood dominante
 *   EVENT    — Burst puntual para efectos especiales
 *
 * Rendimiento:
 *   - Pool pre-alocado (cero allocations en runtime)
 *   - Círculos simples (arc+fill), sin shadow/blur
 *   - Glow simulado con 2 capas concéntricas
 *   - Auto-reduce si FPS < 45
 *
 * Uso:
 *   ParticleSystem.init()
 *   ParticleSystem.update(dt)
 *   ParticleSystem.render(ctx)
 *   ParticleSystem.setMood(mood)
 *   ParticleSystem.burst(x, y, color, count)
 *   ParticleSystem.setIntensity(0-1)
 * ===================================================
 */
(function() {
  'use strict';

  // ─── Pool config ───
  var POOL_SIZE = 40;
  var pool = [];

  // ─── Type constants ───
  var T_AMBIENT  = 0;
  var T_EMOTION  = 1;
  var T_EVENT    = 2;

  // ─── Target counts ───
  var ambientTarget = 18;
  var emotionTarget = 6;
  var intensityMul  = 1.0;

  // ─── Current mood ───
  var currentMood = 'neutral';

  // ─── Mood color definitions ───
  var MOOD_COLORS = {
    neutral:   { h: 270, s: 40, l: 70 },
    happiness: { h: 45,  s: 80, l: 75 },
    sadness:   { h: 220, s: 50, l: 55 },
    fear:      { h: 280, s: 50, l: 40 },
    anger:     { h: 0,   s: 70, l: 55 },
    curiosity: { h: 170, s: 65, l: 65 },
    love:      { h: 330, s: 65, l: 72 },
    sleepy:    { h: 240, s: 30, l: 45 },
    playful:   { h: 130, s: 65, l: 65 },
    sick:      { h: 90,  s: 40, l: 50 },
    happy:     { h: 45,  s: 80, l: 75 },
    excited:   { h: 35,  s: 75, l: 70 },
    scared:    { h: 280, s: 50, l: 40 }
  };

  // ─── Mood behavior definitions ───
  var MOOD_BEHAVIOR = {
    neutral:   { vy: -12, spread: 1.0, sizeMin: 0.8, sizeMax: 2.2, alphaMax: 0.20 },
    happiness: { vy: -25, spread: 1.2, sizeMin: 1.0, sizeMax: 2.8, alphaMax: 0.35 },
    sadness:   { vy:  10, spread: 0.5, sizeMin: 1.2, sizeMax: 2.5, alphaMax: 0.18 },
    fear:      { vy: -40, spread: 2.0, sizeMin: 0.5, sizeMax: 1.5, alphaMax: 0.15 },
    anger:     { vy: -18, spread: 1.8, sizeMin: 1.0, sizeMax: 2.5, alphaMax: 0.30 },
    curiosity: { vy: -15, spread: 1.0, sizeMin: 0.8, sizeMax: 2.0, alphaMax: 0.28 },
    love:      { vy:  -8, spread: 0.6, sizeMin: 1.0, sizeMax: 3.0, alphaMax: 0.30 },
    sleepy:    { vy:  -5, spread: 0.3, sizeMin: 1.5, sizeMax: 3.0, alphaMax: 0.12 },
    playful:   { vy: -30, spread: 1.5, sizeMin: 0.8, sizeMax: 2.5, alphaMax: 0.32 },
    sick:      { vy:  -8, spread: 1.2, sizeMin: 1.0, sizeMax: 2.0, alphaMax: 0.15 },
    happy:     { vy: -25, spread: 1.2, sizeMin: 1.0, sizeMax: 2.8, alphaMax: 0.35 },
    excited:   { vy: -35, spread: 1.8, sizeMin: 0.8, sizeMax: 2.5, alphaMax: 0.35 },
    scared:    { vy: -40, spread: 2.0, sizeMin: 0.5, sizeMax: 1.5, alphaMax: 0.15 }
  };

  // ─── Performance tracking ───
  var _fpsLow = false;
  var _fpsCheckTimer = 0;
  var FPS_CHECK_INTERVAL = 3.0;

  // ─── Phase accumulator for ambient movement ───
  var _phase = 0;

  // ─── Seasonal system ───
  var _season = 'default';
  var SEASON_COLORS = {
    spring:  { h: 340, s: 70, l: 80 },   // cherry blossom pink
    summer:  { h: 45,  s: 85, l: 75 },   // golden sunshine
    autumn:  { h: 25,  s: 75, l: 55 },   // fallen leaves
    winter:  { h: 200, s: 30, l: 90 },   // snowflakes
    default: { h: 270, s: 45, l: 75 }
  };

  function detectSeason() {
    var m = new Date().getMonth(); // 0-11
    if (m >= 2 && m <= 4) return 'spring';
    if (m >= 5 && m <= 7) return 'summer';
    if (m >= 8 && m <= 10) return 'autumn';
    return 'winter';
  }

  // ──────────────────────────────────────────────
  // Particle factory (resets an existing object)
  // ──────────────────────────────────────────────

  function resetParticle(p) {
    p.x = 0; p.y = 0;
    p.vx = 0; p.vy = 0;
    p.size = 1;
    p.alpha = 0; p.maxAlpha = 0.2;
    p.h = 270; p.s = 40; p.l = 70;
    p.life = 0; p.maxLife = 5;
    p.type = T_AMBIENT;
    p.active = false;
    p.phase = Math.random() * Math.PI * 2;
    p.orbit = false;
    p.orbitAngle = 0;
    p.orbitDist = 0;
    p.orbitSpeed = 0;
    return p;
  }

  function initPool() {
    pool = new Array(POOL_SIZE);
    for (var i = 0; i < POOL_SIZE; i++) {
      pool[i] = resetParticle({});
    }
  }

  // ──────────────────────────────────────────────
  // Get a free particle from pool
  // ──────────────────────────────────────────────

  function acquire() {
    // First pass: find inactive
    for (var i = 0; i < POOL_SIZE; i++) {
      if (!pool[i].active) return pool[i];
    }
    // Second pass: steal oldest (highest life ratio)
    var oldest = pool[0];
    var oldestRatio = 0;
    for (var j = 0; j < POOL_SIZE; j++) {
      var ratio = pool[j].life / pool[j].maxLife;
      if (ratio > oldestRatio) {
        oldestRatio = ratio;
        oldest = pool[j];
      }
    }
    return resetParticle(oldest);
  }

  // ──────────────────────────────────────────────
  // Spawn ambient particle
  // ──────────────────────────────────────────────

  function spawnAmbient(randomY) {
    var G = window.GAME;
    if (!G || G.width === 0) return;

    var p = acquire();
    resetParticle(p);

    p.type = T_AMBIENT;
    p.active = true;
    p.x = Math.random() * G.width;
    p.y = randomY ? Math.random() * G.height : G.height + 10;
    p.vx = (Math.random() - 0.5) * 6;
    p.vy = -(Math.random() * 12 + 4);
    p.size = Math.random() * 1.8 + 0.6;
    p.maxAlpha = Math.random() * 0.18 + 0.05;
    p.maxLife = Math.random() * 8 + 4;
    // Seasonal tint for ambient particles
    var sc = SEASON_COLORS[_season] || SEASON_COLORS.default;
    p.h = sc.h + (Math.random() - 0.5) * 30;
    p.s = sc.s + (Math.random() - 0.5) * 15;
    p.l = sc.l + (Math.random() - 0.5) * 10;

    // Seasonal behavior
    if (_season === 'autumn') {
      p.vx = (Math.random() - 0.3) * 15; // drift right like wind
      p.vy = Math.random() * 8 + 3;       // fall down (leaves)
      p.size = Math.random() * 2.5 + 1;
    } else if (_season === 'winter') {
      p.vx = (Math.random() - 0.5) * 8;
      p.vy = Math.random() * 5 + 1;       // gentle snowfall
      p.size = Math.random() * 2 + 0.8;
      p.maxAlpha = Math.random() * 0.3 + 0.1;
    } else if (_season === 'spring') {
      p.vy = -(Math.random() * 6 + 2);    // float up (petals)
      p.size = Math.random() * 2.2 + 0.8;
    }
    // summer uses default upward float
  }

  // ──────────────────────────────────────────────
  // Spawn emotion particle
  // ──────────────────────────────────────────────

  function spawnEmotion() {
    var G = window.GAME;
    if (!G || G.width === 0) return;

    var p = acquire();
    resetParticle(p);

    var mc = MOOD_COLORS[currentMood] || MOOD_COLORS.neutral;
    var mb = MOOD_BEHAVIOR[currentMood] || MOOD_BEHAVIOR.neutral;

    p.type = T_EMOTION;
    p.active = true;
    p.h = mc.h + (Math.random() - 0.5) * 20;
    p.s = mc.s + (Math.random() - 0.5) * 10;
    p.l = mc.l + (Math.random() - 0.5) * 10;

    // Position: near creature or random depending on mood
    var cx = G.centerX;
    var cy = G.centerY;
    if (window.Creature) {
      cx = window.Creature.x || cx;
      cy = window.Creature.y || cy;
    }

    // Love particles orbit the creature
    if (currentMood === 'love') {
      p.orbit = true;
      p.orbitAngle = Math.random() * Math.PI * 2;
      p.orbitDist = (window.Creature ? window.Creature.radius || 60 : 60) * (1.5 + Math.random() * 1.5);
      p.orbitSpeed = (Math.random() > 0.5 ? 1 : -1) * (0.3 + Math.random() * 0.5);
      p.x = cx + Math.cos(p.orbitAngle) * p.orbitDist;
      p.y = cy + Math.sin(p.orbitAngle) * p.orbitDist;
      p.vx = 0; p.vy = 0;
    } else {
      var spread = mb.spread;
      var spawnRadius = 80 + Math.random() * 120 * spread;
      var angle = Math.random() * Math.PI * 2;
      p.x = cx + Math.cos(angle) * spawnRadius;
      p.y = cy + Math.sin(angle) * spawnRadius;
      p.vx = (Math.random() - 0.5) * 10 * spread;
      p.vy = mb.vy + (Math.random() - 0.5) * 8;
    }

    // Fear particles fly outward fast
    if (currentMood === 'fear' || currentMood === 'scared') {
      var dx = p.x - cx;
      var dy = p.y - cy;
      var d = Math.sqrt(dx * dx + dy * dy) || 1;
      p.vx = (dx / d) * 40 * mb.spread;
      p.vy = (dy / d) * 40 * mb.spread;
    }

    // Sadness: drip downward
    if (currentMood === 'sadness' || currentMood === 'sad') {
      p.x = cx + (Math.random() - 0.5) * 60;
      p.y = cy - 20;
      p.vx = (Math.random() - 0.5) * 3;
      p.vy = 10 + Math.random() * 15;
    }

    p.size = mb.sizeMin + Math.random() * (mb.sizeMax - mb.sizeMin);
    p.maxAlpha = mb.alphaMax * (0.6 + Math.random() * 0.4);
    p.maxLife = 2 + Math.random() * 4;
  }

  // ──────────────────────────────────────────────
  // Spawn event (burst) particle
  // ──────────────────────────────────────────────

  function spawnEvent(x, y, h, s, l) {
    var p = acquire();
    resetParticle(p);

    p.type = T_EVENT;
    p.active = true;
    p.x = x;
    p.y = y;
    p.h = h; p.s = s; p.l = l;

    var angle = Math.random() * Math.PI * 2;
    var speed = 30 + Math.random() * 100;
    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed - 30; // Bias upward
    p.size = 1.5 + Math.random() * 3;
    p.maxAlpha = 0.4 + Math.random() * 0.4;
    p.maxLife = 0.8 + Math.random() * 1.5;
  }

  // ──────────────────────────────────────────────
  // Count active by type
  // ──────────────────────────────────────────────

  function countActive(type) {
    var count = 0;
    for (var i = 0; i < POOL_SIZE; i++) {
      if (pool[i].active && pool[i].type === type) count++;
    }
    return count;
  }

  // ══════════════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════════════

  window.ParticleSystem = {

    init: function() {
      initPool();
      _phase = 0;
      currentMood = 'neutral';
      intensityMul = 1.0;
      _fpsLow = false;
      _fpsCheckTimer = 0;

      // Seed some ambient particles
      for (var i = 0; i < ambientTarget; i++) {
        spawnAmbient(true);
      }

      _season = detectSeason();
      console.log('[ParticleSystem] Initialized — pool:', POOL_SIZE, '— season:', _season);
    },

    update: function(dt) {
      var G = window.GAME;
      if (!G) return;

      _phase += dt;

      // ── Performance check ──
      _fpsCheckTimer += dt;
      if (_fpsCheckTimer >= FPS_CHECK_INTERVAL) {
        _fpsCheckTimer -= FPS_CHECK_INTERVAL;
        _fpsLow = G.fps > 0 && G.fps < 45;
      }

      var effectiveAmbient = _fpsLow
        ? Math.round(ambientTarget * 0.5)
        : Math.round(ambientTarget * intensityMul);

      var effectiveEmotion = _fpsLow
        ? Math.round(emotionTarget * 0.3)
        : Math.round(emotionTarget * intensityMul);

      // ── Spawn ambient if needed ──
      var ambCount = countActive(T_AMBIENT);
      if (ambCount < effectiveAmbient) {
        spawnAmbient(false);
      }

      // ── Spawn emotion if living and needed ──
      if (G.state === 'living' && currentMood !== 'neutral') {
        var emoCount = countActive(T_EMOTION);
        if (emoCount < effectiveEmotion && Math.random() < dt * 2) {
          spawnEmotion();
        }
      }

      // ── Auto-sync mood from EmotionSystem ──
      if (G.state === 'living' && window.EmotionSystem) {
        var dom = window.EmotionSystem.getDominant();
        if (dom !== currentMood) {
          currentMood = dom;
        }
      }

      // ── Update all particles ──
      var cx = G.centerX;
      var cy = G.centerY;
      if (window.Creature && G.state === 'living') {
        cx = window.Creature.x || cx;
        cy = window.Creature.y || cy;
      }

      for (var i = 0; i < POOL_SIZE; i++) {
        var p = pool[i];
        if (!p.active) continue;

        p.life += dt;

        // Kill expired
        if (p.life >= p.maxLife) {
          p.active = false;
          continue;
        }

        // Orbit behavior (love)
        if (p.orbit) {
          p.orbitAngle += p.orbitSpeed * dt;
          var tx = cx + Math.cos(p.orbitAngle) * p.orbitDist;
          var ty = cy + Math.sin(p.orbitAngle) * p.orbitDist;
          p.x += (tx - p.x) * dt * 3;
          p.y += (ty - p.y) * dt * 3;
        } else {
          // Physics
          p.x += p.vx * dt;
          p.y += p.vy * dt;

          // Ambient: sinusoidal drift
          if (p.type === T_AMBIENT) {
            p.x += Math.sin(_phase * 0.5 + p.phase + i * 0.37) * 0.4;
          }

          // Event: gravity
          if (p.type === T_EVENT) {
            p.vy += 80 * dt;
          }

          // Emotion: slight drag
          if (p.type === T_EMOTION) {
            p.vx *= (1 - dt * 0.8);
            p.vy *= (1 - dt * 0.5);
          }
        }

        // Alpha envelope: fade in → sustain → fade out
        var lr = p.life / p.maxLife;
        if (lr < 0.12) {
          p.alpha = p.maxAlpha * (lr / 0.12);
        } else if (lr > 0.75) {
          p.alpha = p.maxAlpha * ((1 - lr) / 0.25);
        } else {
          p.alpha = p.maxAlpha;
        }

        // Bounds kill (ambient and emotion only)
        if (p.type !== T_EVENT) {
          if (p.y < -20 || p.y > G.height + 20 ||
              p.x < -20 || p.x > G.width + 20) {
            p.active = false;
          }
        } else {
          // Event particles die at screen edge
          if (p.y > G.height + 30 || p.x < -30 || p.x > G.width + 30 || p.y < -30) {
            p.active = false;
          }
        }
      }
    },

    render: function(ctx) {
      for (var i = 0; i < POOL_SIZE; i++) {
        var p = pool[i];
        if (!p.active || p.alpha < 0.01) continue;

        var colorStr = 'hsla(' + Math.round(p.h) + ',' +
                       Math.round(p.s) + '%,' +
                       Math.round(p.l) + '%,';

        // Layer 1: Soft glow (larger, dimmer)
        if (p.size > 1.2 && p.alpha > 0.08) {
          ctx.globalAlpha = p.alpha * 0.3;
          ctx.fillStyle = colorStr + (p.alpha * 0.3) + ')';
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 2.2, 0, Math.PI * 2);
          ctx.fill();
        }

        // Layer 2: Core particle
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = colorStr + p.alpha + ')';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
    },

    /**
     * Set the emotional mood (changes emotion particle type)
     * @param {string} mood
     */
    setMood: function(mood) {
      if (MOOD_COLORS[mood]) {
        currentMood = mood;
      }
    },

    /**
     * Particle burst at position (for events: hatching, feeding, etc)
     * @param {number} x — center X
     * @param {number} y — center Y
     * @param {string} color — 'h,s,l' or {h,s,l} object
     * @param {number} count — how many particles (capped by pool)
     */
    burst: function(x, y, color, count) {
      var h = 270, s = 60, l = 70;

      if (typeof color === 'object' && color !== null) {
        h = color.h || 270;
        s = color.s || 60;
        l = color.l || 70;
      } else if (typeof color === 'string') {
        var parts = color.split(',');
        if (parts.length >= 3) {
          h = parseFloat(parts[0]) || 270;
          s = parseFloat(parts[1]) || 60;
          l = parseFloat(parts[2]) || 70;
        }
      }

      var n = Math.min(count || 8, 15); // Cap at 15 per burst
      for (var i = 0; i < n; i++) {
        spawnEvent(x, y,
          h + (Math.random() - 0.5) * 20,
          s + (Math.random() - 0.5) * 10,
          l + (Math.random() - 0.5) * 15
        );
      }
    },

    /**
     * Set ambient particle intensity (0-1)
     * 0 = minimal particles, 1 = full density
     * @param {number} v
     */
    setIntensity: function(v) {
      intensityMul = Math.max(0.1, Math.min(1.5, v));
    },

    /**
     * Get pool stats for debug
     */
    getStats: function() {
      return {
        ambient: countActive(T_AMBIENT),
        emotion: countActive(T_EMOTION),
        event:   countActive(T_EVENT),
        total:   countActive(T_AMBIENT) + countActive(T_EMOTION) + countActive(T_EVENT),
        pool:    POOL_SIZE
      };
    }
  };

})();
