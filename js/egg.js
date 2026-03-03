/**
 * ===================================================
 * EggSystem — Experiencia mágica de eclosión
 * ===================================================
 * El huevo aparece al centro, late, brilla y reacciona
 * al toque. El usuario lo acaricia/toca/sostiene para
 * llenar hatchProgress (0-100). En milestones aparecen
 * grietas con branching procedural. A 100% se dispara
 * una animación cinemática con fragmentos y partículas.
 * ===================================================
 */
(function() {
  'use strict';

  // ─── Constants ───
  var EGG_PARTICLE_COUNT = 24;
  var FRAGMENT_COUNT = 14;

  // ─── Egg state ───
  var egg = {
    x: 0, y: 0,
    width: 0, height: 0,
    baseY: 0,
    rotation: 0,
    rotTarget: 0,
    scale: 0,
    floatPhase: 0,
    pulsePhase: 0,
    wobble: 0,
    wobblePhase: 0,
    glowIntensity: 0.15,
    hatchProgress: 0,
    iridPhase: 0,
    active: false
  };

  // ─── Milestones ───
  var milestones = { 25: false, 50: false, 75: false };

  // ─── Cracks ───
  var cracks = [];

  // ─── Fragments (post-hatch) ───
  var fragments = [];

  // ─── Egg-local particles ───
  var eggParts = [];

  // ─── Hatching animation ───
  var hatching = {
    active: false,
    phase: 0,
    timer: 0,
    flashAlpha: 0
  };

  // ─── Touch tracking ───
  var touching = false;
  var touchOnEgg = false;
  var lastDragX = 0;
  var lastDragY = 0;
  var caressAccum = 0;

  // ─── Input callbacks (stored for cleanup) ───
  var _cbTap, _cbDown, _cbDrag, _cbHold, _cbRelease;

  // ══════════════════════════════════════════════
  // Hit test: elliptical
  // ══════════════════════════════════════════════
  function isInsideEgg(px, py) {
    var dx = (px - egg.x) / (egg.width * 0.6);
    var dy = (py - egg.y) / (egg.height * 0.55);
    return dx * dx + dy * dy <= 1;
  }

  // ══════════════════════════════════════════════
  // Draw egg bezier path (organic egg shape)
  // ══════════════════════════════════════════════
  function drawEggPath(ctx, w, h) {
    ctx.beginPath();
    ctx.moveTo(0, -h / 2);
    ctx.bezierCurveTo(
      w * 0.55, -h * 0.5,
      w * 0.52, -h * 0.08,
      w * 0.42, h * 0.16
    );
    ctx.bezierCurveTo(
      w * 0.35, h * 0.38,
      w * 0.15, h * 0.5,
      0, h / 2
    );
    ctx.bezierCurveTo(
      -w * 0.15, h * 0.5,
      -w * 0.35, h * 0.38,
      -w * 0.42, h * 0.16
    );
    ctx.bezierCurveTo(
      -w * 0.52, -h * 0.08,
      -w * 0.55, -h * 0.5,
      0, -h / 2
    );
    ctx.closePath();
  }

  // ══════════════════════════════════════════════
  // Generate a procedural crack with branch
  // ══════════════════════════════════════════════
  function generateCrack(milestone) {
    var angle, startR;

    if (milestone <= 25) {
      angle = -Math.PI * 0.5 + (Math.random() - 0.5) * 0.8;
      startR = 0.08;
    } else if (milestone <= 50) {
      angle = (Math.random() > 0.5 ? 1 : -1) * (Math.PI * 0.25 + Math.random() * 0.5);
      startR = 0.06;
    } else {
      angle = Math.random() * Math.PI * 2;
      startR = 0.04;
    }

    var startX = Math.cos(angle) * egg.width * startR;
    var startY = Math.sin(angle) * egg.height * startR;

    var points = [{ x: startX, y: startY }];
    var curAngle = angle + (Math.random() - 0.5) * 0.6;
    var segLen = egg.height * 0.09;
    var numPts = 4 + Math.floor(Math.random() * 3);

    for (var i = 0; i < numPts; i++) {
      curAngle += (Math.random() - 0.5) * 1.4;
      segLen *= (0.65 + Math.random() * 0.5);
      var last = points[points.length - 1];
      points.push({
        x: last.x + Math.cos(curAngle) * segLen,
        y: last.y + Math.sin(curAngle) * segLen
      });
    }

    // Optional branch
    var branch = null;
    if (Math.random() > 0.35 && points.length > 2) {
      var bi = 1 + Math.floor(Math.random() * (points.length - 2));
      var brPts = [{ x: points[bi].x, y: points[bi].y }];
      var brA = curAngle + (Math.random() > 0.5 ? 1 : -1) * (0.4 + Math.random() * 0.9);
      var brL = segLen * 0.85;
      for (var j = 0; j < 3; j++) {
        brA += (Math.random() - 0.5) * 0.9;
        brL *= 0.7;
        var bl = brPts[brPts.length - 1];
        brPts.push({
          x: bl.x + Math.cos(brA) * brL,
          y: bl.y + Math.sin(brA) * brL
        });
      }
      branch = brPts;
    }

    cracks.push({
      points: points,
      branch: branch,
      progress: 0,
      glowing: milestone >= 75,
      width: 1 + Math.random() * 1.5
    });
  }

  // ══════════════════════════════════════════════
  // Egg-local particles
  // ══════════════════════════════════════════════
  function makeEggParticle(randomPos) {
    var angle = Math.random() * Math.PI * 2;
    var dist = egg.height * (0.7 + Math.random() * 1.0);
    return {
      x: randomPos ? egg.x + Math.cos(angle) * dist : egg.x,
      y: randomPos ? egg.y + Math.sin(angle) * dist : egg.y + egg.height * 0.6,
      vx: (Math.random() - 0.5) * 10,
      vy: -(Math.random() * 10 + 4),
      size: Math.random() * 2.2 + 0.5,
      life: randomPos ? Math.random() * 4 : 0,
      maxLife: 3 + Math.random() * 5,
      opacity: 0.08 + Math.random() * 0.25,
      orbAngle: angle,
      orbSpeed: (Math.random() - 0.5) * 0.4,
      orbDist: dist
    };
  }

  function initEggParticles() {
    eggParts = [];
    for (var i = 0; i < EGG_PARTICLE_COUNT; i++) {
      eggParts.push(makeEggParticle(true));
    }
  }

  function updateEggParticles(dt) {
    for (var i = 0; i < eggParts.length; i++) {
      var p = eggParts[i];
      p.life += dt;
      p.orbAngle += p.orbSpeed * dt;
      var tx = egg.x + Math.cos(p.orbAngle) * p.orbDist;
      var ty = egg.y + Math.sin(p.orbAngle) * p.orbDist;
      p.x += (tx - p.x) * dt * 0.4 + p.vx * dt;
      p.y += (ty - p.y) * dt * 0.4 + p.vy * dt;
      p.vy -= 2 * dt;
      if (p.life >= p.maxLife) {
        eggParts[i] = makeEggParticle(false);
      }
    }
  }

  function renderEggParticles(ctx) {
    var progressBoost = 1 + (egg.hatchProgress / 100) * 1.8;
    for (var i = 0; i < eggParts.length; i++) {
      var p = eggParts[i];
      var lr = p.life / p.maxLife;
      var alpha = p.opacity;
      if (lr < 0.15) alpha *= lr / 0.15;
      else if (lr > 0.75) alpha *= (1 - lr) / 0.25;
      alpha = Math.min(0.5, alpha * progressBoost);
      if (alpha < 0.01) continue;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#e0aaff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ══════════════════════════════════════════════
  // Fragments for hatching explosion
  // ══════════════════════════════════════════════
  function createFragments() {
    fragments = [];
    for (var i = 0; i < FRAGMENT_COUNT; i++) {
      var angle = (i / FRAGMENT_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      var speed = 100 + Math.random() * 220;
      var fw = egg.width * (0.1 + Math.random() * 0.14);
      var fh = egg.height * (0.07 + Math.random() * 0.1);
      fragments.push({
        x: egg.x + Math.cos(angle) * egg.width * 0.15,
        y: egg.y + Math.sin(angle) * egg.height * 0.15,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 80,
        rot: Math.random() * Math.PI * 2,
        rotV: (Math.random() - 0.5) * 14,
        w: fw, h: fh,
        opacity: 1,
        pts: [
          { x: -fw / 2 + Math.random() * 3, y: -fh / 2 + Math.random() * 3 },
          { x:  fw / 2 + Math.random() * 3, y: -fh / 2 + Math.random() * 2 },
          { x:  fw / 2 + Math.random() * 2, y:  fh / 2 + Math.random() * 3 },
          { x: -fw / 2 + Math.random() * 2, y:  fh / 2 + Math.random() * 2 }
        ]
      });
    }
  }

  function renderFragments(ctx) {
    for (var i = 0; i < fragments.length; i++) {
      var f = fragments[i];
      if (f.opacity < 0.01) continue;
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(f.rot);
      ctx.globalAlpha = f.opacity;
      var fg = ctx.createLinearGradient(-f.w / 2, -f.h / 2, f.w / 2, f.h / 2);
      fg.addColorStop(0, '#f0e6ff');
      fg.addColorStop(1, '#d4b8e8');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.moveTo(f.pts[0].x, f.pts[0].y);
      for (var s = 1; s < f.pts.length; s++) ctx.lineTo(f.pts[s].x, f.pts[s].y);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.restore();
    }
  }

  // ══════════════════════════════════════════════
  // Crack rendering
  // ══════════════════════════════════════════════
  function drawCrackLine(ctx, pts, count, ox, oy) {
    if (count < 2) return;
    ctx.beginPath();
    ctx.moveTo(pts[0].x + ox, pts[0].y + oy);
    for (var i = 1; i < count; i++) ctx.lineTo(pts[i].x + ox, pts[i].y + oy);
    ctx.stroke();
  }

  function renderCracks(ctx) {
    if (cracks.length === 0) return;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (var c = 0; c < cracks.length; c++) {
      var cr = cracks[c];
      if (cr.progress < 0.01) continue;
      var vis = Math.ceil(cr.points.length * cr.progress);

      // Crack shadow
      ctx.strokeStyle = 'rgba(80, 50, 100, 0.35)';
      ctx.lineWidth = cr.width + 1.5;
      drawCrackLine(ctx, cr.points, vis, 0.5, 0.8);

      // Main crack
      ctx.strokeStyle = 'rgba(25, 12, 35, 0.75)';
      ctx.lineWidth = cr.width;
      drawCrackLine(ctx, cr.points, vis, 0, 0);

      // Branch
      if (cr.branch && cr.progress > 0.35) {
        var brVis = Math.ceil(cr.branch.length * Math.min(1, (cr.progress - 0.35) / 0.65));
        ctx.strokeStyle = 'rgba(25, 12, 35, 0.5)';
        ctx.lineWidth = cr.width * 0.65;
        drawCrackLine(ctx, cr.branch, brVis, 0, 0);
      }

      // Inner light along crack (75%+ milestone)
      if (cr.glowing) {
        ctx.save();
        ctx.shadowColor = 'rgba(255, 220, 150, 0.6)';
        ctx.shadowBlur = 10;
        ctx.strokeStyle = 'rgba(255, 240, 200, ' + (0.45 * egg.glowIntensity * cr.progress) + ')';
        ctx.lineWidth = cr.width + 2.5;
        drawCrackLine(ctx, cr.points, vis, 0, 0);
        ctx.restore();
      }
    }
  }

  // ══════════════════════════════════════════════
  // Milestone checker
  // ══════════════════════════════════════════════
  function checkMilestones() {
    if (egg.hatchProgress >= 25 && !milestones[25]) {
      milestones[25] = true;
      generateCrack(25);
      egg.wobble = 0.7;
    }
    if (egg.hatchProgress >= 50 && !milestones[50]) {
      milestones[50] = true;
      generateCrack(50);
      generateCrack(50);
      egg.wobble = 0.9;
    }
    if (egg.hatchProgress >= 75 && !milestones[75]) {
      milestones[75] = true;
      generateCrack(75);
      generateCrack(75);
      for (var i = 0; i < cracks.length; i++) cracks[i].glowing = true;
      egg.wobble = 1.2;
    }
  }

  // ══════════════════════════════════════════════
  // Start hatching sequence
  // ══════════════════════════════════════════════
  function startHatching() {
    hatching.active = true;
    hatching.phase = 0;
    hatching.timer = 0;
    hatching.flashAlpha = 0;
    console.log('[EggSystem] ¡ECLOSIÓN!');
  }

  // ══════════════════════════════════════════════
  // Hatching animation update
  // ══════════════════════════════════════════════
  function updateHatching(dt) {
    hatching.timer += dt;

    switch (hatching.phase) {
      case 0: // Violent shaking
        egg.wobble = 1.5 + hatching.timer * 2.5;
        egg.wobblePhase += dt * 38;
        egg.glowIntensity = Math.min(1, 0.4 + hatching.timer * 0.8);
        if (hatching.timer > 0.8) {
          hatching.phase = 1;
          hatching.timer = 0;
        }
        break;

      case 1: // Flash buildup
        egg.wobble = 3.5;
        egg.wobblePhase += dt * 50;
        hatching.flashAlpha = Math.min(0.95, hatching.timer / 0.4);
        egg.glowIntensity = 1;
        if (hatching.timer > 0.5) {
          hatching.phase = 2;
          hatching.timer = 0;
          hatching.flashAlpha = 1;
          createFragments();
          for (var i = 0; i < 18; i++) {
            var p = makeEggParticle(false);
            var a = (i / 18) * Math.PI * 2;
            p.x = egg.x; p.y = egg.y;
            p.vx = Math.cos(a) * (60 + Math.random() * 100);
            p.vy = Math.sin(a) * (60 + Math.random() * 100) - 40;
            p.size = 2 + Math.random() * 3;
            p.opacity = 0.5;
            p.maxLife = 2.5;
            p.life = 0;
            eggParts.push(p);
          }
        }
        break;

      case 2: // Explosion: fragments fly out
        hatching.flashAlpha = Math.max(0, 1 - hatching.timer * 1.4);
        for (var j = 0; j < fragments.length; j++) {
          var f = fragments[j];
          f.vy += 350 * dt;
          f.x += f.vx * dt;
          f.y += f.vy * dt;
          f.rot += f.rotV * dt;
          f.opacity = Math.max(0, f.opacity - dt * 0.6);
        }
        if (hatching.timer > 1.3) {
          hatching.phase = 3;
          hatching.timer = 0;
          cleanupInputs();
          window.GAME.state = 'naming';
          var overlay = document.getElementById('naming-overlay');
          if (overlay) overlay.classList.add('visible');
          setTimeout(function() {
            var input = document.getElementById('name-input');
            if (input) input.focus();
          }, 600);
          console.log('[Mochi] Estado: egg → naming');
        }
        break;

      case 3: // Fade out remaining fragments
        hatching.flashAlpha = Math.max(0, hatching.flashAlpha - dt * 2);
        for (var k = 0; k < fragments.length; k++) {
          var ff = fragments[k];
          ff.vy += 350 * dt;
          ff.x += ff.vx * dt;
          ff.y += ff.vy * dt;
          ff.rot += ff.rotV * dt;
          ff.opacity = Math.max(0, ff.opacity - dt * 1.5);
        }
        egg.active = false;
        break;
    }
  }

  // ══════════════════════════════════════════════
  // Input handlers
  // ══════════════════════════════════════════════
  function onTap(e) {
    if (window.GAME.state !== 'egg' || hatching.active) return;
    if (!isInsideEgg(e.x, e.y)) return;

    egg.hatchProgress = Math.min(100, egg.hatchProgress + 2.5);
    egg.wobble = Math.min(1.5, egg.wobble + 0.5);
    egg.glowIntensity = Math.min(1, egg.glowIntensity + 0.35);

    var dx = e.x - egg.x;
    egg.rotTarget = Math.max(-0.08, Math.min(0.08, dx * 0.001));

    checkMilestones();
    if (egg.hatchProgress >= 100) startHatching();
  }

  function onDown(e) {
    if (window.GAME.state !== 'egg' || hatching.active) return;
    touching = true;
    touchOnEgg = isInsideEgg(e.x, e.y);
    lastDragX = e.x;
    lastDragY = e.y;
    caressAccum = 0;
  }

  function onDrag(e) {
    if (window.GAME.state !== 'egg' || hatching.active || !touching) return;

    var dx = e.x - lastDragX;
    var dy = e.y - lastDragY;
    lastDragX = e.x;
    lastDragY = e.y;

    if (touchOnEgg || isInsideEgg(e.x, e.y)) {
      var moveDist = Math.sqrt(dx * dx + dy * dy);
      var normalized = moveDist / (egg.width * 0.5);
      caressAccum += normalized;

      var inc = normalized * 0.6;
      if (inc > 0.001) {
        egg.hatchProgress = Math.min(100, egg.hatchProgress + inc);
        egg.glowIntensity = Math.min(1, egg.glowIntensity + 0.015);

        var rdx = e.x - egg.x;
        egg.rotTarget = Math.max(-0.06, Math.min(0.06, rdx / egg.width * 0.06));

        checkMilestones();
        if (egg.hatchProgress >= 100) startHatching();
      }
    }
  }

  function onHold(e) {
    if (window.GAME.state !== 'egg' || hatching.active) return;
    if (!isInsideEgg(e.x, e.y)) return;

    egg.hatchProgress = Math.min(100, egg.hatchProgress + 4);
    egg.glowIntensity = Math.min(1, egg.glowIntensity + 0.45);
    egg.wobble = Math.min(0.6, egg.wobble + 0.2);

    checkMilestones();
    if (egg.hatchProgress >= 100) startHatching();
  }

  function onRelease(e) {
    touching = false;
    touchOnEgg = false;
    caressAccum = 0;
  }

  function cleanupInputs() {
    if (window.InputSystem) {
      if (_cbTap) { InputSystem.off('tap', _cbTap); InputSystem.off('double_tap', _cbTap); }
      if (_cbDown) InputSystem.off('down', _cbDown);
      if (_cbDrag) InputSystem.off('drag', _cbDrag);
      if (_cbHold) InputSystem.off('hold', _cbHold);
      if (_cbRelease) InputSystem.off('release', _cbRelease);
    }
    _cbTap = _cbDown = _cbDrag = _cbHold = _cbRelease = null;
  }

  // ══════════════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════════════
  window.EggSystem = {

    init: function() {
      var G = window.GAME;

      egg.width = Math.min(G.width, G.height) * 0.2;
      egg.height = egg.width * 1.35;
      egg.x = G.centerX;
      egg.y = G.centerY;
      egg.baseY = G.centerY;
      egg.scale = 0;
      egg.rotation = 0;
      egg.rotTarget = 0;
      egg.hatchProgress = 0;
      egg.glowIntensity = 0.15;
      egg.wobble = 0;
      egg.wobblePhase = 0;
      egg.floatPhase = 0;
      egg.pulsePhase = 0;
      egg.iridPhase = 0;
      egg.active = true;

      milestones = { 25: false, 50: false, 75: false };
      cracks = [];
      fragments = [];
      hatching.active = false;
      hatching.phase = 0;
      touching = false;

      initEggParticles();

      if (window.InputSystem) {
        _cbTap = onTap;
        _cbDown = onDown;
        _cbDrag = onDrag;
        _cbHold = onHold;
        _cbRelease = onRelease;
        InputSystem.on('tap', _cbTap);
        InputSystem.on('double_tap', _cbTap);
        InputSystem.on('down', _cbDown);
        InputSystem.on('drag', _cbDrag);
        InputSystem.on('hold', _cbHold);
        InputSystem.on('release', _cbRelease);
      }

      if (window.ParticleSystem) {
        window.ParticleSystem.init();
      }

      console.log('[EggSystem] Inicializado');
    },

    update: function(dt) {
      if (!egg.active && !hatching.active) return;

      // Entry scale
      if (egg.scale < 1 && !hatching.active) {
        egg.scale = Math.min(1, egg.scale + dt * 1.2);
      }

      // Float
      egg.floatPhase += dt * 1.3;
      egg.y = egg.baseY + Math.sin(egg.floatPhase) * 6;

      // Heartbeat pulse
      egg.pulsePhase += dt * 2.8;
      var pulse = Math.sin(egg.pulsePhase);
      var heartbeat = pulse > 0.7 ? (pulse - 0.7) / 0.3 : 0;
      var heartScale = 0.3 + (egg.hatchProgress / 100) * 0.7;
      egg.glowIntensity = Math.max(
        egg.glowIntensity - dt * 1.2,
        0.1 + heartbeat * 0.3 * heartScale
      );

      // Iridescence
      egg.iridPhase += dt * 0.7;

      // Rotation smoothing
      egg.rotation += (egg.rotTarget - egg.rotation) * Math.min(1, dt * 5);
      egg.rotTarget *= 0.96;

      // Wobble decay
      if (egg.wobble > 0.01) {
        egg.wobblePhase += dt * 20;
        egg.wobble *= Math.max(0, 1 - dt * 2.5);
      } else {
        egg.wobble = 0;
      }

      // Auto-wobble at higher progress
      if (!hatching.active && egg.hatchProgress >= 50) {
        var chance = (egg.hatchProgress - 50) / 50 * 0.4;
        if (Math.random() < chance * dt) {
          egg.wobble = Math.min(1, egg.wobble + 0.25);
        }
      }

      // Touch glow boost
      if (touching && touchOnEgg) {
        egg.glowIntensity = Math.min(1, egg.glowIntensity + dt * 1.5);
      }

      // Crack reveal
      for (var i = 0; i < cracks.length; i++) {
        if (cracks[i].progress < 1) {
          cracks[i].progress = Math.min(1, cracks[i].progress + dt * 2.0);
        }
      }

      // Egg particles
      updateEggParticles(dt);

      // Hatching
      if (hatching.active) {
        updateHatching(dt);
      }

      // Ambient particles
      if (window.ParticleSystem) {
        window.ParticleSystem.update(dt);
      }
    },

    render: function(ctx) {
      var G = window.GAME;

      renderEggParticles(ctx);

      // Post-explosion: only fragments + flash
      if (hatching.active && hatching.phase >= 2) {
        renderFragments(ctx);
        if (hatching.flashAlpha > 0.01) {
          ctx.fillStyle = 'rgba(224, 170, 255, ' + hatching.flashAlpha + ')';
          ctx.fillRect(0, 0, G.width, G.height);
        }
        return;
      }

      if (!egg.active || egg.scale <= 0.01) return;

      ctx.save();
      ctx.translate(egg.x, egg.y);

      var wobRot = egg.wobble > 0.01
        ? Math.sin(egg.wobblePhase) * egg.wobble * 0.1
        : 0;
      ctx.rotate(egg.rotation + wobRot);
      ctx.scale(egg.scale, egg.scale);

      var w = egg.width;
      var h = egg.height;

      // Shadow
      ctx.save();
      ctx.translate(0, h * 0.56);
      ctx.scale(1.15, 0.13);
      ctx.beginPath();
      ctx.arc(0, 0, w * 0.42, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
      ctx.fill();
      ctx.restore();

      // Outer glow
      var glowR = h * (1.3 + egg.glowIntensity * 0.7);
      var ga = 0.04 + egg.glowIntensity * 0.22;
      var glowG = ctx.createRadialGradient(0, 0, h * 0.25, 0, 0, glowR);
      glowG.addColorStop(0, 'rgba(224, 170, 255, ' + ga + ')');
      glowG.addColorStop(0.5, 'rgba(200, 160, 255, ' + (ga * 0.3) + ')');
      glowG.addColorStop(1, 'rgba(180, 140, 255, 0)');
      ctx.fillStyle = glowG;
      ctx.beginPath();
      ctx.arc(0, 0, glowR, 0, Math.PI * 2);
      ctx.fill();

      // Egg body fill
      drawEggPath(ctx, w, h);
      var bodyG = ctx.createLinearGradient(-w * 0.25, -h / 2, w * 0.2, h / 2);
      bodyG.addColorStop(0, '#faf5ff');
      bodyG.addColorStop(0.25, '#f0e8ff');
      bodyG.addColorStop(0.55, '#e8d5f5');
      bodyG.addColorStop(1, '#d4b8e8');
      ctx.fillStyle = bodyG;
      ctx.fill();

      // Iridescent overlay
      var iH = Math.round(Math.sin(egg.iridPhase) * 30 + 270);
      drawEggPath(ctx, w, h);
      var iG = ctx.createLinearGradient(-w * 0.4, -h * 0.3, w * 0.4, h * 0.3);
      iG.addColorStop(0, 'hsla(' + (iH - 30) + ', 60%, 80%, 0.08)');
      iG.addColorStop(0.5, 'hsla(' + iH + ', 70%, 85%, 0.12)');
      iG.addColorStop(1, 'hsla(' + (iH + 40) + ', 50%, 75%, 0.06)');
      ctx.fillStyle = iG;
      ctx.fill();

      // Subtle border
      drawEggPath(ctx, w, h);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Main highlight
      ctx.beginPath();
      ctx.ellipse(-w * 0.1, -h * 0.22, w * 0.09, h * 0.13, -0.25, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.fill();

      // Small secondary highlight
      ctx.beginPath();
      ctx.ellipse(-w * 0.04, -h * 0.06, w * 0.035, h * 0.035, -0.15, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.fill();

      // Cracks
      renderCracks(ctx);

      // Inner light from cracks at 75%+
      if (egg.hatchProgress >= 75) {
        var lightA = ((egg.hatchProgress - 75) / 25) * 0.25 * egg.glowIntensity;
        for (var ci = 0; ci < cracks.length; ci++) {
          var cr = cracks[ci];
          if (!cr.glowing) continue;
          for (var pi = 0; pi < cr.points.length; pi++) {
            var pt = cr.points[pi];
            var lg = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, w * 0.12);
            lg.addColorStop(0, 'rgba(255, 240, 200, ' + (lightA * cr.progress) + ')');
            lg.addColorStop(1, 'rgba(255, 200, 150, 0)');
            ctx.fillStyle = lg;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, w * 0.12, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // Instructive text
      if (!hatching.active && egg.scale >= 0.98 && egg.hatchProgress < 8) {
        var tA = 0.18 + Math.sin(G.lastTime / 1000 * 2) * 0.1;
        ctx.fillStyle = 'rgba(224, 170, 255, ' + tA + ')';
        ctx.font = '300 ' + Math.round(G.width * 0.028) + 'px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText('acaricia para despertar', 0, h / 2 + 35);
      }

      // Progress indicator
      if (egg.hatchProgress >= 8 && egg.hatchProgress < 100 && !hatching.active) {
        var pA = 0.12 + egg.glowIntensity * 0.15;
        ctx.fillStyle = 'rgba(224, 170, 255, ' + pA + ')';
        ctx.font = '300 ' + Math.round(G.width * 0.024) + 'px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(Math.round(egg.hatchProgress) + '%', 0, h / 2 + 35);
      }

      // Flash overlay during hatching
      if (hatching.active && hatching.flashAlpha > 0.01) {
        ctx.fillStyle = 'rgba(255, 250, 240, ' + hatching.flashAlpha + ')';
        drawEggPath(ctx, w * 1.5, h * 1.5);
        ctx.fill();
      }

      ctx.restore();
    },

    isComplete: function() {
      return hatching.active && hatching.phase >= 3;
    },

    getProgress: function() {
      return egg.hatchProgress;
    }
  };
})();
