/**
 * ===================================================
 * Personality — IA adaptativa y personalidad emergente
 * ===================================================
 * La criatura desarrolla una personalidad ÚNICA basada
 * en cómo el usuario interactúa con ella. Dos criaturas
 * nunca serán iguales. Los cambios son MUY lentos
 * (días/semanas de uso real).
 *
 * 6 ejes de personalidad (0-100, neutro = 50):
 *   sociability  — Independiente ↔ Dependiente
 *   energy_level — Calmada ↔ Hiperactiva
 *   trust        — Desconfiada ↔ Confiada
 *   curiosity    — Cautelosa ↔ Exploradora
 *   temperament  — Irritable ↔ Paciente
 *   playfulness  — Seria ↔ Juguetona
 *
 * Uso:
 *   Personality.init()
 *   Personality.update(dt)
 *   Personality.recordEvent('pet')
 *   Personality.getIdleBehavior() → {moveSpeed, ...}
 * ===================================================
 */
(function() {
  'use strict';

  // ─────────────────────────────────────────────
  // Trait definitions
  // ─────────────────────────────────────────────

  var TRAIT_KEYS = [
    'sociability',
    'energy_level',
    'trust',
    'curiosity',
    'temperament',
    'playfulness'
  ];
  var NUM_TRAITS = TRAIT_KEYS.length;

  /** Starting value for all traits */
  var NEUTRAL = 50;

  // ─────────────────────────────────────────────
  // Event → Trait modification map
  // ─────────────────────────────────────────────
  // Values are intentionally tiny: personality changes over weeks

  var EVENT_EFFECTS = {
    pet: {
      sociability: 0.03,
      trust: 0.02
    },
    pet_gentle: {
      sociability: 0.04,
      trust: 0.03,
      temperament: 0.01
    },
    pet_rough: {
      trust: -0.06,
      temperament: -0.03
    },
    feed: {
      trust: 0.02,
      temperament: 0.01
    },
    feed_good: {
      trust: 0.03,
      temperament: 0.02,
      sociability: 0.01
    },
    feed_bad: {
      trust: -0.04,
      temperament: -0.02
    },
    play: {
      playfulness: 0.03,
      energy_level: 0.02,
      sociability: 0.01
    },
    toy: {
      playfulness: 0.03,
      curiosity: 0.02,
      energy_level: 0.01
    },
    ignore: {
      sociability: -0.05,
      trust: -0.03,
      playfulness: -0.01
    },
    shake: {
      trust: -0.10,
      temperament: -0.05,
      sociability: -0.02
    },
    open_app: {
      sociability: 0.02,
      trust: 0.01
    },
    sleep: {
      energy_level: -0.01,
      temperament: 0.01
    },
    hold: {
      sociability: 0.02,
      trust: 0.03,
      temperament: 0.01
    },
    tap: {
      curiosity: 0.01,
      playfulness: 0.01
    },
    double_tap: {
      playfulness: 0.02,
      energy_level: 0.01
    },
    drag: {
      trust: -0.01,
      energy_level: 0.01
    },
    comfort: {
      trust: 0.04,
      sociability: 0.02,
      temperament: 0.02
    },
    medicine: {
      trust: -0.02,
      temperament: -0.01
    },
    new_item: {
      curiosity: 0.03
    },
    same_item: {
      curiosity: -0.02
    },
    night_play: {
      energy_level: 0.02
    }
  };

  // ─────────────────────────────────────────────
  // Memory system (circular buffer)
  // ─────────────────────────────────────────────

  var MEMORY_SIZE = 100;
  var _memory = [];
  var _memoryIndex = 0;

  // ─────────────────────────────────────────────
  // State
  // ─────────────────────────────────────────────

  var traits = {};
  var _updateTimer = 0;
  var UPDATE_INTERVAL = 1.0; // seconds between personality influence ticks

  /** Pattern analysis cache */
  var _patterns = {
    hourlyActivity: new Array(24), // sessions per hour
    itemUsage: {},                 // item id → count
    avgSessionGap: 0,              // average seconds between app opens
    totalSessions: 0,
    lastOpenTime: 0,
    favoriteHour: -1,
    isNocturnal: false,
    varietyScore: 0                // 0-1, how many different items used
  };

  var _patternTimer = 0;
  var PATTERN_INTERVAL = 30.0; // re-analyze patterns every 30s

  /** Last item used (for same_item detection) */
  var _lastItemUsed = '';
  var _consecutiveSameItem = 0;

  // ─────────────────────────────────────────────
  // Input trigger binding
  // ─────────────────────────────────────────────

  var _inputBound = false;

  function bindInputTriggers() {
    if (_inputBound || !window.InputSystem) return;
    _inputBound = true;

    InputSystem.on('tap', function(e) {
      if (window.GAME.state !== 'living') return;
      if (window.Creature && window.Creature.isPointInside(e.x, e.y)) {
        window.Personality.recordEvent('tap');
      }
    });

    InputSystem.on('double_tap', function(e) {
      if (window.GAME.state !== 'living') return;
      if (window.Creature && window.Creature.isPointInside(e.x, e.y)) {
        window.Personality.recordEvent('double_tap');
      }
    });

    InputSystem.on('hold', function(e) {
      if (window.GAME.state !== 'living') return;
      if (window.Creature && window.Creature.isPointInside(e.x, e.y)) {
        window.Personality.recordEvent('hold');
      }
    });

    // Drag tracking: gentle vs rough
    var _dragOnCreature = false;
    InputSystem.on('down', function(e) {
      if (window.GAME.state !== 'living') return;
      _dragOnCreature = window.Creature && window.Creature.isPointInside(e.x, e.y);
    });

    InputSystem.on('release', function(e) {
      if (window.GAME.state !== 'living') return;
      if (_dragOnCreature && e.wasDrag) {
        var speed = Math.sqrt(e.velocityX * e.velocityX + e.velocityY * e.velocityY);
        if (speed > 500) {
          window.Personality.recordEvent('pet_rough');
        } else if (speed < 200) {
          window.Personality.recordEvent('pet_gentle');
        } else {
          window.Personality.recordEvent('pet');
        }
      }
      _dragOnCreature = false;
    });
  }

  // ─────────────────────────────────────────────
  // Utilities
  // ─────────────────────────────────────────────

  function clamp(v, min, max) {
    return v < min ? min : (v > max ? max : v);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  // ─────────────────────────────────────────────
  // Apply trait effects to other systems
  // ─────────────────────────────────────────────

  function applyTraitEffects() {
    // These apply every UPDATE_INTERVAL seconds (1s)
    // Very subtle modifications to existing systems

    var soc = traits.sociability;
    var ene = traits.energy_level;
    var tru = traits.trust;
    var cur = traits.curiosity;
    var tem = traits.temperament;
    var pla = traits.playfulness;

    // ── Affect CreatureAI mood weights ──
    if (window.CreatureAI) {
      // High energy → more active moods
      if (ene > 65) {
        // Creature tends toward excited states
        // (CreatureAI will pick bounce/explore more)
      }
      // Low energy → more calm
      if (ene < 35) {
        // Creature tends toward still states
      }
    }

    // ── Affect NeedsSystem decay rates ──
    // (We don't directly modify the system, but we can push emotions
    //  that simulate the personality effect)

    if (window.EmotionSystem && window.GAME.state === 'living') {
      // High sociability → affection decays faster (needs more attention)
      // Simulated by slightly pushing sadness when alone
      if (soc > 65 && window.NeedsSystem) {
        var affVal = window.NeedsSystem.get('affection');
        if (affVal < 40) {
          // Extra sadness push proportional to sociability
          var pushAmt = (soc - 65) / 350 * UPDATE_INTERVAL; // very subtle
          window.EmotionSystem.modify('sadness', pushAmt);
        }
      }

      // Low trust → more fearful of sudden interactions
      if (tru < 35) {
        // Slight baseline anxiety
        var anxietyPush = (35 - tru) / 3500 * UPDATE_INTERVAL;
        window.EmotionSystem.modify('fear', anxietyPush);
      }

      // High playfulness → more spontaneous joy
      if (pla > 65 && Math.random() < 0.02 * UPDATE_INTERVAL) {
        var joyPush = (pla - 65) / 500;
        window.EmotionSystem.modify('playful', joyPush);
      }

      // Low temperament → easier to anger
      if (tem < 35 && window.NeedsSystem) {
        var hungry = window.NeedsSystem.get('hunger');
        if (hungry < 50) {
          var angerPush = (35 - tem) / 3000 * UPDATE_INTERVAL;
          window.EmotionSystem.modify('anger', angerPush);
        }
      }

      // High curiosity → more spontaneous curiosity emotion
      if (cur > 65 && Math.random() < 0.03 * UPDATE_INTERVAL) {
        var curPush = (cur - 65) / 400;
        window.EmotionSystem.modify('curiosity', curPush);
      }
    }

    // ── Affect creature physics ──
    if (window.CreaturePhysics && window.GAME.state === 'living') {
      // Energy level affects spring responsiveness
      var speedMul = 0.7 + (ene / 100) * 0.6; // 0.7 → 1.3
      window.CreaturePhysics.springMul = speedMul;

      // Breathing speed affected by energy
      var breathSpeed = 1.8 + (ene / 100) * 0.8; // 1.8 → 2.6
      var breathAmp = 0.02 + (ene / 100) * 0.02; // 0.02 → 0.04
      window.CreaturePhysics.setBreathing(breathSpeed, breathAmp);
    }
  }

  // ─────────────────────────────────────────────
  // Pattern analysis
  // ─────────────────────────────────────────────

  function analyzePatterns() {
    if (_memory.length === 0) return;

    // ── Hourly activity ──
    for (var h = 0; h < 24; h++) {
      _patterns.hourlyActivity[h] = 0;
    }

    var itemCounts = {};
    var uniqueItems = 0;
    var totalItems = 0;

    for (var i = 0; i < _memory.length; i++) {
      var ev = _memory[i];
      if (!ev) continue;

      var hour = new Date(ev.timestamp).getHours();
      _patterns.hourlyActivity[hour]++;

      // Track item usage
      if (ev.details && ev.details.itemId) {
        var itemId = ev.details.itemId;
        if (!itemCounts[itemId]) {
          itemCounts[itemId] = 0;
          uniqueItems++;
        }
        itemCounts[itemId]++;
        totalItems++;
      }
    }

    _patterns.itemUsage = itemCounts;

    // Find favorite hour
    var maxHourAct = 0;
    _patterns.favoriteHour = 12; // default noon
    for (var fh = 0; fh < 24; fh++) {
      if (_patterns.hourlyActivity[fh] > maxHourAct) {
        maxHourAct = _patterns.hourlyActivity[fh];
        _patterns.favoriteHour = fh;
      }
    }

    // Nocturnal? (more activity 22-06 than 10-18)
    var nightAct = 0, dayAct = 0;
    for (var nh = 0; nh < 24; nh++) {
      if (nh >= 22 || nh < 6) {
        nightAct += _patterns.hourlyActivity[nh];
      } else if (nh >= 10 && nh < 18) {
        dayAct += _patterns.hourlyActivity[nh];
      }
    }
    _patterns.isNocturnal = nightAct > dayAct && nightAct > 5;

    // Variety score (0-1): how many unique items / total categories
    // 18 total items in the game
    _patterns.varietyScore = clamp(uniqueItems / 18, 0, 1);

    // If nocturnal, energy_level gets a tiny boost
    if (_patterns.isNocturnal) {
      traits.energy_level = clamp(traits.energy_level + 0.005, 0, 100);
    }

    // If high variety, curiosity gets a tiny boost
    if (_patterns.varietyScore > 0.5) {
      traits.curiosity = clamp(traits.curiosity + 0.003, 0, 100);
    }
  }

  // ─────────────────────────────────────────────
  // Get idle behavior params from personality
  // ─────────────────────────────────────────────

  function computeIdleBehavior() {
    var soc = traits.sociability / 100;
    var ene = traits.energy_level / 100;
    var tru = traits.trust / 100;
    var cur = traits.curiosity / 100;
    var pla = traits.playfulness / 100;

    // Movement speed: energy and playfulness drive it
    var moveSpeed = 0.5 + ene * 1.0 + pla * 0.5; // 0.5 → 2.0

    // How much of the screen the creature uses
    // Curious and energetic = wide range, shy = small range
    var moveRange = 0.3 + cur * 0.3 + ene * 0.2; // 0.3 → 0.8

    // How often it rests (low energy = lots of resting)
    var restFrequency = clamp(1 - ene * 0.7 - pla * 0.3, 0, 1);

    // Does it approach the finger?
    var approachFinger = soc > 0.55 && tru > 0.4;

    // Available idle animation set
    var anims = ['breathe']; // always available

    if (ene > 0.3)  anims.push('wander');
    if (ene > 0.5)  anims.push('bounce');
    if (pla > 0.5)  anims.push('roll');
    if (cur > 0.5)  anims.push('explore');
    if (soc < 0.35) anims.push('hide');
    if (ene < 0.3)  anims.push('rest');

    return {
      moveSpeed: clamp(moveSpeed, 0.5, 2.0),
      moveRange: clamp(moveRange, 0.3, 0.8),
      restFrequency: clamp(restFrequency, 0, 1),
      approachFinger: approachFinger,
      idleAnimations: anims
    };
  }

  // ══════════════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════════════

  window.Personality = {

    /**
     * Initialize all traits to neutral (50)
     */
    init: function() {
      for (var i = 0; i < NUM_TRAITS; i++) {
        traits[TRAIT_KEYS[i]] = NEUTRAL;
      }

      _memory = [];
      _memoryIndex = 0;
      _updateTimer = 0;
      _patternTimer = 0;
      _lastItemUsed = '';
      _consecutiveSameItem = 0;

      // Reset patterns
      for (var h = 0; h < 24; h++) {
        _patterns.hourlyActivity[h] = 0;
      }
      _patterns.itemUsage = {};
      _patterns.totalSessions = 0;
      _patterns.lastOpenTime = Date.now();
      _patterns.favoriteHour = -1;
      _patterns.isNocturnal = false;
      _patterns.varietyScore = 0;

      // Bind input triggers
      bindInputTriggers();

      // Record app open
      this.recordEvent('open_app');

      console.log('[Personality] Initialized — all traits at', NEUTRAL);
    },

    /**
     * Update every frame (but work done every 1s)
     * @param {number} dt — delta time in seconds
     */
    update: function(dt) {
      if (window.GAME.state !== 'living') return;

      // Periodic trait influence
      _updateTimer += dt;
      if (_updateTimer >= UPDATE_INTERVAL) {
        _updateTimer -= UPDATE_INTERVAL;
        applyTraitEffects();
      }

      // Periodic pattern analysis
      _patternTimer += dt;
      if (_patternTimer >= PATTERN_INTERVAL) {
        _patternTimer -= PATTERN_INTERVAL;
        analyzePatterns();
      }
    },

    /**
     * Record an event in memory and apply trait changes
     * @param {string} type — event type key
     * @param {Object} [details] — optional event details
     */
    recordEvent: function(type, details) {
      // Build memory entry
      var entry = {
        type: type,
        timestamp: Date.now(),
        details: details || null
      };

      // Store in circular buffer
      if (_memory.length < MEMORY_SIZE) {
        _memory.push(entry);
      } else {
        _memory[_memoryIndex] = entry;
      }
      _memoryIndex = (_memoryIndex + 1) % MEMORY_SIZE;

      // Apply trait modifications
      var effects = EVENT_EFFECTS[type];
      if (effects) {
        for (var trait in effects) {
          if (traits[trait] !== undefined) {
            traits[trait] = clamp(traits[trait] + effects[trait], 0, 100);
          }
        }
      }

      // ── Special event processing ──

      // Track item usage for same_item / new_item detection
      if (details && details.itemId) {
        var itemId = details.itemId;

        if (itemId === _lastItemUsed) {
          _consecutiveSameItem++;
          if (_consecutiveSameItem >= 3) {
            // Apply same_item effect (boredom)
            var sameEffects = EVENT_EFFECTS.same_item;
            for (var sk in sameEffects) {
              if (traits[sk] !== undefined) {
                traits[sk] = clamp(traits[sk] + sameEffects[sk], 0, 100);
              }
            }
          }
        } else {
          _consecutiveSameItem = 0;

          // Check if this is a brand new item
          if (!_patterns.itemUsage[itemId]) {
            var newEffects = EVENT_EFFECTS.new_item;
            for (var nk in newEffects) {
              if (traits[nk] !== undefined) {
                traits[nk] = clamp(traits[nk] + newEffects[nk], 0, 100);
              }
            }
          }
        }
        _lastItemUsed = itemId;
      }

      // Night play detection
      var hour = new Date().getHours();
      if ((hour >= 23 || hour < 5) && (type === 'play' || type === 'toy')) {
        var nightEffects = EVENT_EFFECTS.night_play;
        for (var npe in nightEffects) {
          if (traits[npe] !== undefined) {
            traits[npe] = clamp(traits[npe] + nightEffects[npe], 0, 100);
          }
        }
      }
    },

    /**
     * Get all trait values
     * @returns {Object} {sociability, energy_level, trust, ...}
     */
    getTraits: function() {
      var snapshot = {};
      for (var i = 0; i < NUM_TRAITS; i++) {
        var key = TRAIT_KEYS[i];
        snapshot[key] = Math.round(traits[key] * 100) / 100;
      }
      return snapshot;
    },

    /**
     * Get a single trait value (0-100)
     * @param {string} name
     * @returns {number}
     */
    getTrait: function(name) {
      return traits[name] !== undefined ? traits[name] : NEUTRAL;
    },

    /**
     * Get computed idle behavior parameters
     * Used by CreatureAI to adjust movement
     * @returns {Object}
     */
    getIdleBehavior: function() {
      return computeIdleBehavior();
    },

    /**
     * Analyze user patterns from memory
     * @returns {Object} pattern analysis results
     */
    analyzePatterns: function() {
      analyzePatterns();
      return {
        favoriteHour: _patterns.favoriteHour,
        isNocturnal: _patterns.isNocturnal,
        varietyScore: Math.round(_patterns.varietyScore * 100) / 100,
        totalSessions: _patterns.totalSessions,
        itemUsage: Object.assign({}, _patterns.itemUsage),
        hourlyActivity: _patterns.hourlyActivity.slice()
      };
    },

    /**
     * Check if the creature anticipates this hour
     * (used for proactive behavior)
     * @returns {boolean}
     */
    isAnticipatingUser: function() {
      if (_patterns.favoriteHour < 0) return false;
      var currentHour = new Date().getHours();
      // Anticipate 1 hour before favorite time
      var anticipateHour = (_patterns.favoriteHour - 1 + 24) % 24;
      return currentHour === anticipateHour;
    },

    /**
     * Get memory entries (read-only)
     * @param {number} [count] — how many recent entries (default all)
     * @returns {Array}
     */
    getMemory: function(count) {
      var n = count || _memory.length;
      var result = [];
      var len = _memory.length;
      var start = Math.max(0, len - n);
      for (var i = start; i < len; i++) {
        if (_memory[i]) result.push(_memory[i]);
      }
      return result;
    },

    /**
     * Get trait keys for iteration
     * @returns {string[]}
     */
    getTraitKeys: function() {
      return TRAIT_KEYS.slice();
    },

    /**
     * Get a descriptive label for a trait value
     * @param {string} trait
     * @returns {string}
     */
    getTraitLabel: function(trait) {
      var val = traits[trait];
      if (val === undefined) return 'unknown';

      var labels = {
        sociability:  { low: 'Independiente', mid: 'Equilibrada', high: 'Dependiente' },
        energy_level: { low: 'Calmada',       mid: 'Normal',      high: 'Hiperactiva' },
        trust:        { low: 'Desconfiada',   mid: 'Cautelosa',   high: 'Confiada' },
        curiosity:    { low: 'Cautelosa',      mid: 'Moderada',    high: 'Exploradora' },
        temperament:  { low: 'Irritable',      mid: 'Estable',     high: 'Paciente' },
        playfulness:  { low: 'Seria',          mid: 'Moderada',    high: 'Juguetona' }
      };

      var def = labels[trait];
      if (!def) return 'unknown';

      if (val < 35) return def.low;
      if (val > 65) return def.high;
      return def.mid;
    },

    /**
     * Generate diary entries from recent memory
     * @param {number} [count] — max entries to return
     * @returns {Array<{text: string, time: string}>}
     */
    getDiary: function(count) {
      var entries = [];
      var mem = this.getMemory(count || 20);
      var MSGS = {
        pet: ['Me acariciaron 💜', 'Sentí cariño hoy'],
        pet_gentle: ['Me dieron mimos suaves 🥰', 'Se siente tan bien...'],
        pet_rough: ['Me sacudieron 😟', 'Eso fue brusco...'],
        feed_good: ['¡Me dieron comida rica! 🍎', 'Tenía hambre, qué bien'],
        feed_bad: ['Esa comida no me gustó 🤢', 'Me siento mal del estómago'],
        toy: ['¡Jugamos! ⚽', 'Me dieron un juguete nuevo 🧸'],
        tap: ['Me tocaron 👆', 'Hola! Me saludaron'],
        hold: ['Me abrazaron 🤗', 'Calorcito...'],
        double_tap: ['Me hicieron cosquillas 😆'],
        open_app: ['¡Volvieron! 💜', 'Me vinieron a ver'],
        comfort: ['Me cuidaron cuando lo necesitaba 💊'],
        sleep: ['Dormí bien 🌙', 'Zzz... descansé'],
        medicine: ['Me dieron medicina 💊 no me gustó pero me siento mejor']
      };
      for (var i = 0; i < mem.length; i++) {
        var ev = mem[i];
        var msgs = MSGS[ev.type];
        if (!msgs) continue;
        var text = msgs[Math.floor(Math.random() * msgs.length)];
        var d = new Date(ev.timestamp);
        var timeStr = d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0');
        var dayStr = d.getDate() + '/' + (d.getMonth() + 1);
        entries.push({ text: text, time: dayStr + ' ' + timeStr });
      }
      return entries;
    },

    /**
     * @returns {Object}
     */
    serialize: function() {
      var traitData = {};
      for (var i = 0; i < NUM_TRAITS; i++) {
        var key = TRAIT_KEYS[i];
        traitData[key] = Math.round(traits[key] * 1000) / 1000;
      }

      // Compact memory (only keep last 50 for save size)
      var memSlice = [];
      var memLen = _memory.length;
      var memStart = Math.max(0, memLen - 50);
      for (var m = memStart; m < memLen; m++) {
        if (_memory[m]) {
          memSlice.push({
            t: _memory[m].type,
            ts: _memory[m].timestamp,
            d: _memory[m].details || null
          });
        }
      }

      return {
        traits: traitData,
        memory: memSlice,
        patterns: {
          totalSessions: _patterns.totalSessions,
          lastOpenTime: _patterns.lastOpenTime,
          hourlyActivity: _patterns.hourlyActivity.slice()
        },
        lastItem: _lastItemUsed,
        consecutiveSame: _consecutiveSameItem,
        savedAt: Date.now()
      };
    },

    /**
     * Deserialize from save
     * @param {Object} data
     */
    deserialize: function(data) {
      if (!data) return;

      // Restore traits
      if (data.traits) {
        for (var i = 0; i < NUM_TRAITS; i++) {
          var key = TRAIT_KEYS[i];
          if (data.traits[key] !== undefined) {
            traits[key] = clamp(data.traits[key], 0, 100);
          }
        }
      }

      // Restore memory
      if (data.memory && Array.isArray(data.memory)) {
        _memory = [];
        for (var m = 0; m < data.memory.length; m++) {
          var entry = data.memory[m];
          _memory.push({
            type: entry.t,
            timestamp: entry.ts,
            details: entry.d || null
          });
        }
        _memoryIndex = _memory.length % MEMORY_SIZE;
      }

      // Restore patterns
      if (data.patterns) {
        _patterns.totalSessions = data.patterns.totalSessions || 0;
        _patterns.lastOpenTime = data.patterns.lastOpenTime || Date.now();
        if (data.patterns.hourlyActivity) {
          for (var h = 0; h < 24 && h < data.patterns.hourlyActivity.length; h++) {
            _patterns.hourlyActivity[h] = data.patterns.hourlyActivity[h];
          }
        }
      }

      _lastItemUsed = data.lastItem || '';
      _consecutiveSameItem = data.consecutiveSame || 0;

      // Increment session count
      _patterns.totalSessions++;

      // Calculate session gap
      if (data.patterns && data.patterns.lastOpenTime) {
        var gap = (Date.now() - data.patterns.lastOpenTime) / 1000;
        // Very long absence → trust/sociability drops
        if (gap > 3 * 24 * 3600) { // > 3 days
          var daysAway = Math.min(gap / (24 * 3600), 14); // cap at 14 days
          traits.sociability = clamp(traits.sociability - daysAway * 0.5, 0, 100);
          traits.trust = clamp(traits.trust - daysAway * 0.3, 0, 100);
          console.log('[Personality] Long absence:', Math.round(daysAway), 'days — trust/sociability decreased');
        }
      }
      _patterns.lastOpenTime = Date.now();

      // Record this session open
      this.recordEvent('open_app');

      // Re-analyze patterns with restored data
      analyzePatterns();

      console.log('[Personality] Restored — traits:', JSON.stringify(this.getTraits()));
    }
  };

})();
