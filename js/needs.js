/**
 * ===================================================
 * NeedsSystem — Sistema de necesidades vitales
 * ===================================================
 * 5 necesidades (0-100) que decaen con el tiempo y
 * afectan las emociones de la criatura. Sin barras
 * ni UI — el jugador interpreta el comportamiento.
 *
 * Necesidades:
 *   hunger    — decae 1pt/5min
 *   fun       — decae 1pt/8min
 *   energy    — decae 1pt/10min
 *   affection — decae 1pt/15min
 *   health    — NO decae (solo por eventos)
 *
 * Uso:
 *   NeedsSystem.init()
 *   NeedsSystem.update(dt)
 *   NeedsSystem.satisfy('hunger', 20)
 *   NeedsSystem.get('hunger') // → 75
 * ===================================================
 */
(function() {
  'use strict';

  // ─────────────────────────────────────────────
  // Definiciones de necesidades
  // ─────────────────────────────────────────────

  /**
   * decayPer60s: cuánto baja cada 60 segundos reales
   * Calculado desde la especificación:
   *   hunger:    1pt/5min  = 1/300s  → 0.2/60s
   *   fun:       1pt/8min  = 1/480s  → 0.125/60s
   *   energy:    1pt/10min = 1/600s  → 0.1/60s
   *   affection: 1pt/15min = 1/900s  → 0.0667/60s
   *   health:    0 (solo eventos)
   */
  var NEED_DEFS = {
    hunger: {
      decayPerSec: 1 / 300,      // 1 point every 5 minutes
      nightMul: 0.5,             // half decay during sleep
      emotionEffects: {
        low:  { curiosity: -2, sadness: 3, anger: 2 },
        crit: { curiosity: -4, sadness: 5, anger: 4, happiness: -3 }
      }
    },
    fun: {
      decayPerSec: 1 / 480,      // 1 point every 8 minutes
      nightMul: 0.3,
      emotionEffects: {
        low:  { sadness: 2, curiosity: -1.5 },
        crit: { sadness: 4, curiosity: -3, playful: -3 }
      }
    },
    energy: {
      decayPerSec: 1 / 600,      // 1 point every 10 minutes
      nightMul: -0.5,            // NEGATIVE = recovers at night
      emotionEffects: {
        low:  { sleepy: 3, happiness: -1 },
        crit: { sleepy: 6, happiness: -3, curiosity: -2 }
      }
    },
    affection: {
      decayPerSec: 1 / 900,      // 1 point every 15 minutes
      nightMul: 0.25,
      emotionEffects: {
        low:  { sadness: 2, love: -2 },
        crit: { sadness: 4, love: -4, fear: 2 }
      }
    },
    health: {
      decayPerSec: 0,            // Only events
      nightMul: 0,
      emotionEffects: {
        low:  { sick: 3, happiness: -2 },
        crit: { sick: 6, happiness: -4, sleepy: 3 }
      }
    }
  };

  var NEED_KEYS = Object.keys(NEED_DEFS);
  var NUM_NEEDS = NEED_KEYS.length;

  // ─── Thresholds ───
  var THRESHOLD_SATISFIED = 70;   // > 70: no signals
  var THRESHOLD_NOTICE    = 40;   // 40-70: subtle signals
  var THRESHOLD_LOW       = 20;   // 20-40: obvious signals
  var THRESHOLD_CRITICAL  = 5;    // < 5: grave consequences

  // ─── Night hours (local time) ───
  var NIGHT_START = 23;   // 11 PM
  var NIGHT_END   = 7;    // 7 AM

  // ─── Emotion push interval (seconds) ───
  var EMOTION_PUSH_INTERVAL = 1.0;

  // ─── Health damage from hunger ───
  var HUNGER_DAMAGE_THRESHOLD = 20;
  var HUNGER_DAMAGE_TIME = 120;   // seconds of hunger < 20 before health drops
  var HUNGER_DAMAGE_RATE = 1 / 60; // 1 health per minute

  // ─── Behavioral signals interval ───
  var BEHAVIOR_INTERVAL = 3.0;

  // ─────────────────────────────────────────────
  // State
  // ─────────────────────────────────────────────

  /** Current need values (0-100) */
  var needs = {};

  /** Timer for emotion push (only push every EMOTION_PUSH_INTERVAL) */
  var emotionTimer = 0;

  /** Timer for behavioral signals */
  var behaviorTimer = 0;

  /** Time hunger has been below critical (for health damage) */
  var hungerCriticalTime = 0;

  /** Timestamp for offline calculation */
  var lastSaveTime = 0;

  // ─────────────────────────────────────────────
  // Utilities
  // ─────────────────────────────────────────────

  function clamp(v, min, max) {
    return v < min ? min : (v > max ? max : v);
  }

  /**
   * Check if current time is during "night" hours
   * Night = 23:00 to 07:00 local time
   */
  function isNightTime() {
    var hour = new Date().getHours();
    return hour >= NIGHT_START || hour < NIGHT_END;
  }

  /**
   * Get the tier of a need value
   * Returns: 'satisfied', 'notice', 'low', 'critical'
   */
  function getTier(value) {
    if (value > THRESHOLD_SATISFIED) return 'satisfied';
    if (value > THRESHOLD_LOW)       return 'notice';
    if (value > THRESHOLD_CRITICAL)  return 'low';
    return 'critical';
  }

  // ─────────────────────────────────────────────
  // Decay needs over time
  // ─────────────────────────────────────────────

  function decayNeeds(dt) {
    var night = isNightTime();

    for (var i = 0; i < NUM_NEEDS; i++) {
      var key = NEED_KEYS[i];
      var def = NEED_DEFS[key];

      if (def.decayPerSec === 0) continue;

      var rate = def.decayPerSec;

      if (night) {
        // nightMul can be negative (energy recovers at night)
        rate *= def.nightMul;
      }

      // Negative rate = recovery (energy at night)
      needs[key] = clamp(needs[key] - rate * dt, 0, 100);
    }

    // Special: energy recovers when creature is sleepy enough
    if (window.EmotionSystem) {
      var sleepyVal = window.EmotionSystem.get('sleepy');
      if (sleepyVal > 60) {
        // Recovery rate proportional to sleepiness
        var recoveryRate = (sleepyVal - 60) / 40 * (1 / 300); // up to 1pt/5min
        needs.energy = clamp(needs.energy + recoveryRate * dt, 0, 100);
      }
    }
  }

  // ─────────────────────────────────────────────
  // Push emotions based on need levels
  // ─────────────────────────────────────────────

  function pushEmotions() {
    if (!window.EmotionSystem) return;

    for (var i = 0; i < NUM_NEEDS; i++) {
      var key = NEED_KEYS[i];
      var val = needs[key];
      var def = NEED_DEFS[key];
      var tier = getTier(val);

      if (tier === 'satisfied') continue;

      // Choose effect set based on tier
      var effects = null;
      var multiplier = 1;

      if (tier === 'critical') {
        effects = def.emotionEffects.crit;
        multiplier = 1.5;
      } else if (tier === 'low') {
        effects = def.emotionEffects.crit;
        multiplier = 0.8;
      } else { // notice
        effects = def.emotionEffects.low;
        multiplier = 0.4;
      }

      if (!effects) continue;

      // Scale effect by how far below threshold
      // A need at 35 pushes less than a need at 5
      var severity = 1 - (val / THRESHOLD_SATISFIED);
      severity = clamp(severity, 0, 1);
      var scale = severity * multiplier * EMOTION_PUSH_INTERVAL;

      for (var emoKey in effects) {
        var amount = effects[emoKey] * scale;
        window.EmotionSystem.modify(emoKey, amount);
      }
    }
  }

  // ─────────────────────────────────────────────
  // Cross-need interactions
  // ─────────────────────────────────────────────

  function checkInteractions(dt) {
    // Hunger < 20 for too long → health drops
    if (needs.hunger < HUNGER_DAMAGE_THRESHOLD) {
      hungerCriticalTime += dt;
      if (hungerCriticalTime >= HUNGER_DAMAGE_TIME) {
        needs.health = clamp(needs.health - HUNGER_DAMAGE_RATE * dt, 0, 100);
      }
    } else {
      hungerCriticalTime = Math.max(0, hungerCriticalTime - dt * 2); // recover timer slowly
    }

    // Energy < 10 → creature "falls asleep" (handled by EmotionSystem/AI)
    // This is a signal, not a direct need change

    // Health < 30 → energy drains faster
    if (needs.health < 30) {
      var healthDrain = (30 - needs.health) / 30 * (1 / 600) * dt;
      needs.energy = clamp(needs.energy - healthDrain, 0, 100);
    }
  }

  // ─────────────────────────────────────────────
  // Behavioral signals (movement/position hints)
  // ─────────────────────────────────────────────

  function applyBehavioralSignals() {
    if (!window.Creature || !window.CreaturePhysics) return;

    var G = window.GAME;
    var P = window.CreaturePhysics;
    var lowest = getLowest();

    if (!lowest || lowest.value > THRESHOLD_SATISFIED) return;

    var severity = 1 - (lowest.value / THRESHOLD_SATISFIED);
    severity = clamp(severity, 0, 1);

    switch (lowest.name) {
      case 'hunger':
        // Move toward bottom of screen (menu zone)
        if (severity > 0.4 && Math.random() < severity * 0.3) {
          P.targetY = G.height * (0.75 + severity * 0.15);
          // Slight random horizontal drift (searching)
          P.targetX = P.x + (Math.random() - 0.5) * G.width * 0.3;
          P.targetX = clamp(P.targetX, P.baseRadius, G.width - P.baseRadius);
        }
        break;

      case 'fun':
        // Aimless rolling, random direction changes
        if (severity > 0.3 && Math.random() < severity * 0.25) {
          P.targetX = P.baseRadius + Math.random() * (G.width - P.baseRadius * 2);
          P.targetY = P.y + (Math.random() - 0.5) * G.height * 0.2;
          P.targetY = clamp(P.targetY, P.baseRadius + 50, G.height - P.baseRadius);
        }
        break;

      case 'energy':
        // Shrink toward bottom, slow down
        if (severity > 0.4) {
          P.targetY = G.height * (0.7 + severity * 0.15);
          // Move toward center X (settling down)
          P.targetX = P.x + (G.centerX - P.x) * 0.1;
        }
        break;

      case 'affection':
        // Move toward edges (withdrawn)
        if (severity > 0.5 && Math.random() < severity * 0.2) {
          var side = Math.random() > 0.5 ? 1 : -1;
          P.targetX = G.centerX + side * (G.width * 0.3 + severity * G.width * 0.1);
          P.targetX = clamp(P.targetX, P.baseRadius, G.width - P.baseRadius);
          // Slight tremble
          if (severity > 0.7) {
            P.applyForce(
              (Math.random() - 0.5) * severity * 15,
              (Math.random() - 0.5) * severity * 10
            );
          }
        }
        break;

      case 'health':
        // Erratic movement, trembling
        if (severity > 0.3 && Math.random() < severity * 0.35) {
          P.applyForce(
            (Math.random() - 0.5) * severity * 30,
            (Math.random() - 0.5) * severity * 25
          );
        }
        break;
    }
  }

  // ─────────────────────────────────────────────
  // Get the lowest need
  // ─────────────────────────────────────────────

  function getLowest() {
    var minKey = null;
    var minVal = 101;

    for (var i = 0; i < NUM_NEEDS; i++) {
      var key = NEED_KEYS[i];
      if (needs[key] < minVal) {
        minVal = needs[key];
        minKey = key;
      }
    }

    return minKey ? { name: minKey, value: minVal } : null;
  }

  // ─────────────────────────────────────────────
  // Offline time processing
  // ─────────────────────────────────────────────

  function processOfflineTime(lastTimestamp) {
    if (!lastTimestamp) return;

    var now = Date.now();
    var elapsedSec = (now - lastTimestamp) / 1000;

    if (elapsedSec <= 0 || elapsedSec > 7 * 24 * 3600) {
      // Ignore negative or >7 days (probably corrupt)
      console.log('[NeedsSystem] Offline time ignored:', Math.round(elapsedSec) + 's');
      return;
    }

    console.log('[NeedsSystem] Processing offline time:', Math.round(elapsedSec / 60) + ' minutes');

    // Simulate time in 5-minute chunks for day/night accuracy
    var CHUNK = 300; // 5 minutes in seconds
    var simTime = lastTimestamp;
    var remaining = elapsedSec;

    while (remaining > 0) {
      var chunk = Math.min(remaining, CHUNK);
      var simDate = new Date(simTime);
      var simHour = simDate.getHours();
      var isNight = simHour >= NIGHT_START || simHour < NIGHT_END;

      for (var i = 0; i < NUM_NEEDS; i++) {
        var key = NEED_KEYS[i];
        var def = NEED_DEFS[key];

        if (def.decayPerSec === 0) continue;

        var rate = def.decayPerSec;
        if (isNight) {
          rate *= def.nightMul;
        }

        needs[key] = clamp(needs[key] - rate * chunk, 0, 100);
      }

      // Energy recovery during night
      if (isNight) {
        needs.energy = clamp(needs.energy + (1 / 600) * chunk, 0, 100);
      }

      // Health damage from prolonged hunger
      if (needs.hunger < HUNGER_DAMAGE_THRESHOLD) {
        hungerCriticalTime += chunk;
        if (hungerCriticalTime >= HUNGER_DAMAGE_TIME) {
          needs.health = clamp(needs.health - HUNGER_DAMAGE_RATE * chunk, 0, 100);
        }
      } else {
        hungerCriticalTime = Math.max(0, hungerCriticalTime - chunk);
      }

      simTime += chunk * 1000;
      remaining -= chunk;
    }

    console.log('[NeedsSystem] Post-offline needs:', JSON.stringify(getSnapshot()));
  }

  // ─────────────────────────────────────────────
  // Snapshot for debug
  // ─────────────────────────────────────────────

  function getSnapshot() {
    var snap = {};
    for (var i = 0; i < NUM_NEEDS; i++) {
      snap[NEED_KEYS[i]] = Math.round(needs[NEED_KEYS[i]]);
    }
    return snap;
  }

  // ══════════════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════════════

  window.NeedsSystem = {

    /**
     * Initialize all needs to 80 (well-fed, happy start)
     */
    init: function() {
      for (var i = 0; i < NUM_NEEDS; i++) {
        needs[NEED_KEYS[i]] = 80;
      }

      emotionTimer = 0;
      behaviorTimer = 0;
      hungerCriticalTime = 0;
      lastSaveTime = Date.now();

      console.log('[NeedsSystem] Initialized — all needs at 80');
    },

    /**
     * Update every frame:
     * - Decay needs
     * - Push emotions (every 1s)
     * - Check cross-need interactions
     * - Apply behavioral signals (every 3s)
     */
    update: function(dt) {
      // Decay needs
      decayNeeds(dt);

      // Cross-need interactions
      checkInteractions(dt);

      // Push emotions periodically (not every frame)
      emotionTimer += dt;
      if (emotionTimer >= EMOTION_PUSH_INTERVAL) {
        emotionTimer -= EMOTION_PUSH_INTERVAL;
        pushEmotions();
      }

      // Behavioral signals periodically
      behaviorTimer += dt;
      if (behaviorTimer >= BEHAVIOR_INTERVAL) {
        behaviorTimer -= BEHAVIOR_INTERVAL;
        applyBehavioralSignals();
      }
    },

    /**
     * Satisfy a need by a positive amount
     * @param {string} need — 'hunger', 'fun', 'energy', 'affection', 'health'
     * @param {number} amount — positive value to add
     */
    satisfy: function(need, amount) {
      if (needs[need] === undefined) {
        console.warn('[NeedsSystem] Unknown need:', need);
        return;
      }

      var prev = needs[need];
      needs[need] = clamp(prev + Math.abs(amount), 0, 100);

      // Reset hunger critical timer if feeding
      if (need === 'hunger' && needs.hunger >= HUNGER_DAMAGE_THRESHOLD) {
        hungerCriticalTime = 0;
      }

      console.log('[NeedsSystem]', need, Math.round(prev), '→', Math.round(needs[need]),
                  '(+' + Math.round(Math.abs(amount)) + ')');
    },

    /**
     * Decrease a need (for negative events)
     * @param {string} need
     * @param {number} amount — positive value to subtract
     */
    damage: function(need, amount) {
      if (needs[need] === undefined) {
        console.warn('[NeedsSystem] Unknown need:', need);
        return;
      }

      var prev = needs[need];
      needs[need] = clamp(prev - Math.abs(amount), 0, 100);

      console.log('[NeedsSystem]', need, Math.round(prev), '→', Math.round(needs[need]),
                  '(-' + Math.round(Math.abs(amount)) + ')');
    },

    /**
     * Get the current value of a need (0-100)
     * @param {string} need
     * @returns {number}
     */
    get: function(need) {
      return needs[need] !== undefined ? needs[need] : 0;
    },

    /**
     * Get all needs as an object
     * @returns {Object}
     */
    getAll: function() {
      return getSnapshot();
    },

    /**
     * Get the lowest need
     * @returns {{name: string, value: number}}
     */
    getLowest: function() {
      return getLowest();
    },

    /**
     * Get the tier of a specific need
     * @param {string} need
     * @returns {string} 'satisfied' | 'notice' | 'low' | 'critical'
     */
    getTier: function(need) {
      return needs[need] !== undefined ? getTier(needs[need]) : 'satisfied';
    },

    /**
     * Check if it's currently night time
     * @returns {boolean}
     */
    isNight: function() {
      return isNightTime();
    },

    /**
     * Process offline time
     * @param {number} lastTimestamp — Date.now() when last saved
     */
    processOfflineTime: function(lastTimestamp) {
      processOfflineTime(lastTimestamp);
    },

    /**
     * Serialize for save
     * @returns {Object}
     */
    serialize: function() {
      var data = {};
      for (var i = 0; i < NUM_NEEDS; i++) {
        data[NEED_KEYS[i]] = Math.round(needs[NEED_KEYS[i]] * 100) / 100;
      }
      return {
        needs: data,
        hungerCriticalTime: Math.round(hungerCriticalTime),
        savedAt: Date.now()
      };
    },

    /**
     * Deserialize from save
     * @param {Object} data
     */
    deserialize: function(data) {
      if (data && data.needs) {
        for (var i = 0; i < NUM_NEEDS; i++) {
          var key = NEED_KEYS[i];
          if (data.needs[key] !== undefined) {
            needs[key] = clamp(data.needs[key], 0, 100);
          }
        }
      }
      if (data && data.hungerCriticalTime !== undefined) {
        hungerCriticalTime = data.hungerCriticalTime;
      }
      if (data && data.savedAt) {
        processOfflineTime(data.savedAt);
      }
      console.log('[NeedsSystem] State restored:', JSON.stringify(getSnapshot()));
    }
  };

})();
