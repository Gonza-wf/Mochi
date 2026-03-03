/**
 * ===================================================
 * CreaturePhysics — Física del cuerpo + Pelos Verlet
 * ===================================================
 * Sistema de simulación física para la criatura:
 * - Cuerpo: spring hacia target, gravedad, bordes, squash/stretch
 * - Pelos: integración Verlet con constraints de distancia,
 *   gravedad, viento orgánico, inercia y reacción al toque
 * ===================================================
 */
(function() {
  'use strict';

  // ─── Constantes ───
  var HAIR_DAMPING = 0.935;
  var HAIR_GRAVITY = 80;
  var BODY_SPRING = 4.0;
  var BODY_DAMPING = 0.91;
  var CONSTRAINT_ITERS = 2;

  // ─── Hair data ───
  var hairs = [];
  var numHairs = 0;
  var hairBaseLen = 0;
  var hairBaseW = 0;

  // ─── Body state ───
  var bx = 0, by = 0;
  var bpx = 0, bpy = 0;
  var bvx = 0, bvy = 0;
  var btx = 0, bty = 0;
  var baseR = 0;
  var scX = 1, scY = 1;
  var breathPhase = 0;
  var breathAmp = 0.03;
  var breathSpeed = 2.1;
  var breathVal = 1;

  // ─── External force accumulator ───
  var frcX = 0, frcY = 0;

  // ─── Touch influence ───
  var tchX = 0, tchY = 0, tchStr = 0;

  // ─── Wind accumulator ───
  var windT = 0;

  window.CreaturePhysics = {

    get x()  { return bx; },   set x(v)  { bx = v; },
    get y()  { return by; },   set y(v)  { by = v; },
    get vx() { return bvx; },  set vx(v) { bvx = v; },
    get vy() { return bvy; },  set vy(v) { bvy = v; },
    get targetX() { return btx; }, set targetX(v) { btx = v; },
    get targetY() { return bty; }, set targetY(v) { bty = v; },
    get scaleX() { return scX; },
    get scaleY() { return scY; },
    get baseRadius() { return baseR; },
    get breathScale() { return breathVal; },
    springMul: 1,

    hairs: null,
    numHairs: 0,
    hairBaseWidth: 0,

    init: function(x, y, radius) {
      bx = x; by = y;
      bpx = x; bpy = y;
      bvx = 0; bvy = 0;
      btx = x; bty = y;
      baseR = radius;
      scX = 1; scY = 1;
      breathPhase = 0;
      breathVal = 1;
      frcX = 0; frcY = 0;
      tchStr = 0;
      windT = 0;
      this.springMul = 1;

      hairBaseLen = radius * 0.45;
      hairBaseW = Math.max(1.5, radius * 0.055);
      this.hairBaseWidth = hairBaseW;

      // Adaptive hair count
      var area = window.GAME.width * window.GAME.height;
      numHairs = Math.round(Math.max(60, Math.min(110, area / 3500)));
      this.numHairs = numHairs;

      // Create hair strands
      hairs = new Array(numHairs);
      for (var i = 0; i < numHairs; i++) {
        var angle = (i / numHairs) * Math.PI * 2;
        var ca = Math.cos(angle);
        var sa = Math.sin(angle);
        var nSeg = 3 + (i & 1);
        var lenMul = 0.7 + Math.random() * 0.6;
        var sLen = (hairBaseLen * lenMul) / nSeg;

        var pts = new Array(nSeg + 1);
        for (var j = 0; j <= nSeg; j++) {
          var d = radius + j * sLen;
          var px = ca * d;
          var py = sa * d;
          pts[j] = { x: px, y: py, px: px, py: py };
        }

        hairs[i] = {
          ca: ca, sa: sa,
          nSeg: nSeg,
          sLen: sLen,
          pts: pts
        };
      }
      this.hairs = hairs;

      console.log('[CreaturePhysics] ' + numHairs + ' hairs, r=' + Math.round(radius));
    },

    setTouch: function(wx, wy, strength) {
      tchX = wx; tchY = wy; tchStr = strength;
    },

    applyForce: function(fx, fy) {
      frcX += fx; frcY += fy;
    },

    setSquash: function(sx, sy) {
      scX = sx; scY = sy;
    },

    setBreathing: function(speed, amp) {
      breathSpeed = speed;
      breathAmp = amp;
    },

    updateBody: function(dt) {
      var G = window.GAME;

      // Breathing
      breathPhase += dt * breathSpeed;
      breathVal = 1 + Math.sin(breathPhase) * breathAmp;

      // Spring toward target
      var dx = btx - bx;
      var dy = bty - by;
      var sk = BODY_SPRING * this.springMul;
      bvx += dx * sk * dt;
      bvy += dy * sk * dt;

      // Subtle gravity
      bvy += 25 * dt;

      // External forces
      bvx += frcX;
      bvy += frcY;
      frcX = 0; frcY = 0;

      // Damping
      var damp = Math.pow(BODY_DAMPING, dt * 60);
      bvx *= damp;
      bvy *= damp;

      // Speed cap
      var maxSpd = G.width * 1.2;
      var spd = Math.sqrt(bvx * bvx + bvy * bvy);
      if (spd > maxSpd) {
        var ratio = maxSpd / spd;
        bvx *= ratio;
        bvy *= ratio;
        spd = maxSpd;
      }

      // Store previous
      bpx = bx;
      bpy = by;

      // Integrate
      bx += bvx * dt;
      by += bvy * dt;

      // Border bounce
      var margin = baseR * 0.7;
      var topM = margin + 50;
      if (bx < margin)             { bx = margin;             bvx = Math.abs(bvx) * 0.4; }
      if (bx > G.width - margin)   { bx = G.width - margin;   bvx = -Math.abs(bvx) * 0.4; }
      if (by < topM)               { by = topM;               bvy = Math.abs(bvy) * 0.4; }
      if (by > G.height - margin)  { by = G.height - margin;  bvy = -Math.abs(bvy) * 0.4; }

      // Squash & stretch
      var strAmt = Math.min(spd * 0.0004, 0.15);
      var tSX = 1, tSY = 1;
      if (spd > 8) {
        if (Math.abs(bvx) > Math.abs(bvy)) {
          tSX = 1 + strAmt;
          tSY = 1 / (1 + strAmt);
        } else {
          tSX = 1 / (1 + strAmt);
          tSY = 1 + strAmt;
        }
      }
      var lerpF = Math.min(1, dt * 8);
      scX += (tSX - scX) * lerpF;
      scY += (tSY - scY) * lerpF;
    },

    updateHairs: function(dt) {
      windT += dt;

      var dmx = bx - bpx;
      var dmy = by - bpy;
      var norm = dt * 60;
      var gravF = HAIR_GRAVITY * dt * dt;

      var tlx = tchX - bx;
      var tly = tchY - by;
      var br = baseR;

      for (var i = 0; i < numHairs; i++) {
        var h = hairs[i];
        var pts = h.pts;

        // Anchor root
        var rp = pts[0];
        rp.px = rp.x; rp.py = rp.y;
        rp.x = h.ca * br * scX * breathVal;
        rp.y = h.sa * br * scY * breathVal;

        // Verlet integrate
        for (var j = 1; j <= h.nSeg; j++) {
          var p = pts[j];
          var vx = (p.x - p.px) * HAIR_DAMPING;
          var vy = (p.y - p.py) * HAIR_DAMPING;

          p.px = p.x;
          p.py = p.y;

          vy += gravF;

          // Inertia
          vx -= dmx * 0.4;
          vy -= dmy * 0.4;

          // Organic wind
          var wph = windT * 2 + i * 0.37 + j * 0.6;
          vx += Math.sin(wph) * 0.35 * norm;
          vy += Math.cos(wph * 0.73 + i * 0.1) * 0.18 * norm;

          // Touch influence
          if (tchStr > 0.01 || tchStr < -0.01) {
            var tdx = p.x - tlx;
            var tdy = p.y - tly;
            var td2 = tdx * tdx + tdy * tdy;
            var touchR = br * 2.5;
            if (td2 < touchR * touchR && td2 > 1) {
              var td = Math.sqrt(td2);
              var f = tchStr * 2.0 * norm / (td + 8);
              vx += (tdx / td) * f;
              vy += (tdy / td) * f;
            }
          }

          p.x += vx;
          p.y += vy;
        }

        // Distance constraints
        for (var iter = 0; iter < CONSTRAINT_ITERS; iter++) {
          for (var j2 = 0; j2 < h.nSeg; j2++) {
            var p1 = pts[j2];
            var p2 = pts[j2 + 1];
            var cdx = p2.x - p1.x;
            var cdy = p2.y - p1.y;
            var d2 = cdx * cdx + cdy * cdy;
            if (d2 < 0.0001) continue;
            var d = Math.sqrt(d2);
            var diff = (d - h.sLen) / d;
            if (j2 === 0) {
              p2.x -= cdx * diff;
              p2.y -= cdy * diff;
            } else {
              var hd = diff * 0.5;
              p1.x += cdx * hd;
              p1.y += cdy * hd;
              p2.x -= cdx * hd;
              p2.y -= cdy * hd;
            }
          }
        }
      }

      // Decay touch
      tchStr *= 0.9;
    },

    resetHairs: function() {
      for (var i = 0; i < numHairs; i++) {
        var h = hairs[i];
        for (var j = 0; j <= h.nSeg; j++) {
          var d = baseR + j * h.sLen;
          var px = h.ca * d;
          var py = h.sa * d;
          h.pts[j].x = px; h.pts[j].y = py;
          h.pts[j].px = px; h.pts[j].py = py;
        }
      }
    }
  };
})();
