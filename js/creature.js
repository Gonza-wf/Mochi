/**
 * ===================================================
 * Creature — Módulo principal + sistema de crecimiento
 * ===================================================
 * Fachada que une CreaturePhysics + CreatureAI.
 * La criatura nace pequeña (35% tamaño) y crece
 * muy lentamente hasta tamaño completo (~9h de juego).
 * ===================================================
 */
(function() {
  'use strict';

  var HAIR_MAX_SEGS = 4;

  // ─── Growth system ───
  var GROWTH_BABY = 0.35;
  var GROWTH_MAX = 1.0;
  var GROWTH_RATE = 0.00002; // per second → ~0.072/hour → ~9h from baby to adult
  var growthScale = GROWTH_BABY;

  // ─── Color state ───
  var color = { h: 270, s: 60, l: 65 };
  var tColor = { h: 270, s: 60, l: 65 };
  var name = 'Mochi';

  // ─── Interaction state ───
  var touchOnCreature = false;
  var isDragging = false;
  var isBeingHeld = false;
  var holdTimer = 0;
  var isPurring = false;
  var purrPhase = 0;
  var dragOX = 0, dragOY = 0;

  // ─── Sound glow effect ───
  var soundGlowAlpha = 0;
  var soundGlowColor = '224, 170, 255';

  // ─── Sound pop effect ───
  var soundPopScale = 0;      // 0 = no pop, peaks at ~0.15
  var soundPopPhase = 0;      // animation phase
  var soundPopActive = false;

  // ─── Finger reaction (emotion-based) ───
  var _foodChaseTimer = 0;
  var _foodChaseAngered = false;
  var _foodChaseCooldown = 0;

  // ─── Eye state (particle eyes) ───
  var eyes = {
    lx: -0.25, ly: -0.15, rx: 0.25, ry: -0.15,
    tlx: -0.25, tly: -0.15, trx: 0.25, try_: -0.15,
    lookX: 0, lookY: 0, clx: 0, cly: 0,
    blinkT: 0, blinking: false, nextBlink: 3,
    pupil: 1.0, tPupil: 1.0, alpha: 0.85
  };

  // ─── Accelerometer state ───
  var accelEnabled = false;
  var accelX = 0, accelY = 0;

  // ─── Cached color strings ───
  var cBody = '';
  var cLight = '';
  var cDark = '';
  var cHair = '';
  var cGlow = '';

  function rebuildColors() {
    var h = Math.round(color.h);
    var s = Math.round(color.s);
    var l = Math.round(color.l);
    cBody  = 'hsl(' + h + ',' + s + '%,' + l + '%)';
    cLight = 'hsl(' + h + ',' + s + '%,' + Math.min(95, l + 18) + '%)';
    cDark  = 'hsl(' + h + ',' + Math.max(0, s - 5) + '%,' + Math.max(10, l - 22) + '%)';
    cHair  = 'hsl(' + h + ',' + Math.max(0, s - 8) + '%,' + Math.max(10, l - 15) + '%)';
    cGlow  = 'hsla(' + h + ',' + s + '%,' + l + '%,';
  }

  // ─── Hit test (uses growthScale) ───
  function isInside(px, py) {
    var P = window.CreaturePhysics;
    if (!P) return false;
    var dx = px - P.x;
    var dy = py - P.y;
    var r = P.baseRadius * growthScale * 1.3;
    return dx * dx + dy * dy <= r * r;
  }

  // ─── Input callbacks ───
  var _cbTap, _cbDown, _cbDrag, _cbHold, _cbRelease;

  function vibrate(pattern) {
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch(e) {}
  }

  function onTap(e) {
    if (window.GAME.state !== 'living') return;
    if (!isInside(e.x, e.y)) return;
    var P = window.CreaturePhysics;
    P.applyForce(0, -100);
    P.setTouch(e.x, e.y, -2.5);
    vibrate(25);
  }

  function onDown(e) {
    if (window.GAME.state !== 'living') return;
    if (!isInside(e.x, e.y)) return;
    var P = window.CreaturePhysics;
    vibrate(15);
    touchOnCreature = true;
    dragOX = P.x - e.x;
    dragOY = P.y - e.y;
    holdTimer = 0;
    isBeingHeld = true;
    isPurring = false;
    purrPhase = 0;
    window.CreatureAI.interacting = true;
  }

  function onDrag(e) {
    if (window.GAME.state !== 'living') return;
    var P = window.CreaturePhysics;
    if (touchOnCreature) {
      isDragging = true;
      P.targetX = e.x + dragOX;
      P.targetY = e.y + dragOY;
      P.springMul = 4;
      isBeingHeld = false;
      isPurring = false;
    } else if (isInside(e.x, e.y)) {
      P.setTouch(e.x, e.y, 1.8);
    }
  }

  function onHold(e) {
    if (window.GAME.state !== 'living') return;
    if (!touchOnCreature) return;
    isBeingHeld = true;
  }

  function onRelease(e) {
    if (window.GAME.state !== 'living') return;
    if (isDragging) {
      var P = window.CreaturePhysics;
      var vel = window.InputSystem.getVelocity();
      P.applyForce(vel.x * 0.12, vel.y * 0.12);
      P.targetX = P.x;
      P.targetY = P.y;
      P.springMul = 1;
    }
    touchOnCreature = false;
    isDragging = false;
    isBeingHeld = false;
    isPurring = false;
    holdTimer = 0;
    window.CreatureAI.interacting = false;
  }

  // ─── Rendering helpers ───

  function renderShadow(ctx) {
    var P = window.CreaturePhysics;
    var G = window.GAME;
    var groundY = G.height - 25;
    var distG = groundY - P.y;
    var sSc = Math.max(0.3, 1 - distG / G.height * 0.6);
    var sA = Math.max(0.04, 0.15 * sSc);

    ctx.save();
    ctx.translate(P.x, groundY);
    ctx.scale(sSc * 1.3 * growthScale, 0.12 * growthScale);
    ctx.beginPath();
    ctx.arc(0, 0, P.baseRadius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,' + sA + ')';
    ctx.fill();
    ctx.restore();
  }

  function renderGlow(ctx) {
    var P = window.CreaturePhysics;
    var r = P.baseRadius * P.breathScale * growthScale;
    var glowR = r * 2.5;

    ctx.save();
    ctx.translate(P.x, P.y);
    var grad = ctx.createRadialGradient(0, 0, r * 0.6, 0, 0, glowR);
    grad.addColorStop(0, cGlow + '0.08)');
    grad.addColorStop(1, cGlow + '0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, glowR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // ── Sound glow pulse ──
    if (soundGlowAlpha > 0.01) {
      ctx.save();
      ctx.translate(P.x, P.y);
      var sgR = r * (2.0 + soundGlowAlpha * 1.5);
      var sgGrad = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, sgR);
      sgGrad.addColorStop(0, 'rgba(' + soundGlowColor + ',' + (soundGlowAlpha * 0.35) + ')');
      sgGrad.addColorStop(0.5, 'rgba(' + soundGlowColor + ',' + (soundGlowAlpha * 0.12) + ')');
      sgGrad.addColorStop(1, 'rgba(' + soundGlowColor + ',0)');
      ctx.fillStyle = sgGrad;
      ctx.beginPath();
      ctx.arc(0, 0, sgR, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function renderBody(ctx) {
    var P = window.CreaturePhysics;
    var r = P.baseRadius * P.breathScale;

    ctx.save();
    ctx.translate(P.x, P.y);

    // Movement micro-offsets (organic jitter)
    var M = window.Movement;
    var mvOX = M ? M.microOffsetX : 0;
    var mvOY = M ? M.microOffsetY : 0;
    var mvRot = M ? M.rotation : 0;
    var mvCX = M ? M.crouchScaleX : 1;
    var mvCY = M ? M.crouchScaleY : 1;

    // Body language modifiers from Intelligence
    var bm = window.Intelligence ? window.Intelligence.getBodyModifiers() : null;
    var bmSX = bm ? bm.scaleX : 1;
    var bmSY = bm ? bm.scaleY : 1;
    var bmOX = bm ? bm.offsetX : 0;
    var bmOY = bm ? bm.offsetY : 0;
    var bmRot = bm ? bm.rotation : 0;

    ctx.translate(bmOX + mvOX, bmOY + mvOY);
    ctx.rotate(bmRot + mvRot);

    // Apply growth scale + sound pop + body language + movement crouch
    var popMul = 1 + soundPopScale;
    ctx.scale(P.scaleX * growthScale * popMul * bmSX * mvCX, P.scaleY * growthScale * popMul * bmSY * mvCY);

    if (isPurring) {
      ctx.translate(
        Math.sin(purrPhase * 25) * 1.2,
        Math.cos(purrPhase * 19) * 0.8
      );
    }

    var grad = ctx.createRadialGradient(
      -r * 0.2, -r * 0.25, r * 0.08,
      0, 0, r
    );
    grad.addColorStop(0, cLight);
    grad.addColorStop(0.65, cBody);
    grad.addColorStop(1, cDark);

    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.restore();
  }

  function updateEyes(dt) {
    eyes.blinkT += dt;
    if (!eyes.blinking && eyes.blinkT >= eyes.nextBlink) {
      eyes.blinking = true; eyes.blinkT = 0;
      eyes.nextBlink = 2.5 + Math.random() * 6;
    }
    if (eyes.blinking && eyes.blinkT >= 0.15) {
      eyes.blinking = false; eyes.blinkT = 0;
    }

    var P = window.CreaturePhysics;
    if (window.InputSystem && window.InputSystem.isDown()) {
      var pos = window.InputSystem.getPosition();
      var dx = pos.x - P.x, dy = pos.y - P.y;
      var d = Math.sqrt(dx * dx + dy * dy) || 1;
      eyes.lookX = (dx / d) * 0.35;
      eyes.lookY = (dy / d) * 0.25;
    } else {
      eyes.lookX = P.vx * 0.0015;
      eyes.lookY = P.vy * 0.001;
    }
    var el = Math.min(1, dt * 5);
    eyes.clx += (eyes.lookX - eyes.clx) * el;
    eyes.cly += (eyes.lookY - eyes.cly) * el;

    var mood = window.CreatureAI ? window.CreatureAI.mood : 'neutral';
    switch (mood) {
      case 'happy':
        eyes.tlx = -0.28; eyes.trx = 0.28; eyes.tly = eyes.try_ = -0.2; eyes.tPupil = 1.1; break;
      case 'sad':
        eyes.tlx = -0.18; eyes.trx = 0.18; eyes.tly = eyes.try_ = -0.05; eyes.tPupil = 0.7; break;
      case 'scared':
        eyes.tlx = -0.32; eyes.trx = 0.32; eyes.tly = eyes.try_ = -0.22; eyes.tPupil = 1.5;
        eyes.clx += (Math.random() - 0.5) * 0.08; eyes.cly += (Math.random() - 0.5) * 0.06; break;
      case 'sleepy':
        eyes.tlx = -0.2; eyes.trx = 0.2; eyes.tly = eyes.try_ = -0.06; eyes.tPupil = 0.3; break;
      case 'excited':
        eyes.tlx = -0.3; eyes.trx = 0.3; eyes.tly = eyes.try_ = -0.18; eyes.tPupil = 1.3; break;
      default:
        eyes.tlx = -0.25; eyes.trx = 0.25; eyes.tly = eyes.try_ = -0.15; eyes.tPupil = 1.0;
    }
    var ml = Math.min(1, dt * 3);
    eyes.lx += (eyes.tlx - eyes.lx) * ml; eyes.ly += (eyes.tly - eyes.ly) * ml;
    eyes.rx += (eyes.trx - eyes.rx) * ml; eyes.ry += (eyes.try_ - eyes.ry) * ml;
    eyes.pupil += (eyes.tPupil - eyes.pupil) * ml;
  }

  function renderEyes(ctx) {
    var sleepy = window.CreatureAI && window.CreatureAI.mood === 'sleepy';
    var openness = sleepy ? 0.3 : (eyes.blinking ? 0 : 1);
    if (openness < 0.05) return;

    var P = window.CreaturePhysics;
    var r = P.baseRadius * P.breathScale;
    ctx.save();
    ctx.translate(P.x, P.y);
    var ME = window.Movement;
    var mvEOX = ME ? ME.microOffsetX : 0, mvEOY = ME ? ME.microOffsetY : 0;
    var mvERot = ME ? ME.rotation : 0;
    var mvECX = ME ? ME.crouchScaleX : 1, mvECY = ME ? ME.crouchScaleY : 1;
    var bmE = window.Intelligence ? window.Intelligence.getBodyModifiers() : null;
    if (bmE) { ctx.translate(bmE.offsetX + mvEOX, bmE.offsetY + mvEOY); ctx.rotate((bmE.rotation || 0) + mvERot); }
    else { ctx.translate(mvEOX, mvEOY); ctx.rotate(mvERot); }
    var popMulE = 1 + soundPopScale;
    var bmEsx = bmE ? bmE.scaleX : 1, bmEsy = bmE ? bmE.scaleY : 1;
    ctx.scale(P.scaleX * growthScale * popMulE * bmEsx * mvECX, P.scaleY * growthScale * popMulE * bmEsy * mvECY);

    var eR = r * 0.07 * eyes.pupil * openness;
    var gR = eR * 3;
    var lx = r * eyes.lx + r * eyes.clx;
    var ly = r * eyes.ly + r * eyes.cly;
    var rx = r * eyes.rx + r * eyes.clx;
    var ry = r * eyes.ry + r * eyes.cly;

    // Glow
    ctx.globalAlpha = 0.25 * openness;
    var grd = ctx.createRadialGradient(lx, ly, 0, lx, ly, gR);
    grd.addColorStop(0, 'rgba(255,255,255,0.5)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(lx, ly, gR, 0, Math.PI * 2); ctx.fill();
    grd = ctx.createRadialGradient(rx, ry, 0, rx, ry, gR);
    grd.addColorStop(0, 'rgba(255,255,255,0.5)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(rx, ry, gR, 0, Math.PI * 2); ctx.fill();

    // Core dots
    ctx.globalAlpha = eyes.alpha * openness;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(lx, ly, eR, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(rx, ry, eR, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function renderHairs(ctx) {
    var P = window.CreaturePhysics;
    var hs = P.hairs;
    var nH = P.numHairs;
    if (!hs) return;

    ctx.save();
    ctx.translate(P.x, P.y);
    var MH = window.Movement;
    var mvHOX = MH ? MH.microOffsetX : 0, mvHOY = MH ? MH.microOffsetY : 0;
    var mvHRot = MH ? MH.rotation : 0;
    var mvHCX = MH ? MH.crouchScaleX : 1, mvHCY = MH ? MH.crouchScaleY : 1;
    var bmH = window.Intelligence ? window.Intelligence.getBodyModifiers() : null;
    if (bmH) { ctx.translate(bmH.offsetX + mvHOX, bmH.offsetY + mvHOY); ctx.rotate((bmH.rotation || 0) + mvHRot); }
    else { ctx.translate(mvHOX, mvHOY); ctx.rotate(mvHRot); }
    // Apply growth scale + pop + body language + movement crouch to hairs
    var popMulH = 1 + soundPopScale;
    var bmHsx = bmH ? bmH.scaleX : 1, bmHsy = bmH ? bmH.scaleY : 1;
    ctx.scale(growthScale * popMulH * bmHsx * mvHCX, growthScale * popMulH * bmHsy * mvHCY);
    ctx.lineCap = 'round';

    for (var s = 0; s < HAIR_MAX_SEGS; s++) {
      var ratio = 1 - s / HAIR_MAX_SEGS;
      ctx.lineWidth = Math.max(0.5, P.hairBaseWidth * ratio + 0.5);

      var alphaStr = ratio * 0.6 + 0.4;
      ctx.strokeStyle = cHair;
      ctx.globalAlpha = alphaStr;

      ctx.beginPath();
      var hasPath = false;

      for (var i = 0; i < nH; i++) {
        var h = hs[i];
        if (s >= h.nSeg) continue;
        var p1 = h.pts[s];
        var p2 = h.pts[s + 1];
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        hasPath = true;
      }

      if (hasPath) ctx.stroke();
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ═══ Public API ═══

  window.Creature = {

    get x() { return window.CreaturePhysics ? window.CreaturePhysics.x : 0; },
    get y() { return window.CreaturePhysics ? window.CreaturePhysics.y : 0; },
    get radius() { return window.CreaturePhysics ? window.CreaturePhysics.baseRadius * growthScale : 0; },
    get growth() { return growthScale; },
    color: color,
    name: name,

    init: function(x, y) {
      var G = window.GAME;
      var radius = Math.min(G.width, G.height) * 0.15;

      // Newborn starts small — deserialize will override
      growthScale = GROWTH_BABY;

      if (window.CreaturePhysics) {
        window.CreaturePhysics.init(x, y, radius);
      }
      if (window.CreatureAI) {
        window.CreatureAI.init();
      }
      if (window.Movement) {
        window.Movement.init();
      }

      color.h = 270; color.s = 60; color.l = 65;
      tColor.h = 270; tColor.s = 60; tColor.l = 65;
      touchOnCreature = false;
      isDragging = false;
      isBeingHeld = false;
      isPurring = false;
      rebuildColors();

      if (window.InputSystem) {
        _cbTap = onTap;
        _cbDown = onDown;
        _cbDrag = onDrag;
        _cbHold = onHold;
        _cbRelease = onRelease;
        window.InputSystem.on('tap', _cbTap);
        window.InputSystem.on('double_tap', _cbTap);
        window.InputSystem.on('down', _cbDown);
        window.InputSystem.on('drag', _cbDrag);
        window.InputSystem.on('hold', _cbHold);
        window.InputSystem.on('release', _cbRelease);
      }

      console.log('[Creature] Initialized — growth:', growthScale.toFixed(2));
    },

    update: function(dt) {
      var P = window.CreaturePhysics;
      if (!P || !P.hairs) return;

      // ── Growth (very slow) ──
      if (growthScale < GROWTH_MAX) {
        growthScale = Math.min(GROWTH_MAX, growthScale + GROWTH_RATE * dt);
      }

      if (isBeingHeld && !isDragging) {
        holdTimer += dt;
        var squashAmt = Math.min(holdTimer * 0.12, 0.1);
        P.setSquash(1 + squashAmt, 1 - squashAmt * 0.7);
        if (holdTimer > 1 && !isPurring) {
          isPurring = true;
          purrPhase = 0;
        }
      }

      if (isPurring) {
        purrPhase += dt;
        if (Math.sin(purrPhase * 18) > 0.95) vibrate([15, 40, 15]);
      }

      // ── Eyes ──
      updateEyes(dt);

      // ── Intelligence integration ──
      if (window.Intelligence) {
        var intel = window.Intelligence.getAttention();

        // Eyes track attention target
        if (intel && intel.type !== 'nothing' && !isDragging) {
          var adx = intel.x - P.x;
          var ady = intel.y - P.y;
          var aDist = Math.sqrt(adx * adx + ady * ady) || 1;
          eyes.lookX = (adx / aDist) * 0.4;
          eyes.lookY = (ady / aDist) * 0.3;
        }

        // Apply eye microexpressions
        var eyeState = window.Intelligence.getEyeState();
        if (eyeState) {
          eyes.tPupil *= eyeState.pupilScale;
          // Darting eyes (fear)
          if (eyeState.dartSpeed > 0) {
            eyes.clx += (Math.random() - 0.5) * eyeState.dartSpeed * dt;
            eyes.cly += (Math.random() - 0.5) * eyeState.dartSpeed * dt * 0.6;
          }
          // Droop adjusts alpha
          if (eyeState.droop > 0) {
            eyes.alpha = Math.max(0.15, 0.85 - eyeState.droop * 0.7);
          } else {
            eyes.alpha = 0.85;
          }
          // Wider eyes → slightly larger pupils
          if (eyeState.widen > 0) {
            eyes.tPupil *= (1 + eyeState.widen * 0.3);
          }
          // Blink rate modification
          if (eyeState.blinkRate && eyeState.blinkRate !== 1) {
            eyes.nextBlink = (2.5 + Math.random() * 6) / eyeState.blinkRate;
          }
        }

        // Toy play — creature moves toward toys autonomously
        var toyCmd = window.Intelligence.isToyPlaying() ? (function() {
          // Get fresh command from update result
          var cx = P.x, cy = P.y;
          var toys = (window.Items && window.Items._worldToys) || [];
          var activeToys = toys.filter(function(t) { return t.alpha > 0.5; });
          if (activeToys.length === 0) return null;

          var fav = window.Intelligence.getFavoriteToy();
          var target = null;
          if (fav) target = activeToys.find(function(t) { return t.id === fav; });
          if (!target) target = activeToys[0];
          if (!target) return null;

          // Look at toy
          var tdx = target.x - cx, tdy = target.y - cy;
          var tDist = Math.sqrt(tdx * tdx + tdy * tdy) || 1;
          eyes.lookX = (tdx / tDist) * 0.45;
          eyes.lookY = (tdy / tDist) * 0.35;

          // Move toward toy
          if (tDist > P.baseRadius * growthScale * 1.5) {
            P.applyForce((tdx / tDist) * 18 * dt * 60, (tdy / tDist) * 14 * dt * 60);
          }
          return true;
        })() : null;

        // Compound behavior — override AI target
        var compound = window.Intelligence.getCompoundBehavior();
        if (compound && !isDragging && !touchOnCreature && !toyCmd) {
          var G = window.GAME;
          var cTarget = null;

          switch (compound.moveTarget) {
            case 'menu_zone':
              cTarget = { x: G.centerX, y: G.height * 0.85 }; break;
            case 'finger_near':
              if (window.InputSystem && window.InputSystem.isDown()) {
                var fp = window.InputSystem.getPosition();
                cTarget = { x: fp.x, y: fp.y };
              }
              break;
            case 'center':
              cTarget = { x: G.centerX, y: G.centerY }; break;
            case 'edge':
              var edgeX = P.x < G.centerX ? G.width * 0.08 : G.width * 0.92;
              cTarget = { x: edgeX, y: G.height * 0.6 }; break;
            case 'edge_facing_finger':
              var efX = P.x < G.centerX ? G.width * 0.1 : G.width * 0.9;
              cTarget = { x: efX, y: G.height * 0.55 }; break;
            case 'nearest_toy':
              var wToys = (window.Items && window.Items._worldToys) || [];
              var nearest = null, nearDist = Infinity;
              wToys.forEach(function(t) {
                if (t.alpha < 0.3) return;
                var d = Math.hypot(t.x - P.x, t.y - P.y);
                if (d < nearDist) { nearDist = d; nearest = t; }
              });
              if (nearest) cTarget = { x: nearest.x, y: nearest.y };
              break;
          }

          if (cTarget) {
            var cdx = cTarget.x - P.x;
            var cdy = cTarget.y - P.y;
            var cDist = Math.sqrt(cdx * cdx + cdy * cdy) || 1;
            var spd = compound.speed || 1;
            P.applyForce((cdx / cDist) * 12 * spd * dt * 60, (cdy / cDist) * 10 * spd * dt * 60);
          }
        }
      }

      // ── Accelerometer ──
      if (accelEnabled && window.CreaturePhysics) {
        var P = window.CreaturePhysics;
        P.applyForce(accelX * 2.5, accelY * 2.5);
      }

      // ── Sound glow decay ──
      if (soundGlowAlpha > 0.005) {
        soundGlowAlpha *= (1 - dt * 3.5);
      } else {
        soundGlowAlpha = 0;
      }

      // ── Sound pop animation ──
      if (soundPopActive) {
        soundPopPhase += dt * 18; // fast spring
        // Damped spring: scale up quickly, bounce back
        soundPopScale = Math.sin(soundPopPhase) * 0.12 * Math.exp(-soundPopPhase * 0.6);
        if (soundPopPhase > 4) {
          soundPopActive = false;
          soundPopScale = 0;
          soundPopPhase = 0;
        }
      }

      // ════════════════════════════════════════════
      // FINGER REACTION — emotion-based following
      // ════════════════════════════════════════════
      var _isFoodDrag = window.Menu && window.Menu.isDraggingItem
        && window.Menu.selectedItem && window.Menu.selectedItem.category === 'food';

      if (!_isFoodDrag && !isDragging && !touchOnCreature && !isBeingHeld) {
        var _menuBusy = window.Menu && (window.Menu.isOpen || window.Menu.isDraggingItem);
        if (!_menuBusy && window.InputSystem && window.InputSystem.isDown()) {
          var fPos = window.InputSystem.getPosition();
          var fdx = fPos.x - P.x;
          var fdy = fPos.y - P.y;
          var fDist = Math.sqrt(fdx * fdx + fdy * fdy);

          if (fDist > 20 && fDist < window.GAME.width * 0.8) {
            var fnx = fdx / fDist;
            var fny = fdy / fDist;
            var fStr = Math.min(1, fDist / (window.GAME.width * 0.4));

            var mood = window.EmotionSystem ? window.EmotionSystem.getDominant() : 'neutral';
            var force = 0;

            switch (mood) {
              case 'love':
                force = 28 * fStr; break;
              case 'happiness': case 'happy':
                force = 22 * fStr; break;
              case 'curiosity':
                force = 16 * fStr; break;
              case 'playful': case 'excited':
                force = 38 * fStr; break;
              case 'fear': case 'scared':
                force = -45 * fStr; break;
              case 'anger':
                force = -35 * fStr; break;
              case 'sadness': case 'sad':
                force = 8 * fStr; break;
              case 'sleepy':
                force = 3 * fStr; break;
              default:
                force = 12 * fStr; break;
            }

            // Don't overlap finger when approaching
            var minR = P.baseRadius * growthScale * 0.6;
            if (force > 0 && fDist < minR) force = 0;

            P.applyForce(fnx * force * dt * 60, fny * force * dt * 60);
          }
        }
      }

      // ════════════════════════════════════════════
      // FOOD CHASING — creature follows dragged food
      // ════════════════════════════════════════════
      if (_isFoodDrag) {
        var foodPos = window.Menu.dragPosition;
        var fx = foodPos.x - P.x;
        var fy = foodPos.y - P.y;
        var foDist = Math.sqrt(fx * fx + fy * fy);

        _foodChaseTimer += dt;

        if (!_foodChaseAngered && _foodChaseTimer < 15) {
          // Chase the food eagerly
          if (foDist > P.baseRadius * growthScale * 1.2) {
            var hungerFactor = window.NeedsSystem
              ? (100 - window.NeedsSystem.get('hunger')) / 100 : 0.5;
            var chaseF = 22 + hungerFactor * 25;
            var cnx = fx / (foDist || 1);
            var cny = fy / (foDist || 1);
            P.applyForce(cnx * chaseF * dt * 60, cny * chaseF * dt * 60);
          }

          // Eyes track the food
          eyes.lookX = (fx / (foDist || 1)) * 0.5;
          eyes.lookY = (fy / (foDist || 1)) * 0.4;

        } else if (!_foodChaseAngered && _foodChaseTimer >= 15) {
          // 15 seconds — ANGRY!
          _foodChaseAngered = true;
          _foodChaseCooldown = 5;

          if (window.EmotionSystem) {
            window.EmotionSystem.modify('anger', 20);
            window.EmotionSystem.modify('happiness', -10);
          }
          if (window.AudioSystem) {
            window.AudioSystem.play('growl', { volume: 0.35 });
          }
          if (window.Creature) {
            window.Creature.triggerSoundGlow(0.5);
          }
          // Push away from food
          if (foDist > 1) {
            P.applyForce(-(fx / foDist) * 80, -(fy / foDist) * 60);
          }
        } else if (_foodChaseAngered) {
          // Stay away while angry
          if (foDist < P.baseRadius * 3 && foDist > 1) {
            P.applyForce(-(fx / foDist) * 15 * dt * 60, -(fy / foDist) * 12 * dt * 60);
          }
        }
      } else {
        // Reset when food drag ends
        if (_foodChaseTimer > 0) {
          _foodChaseTimer = 0;
        }
        if (_foodChaseCooldown > 0) {
          _foodChaseCooldown -= dt;
          if (_foodChaseCooldown <= 0) {
            _foodChaseAngered = false;
          }
        }
      }

      if (window.CreatureAI) window.CreatureAI.update(dt);

      // Movement system — curves, rotation, micro-movements, weight, trail
      if (window.Movement) window.Movement.update(dt);

      P.updateBody(dt);
      P.updateHairs(dt);

      var cLerp = Math.min(1, dt * 2);
      color.h += (tColor.h - color.h) * cLerp;
      color.s += (tColor.s - color.s) * cLerp;
      color.l += (tColor.l - color.l) * cLerp;
      rebuildColors();
    },

    render: function(ctx) {
      if (!window.CreaturePhysics || !window.CreaturePhysics.hairs) return;
      // Trail renders behind creature
      if (window.Movement) window.Movement.render(ctx);
      renderShadow(ctx);
      renderGlow(ctx);
      renderBody(ctx);
      renderEyes(ctx);
      renderHairs(ctx);
    },

    setAccelerometer: function(enabled) {
      accelEnabled = enabled;
      if (enabled && window.DeviceMotionEvent) {
        window.addEventListener('devicemotion', function(e) {
          if (!accelEnabled) return;
          var a = e.accelerationIncludingGravity;
          if (a) { accelX = -(a.x || 0) * 0.6; accelY = (a.y || 0) * 0.6; }
        });
        if (typeof DeviceMotionEvent.requestPermission === 'function') {
          DeviceMotionEvent.requestPermission().catch(function() {});
        }
      }
    },

    setPosition: function(x, y) {
      if (window.CreaturePhysics) {
        window.CreaturePhysics.targetX = x;
        window.CreaturePhysics.targetY = y;
      }
    },

    setColor: function(h, s, l) {
      tColor.h = h; tColor.s = s; tColor.l = l;
    },

    setMood: function(m) {
      if (window.CreatureAI) window.CreatureAI.setMood(m);
    },

    getRadius: function() {
      return window.CreaturePhysics ? window.CreaturePhysics.baseRadius * growthScale : 0;
    },

    isPointInside: function(px, py) {
      return isInside(px, py);
    },

    applyForce: function(fx, fy) {
      if (window.CreaturePhysics) window.CreaturePhysics.applyForce(fx, fy);
    },

    triggerSoundPop: function() {
      soundPopActive = true;
      soundPopPhase = 0;
    },

    triggerSoundGlow: function(intensity) {
      soundGlowAlpha = Math.min(1, (intensity || 0.7));
      // Also trigger the pop effect
      this.triggerSoundPop();
      // Tint glow based on current emotion color
      var h = Math.round(color.h);
      var s = Math.round(color.s);
      var l = Math.round(Math.min(90, color.l + 15));
      // Convert HSL to approximate RGB for glow
      // Simple approach: use the accent color shifted by emotion
      if (h > 330 || h < 30) soundGlowColor = '255, 180, 180'; // red/warm
      else if (h < 60) soundGlowColor = '255, 230, 150'; // yellow
      else if (h < 150) soundGlowColor = '150, 255, 180'; // green
      else if (h < 200) soundGlowColor = '150, 230, 255'; // cyan
      else if (h < 260) soundGlowColor = '180, 170, 255'; // blue/purple
      else if (h < 330) soundGlowColor = '255, 170, 230'; // pink
      else soundGlowColor = '224, 170, 255'; // default purple
    },

    serialize: function() {
      return {
        name: name,
        color: { h: color.h, s: color.s, l: color.l },
        mood: window.CreatureAI ? window.CreatureAI.mood : 'neutral',
        x: window.CreaturePhysics ? window.CreaturePhysics.x : 0,
        y: window.CreaturePhysics ? window.CreaturePhysics.y : 0,
        growth: Math.round(growthScale * 10000) / 10000
      };
    },

    deserialize: function(data) {
      if (data.name) { name = data.name; this.name = name; }
      if (data.color) {
        color.h = data.color.h; color.s = data.color.s; color.l = data.color.l;
        tColor.h = color.h; tColor.s = color.s; tColor.l = color.l;
        rebuildColors();
      }
      if (data.mood && window.CreatureAI) window.CreatureAI.setMood(data.mood);
      if (data.growth !== undefined) {
        growthScale = Math.max(GROWTH_BABY, Math.min(GROWTH_MAX, data.growth));
      }
      console.log('[Creature] Restored — growth:', growthScale.toFixed(2));
    },

    destroy: function() {
      if (window.InputSystem) {
        if (_cbTap) { window.InputSystem.off('tap', _cbTap); window.InputSystem.off('double_tap', _cbTap); }
        if (_cbDown) window.InputSystem.off('down', _cbDown);
        if (_cbDrag) window.InputSystem.off('drag', _cbDrag);
        if (_cbHold) window.InputSystem.off('hold', _cbHold);
        if (_cbRelease) window.InputSystem.off('release', _cbRelease);
      }
    }
  };
})();
