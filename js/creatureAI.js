/**
 * ===================================================
 * CreatureAI — Comportamiento autónomo y estados idle
 * ===================================================
 * Máquina de estados para movimiento idle:
 * still, wander, explore, bounce.
 * El mood afecta las probabilidades de cada estado.
 * ===================================================
 */
(function() {
  'use strict';

  var STILL   = 'still';
  var WANDER  = 'wander';
  var EXPLORE = 'explore';
  var BOUNCE  = 'bounce';

  var MOODS = {
    neutral:  { still: 4, wander: 3, explore: 2, bounce: 1, speed: 1.0, breath: 1.0 },
    happy:    { still: 2, wander: 3, explore: 3, bounce: 3, speed: 1.2, breath: 1.1 },
    sad:      { still: 6, wander: 2, explore: 1, bounce: 0, speed: 0.5, breath: 0.8 },
    excited:  { still: 1, wander: 2, explore: 3, bounce: 5, speed: 1.5, breath: 1.3 },
    sleepy:   { still: 8, wander: 1, explore: 0, bounce: 0, speed: 0.3, breath: 1.5 },
    scared:   { still: 5, wander: 1, explore: 1, bounce: 2, speed: 0.8, breath: 1.5 }
  };

  var state = STILL;
  var timer = 0;
  var duration = 3;
  var mood = 'neutral';
  var mc = MOODS.neutral;
  var bouncePhase = 0;
  var interacting = false;

  function wChoice(weights) {
    var keys = Object.keys(weights);
    var total = 0;
    for (var i = 0; i < keys.length; i++) total += weights[keys[i]];
    if (total <= 0) return keys[0];
    var r = Math.random() * total;
    for (var i = 0; i < keys.length; i++) {
      r -= weights[keys[i]];
      if (r <= 0) return keys[i];
    }
    return keys[keys.length - 1];
  }

  function rndTarget(near) {
    var G = window.GAME;
    var P = window.CreaturePhysics;
    var m = P.baseRadius * 1.5;
    var tx, ty;
    if (near) {
      var dist = P.baseRadius * (1 + Math.random() * 2);
      var a = Math.random() * Math.PI * 2;
      tx = P.x + Math.cos(a) * dist;
      ty = P.y + Math.sin(a) * dist;
    } else {
      tx = m + Math.random() * (G.width - m * 2);
      ty = G.height * 0.3 + Math.random() * (G.height * 0.55);
    }
    tx = Math.max(m, Math.min(G.width - m, tx));
    ty = Math.max(m + 50, Math.min(G.height - m, ty));
    return { x: tx, y: ty };
  }

  function pickState() {
    var choice = wChoice({
      still: mc.still, wander: mc.wander,
      explore: mc.explore, bounce: mc.bounce
    });
    state = choice;
    timer = 0;

    var P = window.CreaturePhysics;
    switch (choice) {
      case STILL:
        duration = 3 + Math.random() * 5;
        P.targetX = P.x;
        P.targetY = P.y;
        break;
      case WANDER:
        duration = 2 + Math.random() * 4;
        var t1 = rndTarget(true);
        P.targetX = t1.x; P.targetY = t1.y;
        break;
      case EXPLORE:
        duration = 3 + Math.random() * 4;
        var t2 = rndTarget(false);
        P.targetX = t2.x; P.targetY = t2.y;
        break;
      case BOUNCE:
        duration = 2 + Math.random() * 3;
        bouncePhase = 0;
        break;
    }
  }

  window.CreatureAI = {
    get state() { return state; },
    get mood() { return mood; },
    get interacting() { return interacting; },
    set interacting(v) { interacting = v; },

    init: function() {
      mood = 'neutral';
      mc = MOODS.neutral;
      state = STILL;
      timer = 0;
      duration = 2;
      interacting = false;
      bouncePhase = 0;
      console.log('[CreatureAI] Initialized');
    },

    setMood: function(m) {
      if (MOODS[m]) {
        mood = m;
        mc = MOODS[m];
        if (window.CreaturePhysics) {
          window.CreaturePhysics.setBreathing(
            2.1 * mc.breath,
            0.03 * mc.breath
          );
        }
        console.log('[CreatureAI] Mood →', m);
      }
    },

    getMoodConfig: function() { return mc; },

    update: function(dt) {
      if (interacting) { timer = 0; return; }

      var P = window.CreaturePhysics;
      timer += dt;

      if (timer >= duration) {
        pickState();
        return;
      }

      switch (state) {
        case BOUNCE:
          bouncePhase += dt * (4 + mc.speed * 2);
          var sinB = Math.sin(bouncePhase);
          if (sinB > 0.92) {
            P.applyForce(
              (Math.random() - 0.5) * 40 * mc.speed,
              -80 * mc.speed * dt * 60
            );
          }
          break;

        case WANDER:
        case EXPLORE:
          var dx = P.targetX - P.x;
          var dy = P.targetY - P.y;
          if (dx * dx + dy * dy < P.baseRadius * P.baseRadius * 0.15) {
            state = STILL;
            duration = timer + 1 + Math.random() * 2;
            P.targetX = P.x;
            P.targetY = P.y;
          }
          break;
      }
    }
  };
})();
