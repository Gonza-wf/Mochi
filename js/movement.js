/**
 * ===================================================
 * Movement — Sistema de Movimiento Orgánico Avanzado
 * ===================================================
 * Transforma el movimiento robótico en movimiento vivo:
 * - Curvas bezier en vez de líneas rectas
 * - Micro-movimientos orgánicos (nunca estático)
 * - Peso/inercia variable por emoción
 * - Rotación dinámica por velocidad
 * - Animaciones de transición (crouch → move → overshoot)
 * - Trail visual en movimiento rápido
 * - Gravedad emocional (zonas preferidas)
 * ===================================================
 */
(function() {
  'use strict';

  // ═══════════════════════════════════════════
  //  MICRO-MOVEMENTS — organic idle jitter
  // ═══════════════════════════════════════════

  var micro = {
    // Layer 1: lateral sway (slow)
    swayPhase: Math.random() * 6.28,
    swaySpeed: 0.7,
    swayAmp: 0,

    // Layer 2: vertical bob (medium)
    bobPhase: Math.random() * 6.28,
    bobSpeed: 1.3,
    bobAmp: 0,

    // Layer 3: drift (very slow, random direction changes)
    driftX: 0,
    driftY: 0,
    driftTX: 0,
    driftTY: 0,
    driftTimer: 0,

    // Combined output
    offsetX: 0,
    offsetY: 0
  };

  // ═══════════════════════════════════════════
  //  BEZIER CURVE PATH
  // ═══════════════════════════════════════════

  var curve = {
    active: false,
    startX: 0, startY: 0,
    cp1X: 0, cp1Y: 0,      // control point 1
    cp2X: 0, cp2Y: 0,      // control point 2
    endX: 0, endY: 0,
    t: 0,                   // progress 0-1
    speed: 0.4,             // how fast to traverse
    lastTargetX: -1,
    lastTargetY: -1
  };

  // ═══════════════════════════════════════════
  //  ROTATION
  // ═══════════════════════════════════════════

  var rotation = {
    current: 0,       // current angle in radians
    target: 0,        // target angle
    velocity: 0,      // angular velocity for overshoot
    maxTilt: 0.25     // max radians (~14 degrees)
  };

  // ═══════════════════════════════════════════
  //  TRANSITION ANIMATIONS
  // ═══════════════════════════════════════════

  var transition = {
    state: 'idle',    // 'idle' | 'crouch' | 'moving' | 'arriving' | 'overshoot'
    timer: 0,
    crouchScale: 1,   // Y scale during crouch
    crouchX: 1,        // X scale during crouch (widens)
    prevSpeed: 0,
    wasMoving: false
  };

  // ═══════════════════════════════════════════
  //  EMOTIONAL WEIGHT / INERTIA
  // ═══════════════════════════════════════════

  var weight = {
    mass: 1.0,         // 0.5 (light) to 2.0 (heavy)
    bounciness: 0.4,   // border bounce multiplier
    accelMul: 1.0,     // acceleration multiplier
    dampingMul: 1.0    // damping multiplier
  };

  // ═══════════════════════════════════════════
  //  TRAIL (visual speed feedback)
  // ═══════════════════════════════════════════

  var TRAIL_MAX = 12;
  var trail = [];
  var trailTimer = 0;
  var trailSpawnRate = 0.03; // seconds between trail dots

  for (var i = 0; i < TRAIL_MAX; i++) {
    trail.push({ x: 0, y: 0, alpha: 0, size: 0, active: false });
  }
  var trailIdx = 0;

  // ═══════════════════════════════════════════
  //  EMOTIONAL GRAVITY ZONES
  // ═══════════════════════════════════════════

  var gravity = {
    targetY: 0.55,     // normalized Y position (0=top, 1=bottom)
    targetX: 0.5,      // normalized X position
    strength: 0.3,     // how strongly it pulls
    timer: 0
  };

  // ═══════════════════════════════════════════
  //  HELPER: cubic bezier evaluation
  // ═══════════════════════════════════════════

  function bezierPoint(t, p0, p1, p2, p3) {
    var t2 = t * t;
    var t3 = t2 * t;
    var mt = 1 - t;
    var mt2 = mt * mt;
    var mt3 = mt2 * mt;
    return mt3 * p0 + 3 * mt2 * t * p1 + 3 * mt * t2 * p2 + t3 * p3;
  }

  function bezierTangent(t, p0, p1, p2, p3) {
    var mt = 1 - t;
    return 3 * mt * mt * (p1 - p0) + 6 * mt * t * (p2 - p1) + 3 * t * t * (p3 - p2);
  }

  // ═══════════════════════════════════════════
  //  MAIN MODULE
  // ═══════════════════════════════════════════

  window.Movement = {

    // Read-only outputs for creature.js
    get rotation() { return rotation.current; },
    get crouchScaleX() { return transition.crouchX; },
    get crouchScaleY() { return transition.crouchScale; },
    get microOffsetX() { return micro.offsetX; },
    get microOffsetY() { return micro.offsetY; },
    get isMovingFast() { return transition.state === 'moving' && transition.prevSpeed > 80; },

    init: function() {
      micro.swayPhase = Math.random() * 6.28;
      micro.bobPhase = Math.random() * 6.28;
      micro.driftTimer = 0;
      micro.offsetX = 0;
      micro.offsetY = 0;

      curve.active = false;
      curve.lastTargetX = -1;
      curve.lastTargetY = -1;

      rotation.current = 0;
      rotation.target = 0;
      rotation.velocity = 0;

      transition.state = 'idle';
      transition.timer = 0;
      transition.crouchScale = 1;
      transition.crouchX = 1;

      trail.forEach(function(t) { t.active = false; t.alpha = 0; });

      console.log('[Movement] Initialized');
    },

    update: function(dt) {
      var P = window.CreaturePhysics;
      if (!P) return;

      var G = window.GAME;
      var speed = Math.sqrt(P.vx * P.vx + P.vy * P.vy);

      // ─────────────────────────────────────
      // 1. EMOTIONAL WEIGHT
      // ─────────────────────────────────────
      this._updateWeight(dt);

      // ─────────────────────────────────────
      // 2. MICRO-MOVEMENTS (always active)
      // ─────────────────────────────────────
      this._updateMicro(dt, speed);

      // ─────────────────────────────────────
      // 3. BEZIER CURVE PATHING
      // ─────────────────────────────────────
      this._updateCurve(dt, P);

      // ─────────────────────────────────────
      // 4. DYNAMIC ROTATION
      // ─────────────────────────────────────
      this._updateRotation(dt, P, speed);

      // ─────────────────────────────────────
      // 5. TRANSITION ANIMATIONS
      // ─────────────────────────────────────
      this._updateTransitions(dt, speed, P);

      // ─────────────────────────────────────
      // 6. EMOTIONAL GRAVITY
      // ─────────────────────────────────────
      this._updateGravity(dt, P);

      // ─────────────────────────────────────
      // 7. TRAIL
      // ─────────────────────────────────────
      this._updateTrail(dt, P, speed);

      // ─────────────────────────────────────
      // 8. APPLY WEIGHT TO PHYSICS
      // ─────────────────────────────────────
      // Modify physics damping based on emotional weight
      // Heavier = more damping, lighter = less
      var baseDamp = 0.91;
      var modDamp = baseDamp + (weight.mass - 1.0) * 0.025;
      // We apply this through CreaturePhysics.springMul adjustment
      // Heavy creatures have slower springs
      if (!P._movementApplied) {
        P._origSpringMul = P.springMul;
        P._movementApplied = true;
      }

      // Apply micro-movements as gentle forces when idle
      if (speed < 15) {
        P.applyForce(micro.offsetX * 0.5 * dt * 60, micro.offsetY * 0.5 * dt * 60);
      }
    },

    render: function(ctx) {
      this._renderTrail(ctx);
    },

    // ═══════════════════════════════════════════
    //  WEIGHT SYSTEM
    // ═══════════════════════════════════════════

    _updateWeight: function(dt) {
      var mood = window.EmotionSystem ? window.EmotionSystem.getDominant() : 'neutral';

      var targetMass = 1.0;
      var targetBounce = 0.4;
      var targetAccel = 1.0;

      switch (mood) {
        case 'happiness': case 'happy':
          targetMass = 0.7; targetBounce = 0.6; targetAccel = 1.3; break;
        case 'playful': case 'excited':
          targetMass = 0.55; targetBounce = 0.75; targetAccel = 1.5; break;
        case 'sadness': case 'sad':
          targetMass = 1.6; targetBounce = 0.15; targetAccel = 0.5; break;
        case 'sleepy':
          targetMass = 1.8; targetBounce = 0.1; targetAccel = 0.3; break;
        case 'fear': case 'scared':
          targetMass = 0.5; targetBounce = 0.5; targetAccel = 1.8; break;
        case 'anger':
          targetMass = 1.1; targetBounce = 0.55; targetAccel = 1.4; break;
        case 'curiosity':
          targetMass = 0.8; targetBounce = 0.45; targetAccel = 1.2; break;
        case 'love':
          targetMass = 0.9; targetBounce = 0.35; targetAccel = 0.9; break;
      }

      var wLerp = Math.min(1, dt * 1.5);
      weight.mass += (targetMass - weight.mass) * wLerp;
      weight.bounciness += (targetBounce - weight.bounciness) * wLerp;
      weight.accelMul += (targetAccel - weight.accelMul) * wLerp;
    },

    // ═══════════════════════════════════════════
    //  MICRO-MOVEMENTS
    // ═══════════════════════════════════════════

    _updateMicro: function(dt, speed) {
      var G = window.GAME;
      var baseAmp = G.width * 0.003; // proportional to screen

      // Reduce micro-movements when moving fast
      var speedDampen = Math.max(0.05, 1 - speed / 200);

      // Layer 1: Lateral sway
      micro.swayPhase += dt * micro.swaySpeed;
      var swayAmp = baseAmp * 1.2 * speedDampen;

      // Layer 2: Vertical bob
      micro.bobPhase += dt * micro.bobSpeed;
      var bobAmp = baseAmp * 0.6 * speedDampen;

      // Layer 3: Random drift (changes direction every 2-5 seconds)
      micro.driftTimer += dt;
      if (micro.driftTimer > 2 + Math.random() * 3) {
        micro.driftTimer = 0;
        micro.driftTX = (Math.random() - 0.5) * baseAmp * 2;
        micro.driftTY = (Math.random() - 0.5) * baseAmp * 1.5;
      }
      var dLerp = Math.min(1, dt * 0.8);
      micro.driftX += (micro.driftTX - micro.driftX) * dLerp;
      micro.driftY += (micro.driftTY - micro.driftY) * dLerp;

      // Combine all layers
      micro.offsetX = Math.sin(micro.swayPhase) * swayAmp
                    + Math.sin(micro.swayPhase * 0.37 + 1.7) * swayAmp * 0.3
                    + micro.driftX * speedDampen;

      micro.offsetY = Math.sin(micro.bobPhase) * bobAmp
                    + Math.cos(micro.bobPhase * 0.61 + 2.3) * bobAmp * 0.4
                    + micro.driftY * speedDampen;

      // Mood affects micro-movement intensity
      var mood = window.EmotionSystem ? window.EmotionSystem.getDominant() : 'neutral';
      var moodMul = 1.0;
      switch (mood) {
        case 'sleepy': moodMul = 0.4; micro.swaySpeed = 0.4; micro.bobSpeed = 0.7; break;
        case 'scared': moodMul = 1.8; micro.swaySpeed = 1.8; micro.bobSpeed = 2.5; break;
        case 'playful': case 'excited': moodMul = 1.5; micro.swaySpeed = 1.0; micro.bobSpeed = 1.8; break;
        case 'sad': case 'sadness': moodMul = 0.6; micro.swaySpeed = 0.5; micro.bobSpeed = 0.8; break;
        default: micro.swaySpeed = 0.7; micro.bobSpeed = 1.3; break;
      }

      micro.offsetX *= moodMul;
      micro.offsetY *= moodMul;
    },

    // ═══════════════════════════════════════════
    //  BEZIER CURVE PATHING
    // ═══════════════════════════════════════════

    _updateCurve: function(dt, P) {
      // Detect new target
      var dx = P.targetX - curve.lastTargetX;
      var dy = P.targetY - curve.lastTargetY;
      var targetChanged = dx * dx + dy * dy > 100; // more than 10px change

      if (targetChanged && !P._movementDrag) {
        var dist = Math.sqrt(
          (P.targetX - P.x) * (P.targetX - P.x) +
          (P.targetY - P.y) * (P.targetY - P.y)
        );

        // Only use curves for medium+ distances
        if (dist > P.baseRadius * 0.8) {
          curve.active = true;
          curve.startX = P.x;
          curve.startY = P.y;
          curve.endX = P.targetX;
          curve.endY = P.targetY;
          curve.t = 0;

          // Generate curved control points
          var midX = (P.x + P.targetX) * 0.5;
          var midY = (P.y + P.targetY) * 0.5;

          // Perpendicular offset for the arc
          var perpX = -(P.targetY - P.y);
          var perpY = P.targetX - P.x;
          var perpLen = Math.sqrt(perpX * perpX + perpY * perpY) || 1;
          perpX /= perpLen;
          perpY /= perpLen;

          // Random arc direction and intensity
          var arcSign = Math.random() > 0.5 ? 1 : -1;
          var arcAmount = dist * (0.15 + Math.random() * 0.25) * arcSign;

          curve.cp1X = midX + perpX * arcAmount * 0.8;
          curve.cp1Y = midY + perpY * arcAmount * 0.8;
          curve.cp2X = midX + perpX * arcAmount * 0.4;
          curve.cp2Y = midY + perpY * arcAmount * 0.4;

          // Speed: faster for short distances, slower for long
          curve.speed = Math.max(0.3, Math.min(1.2, 150 / dist)) * weight.accelMul;
        }

        curve.lastTargetX = P.targetX;
        curve.lastTargetY = P.targetY;
      }

      // Follow curve
      if (curve.active) {
        curve.t += dt * curve.speed;

        if (curve.t >= 1) {
          curve.active = false;
          curve.t = 1;
        } else {
          // Ease in-out
          var easeT = curve.t < 0.5
            ? 2 * curve.t * curve.t
            : 1 - Math.pow(-2 * curve.t + 2, 2) / 2;

          // Calculate bezier position and set as intermediate target
          var bx = bezierPoint(easeT, curve.startX, curve.cp1X, curve.cp2X, curve.endX);
          var by = bezierPoint(easeT, curve.startY, curve.cp1Y, curve.cp2Y, curve.endY);

          // Override target with curve point
          P.targetX = bx;
          P.targetY = by;
        }
      }
    },

    // ═══════════════════════════════════════════
    //  DYNAMIC ROTATION
    // ═══════════════════════════════════════════

    _updateRotation: function(dt, P, speed) {
      // Target rotation based on horizontal velocity
      if (speed > 5) {
        // Tilt in direction of movement
        rotation.target = Math.atan2(P.vx, -Math.abs(P.vy) * 0.3) * 0.15;
        // Clamp
        rotation.target = Math.max(-rotation.maxTilt, Math.min(rotation.maxTilt, rotation.target));
      } else {
        rotation.target = 0;
      }

      // Spring toward target with overshoot
      var diff = rotation.target - rotation.current;
      rotation.velocity += diff * 8 * dt;
      rotation.velocity *= Math.pow(0.85, dt * 60); // damping
      rotation.current += rotation.velocity;

      // Add wobble on border bounce
      if (P.x <= P.baseRadius * 0.8 || P.x >= window.GAME.width - P.baseRadius * 0.8) {
        rotation.velocity += (P.vx > 0 ? -1 : 1) * 0.15;
      }
    },

    // ═══════════════════════════════════════════
    //  TRANSITION ANIMATIONS
    // ═══════════════════════════════════════════

    _updateTransitions: function(dt, speed, P) {
      var isMoving = speed > 20;
      transition.prevSpeed = speed;

      switch (transition.state) {
        case 'idle':
          // Detect start of movement → crouch first
          if (isMoving && !transition.wasMoving) {
            transition.state = 'crouch';
            transition.timer = 0;
          }
          // Settle scales back to normal
          var sLerp = Math.min(1, dt * 6);
          transition.crouchScale += (1 - transition.crouchScale) * sLerp;
          transition.crouchX += (1 - transition.crouchX) * sLerp;
          break;

        case 'crouch':
          // Quick preparation squash (100ms)
          transition.timer += dt;
          var crouchProgress = Math.min(1, transition.timer / 0.1);

          // Squash down, widen
          transition.crouchScale = 1 - 0.08 * crouchProgress;
          transition.crouchX = 1 + 0.05 * crouchProgress;

          if (transition.timer >= 0.1) {
            transition.state = 'moving';
            transition.timer = 0;
          }
          break;

        case 'moving':
          // Stretch in movement direction (handled by physics squash/stretch)
          // Gradually return crouch to normal
          var mLerp = Math.min(1, dt * 5);
          transition.crouchScale += (1 - transition.crouchScale) * mLerp;
          transition.crouchX += (1 - transition.crouchX) * mLerp;

          // Detect arrival (speed drops suddenly)
          if (!isMoving) {
            transition.state = 'overshoot';
            transition.timer = 0;
          }
          break;

        case 'overshoot':
          // Small bounce past destination then settle
          transition.timer += dt;

          // Damped oscillation
          var oscT = transition.timer * 12;
          var oscAmp = Math.exp(-transition.timer * 6);
          transition.crouchScale = 1 + Math.sin(oscT) * 0.06 * oscAmp;
          transition.crouchX = 1 - Math.sin(oscT) * 0.04 * oscAmp;

          if (transition.timer > 0.5) {
            transition.state = 'idle';
            transition.crouchScale = 1;
            transition.crouchX = 1;
          }
          break;
      }

      transition.wasMoving = isMoving;
    },

    // ═══════════════════════════════════════════
    //  EMOTIONAL GRAVITY
    // ═══════════════════════════════════════════

    _updateGravity: function(dt, P) {
      gravity.timer += dt;
      if (gravity.timer < 2) return; // update every 2 seconds
      gravity.timer = 0;

      var G = window.GAME;
      var mood = window.EmotionSystem ? window.EmotionSystem.getDominant() : 'neutral';

      // Different moods prefer different screen zones
      switch (mood) {
        case 'happiness': case 'happy':
          gravity.targetY = 0.42; gravity.targetX = 0.5; gravity.strength = 0.2; break;
        case 'sadness': case 'sad':
          gravity.targetY = 0.72; gravity.targetX = 0.5; gravity.strength = 0.4; break;
        case 'fear': case 'scared':
          // Corners
          gravity.targetY = 0.75;
          gravity.targetX = P.x < G.centerX ? 0.12 : 0.88;
          gravity.strength = 0.35; break;
        case 'playful': case 'excited':
          gravity.targetY = 0.45; gravity.targetX = 0.5; gravity.strength = 0.05; break;
        case 'sleepy':
          gravity.targetY = 0.78; gravity.targetX = 0.5; gravity.strength = 0.5; break;
        case 'love':
          gravity.targetY = 0.5; gravity.targetX = 0.5; gravity.strength = 0.15; break;
        case 'curiosity':
          gravity.targetY = 0.4; gravity.targetX = 0.5; gravity.strength = 0.08; break;
        default:
          gravity.targetY = 0.55; gravity.targetX = 0.5; gravity.strength = 0.2; break;
      }

      // Apply gentle pull toward preferred zone (only when idle-ish)
      var speed = Math.sqrt(P.vx * P.vx + P.vy * P.vy);
      if (speed < 30) {
        var gx = G.width * gravity.targetX;
        var gy = G.height * gravity.targetY;
        var gdx = gx - P.x;
        var gdy = gy - P.y;
        var gDist = Math.sqrt(gdx * gdx + gdy * gdy);

        if (gDist > P.baseRadius * 2) {
          var gForce = gravity.strength * Math.min(1, gDist / (G.width * 0.3));
          P.applyForce(
            (gdx / gDist) * gForce * 0.5,
            (gdy / gDist) * gForce * 0.5
          );
        }
      }
    },

    // ═══════════════════════════════════════════
    //  TRAIL SYSTEM
    // ═══════════════════════════════════════════

    _updateTrail: function(dt, P, speed) {
      // Fade existing trail
      for (var i = 0; i < TRAIL_MAX; i++) {
        if (trail[i].active) {
          trail[i].alpha -= dt * 3.5;
          trail[i].size *= (1 - dt * 2);
          if (trail[i].alpha <= 0) {
            trail[i].active = false;
          }
        }
      }

      // Spawn new trail dots only when moving fast
      var speedThreshold = 80;
      if (speed > speedThreshold) {
        trailTimer += dt;
        // Faster = more frequent trail dots
        var spawnRate = Math.max(0.015, trailSpawnRate * (speedThreshold / speed));

        if (trailTimer >= spawnRate) {
          trailTimer = 0;

          var t = trail[trailIdx];
          // Spawn behind the creature (opposite to velocity)
          var growthScale = window.Creature ? window.Creature.growth : 1;
          var r = P.baseRadius * growthScale;
          var normSpeed = Math.sqrt(P.vx * P.vx + P.vy * P.vy) || 1;

          t.x = P.x - (P.vx / normSpeed) * r * 0.6;
          t.y = P.y - (P.vy / normSpeed) * r * 0.6;
          t.alpha = Math.min(0.35, (speed - speedThreshold) / 400);
          t.size = r * (0.15 + Math.random() * 0.15);
          t.active = true;

          trailIdx = (trailIdx + 1) % TRAIL_MAX;
        }
      } else {
        trailTimer = 0;
      }
    },

    _renderTrail: function(ctx) {
      var hasActive = false;
      for (var i = 0; i < TRAIL_MAX; i++) {
        if (trail[i].active) { hasActive = true; break; }
      }
      if (!hasActive) return;

      // Get creature color for trail
      var c = window.Creature ? window.Creature.color : { h: 270, s: 60, l: 65 };

      ctx.save();
      for (var j = 0; j < TRAIL_MAX; j++) {
        var t = trail[j];
        if (!t.active || t.alpha < 0.01) continue;

        var grad = ctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, t.size);
        grad.addColorStop(0, 'hsla(' + Math.round(c.h) + ',' + Math.round(c.s) + '%,' +
          Math.round(c.l + 10) + '%,' + (t.alpha * 0.6) + ')');
        grad.addColorStop(1, 'hsla(' + Math.round(c.h) + ',' + Math.round(c.s) + '%,' +
          Math.round(c.l) + '%,0)');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(t.x, t.y, t.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },

    // ═══════════════════════════════════════════
    //  SERIALIZATION
    // ═══════════════════════════════════════════

    getWeight: function() {
      return { mass: weight.mass, bounce: weight.bounciness, accel: weight.accelMul };
    },

    serialize: function() {
      return {
        mass: weight.mass,
        gravY: gravity.targetY
      };
    },

    deserialize: function(data) {
      if (data) {
        if (data.mass !== undefined) weight.mass = data.mass;
        if (data.gravY !== undefined) gravity.targetY = data.gravY;
      }
    }
  };

})();
