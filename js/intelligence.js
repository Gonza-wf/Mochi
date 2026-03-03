/* ============================================================
 *  js/intelligence.js  –  Mochi Advanced AI Brain
 *  Systems: Attention, Short-term Memory, Anticipation,
 *  Compound Emotions, Routines, Toy Play, Communication, 
 *  Microexpressions, Body Language
 * ============================================================ */
(function () {
  'use strict';

  // ── ATTENTION SYSTEM ──────────────────────────────────────
  // What the creature is currently focused on
  const _attention = {
    target: null,        // {type, x, y, id} or null
    type: 'nothing',     // 'finger', 'toy', 'food', 'corner', 'nothing'
    x: 0, y: 0,
    interest: 0,         // 0-1 how interested
    duration: 0,         // how long focused on this
    switchTimer: 0,      // time until next attention switch
    scanTimer: 0,        // time until next environment scan
  };

  function _scanEnvironment() {
    const candidates = [];
    const cx = window.Creature ? window.Creature.x : 0;
    const cy = window.Creature ? window.Creature.y : 0;
    const G = window.GAME || {};

    // Finger (if touching)
    if (window.InputSystem && window.InputSystem.isDown()) {
      const pos = window.InputSystem.getPosition();
      const dist = Math.hypot(pos.x - cx, pos.y - cy);
      // Interest based on proximity + emotion
      let fingerInterest = Math.max(0, 1 - dist / (G.width || 400));
      const dominant = window.EmotionSystem ? window.EmotionSystem.getDominant() : 'neutral';
      if (dominant === 'curiosity' || dominant === 'love') fingerInterest *= 1.5;
      if (dominant === 'fear') fingerInterest *= 0.3;
      if (dominant === 'sleepy') fingerInterest *= 0.2;
      candidates.push({ type: 'finger', x: pos.x, y: pos.y, interest: Math.min(1, fingerInterest), id: 'finger' });
    }

    // World toys
    if (window.Items && window.Items._worldToys) {
      window.Items._worldToys.forEach(function (t) {
        if (t.alpha < 0.3) return;
        const dist = Math.hypot(t.x - cx, t.y - cy);
        let toyInterest = Math.max(0, 0.7 - dist / (G.width || 400));
        // Favorite toy gets bonus
        if (t.id === _memory.favoriteToy) toyInterest += 0.3;
        // Bored of recently used toys
        const recent = _memory.shortTerm.filter(function (e) { return e.type === 'toy_play' && e.detail === t.id; });
        if (recent.length > 2) toyInterest -= 0.3;
        // Playful creatures are more interested
        const dom = window.EmotionSystem ? window.EmotionSystem.getDominant() : 'neutral';
        if (dom === 'playful') toyInterest += 0.3;
        if (dom === 'curiosity') toyInterest += 0.2;
        candidates.push({ type: 'toy', x: t.x, y: t.y, interest: Math.max(0, Math.min(1, toyInterest)), id: t.id });
      });
    }

    // Dragged food
    if (window.Menu && window.Menu._dragging && window.Menu._dragItem) {
      const dp = window.Menu._dragPos || window.Menu.dragPosition;
      if (dp) {
        candidates.push({ type: 'food', x: dp.x, y: dp.y, interest: 0.9, id: 'food' });
      }
    }

    // Random corner (when bored)
    if (candidates.length === 0 || (window.EmotionSystem && window.EmotionSystem.getDominant() === 'sadness')) {
      const w = G.width || 400;
      const h = G.height || 700;
      candidates.push({
        type: 'corner',
        x: Math.random() * w * 0.6 + w * 0.2,
        y: Math.random() * h * 0.6 + h * 0.2,
        interest: 0.15,
        id: 'wander'
      });
    }

    // Pick highest interest
    candidates.sort(function (a, b) { return b.interest - a.interest; });
    return candidates[0] || null;
  }

  function _updateAttention(dt) {
    _attention.duration += dt;
    _attention.scanTimer += dt;
    _attention.switchTimer -= dt;

    // Scan every 0.5s
    if (_attention.scanTimer > 0.5) {
      _attention.scanTimer = 0;
      var best = _scanEnvironment();

      if (best) {
        // Switch attention if new thing is much more interesting
        // or if current attention timed out
        var shouldSwitch = _attention.type === 'nothing' ||
          _attention.switchTimer <= 0 ||
          (best.interest > _attention.interest + 0.25) ||
          (best.type === 'food' && _attention.type !== 'food') ||
          (best.type === 'finger' && _attention.type === 'nothing');

        if (shouldSwitch) {
          _attention.target = best;
          _attention.type = best.type;
          _attention.interest = best.interest;
          _attention.duration = 0;
          // How long to stay focused
          _attention.switchTimer = best.type === 'finger' ? 1.5 :
            best.type === 'food' ? 10 :
              best.type === 'toy' ? 3 + Math.random() * 4 :
                2 + Math.random() * 3;
        }
      }
    }

    // Update position for moving targets
    if (_attention.type === 'finger' && window.InputSystem) {
      if (window.InputSystem.isDown()) {
        var p = window.InputSystem.getPosition();
        _attention.x = p.x;
        _attention.y = p.y;
      } else {
        _attention.type = 'nothing';
        _attention.interest = 0;
      }
    } else if (_attention.type === 'food' && window.Menu && window.Menu._dragging) {
      var dp = window.Menu._dragPos || window.Menu.dragPosition;
      if (dp) {
        _attention.x = dp.x;
        _attention.y = dp.y;
      }
    } else if (_attention.type === 'toy') {
      // Toy position is static, already set
      if (_attention.target) {
        _attention.x = _attention.target.x;
        _attention.y = _attention.target.y;
      }
    } else if (_attention.target) {
      _attention.x = _attention.target.x;
      _attention.y = _attention.target.y;
    }

    // Fade interest over time
    if (_attention.duration > 3) {
      _attention.interest *= 0.995;
    }
  }

  // ── SHORT-TERM MEMORY ─────────────────────────────────────
  const _memory = {
    shortTerm: [],       // last 15 events {type, detail, time, x, y}
    maxShortTerm: 15,
    lastPetTime: 0,
    lastFeedTime: 0,
    lastPlayTime: 0,
    petCount30s: 0,      // pets in last 30s (habituation)
    feedCount5m: 0,      // feeds in last 5 min
    scaredOf: null,      // what scared it last
    scaredUntil: 0,      // timestamp
    favoriteToy: null,
    toyUseCounts: {},    // {toyId: count}
    recentItems: [],     // last 5 item IDs used
    lastInteraction: 0,
  };

  function _recordMemory(type, detail, x, y) {
    var now = Date.now();
    _memory.shortTerm.push({ type: type, detail: detail || '', time: now, x: x || 0, y: y || 0 });
    if (_memory.shortTerm.length > _memory.maxShortTerm) _memory.shortTerm.shift();
    _memory.lastInteraction = now;

    if (type === 'pet') {
      _memory.lastPetTime = now;
      _memory.petCount30s++;
      setTimeout(function () { _memory.petCount30s = Math.max(0, _memory.petCount30s - 1); }, 30000);
    }
    if (type === 'feed') {
      _memory.lastFeedTime = now;
      _memory.feedCount5m++;
      setTimeout(function () { _memory.feedCount5m = Math.max(0, _memory.feedCount5m - 1); }, 300000);
      // Track recent items
      if (detail) {
        _memory.recentItems.push(detail);
        if (_memory.recentItems.length > 5) _memory.recentItems.shift();
      }
    }
    if (type === 'play' || type === 'toy_play') {
      _memory.lastPlayTime = now;
      if (detail) {
        _memory.toyUseCounts[detail] = (_memory.toyUseCounts[detail] || 0) + 1;
        // Update favorite toy
        var maxCount = 0;
        var fav = null;
        for (var id in _memory.toyUseCounts) {
          if (_memory.toyUseCounts[id] > maxCount) {
            maxCount = _memory.toyUseCounts[id];
            fav = id;
          }
        }
        _memory.favoriteToy = fav;
      }
    }
    if (type === 'scare') {
      _memory.scaredOf = detail;
      _memory.scaredUntil = now + 15000; // scared for 15 seconds
    }
  }

  // Returns how habituated the creature is to petting (0=fresh, 1=bored)
  function _getPetHabituation() {
    return Math.min(1, _memory.petCount30s / 8);
  }

  // Returns if creature is "full" (fed too recently)
  function _isOverfed() {
    return _memory.feedCount5m >= 3;
  }

  // ── ANTICIPATION SYSTEM ───────────────────────────────────
  const _anticipation = {
    hourlyActivity: new Array(24).fill(0),  // activity count per hour
    menuOpenCount: 0,
    predictedAction: null,  // 'feed', 'play', 'pet', null
    excitement: 0,          // 0-1
    updateTimer: 0,
  };

  function _updateAnticipation(dt) {
    _anticipation.updateTimer += dt;
    if (_anticipation.updateTimer < 5) return;
    _anticipation.updateTimer = 0;

    var hour = new Date().getHours();

    // Check if this is a "usual" activity hour
    var avgActivity = 0;
    for (var i = 0; i < 24; i++) avgActivity += _anticipation.hourlyActivity[i];
    avgActivity /= 24;

    if (_anticipation.hourlyActivity[hour] > avgActivity * 1.5 && avgActivity > 0) {
      // This is a peak hour - creature anticipates interaction
      _anticipation.excitement = Math.min(1, (_anticipation.hourlyActivity[hour] / avgActivity - 1) * 0.3);

      // What does the user usually do?
      var recentTypes = {};
      _memory.shortTerm.forEach(function (e) {
        recentTypes[e.type] = (recentTypes[e.type] || 0) + 1;
      });
      var maxType = null;
      var maxN = 0;
      for (var t in recentTypes) {
        if (recentTypes[t] > maxN) { maxN = recentTypes[t]; maxType = t; }
      }
      _anticipation.predictedAction = maxType === 'feed' ? 'feed' : maxType === 'play' ? 'play' : 'pet';
    } else {
      _anticipation.excitement *= 0.99;
    }

    // Apply excitement to emotions
    if (_anticipation.excitement > 0.3 && window.EmotionSystem) {
      window.EmotionSystem.modify('happiness', _anticipation.excitement * 0.5);
      window.EmotionSystem.modify('curiosity', _anticipation.excitement * 0.3);
    }
  }

  function _recordHourlyActivity() {
    var hour = new Date().getHours();
    _anticipation.hourlyActivity[hour] = Math.min(100, (_anticipation.hourlyActivity[hour] || 0) + 1);
  }

  // ── COMPOUND EMOTIONS → BEHAVIORS ────────────────────────
  // Returns a complex behavior based on emotion combinations
  function _getCompoundBehavior() {
    if (!window.EmotionSystem) return null;
    var E = window.EmotionSystem;
    // Get raw values (handle both function and direct access)
    var emotions = {};
    var names = ['happiness', 'sadness', 'fear', 'anger', 'curiosity', 'love', 'sleepy', 'playful', 'sick'];
    names.forEach(function (n) {
      emotions[n] = typeof E.get === 'function' ? E.get(n) : 50;
    });

    // Also check needs
    var N = window.NeedsSystem;
    var hunger = N ? N.get('hunger') : 80;
    var energy = N ? N.get('energy') : 80;
    var fun = N ? N.get('fun') : 80;
    var affection = N ? N.get('affection') : 80;

    // ── Compound behavior detection (priority order) ──

    // Hungry + Curious = actively search for food
    if (hunger < 40 && emotions.curiosity > 55) {
      return {
        id: 'search_food',
        moveTarget: 'menu_zone',  // bottom of screen
        speed: 1.3,
        bodyScale: 1.0,
        soundPattern: ['whimper', 400, 'chirp'],
        lookDir: 'down',
      };
    }

    // Sleepy + Love = want to sleep near finger
    if (emotions.sleepy > 60 && emotions.love > 55) {
      return {
        id: 'cuddle_sleep',
        moveTarget: 'finger_near',
        speed: 0.3,
        bodyScale: 0.88,
        soundPattern: ['purr'],
        lookDir: 'finger',
      };
    }

    // Playful + Curious = invent games (chase toys)
    if (emotions.playful > 60 && emotions.curiosity > 55) {
      return {
        id: 'play_explore',
        moveTarget: 'nearest_toy',
        speed: 1.8,
        bodyScale: 1.05,
        soundPattern: ['chirp', 200, 'squeak'],
        lookDir: 'toy',
      };
    }

    // Fear + Love = hide but look at finger
    if (emotions.fear > 55 && emotions.love > 50) {
      return {
        id: 'shy_hide',
        moveTarget: 'edge_facing_finger',
        speed: 0.8,
        bodyScale: 0.9,
        soundPattern: ['whimper'],
        lookDir: 'finger',
      };
    }

    // Anger + Hunger = tantrum (shake violently, move erratically)
    if (emotions.anger > 60 && hunger < 30) {
      return {
        id: 'tantrum',
        moveTarget: 'random_fast',
        speed: 2.2,
        bodyScale: 1.08,
        soundPattern: ['growl', 300, 'growl'],
        lookDir: 'away',
      };
    }

    // Happy + Playful = bouncy joy
    if (emotions.happiness > 65 && emotions.playful > 60) {
      return {
        id: 'joyful_bounce',
        moveTarget: 'bounce_around',
        speed: 1.6,
        bodyScale: 1.0,
        soundPattern: ['chirp', 150, 'chirp', 150, 'squeak'],
        lookDir: 'up',
      };
    }

    // Sad + lonely = go to edge
    if (emotions.sadness > 60 && affection < 35) {
      return {
        id: 'lonely_edge',
        moveTarget: 'edge',
        speed: 0.4,
        bodyScale: 0.85,
        soundPattern: ['whimper'],
        lookDir: 'away',
      };
    }

    // Love + Happy = warm and content
    if (emotions.love > 60 && emotions.happiness > 55) {
      return {
        id: 'content',
        moveTarget: 'center',
        speed: 0.5,
        bodyScale: 1.02,
        soundPattern: ['hum'],
        lookDir: 'finger',
      };
    }

    return null;
  }

  // ── NATURAL ROUTINES ──────────────────────────────────────
  const _routines = {
    wakeUpDone: false,
    sleepStarted: false,
    lastHour: -1,
    stretchTimer: 0,
  };

  function _getRoutineBehavior() {
    var hour = new Date().getHours();

    // Reset daily flags
    if (hour !== _routines.lastHour) {
      if (hour === 7) _routines.wakeUpDone = false;
      if (hour === 22) _routines.sleepStarted = false;
      _routines.lastHour = hour;
    }

    // Morning wake-up (7-8 AM)
    if (hour >= 7 && hour < 8 && !_routines.wakeUpDone) {
      return 'waking_up';
    }

    // Bedtime (22-23)
    if (hour >= 22 && !_routines.sleepStarted) {
      return 'going_to_sleep';
    }

    return null;
  }

  // ── TOY INTERACTION (play alone) ──────────────────────────
  const _toyPlay = {
    active: false,
    targetToy: null,
    phase: 'approach', // 'approach', 'inspect', 'play', 'bored'
    timer: 0,
    playTimer: 0,
    cooldown: 0,
  };

  function _updateToyPlay(dt, cx, cy) {
    _toyPlay.cooldown -= dt;
    if (_toyPlay.cooldown > 0 && !_toyPlay.active) return null;

    // Don't play if sleepy, sad, or sick
    var dom = window.EmotionSystem ? window.EmotionSystem.getDominant() : 'neutral';
    if (dom === 'sleepy' || dom === 'sick') {
      _toyPlay.active = false;
      return null;
    }

    // Check for available toys
    var toys = (window.Items && window.Items._worldToys) ? window.Items._worldToys : [];
    var activeToys = toys.filter(function (t) { return t.alpha > 0.5; });
    if (activeToys.length === 0) {
      _toyPlay.active = false;
      return null;
    }

    // Start playing if bored and toys available
    if (!_toyPlay.active) {
      var shouldPlay = (dom === 'playful' || dom === 'curiosity') ||
        (window.NeedsSystem && window.NeedsSystem.get('fun') < 50);
      if (!shouldPlay) return null;

      // Pick a toy (prefer favorite)
      var pick = null;
      if (_memory.favoriteToy) {
        pick = activeToys.find(function (t) { return t.id === _memory.favoriteToy; });
      }
      if (!pick) pick = activeToys[Math.floor(Math.random() * activeToys.length)];

      _toyPlay.active = true;
      _toyPlay.targetToy = pick;
      _toyPlay.phase = 'approach';
      _toyPlay.timer = 0;
      _toyPlay.playTimer = 0;
    }

    // Verify toy still exists
    if (_toyPlay.targetToy && _toyPlay.targetToy.alpha < 0.3) {
      _toyPlay.active = false;
      _toyPlay.cooldown = 5;
      return null;
    }

    _toyPlay.timer += dt;
    var toy = _toyPlay.targetToy;
    if (!toy) { _toyPlay.active = false; return null; }

    var dist = Math.hypot(toy.x - cx, toy.y - cy);
    var radius = window.Creature ? window.Creature.radius : 40;

    var result = { lookAt: { x: toy.x, y: toy.y } };

    if (_toyPlay.phase === 'approach') {
      // Move toward toy
      result.moveToward = { x: toy.x, y: toy.y, speed: 1.2 };
      if (dist < radius * 2.5) {
        _toyPlay.phase = 'inspect';
        _toyPlay.timer = 0;
      }
      if (_toyPlay.timer > 5) { // timeout
        _toyPlay.active = false;
        _toyPlay.cooldown = 8;
      }
    } else if (_toyPlay.phase === 'inspect') {
      // Circle around toy briefly
      var angle = _toyPlay.timer * 1.5;
      result.moveToward = {
        x: toy.x + Math.cos(angle) * radius * 1.8,
        y: toy.y + Math.sin(angle) * radius * 1.8,
        speed: 0.8
      };
      if (_toyPlay.timer > 2) {
        _toyPlay.phase = 'play';
        _toyPlay.timer = 0;
      }
    } else if (_toyPlay.phase === 'play') {
      _toyPlay.playTimer += dt;
      // Bounce toward and away from toy
      var bouncePhase = Math.sin(_toyPlay.timer * 3);
      var targetDist = radius * (1.5 + bouncePhase * 0.8);
      var ang = Math.atan2(cy - toy.y, cx - toy.x);
      result.moveToward = {
        x: toy.x + Math.cos(ang) * targetDist,
        y: toy.y + Math.sin(ang) * targetDist,
        speed: 1.5
      };
      result.bounce = bouncePhase > 0.8;

      // Make sounds while playing
      if (Math.random() < 0.005) {
        result.sound = 'chirp';
      }

      // Record toy play event
      if (_toyPlay.playTimer > 3 && Math.floor(_toyPlay.playTimer) % 4 === 0) {
        _recordMemory('toy_play', toy.id, toy.x, toy.y);
        if (window.NeedsSystem) window.NeedsSystem.satisfy('fun', 2);
        if (window.EmotionSystem) {
          window.EmotionSystem.modify('happiness', 1);
          window.EmotionSystem.modify('playful', 1.5);
        }
      }

      // Get bored after 8-15 seconds
      if (_toyPlay.playTimer > 8 + Math.random() * 7) {
        _toyPlay.phase = 'bored';
        _toyPlay.timer = 0;
      }
    } else if (_toyPlay.phase === 'bored') {
      // Move away
      var awayAng = Math.atan2(cy - toy.y, cx - toy.x);
      result.moveToward = {
        x: cx + Math.cos(awayAng) * radius * 3,
        y: cy + Math.sin(awayAng) * radius * 3,
        speed: 0.6
      };
      if (_toyPlay.timer > 2) {
        _toyPlay.active = false;
        _toyPlay.cooldown = 10 + Math.random() * 15;
      }
    }

    return result;
  }

  // ── COMMUNICATION PATTERNS ────────────────────────────────
  const _comms = {
    lastPattern: [],       // sounds the creature made
    userPattern: [],       // sounds the user made (from talk button)
    userPatternTimes: [],  // timestamps
    listenWindow: 3000,    // 3 seconds to complete pattern
    respondTimer: 0,
    queuedSounds: [],      // [{sound, delay}]
    queueTimer: 0,
    expressTimer: 0,       // time between voluntary communications
    expressInterval: 12,   // seconds between voluntary sounds
  };

  // Called when user makes a sound
  function _userSounded() {
    var now = Date.now();
    _comms.userPattern.push(now);
    // Remove old entries
    _comms.userPattern = _comms.userPattern.filter(function (t) { return now - t < _comms.listenWindow; });
  }

  // Generate a communication pattern based on current needs
  function _generateExpression() {
    var dom = window.EmotionSystem ? window.EmotionSystem.getDominant() : 'neutral';
    var lowest = window.NeedsSystem ? window.NeedsSystem.getLowest() : null;
    var sounds = [];

    // Need-based communication
    if (lowest && lowest.value < 40) {
      switch (lowest.name) {
        case 'hunger':
          sounds = [{ s: 'whimper', d: 0 }, { s: 'chirp', d: 400 }];
          break;
        case 'fun':
          sounds = [{ s: 'squeak', d: 0 }, { s: 'squeak', d: 200 }, { s: 'chirp', d: 400 }];
          break;
        case 'energy':
          sounds = [{ s: 'yawn', d: 0 }];
          break;
        case 'affection':
          sounds = [{ s: 'whimper', d: 0 }, { s: 'whimper', d: 600 }];
          break;
        case 'health':
          sounds = [{ s: 'whimper', d: 0 }, { s: 'growl', d: 500 }];
          break;
      }
    }
    // Emotion-based if no urgent need
    else {
      switch (dom) {
        case 'happiness':
          sounds = [{ s: 'chirp', d: 0 }, { s: 'chirp', d: 200 }];
          break;
        case 'playful':
          sounds = [{ s: 'squeak', d: 0 }, { s: 'chirp', d: 150 }, { s: 'squeak', d: 350 }];
          break;
        case 'love':
          sounds = [{ s: 'purr_short', d: 0 }, { s: 'chirp', d: 500 }];
          break;
        case 'sadness':
          sounds = [{ s: 'whimper', d: 0 }];
          break;
        case 'fear':
          sounds = [{ s: 'squeak', d: 0 }, { s: 'squeak', d: 100 }];
          break;
        case 'curiosity':
          sounds = [{ s: 'chirp', d: 0 }, { s: 'squeak', d: 300 }];
          break;
        default:
          sounds = [{ s: 'chirp', d: 0 }];
      }
    }

    return sounds;
  }

  // Try to mimic user's rhythm
  function _generateMimicResponse() {
    if (_comms.userPattern.length < 2) return null;

    var intervals = [];
    for (var i = 1; i < _comms.userPattern.length; i++) {
      intervals.push(_comms.userPattern[i] - _comms.userPattern[i - 1]);
    }

    // Copy the rhythm with creature sounds
    var sounds = [{ s: 'respond', d: 0 }];
    var totalDelay = 0;
    intervals.forEach(function (interval) {
      totalDelay += Math.min(800, interval); // cap interval
      sounds.push({ s: Math.random() > 0.5 ? 'respond' : 'chirp', d: totalDelay });
    });

    return sounds;
  }

  function _updateCommunication(dt) {
    // Process queued sounds
    if (_comms.queuedSounds.length > 0) {
      _comms.queueTimer += dt * 1000;
      var next = _comms.queuedSounds[0];
      if (_comms.queueTimer >= next.d) {
        var snd = next.s === 'purr_short' ? 'chirp' : next.s;
        if (window.AudioSystem && window.AudioSystem.isInitialized()) {
          window.AudioSystem.play(snd, { volume: 0.4 });
        }
        if (window.Creature) {
          window.Creature.triggerSoundGlow();
          if (typeof window.Creature.triggerSoundPop === 'function') {
            window.Creature.triggerSoundPop();
          }
        }
        _comms.queuedSounds.shift();
        if (_comms.queuedSounds.length === 0) _comms.queueTimer = 0;
      }
      return; // Don't generate new sounds while playing
    }

    // Check if user made a pattern we should respond to
    if (_comms.userPattern.length >= 2) {
      var now = Date.now();
      var lastUserSound = _comms.userPattern[_comms.userPattern.length - 1];
      // Wait 600ms after last user sound before responding
      if (now - lastUserSound > 600) {
        var mimic = _generateMimicResponse();
        if (mimic) {
          _comms.queuedSounds = mimic;
          _comms.queueTimer = 0;
          _comms.userPattern = [];
        }
      }
      return;
    }

    // Voluntary expression
    _comms.expressTimer += dt;
    var interval = _comms.expressInterval;
    // More talkative when happy/playful
    var dom = window.EmotionSystem ? window.EmotionSystem.getDominant() : 'neutral';
    if (dom === 'playful' || dom === 'happiness') interval *= 0.6;
    if (dom === 'sleepy') interval *= 2;

    if (_comms.expressTimer > interval) {
      _comms.expressTimer = 0;
      _comms.expressInterval = 8 + Math.random() * 12;
      var expression = _generateExpression();
      if (expression.length > 0) {
        _comms.queuedSounds = expression;
        _comms.queueTimer = 0;
      }
    }
  }

  // ── MICROEXPRESSIONS (eye behavior) ──────────────────────
  function _getEyeState() {
    var dom = window.EmotionSystem ? window.EmotionSystem.getDominant() : 'neutral';
    var result = {
      pupilScale: 1,
      blinkRate: 1,    // multiplier
      lookSpeed: 1,
      squint: 0,       // 0-1
      widen: 0,        // 0-1
      dartSpeed: 0,    // rapid eye movement
      droop: 0,        // eyelid droop 0-1
    };

    switch (dom) {
      case 'happiness':
        result.pupilScale = 1.1;
        result.squint = 0.2; // "smiling eyes"
        result.blinkRate = 0.8;
        break;
      case 'sadness':
        result.pupilScale = 1.15;
        result.droop = 0.3;
        result.lookSpeed = 0.5;
        result.blinkRate = 1.5;
        break;
      case 'fear':
        result.pupilScale = 1.4; // wide eyes
        result.widen = 0.4;
        result.dartSpeed = 3; // darting eyes
        result.blinkRate = 2.5; // nervous blinking
        break;
      case 'anger':
        result.squint = 0.5;
        result.pupilScale = 0.8;
        result.lookSpeed = 1.5;
        break;
      case 'curiosity':
        result.pupilScale = 1.3;
        result.widen = 0.2;
        result.lookSpeed = 1.8;
        break;
      case 'love':
        result.pupilScale = 1.35;
        result.blinkRate = 0.6; // slow blinks
        result.squint = 0.15;
        break;
      case 'sleepy':
        result.droop = 0.7;
        result.pupilScale = 0.85;
        result.lookSpeed = 0.3;
        result.blinkRate = 0.4; // slow heavy blinks
        break;
      case 'playful':
        result.pupilScale = 1.2;
        result.widen = 0.15;
        result.lookSpeed = 2;
        result.dartSpeed = 1;
        break;
      case 'sick':
        result.droop = 0.4;
        result.pupilScale = 0.9;
        result.lookSpeed = 0.4;
        break;
    }

    // Scared of something? Extra wide eyes
    if (_memory.scaredUntil > Date.now()) {
      result.widen = Math.max(result.widen, 0.5);
      result.dartSpeed = Math.max(result.dartSpeed, 4);
      result.pupilScale = Math.max(result.pupilScale, 1.4);
    }

    // Overfed? Sleepy eyes
    if (_isOverfed()) {
      result.droop = Math.max(result.droop, 0.3);
      result.pupilScale *= 0.9;
    }

    return result;
  }

  // ── BODY LANGUAGE ─────────────────────────────────────────
  const _bodyLang = {
    stretchTimer: 0,
    isStretching: false,
    stretchPhase: 0,
    sighTimer: 0,
    isSighing: false,
    sighPhase: 0,
    shakeTimer: 0,
    isShaking: false,
    shakePhase: 0,
    shiverAmount: 0,
    puffAmount: 0,     // inflation 0-1
    tiltAngle: 0,      // body tilt
  };

  function _updateBodyLanguage(dt) {
    var dom = window.EmotionSystem ? window.EmotionSystem.getDominant() : 'neutral';
    var N = window.NeedsSystem;

    // ── Stretch after waking up or sitting still
    _bodyLang.stretchTimer += dt;
    if (!_bodyLang.isStretching && _bodyLang.stretchTimer > 30 + Math.random() * 60) {
      if (dom === 'neutral' || dom === 'happiness') {
        _bodyLang.isStretching = true;
        _bodyLang.stretchPhase = 0;
        _bodyLang.stretchTimer = 0;
      }
    }
    if (_bodyLang.isStretching) {
      _bodyLang.stretchPhase += dt / 1.5; // 1.5 second stretch
      if (_bodyLang.stretchPhase >= 1) {
        _bodyLang.isStretching = false;
        _bodyLang.stretchPhase = 0;
      }
    }

    // ── Sigh when bored
    _bodyLang.sighTimer += dt;
    if (!_bodyLang.isSighing && _bodyLang.sighTimer > 20 + Math.random() * 40) {
      if (dom === 'sadness' || (N && N.get('fun') < 40)) {
        _bodyLang.isSighing = true;
        _bodyLang.sighPhase = 0;
        _bodyLang.sighTimer = 0;
      }
    }
    if (_bodyLang.isSighing) {
      _bodyLang.sighPhase += dt / 1.2;
      if (_bodyLang.sighPhase >= 1) {
        _bodyLang.isSighing = false;
        _bodyLang.sighPhase = 0;
      }
    }

    // ── Shiver when cold/scared/low energy
    var shouldShiver = dom === 'fear' ||
      (N && N.get('energy') < 20) ||
      _memory.scaredUntil > Date.now();
    _bodyLang.shiverAmount += ((shouldShiver ? 1 : 0) - _bodyLang.shiverAmount) * dt * 3;

    // ── Puff up when angry or proud
    var shouldPuff = dom === 'anger' || 
      (dom === 'happiness' && window.Personality && window.Personality.getTrait('playfulness') > 70);
    _bodyLang.puffAmount += ((shouldPuff ? 0.12 : 0) - _bodyLang.puffAmount) * dt * 2;

    // ── Tilt toward attention target
    var targetTilt = 0;
    if (_attention.type !== 'nothing' && window.Creature) {
      var dx = _attention.x - window.Creature.x;
      targetTilt = Math.max(-0.15, Math.min(0.15, dx * 0.0003));
    }
    _bodyLang.tiltAngle += (targetTilt - _bodyLang.tiltAngle) * dt * 3;

    // ── Shake after bath
    if (_bodyLang.isShaking) {
      _bodyLang.shakePhase += dt / 1.0;
      if (_bodyLang.shakePhase >= 1) {
        _bodyLang.isShaking = false;
        _bodyLang.shakePhase = 0;
      }
    }
  }

  function _getBodyModifiers() {
    var scaleX = 1;
    var scaleY = 1;
    var offsetX = 0;
    var offsetY = 0;
    var rotation = _bodyLang.tiltAngle;

    // Stretch animation (squash wide then tall)
    if (_bodyLang.isStretching) {
      var p = _bodyLang.stretchPhase;
      if (p < 0.4) {
        // Squash down, stretch wide
        var t = p / 0.4;
        scaleX = 1 + 0.15 * Math.sin(t * Math.PI);
        scaleY = 1 - 0.1 * Math.sin(t * Math.PI);
      } else {
        // Stretch tall, narrow
        var t2 = (p - 0.4) / 0.6;
        scaleX = 1 - 0.08 * Math.sin(t2 * Math.PI);
        scaleY = 1 + 0.12 * Math.sin(t2 * Math.PI);
      }
    }

    // Sigh (deflate briefly)
    if (_bodyLang.isSighing) {
      var sp = _bodyLang.sighPhase;
      var deflate = Math.sin(sp * Math.PI) * 0.08;
      scaleX += deflate * 0.5;
      scaleY -= deflate;
      offsetY += deflate * 10; // sink slightly
    }

    // Shiver
    if (_bodyLang.shiverAmount > 0.05) {
      offsetX += Math.sin(Date.now() * 0.03) * _bodyLang.shiverAmount * 3;
    }

    // Puff up
    scaleX += _bodyLang.puffAmount;
    scaleY += _bodyLang.puffAmount;

    // Post-bath shake
    if (_bodyLang.isShaking) {
      var shk = Math.sin(_bodyLang.shakePhase * Math.PI * 8) * (1 - _bodyLang.shakePhase);
      rotation += shk * 0.3;
      offsetX += shk * 8;
    }

    return {
      scaleX: scaleX,
      scaleY: scaleY,
      offsetX: offsetX,
      offsetY: offsetY,
      rotation: rotation,
    };
  }


  // ══════════════════════════════════════════════════════════
  //  PUBLIC API
  // ══════════════════════════════════════════════════════════

  window.Intelligence = {

    // ── Init ──
    init: function () {
      _attention.type = 'nothing';
      _attention.interest = 0;
      _comms.expressTimer = 0;
      _comms.expressInterval = 8 + Math.random() * 8;
      _toyPlay.cooldown = 5;
      _bodyLang.stretchTimer = 25; // first stretch soon
    },

    // ── Main update (call every frame) ──
    update: function (dt) {
      _updateAttention(dt);
      _updateAnticipation(dt);
      _updateCommunication(dt);
      _updateBodyLanguage(dt);

      var cx = window.Creature ? window.Creature.x : 0;
      var cy = window.Creature ? window.Creature.y : 0;

      // Toy play (returns movement commands)
      var toyCmd = _updateToyPlay(dt, cx, cy);

      return {
        attention: _attention,
        toyPlay: toyCmd,
        compound: _getCompoundBehavior(),
        routine: _getRoutineBehavior(),
        eyeState: _getEyeState(),
        bodyMods: _getBodyModifiers(),
      };
    },

    // ── Record events ──
    record: function (type, detail, x, y) {
      _recordMemory(type, detail, x, y);
      _recordHourlyActivity();
    },

    // ── Called when user presses talk button ──
    userSounded: function () {
      _userSounded();
    },

    // ── Queries ──
    getAttention: function () { return _attention; },
    getCompoundBehavior: _getCompoundBehavior,
    getEyeState: _getEyeState,
    getBodyModifiers: _getBodyModifiers,
    getRoutine: _getRoutineBehavior,
    getPetHabituation: _getPetHabituation,
    isOverfed: _isOverfed,
    isToyPlaying: function () { return _toyPlay.active; },
    getFavoriteToy: function () { return _memory.favoriteToy; },
    getMemory: function () { return _memory; },
    getAnticipation: function () { return _anticipation; },

    // ── Trigger body language events ──
    triggerShake: function () {
      _bodyLang.isShaking = true;
      _bodyLang.shakePhase = 0;
    },
    triggerScare: function (detail) {
      _recordMemory('scare', detail);
    },

    // ── Serialization ──
    serialize: function () {
      return {
        memory: {
          favoriteToy: _memory.favoriteToy,
          toyUseCounts: _memory.toyUseCounts,
        },
        anticipation: {
          hourlyActivity: _anticipation.hourlyActivity,
        },
        comms: {
          expressInterval: _comms.expressInterval,
        },
      };
    },

    deserialize: function (data) {
      if (!data) return;
      if (data.memory) {
        _memory.favoriteToy = data.memory.favoriteToy || null;
        _memory.toyUseCounts = data.memory.toyUseCounts || {};
      }
      if (data.anticipation) {
        _anticipation.hourlyActivity = data.anticipation.hourlyActivity || new Array(24).fill(0);
      }
      if (data.comms) {
        _comms.expressInterval = data.comms.expressInterval || 12;
      }
    },
  };

})();
