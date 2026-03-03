/**
 * ===================================================
 * EmotionSystem — Sistema emocional complejo
 * ===================================================
 * La criatura expresa emociones mediante COLOR y
 * MOVIMIENTO (no tiene rostro). 9 emociones base
 * con mezcla ponderada de color HSL, atenuación
 * natural, emociones opuestas y triggers contextuales.
 *
 * Uso:
 *   EmotionSystem.init()
 *   EmotionSystem.update(dt)    // cada frame
 *   EmotionSystem.modify('happiness', +15)
 *   EmotionSystem.getDominant() // → 'happiness'
 * ===================================================
 */
(function() {
  'use strict';

  // ─────────────────────────────────────────────
  // Definición de emociones base
  // ─────────────────────────────────────────────

  /**
   * Cada emoción tiene:
   * - color: {h, s, l} — color HSL asociado
   * - mood: string que se pasa a CreatureAI.setMood()
   * - opposites: emociones que bajan cuando esta sube
   * - oppFactor: cuánto baja la opuesta (0-1)
   */
  var EMOTION_DEFS = {
    happiness: {
      color: { h: 45, s: 80, l: 70 },
      mood: 'happy',
      opposites: ['sadness'],
      oppFactor: 0.4
    },
    sadness: {
      color: { h: 220, s: 40, l: 45 },
      mood: 'sad',
      opposites: ['happiness', 'playful'],
      oppFactor: 0.3
    },
    fear: {
      color: { h: 270, s: 60, l: 50 },
      mood: 'scared',
      opposites: ['curiosity', 'playful'],
      oppFactor: 0.35
    },
    anger: {
      color: { h: 0, s: 80, l: 50 },
      mood: 'excited',
      opposites: ['love', 'sleepy'],
      oppFactor: 0.3
    },
    curiosity: {
      color: { h: 170, s: 70, l: 60 },
      mood: 'happy',
      opposites: ['fear', 'sleepy'],
      oppFactor: 0.25
    },
    love: {
      color: { h: 330, s: 70, l: 70 },
      mood: 'happy',
      opposites: ['anger', 'fear'],
      oppFactor: 0.3
    },
    sleepy: {
      color: { h: 240, s: 30, l: 40 },
      mood: 'sleepy',
      opposites: ['playful', 'curiosity'],
      oppFactor: 0.35
    },
    playful: {
      color: { h: 130, s: 70, l: 65 },
      mood: 'excited',
      opposites: ['sadness', 'sleepy'],
      oppFactor: 0.3
    },
    sick: {
      color: { h: 90, s: 40, l: 45 },
      mood: 'sad',
      opposites: ['happiness', 'playful'],
      oppFactor: 0.2
    }
  };

  /** Neutral value — emotions decay toward this */
  var NEUTRAL = 50;

  /** Decay speed (units per second toward neutral) */
  var DECAY_RATE = 0.5;

  /** Color lerp speed per second (0-1) */
  var COLOR_LERP_SPEED = 0.02;

  /** Minimum emotion delta to be considered "active" */
  var ACTIVE_THRESHOLD = 5;

  // ─────────────────────────────────────────────
  // State
  // ─────────────────────────────────────────────

  /** Current emotion values (0-100) */
  var emotions = {};

  /** Current blended output color */
  var currentColor = { h: 270, s: 60, l: 65 };

  /** Target blended color (we lerp toward this) */
  var targetColor = { h: 270, s: 60, l: 65 };

  /** Cached dominant emotion name */
  var dominant = 'neutral';

  /** Cached dominant intensity (0-1) */
  var dominantIntensity = 0;

  /** Cached mood string */
  var currentMood = 'neutral';

  /** Timer for periodic recalculation (avoid every frame) */
  var recalcTimer = 0;

  /** Recalculate dominant/color every N seconds */
  var RECALC_INTERVAL = 0.15;

  /** All emotion keys (cached for iteration) */
  var EMOTION_KEYS = Object.keys(EMOTION_DEFS);
  var NUM_EMOTIONS = EMOTION_KEYS.length;

  // ─────────────────────────────────────────────
  // HSL utilities
  // ─────────────────────────────────────────────

  /**
   * Lerp hue on the shortest arc around the 360° wheel
   */
  function lerpHue(a, b, t) {
    var diff = b - a;
    // Shortest path on the circle
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    var result = a + diff * t;
    if (result < 0) result += 360;
    if (result >= 360) result -= 360;
    return result;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function clamp(v, min, max) {
    return v < min ? min : (v > max ? max : v);
  }

  // ─────────────────────────────────────────────
  // Compute blended target color + dominant
  // ─────────────────────────────────────────────

  function recalculate() {
    var totalWeight = 0;
    var wH = 0, wS = 0, wL = 0;
    var bestKey = 'neutral';
    var bestVal = -1;

    // We use distance from neutral as weight
    // so emotions at exactly 50 contribute nothing
    for (var i = 0; i < NUM_EMOTIONS; i++) {
      var key = EMOTION_KEYS[i];
      var val = emotions[key];
      var dist = Math.abs(val - NEUTRAL);

      if (dist < ACTIVE_THRESHOLD) continue;

      // Weight is how far from neutral (squared for emphasis)
      var weight = dist * dist;
      var def = EMOTION_DEFS[key];

      // For hue blending we need to handle the circular nature
      // Use sin/cos decomposition for proper circular average
      var hRad = def.color.h * Math.PI / 180;
      wH += Math.cos(hRad) * weight;
      wS += def.color.s * weight;
      wL += def.color.l * weight;
      totalWeight += weight;

      if (val > bestVal) {
        bestVal = val;
        bestKey = key;
      }
    }

    // Update dominant
    if (bestVal > NEUTRAL + ACTIVE_THRESHOLD) {
      dominant = bestKey;
      dominantIntensity = clamp((bestVal - NEUTRAL) / 50, 0, 1);
      currentMood = EMOTION_DEFS[bestKey].mood;
    } else {
      dominant = 'neutral';
      dominantIntensity = 0;
      currentMood = 'neutral';
    }

    // Compute blended color
    if (totalWeight > 0.01) {
      // Circular mean for hue
      var sinSum = 0, cosSum = 0;
      for (var j = 0; j < NUM_EMOTIONS; j++) {
        var k = EMOTION_KEYS[j];
        var v = emotions[k];
        var d = Math.abs(v - NEUTRAL);
        if (d < ACTIVE_THRESHOLD) continue;
        var w = d * d;
        var hr = EMOTION_DEFS[k].color.h * Math.PI / 180;
        sinSum += Math.sin(hr) * w;
        cosSum += Math.cos(hr) * w;
      }
      var avgHue = Math.atan2(sinSum, cosSum) * 180 / Math.PI;
      if (avgHue < 0) avgHue += 360;

      targetColor.h = avgHue;
      targetColor.s = clamp(wS / totalWeight, 20, 90);
      targetColor.l = clamp(wL / totalWeight, 30, 80);
    } else {
      // All neutral — default purple
      targetColor.h = 270;
      targetColor.s = 60;
      targetColor.l = 65;
    }
  }

  // ─────────────────────────────────────────────
  // Decay emotions toward neutral
  // ─────────────────────────────────────────────

  function decayEmotions(dt) {
    var decayAmt = DECAY_RATE * dt;

    for (var i = 0; i < NUM_EMOTIONS; i++) {
      var key = EMOTION_KEYS[i];
      var val = emotions[key];

      if (val > NEUTRAL) {
        emotions[key] = Math.max(NEUTRAL, val - decayAmt);
      } else if (val < NEUTRAL) {
        emotions[key] = Math.min(NEUTRAL, val + decayAmt);
      }
    }
  }

  // ─────────────────────────────────────────────
  // Apply color to Creature
  // ─────────────────────────────────────────────

  function applyToCreature(dt) {
    // Smooth lerp current color toward target
    var t = clamp(COLOR_LERP_SPEED * dt * 60, 0, 1);

    currentColor.h = lerpHue(currentColor.h, targetColor.h, t);
    currentColor.s = lerp(currentColor.s, targetColor.s, t);
    currentColor.l = lerp(currentColor.l, targetColor.l, t);

    // Push to Creature
    if (window.Creature) {
      window.Creature.setColor(currentColor.h, currentColor.s, currentColor.l);
    }

    // Push mood to AI
    if (window.Creature && window.Creature.setMood) {
      window.Creature.setMood(currentMood);
    }
  }

  // ─────────────────────────────────────────────
  // Input-based triggers (register once)
  // ─────────────────────────────────────────────

  var _inputBound = false;
  var _dragAccum = 0;
  var _lastDragOnCreature = false;

  function bindInputTriggers() {
    if (_inputBound || !window.InputSystem) return;
    _inputBound = true;

    // Tap on creature → curiosity + playful
    InputSystem.on('tap', function(e) {
      if (window.GAME.state !== 'living') return;
      if (window.Creature && window.Creature.isPointInside(e.x, e.y)) {
        window.EmotionSystem.modify('curiosity', 3);
        window.EmotionSystem.modify('playful', 2);
      }
    });

    // Double tap → more playful
    InputSystem.on('double_tap', function(e) {
      if (window.GAME.state !== 'living') return;
      if (window.Creature && window.Creature.isPointInside(e.x, e.y)) {
        window.EmotionSystem.modify('playful', 5);
        window.EmotionSystem.modify('happiness', 3);
      }
    });

    // Hold → love + slight sleepy (warmth)
    InputSystem.on('hold', function(e) {
      if (window.GAME.state !== 'living') return;
      if (window.Creature && window.Creature.isPointInside(e.x, e.y)) {
        window.EmotionSystem.modify('love', 4);
        window.EmotionSystem.modify('sleepy', 1.5);
        window.EmotionSystem.modify('happiness', 2);
      }
    });

    // Drag — track caressing vs rough dragging
    InputSystem.on('drag', function(e) {
      if (window.GAME.state !== 'living') return;
      if (!window.Creature) return;

      var onCreature = window.Creature.isPointInside(e.x, e.y);

      if (onCreature) {
        // Check velocity for gentle vs rough
        var speed = Math.sqrt(e.velocityX * e.velocityX + e.velocityY * e.velocityY);

        if (speed < 300) {
          // Gentle caress
          _dragAccum += 0.08;
          if (_dragAccum >= 1) {
            _dragAccum -= 1;
            window.EmotionSystem.modify('happiness', 1.5);
            window.EmotionSystem.modify('love', 1);
          }
        } else if (speed > 600) {
          // Rough dragging
          _dragAccum = 0;
          window.EmotionSystem.modify('anger', 2);
          window.EmotionSystem.modify('fear', 1.5);
        }
      }
    });

    // Release → reset drag accumulator
    InputSystem.on('release', function() {
      _dragAccum = 0;
    });
  }

  // ─────────────────────────────────────────────
  // Neglect timer (ignored too long)
  // ─────────────────────────────────────────────

  var _lastInteractionTime = 0;
  var NEGLECT_THRESHOLD = 120; // seconds before sadness kicks in
  var _neglectApplied = false;

  function checkNeglect(dt) {
    _lastInteractionTime += dt;

    if (_lastInteractionTime > NEGLECT_THRESHOLD && !_neglectApplied) {
      _neglectApplied = true;
      window.EmotionSystem.modify('sadness', 15);
      window.EmotionSystem.modify('love', -8);
      console.log('[EmotionSystem] Criatura se siente ignorada');
    }
  }

  function resetNeglectTimer() {
    _lastInteractionTime = 0;
    _neglectApplied = false;
  }

  // ══════════════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════════════

  window.EmotionSystem = {

    /**
     * Initialize all emotions to neutral (50)
     */
    init: function() {
      for (var i = 0; i < NUM_EMOTIONS; i++) {
        emotions[EMOTION_KEYS[i]] = NEUTRAL;
      }

      currentColor.h = 270;
      currentColor.s = 60;
      currentColor.l = 65;
      targetColor.h = 270;
      targetColor.s = 60;
      targetColor.l = 65;

      dominant = 'neutral';
      dominantIntensity = 0;
      currentMood = 'neutral';
      recalcTimer = 0;

      _lastInteractionTime = 0;
      _neglectApplied = false;
      _dragAccum = 0;

      bindInputTriggers();

      console.log('[EmotionSystem] Inicializado — todas las emociones en', NEUTRAL);
    },

    /**
     * Update every frame:
     * - Decay emotions toward neutral
     * - Recalculate blended color periodically
     * - Apply color/mood to Creature
     * - Check neglect timer
     */
    update: function(dt) {
      // Decay
      decayEmotions(dt);

      // Periodic heavy recalc
      recalcTimer += dt;
      if (recalcTimer >= RECALC_INTERVAL) {
        recalcTimer -= RECALC_INTERVAL;
        recalculate();
      }

      // Smooth color application every frame
      applyToCreature(dt);

      // Neglect check
      checkNeglect(dt);

      // Reset neglect when any input happens
      if (window.InputSystem && window.InputSystem.isDown()) {
        resetNeglectTimer();
      }
    },

    /**
     * Modify an emotion by a signed amount
     * Also adjusts opposing emotions
     *
     * @param {string} emotion — key name
     * @param {number} amount — positive to increase, negative to decrease
     */
    modify: function(emotion, amount) {
      if (!EMOTION_DEFS[emotion]) {
        console.warn('[EmotionSystem] Emoción desconocida:', emotion);
        return;
      }

      var prev = emotions[emotion];
      emotions[emotion] = clamp(prev + amount, 0, 100);

      // Opposing emotions
      if (amount > 0) {
        var def = EMOTION_DEFS[emotion];
        var opps = def.opposites;
        var factor = def.oppFactor;
        for (var i = 0; i < opps.length; i++) {
          var oppKey = opps[i];
          if (emotions[oppKey] !== undefined) {
            emotions[oppKey] = clamp(
              emotions[oppKey] - amount * factor,
              0, 100
            );
          }
        }
      }

      // Reset neglect on positive interaction
      if (emotion === 'happiness' || emotion === 'love' || emotion === 'playful') {
        resetNeglectTimer();
      }

      // Force immediate recalc on significant changes
      if (Math.abs(amount) >= 5) {
        recalculate();
      }
    },

    /**
     * Get the dominant emotion name
     * @returns {string} e.g. 'happiness', 'neutral'
     */
    getDominant: function() {
      return dominant;
    },

    /**
     * Get the blended output color
     * @returns {{h: number, s: number, l: number}}
     */
    getColor: function() {
      return {
        h: currentColor.h,
        s: currentColor.s,
        l: currentColor.l
      };
    },

    /**
     * Get the mood string for Creature/AI
     * @returns {string}
     */
    getMood: function() {
      return currentMood;
    },

    /**
     * Get intensity of dominant emotion (0-1)
     * 0 = fully neutral, 1 = extreme
     * @returns {number}
     */
    getIntensity: function() {
      return dominantIntensity;
    },

    /**
     * Get raw value of a specific emotion (0-100)
     * @param {string} emotion
     * @returns {number}
     */
    get: function(emotion) {
      return emotions[emotion] !== undefined ? emotions[emotion] : NEUTRAL;
    },

    /**
     * Get all emotion values (read-only snapshot)
     * @returns {Object}
     */
    getAll: function() {
      var snapshot = {};
      for (var i = 0; i < NUM_EMOTIONS; i++) {
        snapshot[EMOTION_KEYS[i]] = Math.round(emotions[EMOTION_KEYS[i]] * 10) / 10;
      }
      return snapshot;
    },

    /**
     * Trigger preset emotional events
     * @param {string} trigger — named event
     */
    trigger: function(trigger) {
      switch (trigger) {
        case 'pet':
        case 'caress':
          this.modify('happiness', 8);
          this.modify('love', 5);
          break;

        case 'feed_good':
          this.modify('happiness', 12);
          this.modify('sadness', -5);
          break;

        case 'feed_bad':
          this.modify('anger', 8);
          this.modify('sick', 10);
          break;

        case 'toy':
        case 'play':
          this.modify('playful', 12);
          this.modify('happiness', 6);
          break;

        case 'shake':
          this.modify('fear', 12);
          this.modify('happiness', -5);
          break;

        case 'wake':
          this.modify('sleepy', -15);
          this.modify('anger', 4);
          break;

        case 'sleep':
          this.modify('sleepy', 20);
          this.modify('happiness', 3);
          break;

        case 'scare':
          this.modify('fear', 15);
          this.modify('curiosity', -8);
          break;

        case 'comfort':
          this.modify('fear', -10);
          this.modify('love', 8);
          this.modify('happiness', 5);
          break;

        case 'neglect':
          this.modify('sadness', 15);
          this.modify('love', -8);
          break;

        default:
          console.warn('[EmotionSystem] Trigger desconocido:', trigger);
      }
    },

    /**
     * Serialize for save
     * @returns {Object}
     */
    serialize: function() {
      var data = {};
      for (var i = 0; i < NUM_EMOTIONS; i++) {
        data[EMOTION_KEYS[i]] = Math.round(emotions[EMOTION_KEYS[i]] * 100) / 100;
      }
      return {
        emotions: data,
        color: {
          h: Math.round(currentColor.h * 10) / 10,
          s: Math.round(currentColor.s * 10) / 10,
          l: Math.round(currentColor.l * 10) / 10
        }
      };
    },

    /**
     * Deserialize from save
     * @param {Object} data
     */
    deserialize: function(data) {
      if (data && data.emotions) {
        for (var i = 0; i < NUM_EMOTIONS; i++) {
          var key = EMOTION_KEYS[i];
          if (data.emotions[key] !== undefined) {
            emotions[key] = clamp(data.emotions[key], 0, 100);
          }
        }
      }
      if (data && data.color) {
        currentColor.h = data.color.h || 270;
        currentColor.s = data.color.s || 60;
        currentColor.l = data.color.l || 65;
        targetColor.h = currentColor.h;
        targetColor.s = currentColor.s;
        targetColor.l = currentColor.l;
      }
      recalculate();
      console.log('[EmotionSystem] Estado restaurado');
    }
  };

})();
