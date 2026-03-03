/**
 * ===================================================
 * Background — Fondo dinámico emocional + ciclo día/noche
 * ===================================================
 * Gradiente radial que reacciona al estado emocional
 * de la criatura y a la hora real del dispositivo.
 *
 * Ciclo día/noche (hora local):
 *   06-08  Amanecer   (brightness ramps up, warm tint)
 *   08-18  Día        (full brightness)
 *   18-20  Atardecer  (brightness drops, orange tint)
 *   20-06  Noche      (dark, blue tint)
 *
 * Uso:
 *   Background.init()
 *   Background.update(dt)
 *   Background.render(ctx)
 * ===================================================
 */
(function() {
  'use strict';

  // ─── Default colors (dark purple theme) ───
  var DEFAULT_H = 260;
  var DEFAULT_S = 25;
  var DEFAULT_L = 12;

  // ─── Current smooth color (center and edge) ───
  var centerH = DEFAULT_H, centerS = DEFAULT_S, centerL = DEFAULT_L;
  var edgeH   = DEFAULT_H, edgeS   = DEFAULT_S - 10, edgeL = DEFAULT_L - 8;

  // ─── Target colors (we lerp toward these) ───
  var tCenterH = DEFAULT_H, tCenterS = DEFAULT_S, tCenterL = DEFAULT_L;
  var tEdgeH   = DEFAULT_H, tEdgeS   = DEFAULT_S - 10, tEdgeL = DEFAULT_L - 8;

  // ─── Day/night state ───
  var dayFactor = 1.0;       // 0.3 (night) → 1.0 (day)
  var targetDayFactor = 1.0;
  var timeHue = 0;           // Extra hue shift from time of day
  var targetTimeHue = 0;
  var timeSat = 0;           // Extra saturation shift
  var targetTimeSat = 0;

  // ─── Lerp speed ───
  var COLOR_LERP = 0.015;    // Per-frame lerp factor (slow, smooth)
  var DAY_LERP   = 0.008;    // Even slower for day/night transitions

  // ─── Cached gradient string (avoid rebuilding if unchanged) ───
  var _lastCenterStr = '';
  var _lastEdgeStr   = '';
  var _cachedCenterStr = '';
  var _cachedEdgeStr   = '';

  // ─── Time check interval (no need to check Date every frame) ───
  var _timeCheckTimer = 0;
  var TIME_CHECK_INTERVAL = 5.0; // Check real clock every 5 seconds

  // ──────────────────────────────────────────────
  // Utilities
  // ──────────────────────────────────────────────

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function lerpHue(a, b, t) {
    var diff = b - a;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    var result = a + diff * t;
    if (result < 0) result += 360;
    if (result >= 360) result -= 360;
    return result;
  }

  function clamp(v, min, max) {
    return v < min ? min : (v > max ? max : v);
  }

  /**
   * Calculate day/night factor and color tints from current hour.
   * Returns smooth values even at transition boundaries.
   */
  function updateTimeOfDay() {
    var now = new Date();
    // Fractional hour (e.g. 6:30 = 6.5)
    var hour = now.getHours() + now.getMinutes() / 60;

    if (hour >= 8 && hour < 18) {
      // ── Day ──
      targetDayFactor = 1.0;
      targetTimeHue = 0;
      targetTimeSat = 0;

    } else if (hour >= 6 && hour < 8) {
      // ── Dawn ── (6→8: ramp 0.4→1.0)
      var t = (hour - 6) / 2; // 0→1
      targetDayFactor = 0.4 + t * 0.6;
      targetTimeHue = (1 - t) * 15;   // Warm tint fading out
      targetTimeSat = (1 - t) * 8;

    } else if (hour >= 18 && hour < 20) {
      // ── Sunset ── (18→20: ramp 1.0→0.4)
      var t2 = (hour - 18) / 2; // 0→1
      targetDayFactor = 1.0 - t2 * 0.6;
      targetTimeHue = t2 * 20;        // Orange/warm shift
      targetTimeSat = t2 * 10;

    } else {
      // ── Night ── (20→6)
      targetDayFactor = 0.3;
      targetTimeHue = -15;  // Blue shift
      targetTimeSat = -8;   // Desaturate
    }
  }

  /**
   * Compute target colors from emotion + time of day
   */
  function computeTargetColors() {
    var emoH = DEFAULT_H;
    var emoS = DEFAULT_S;
    var emoL = DEFAULT_L;

    // Get emotion color if available
    if (window.EmotionSystem && window.GAME && window.GAME.state === 'living') {
      var ec = window.EmotionSystem.getColor();
      // Derive background from emotion: much darker and more desaturated
      emoH = ec.h;
      emoS = clamp(ec.s * 0.35, 8, 35);    // Heavy desaturation
      emoL = clamp(ec.l * 0.22, 5, 18);     // Very dark
    }

    // Apply time-of-day modifications
    var finalH = emoH + timeHue;
    var finalS = clamp(emoS + timeSat, 5, 40);

    // Center: slightly lighter
    tCenterL = clamp(emoL + 10 * dayFactor, 6, 22);
    tCenterS = finalS;
    tCenterH = finalH;

    // Edge: darker and less saturated
    tEdgeL = clamp(emoL - 4, 2, 12);
    tEdgeS = clamp(finalS - 10, 3, 25);
    tEdgeH = finalH;
  }

  /**
   * Build HSL string (avoid allocation if unchanged)
   */
  function hsl(h, s, l) {
    return 'hsl(' + Math.round(h) + ',' + Math.round(s) + '%,' + Math.round(l) + '%)';
  }

  // ══════════════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════════════

  window.Background = {

    init: function() {
      // Set initial time-based values immediately
      updateTimeOfDay();
      dayFactor = targetDayFactor;
      timeHue = targetTimeHue;
      timeSat = targetTimeSat;

      computeTargetColors();

      // Snap to target (no lerp on first frame)
      centerH = tCenterH; centerS = tCenterS; centerL = tCenterL;
      edgeH = tEdgeH;     edgeS = tEdgeS;     edgeL = tEdgeL;

      _timeCheckTimer = 0;

      console.log('[Background] Initialized — dayFactor:', dayFactor.toFixed(2));
    },

    update: function(dt) {
      // Check real clock periodically
      _timeCheckTimer += dt;
      if (_timeCheckTimer >= TIME_CHECK_INTERVAL) {
        _timeCheckTimer -= TIME_CHECK_INTERVAL;
        updateTimeOfDay();
      }

      // Smooth day/night transitions
      var dlf = Math.min(1, DAY_LERP * dt * 60);
      dayFactor = lerp(dayFactor, targetDayFactor, dlf);
      timeHue = lerp(timeHue, targetTimeHue, dlf);
      timeSat = lerp(timeSat, targetTimeSat, dlf);

      // Recompute target colors from emotion + time
      computeTargetColors();

      // Smooth color transitions
      var clf = Math.min(1, COLOR_LERP * dt * 60);
      centerH = lerpHue(centerH, tCenterH, clf);
      centerS = lerp(centerS, tCenterS, clf);
      centerL = lerp(centerL, tCenterL, clf);

      edgeH = lerpHue(edgeH, tEdgeH, clf);
      edgeS = lerp(edgeS, tEdgeS, clf);
      edgeL = lerp(edgeL, tEdgeL, clf);
    },

    render: function(ctx) {
      var G = window.GAME;

      // Build color strings
      var cStr = hsl(centerH, centerS, centerL);
      var eStr = hsl(edgeH, edgeS, edgeL);

      // Radial gradient from center-bottom toward edges
      var cx = G.centerX;
      var cy = G.centerY * 1.15;
      var outerR = Math.max(G.width, G.height) * 0.85;

      var grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, outerR);
      grad.addColorStop(0, cStr);
      grad.addColorStop(0.6, eStr);
      grad.addColorStop(1, '#0a0a0f');

      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, G.width, G.height);

      // Subtle secondary vignette (soft darkening at very edges)
      var vig = ctx.createRadialGradient(cx, cy, outerR * 0.5, cx, cy, outerR * 1.1);
      vig.addColorStop(0, 'rgba(0,0,0,0)');
      vig.addColorStop(1, 'rgba(0,0,0,0.25)');
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, G.width, G.height);
    },

    /**
     * Get current day factor (0.3 night → 1.0 day)
     */
    getDayFactor: function() {
      return dayFactor;
    },

    /**
     * Check if currently night time
     */
    isNight: function() {
      return dayFactor < 0.5;
    }
  };

})();
