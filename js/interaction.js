/* ============================================
   INTERACTION SYSTEM — Bidirectional Creature-Player Interaction
   Handles: Requests, Mini-games, Gestures, Context, Micro-moments
   ============================================ */

window.Interaction = (function () {

  // ── State ──
  let _initialized = false;
  let _timers = { request: 0, game: 0, moment: 0, gesture: 0, context: 0 };
  let _intervals = { request: 3, game: 5, moment: 8, gesture: 0.05, context: 1 };

  // ── 1. CREATURE REQUESTS ──
  const _request = {
    active: false,
    type: null,        // 'food', 'play', 'love', 'sleep'
    intensity: 0,      // 0-1 how urgently
    timer: 0,          // how long requesting
    signalPhase: 0,    // animation phase
    lastPosition: null // where creature signals toward
  };

  const REQUEST_SIGNALS = {
    food: {
      check: () => typeof NeedsSystem !== 'undefined' && NeedsSystem.get('hunger') < 45,
      targetY: () => GAME.height * 0.92, // bottom — toward menu
      targetX: () => GAME.width * 0.5,
      sound: 'whimper',
      soundInterval: 4,
      emotion: 'sadness'
    },
    play: {
      check: () => typeof NeedsSystem !== 'undefined' && NeedsSystem.get('fun') < 40,
      targetY: () => GAME.height * 0.5,
      targetX: () => GAME.width * 0.3 + Math.random() * GAME.width * 0.4,
      sound: 'chirp',
      soundInterval: 5,
      emotion: 'curiosity'
    },
    love: {
      check: () => typeof NeedsSystem !== 'undefined' && NeedsSystem.get('affection') < 35,
      targetY: () => GAME.height * 0.5,
      targetX: () => GAME.width * 0.5,
      sound: 'whimper',
      soundInterval: 6,
      emotion: 'sadness'
    },
    sleep: {
      check: () => typeof NeedsSystem !== 'undefined' && NeedsSystem.get('energy') < 30,
      targetY: () => GAME.height * 0.75,
      targetX: () => GAME.width * 0.15,
      sound: 'yawn',
      soundInterval: 7,
      emotion: 'sleepy'
    }
  };

  function _updateRequests(dt) {
    _timers.request += dt;
    if (_timers.request < _intervals.request) return;
    _timers.request = 0;

    // If already requesting, update signal
    if (_request.active) {
      _request.timer += _intervals.request;
      _request.signalPhase += _intervals.request;
      const sig = REQUEST_SIGNALS[_request.type];
      if (!sig) return;

      // Play signal sound periodically
      if (_request.timer % sig.soundInterval < _intervals.request) {
        if (typeof AudioSystem !== 'undefined' && AudioSystem.isInitialized()) {
          AudioSystem.play(sig.sound, { volume: 0.3 });
        }
      }

      // Move creature toward signal target
      if (typeof Creature !== 'undefined' && Creature.x != null) {
        const tx = sig.targetX();
        const ty = sig.targetY();
        const dx = tx - Creature.x;
        const dy = ty - Creature.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 30) {
          const f = Math.min(_request.intensity * 15, 20);
          Creature.applyForce((dx / dist) * f, (dy / dist) * f);
        } else {
          // Bounce at target to signal
          const bounce = Math.sin(_request.signalPhase * 3) * 12;
          Creature.applyForce(0, bounce);
        }
      }

      // Check if need was satisfied
      if (!sig.check()) {
        _request.active = false;
        _request.type = null;
        _request.timer = 0;
      }

      // Give up after 60 seconds
      if (_request.timer > 60) {
        _request.active = false;
        _request.timer = 0;
        if (typeof EmotionSystem !== 'undefined') {
          EmotionSystem.modify('sadness', 10);
        }
      }
      return;
    }

    // Check if creature needs something
    const priority = ['food', 'sleep', 'play', 'love'];
    for (let i = 0; i < priority.length; i++) {
      const type = priority[i];
      const sig = REQUEST_SIGNALS[type];
      if (sig.check()) {
        // Only start requesting sometimes (not every check)
        if (Math.random() < 0.3) {
          _request.active = true;
          _request.type = type;
          _request.intensity = 0.5;
          _request.timer = 0;
          _request.signalPhase = 0;

          // Intensity based on how low the need is
          const val = NeedsSystem.get(type === 'food' ? 'hunger' : type === 'play' ? 'fun' : type === 'love' ? 'affection' : 'energy');
          _request.intensity = 1 - (val / 100);
        }
        break;
      }
    }
  }


  // ── 2. MINI-GAMES (Creature-initiated) ──
  const _game = {
    active: false,
    type: null,       // 'hide', 'chase', 'imitate'
    phase: 0,         // game phase
    timer: 0,
    data: {},
    cooldown: 0
  };

  const GAME_REQUIREMENTS = {
    hide: () => _getTrait('playfulness') > 55 && _getTrait('trust') > 50,
    chase: () => _getTrait('playfulness') > 45 && _getTrait('energy_level') > 50,
    imitate: () => _getTrait('trust') > 60 && _getTrait('curiosity') > 50
  };

  function _getTrait(name) {
    if (typeof Personality !== 'undefined' && Personality.getTrait) return Personality.getTrait(name);
    return 50;
  }

  function _getDominant() {
    if (typeof EmotionSystem !== 'undefined' && EmotionSystem.getDominant) return EmotionSystem.getDominant();
    return 'neutral';
  }

  function _updateGames(dt) {
    if (_game.cooldown > 0) { _game.cooldown -= dt; return; }
    _timers.game += dt;
    if (_timers.game < _intervals.game) return;
    _timers.game = 0;

    if (_game.active) {
      _updateActiveGame(dt * _intervals.game);
      return;
    }

    // Don't start games if creature is busy
    if (_request.active) return;
    const dom = _getDominant();
    if (dom === 'sadness' || dom === 'fear' || dom === 'anger' || dom === 'sleepy' || dom === 'sick') return;

    // Random chance to start a game
    if (Math.random() > 0.08) return;

    // Pick a valid game
    const types = ['chase', 'hide', 'imitate'];
    const valid = types.filter(t => GAME_REQUIREMENTS[t]());
    if (valid.length === 0) return;

    const chosen = valid[Math.floor(Math.random() * valid.length)];
    _startGame(chosen);
  }

  function _startGame(type) {
    _game.active = true;
    _game.type = type;
    _game.phase = 0;
    _game.timer = 0;
    _game.data = {};

    if (typeof AudioSystem !== 'undefined' && AudioSystem.isInitialized()) {
      AudioSystem.play('chirp', { volume: 0.4, pitch: 1.2 });
    }

    switch (type) {
      case 'hide':
        // Pick a corner to hide in
        const corners = [
          { x: -30, y: GAME.height * 0.3 },
          { x: GAME.width + 30, y: GAME.height * 0.3 },
          { x: -30, y: GAME.height * 0.7 },
          { x: GAME.width + 30, y: GAME.height * 0.7 }
        ];
        _game.data.corner = corners[Math.floor(Math.random() * corners.length)];
        _game.data.peekAmount = 0;
        _game.data.found = false;
        break;

      case 'chase':
        _game.data.escaped = 0;    // times escaped from player
        _game.data.caught = false;
        _game.data.fleeing = false;
        break;

      case 'imitate':
        // Create a pattern: sequence of directions
        const dirs = ['up', 'down', 'left', 'right'];
        const len = 2 + Math.floor(Math.random() * 2); // 2-3 moves
        _game.data.pattern = [];
        for (let i = 0; i < len; i++) {
          _game.data.pattern.push(dirs[Math.floor(Math.random() * dirs.length)]);
        }
        _game.data.showIndex = 0;
        _game.data.playerIndex = 0;
        _game.data.showing = true;
        _game.data.success = false;
        _game.data.moveTimer = 0;
        break;
    }
  }

  function _updateActiveGame(dt) {
    _game.timer += dt;

    // Timeout — game over
    if (_game.timer > 30) {
      _endGame(false);
      return;
    }

    switch (_game.type) {
      case 'hide': _updateHideGame(dt); break;
      case 'chase': _updateChaseGame(dt); break;
      case 'imitate': _updateImitateGame(dt); break;
    }
  }

  function _updateHideGame(dt) {
    const c = _game.data.corner;
    const cr = typeof Creature !== 'undefined' ? Creature : null;
    if (!cr || cr.x == null) return;

    switch (_game.phase) {
      case 0: // Moving to corner
        const dx = c.x - cr.x;
        const dy = c.y - cr.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        cr.applyForce((dx / Math.max(dist, 1)) * 35, (dy / Math.max(dist, 1)) * 35);

        if (dist < 60 || _game.timer > 5) {
          _game.phase = 1;
          _game.data.peekTimer = 0;
        }
        break;

      case 1: // Peeking out, waiting to be found
        _game.data.peekTimer = (_game.data.peekTimer || 0) + dt;
        // Peek in and out
        _game.data.peekAmount = Math.sin(_game.data.peekTimer * 1.5) * 0.5 + 0.5;

        // Nudge creature to stay near edge but peek
        const peekX = c.x < GAME.width / 2 ? 20 + _game.data.peekAmount * 40 : GAME.width - 20 - _game.data.peekAmount * 40;
        cr.applyForce((peekX - cr.x) * 0.3, (c.y - cr.y) * 0.3);

        // Check if player taps near creature
        if (typeof InputSystem !== 'undefined' && InputSystem.isDown()) {
          const pos = InputSystem.getPosition();
          const tdx = pos.x - cr.x;
          const tdy = pos.y - cr.y;
          if (Math.sqrt(tdx * tdx + tdy * tdy) < cr.radius * 2.5) {
            _game.data.found = true;
            _endGame(true);
          }
        }
        break;
    }
  }

  function _updateChaseGame(dt) {
    const cr = typeof Creature !== 'undefined' ? Creature : null;
    if (!cr || cr.x == null) return;
    if (typeof InputSystem === 'undefined') return;

    if (!InputSystem.isDown()) {
      // Creature taunts — bounces around playfully
      const tauntX = GAME.width / 2 + Math.sin(_game.timer * 2) * GAME.width * 0.3;
      const tauntY = GAME.height / 2 + Math.cos(_game.timer * 1.5) * GAME.height * 0.15;
      cr.applyForce((tauntX - cr.x) * 0.15, (tauntY - cr.y) * 0.15);
      _game.data.fleeing = false;
      return;
    }

    const pos = InputSystem.getPosition();
    const dx = cr.x - pos.x;
    const dy = cr.y - pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < cr.radius * 1.5) {
      // Caught!
      _game.data.caught = true;
      _endGame(true);
      return;
    }

    if (dist < cr.radius * 5) {
      // Flee from finger!
      _game.data.fleeing = true;
      const flee = Math.min(50, 200 / Math.max(dist, 1));
      cr.applyForce((dx / dist) * flee, (dy / dist) * flee);

      // Chirp while running
      if (Math.random() < 0.02 && typeof AudioSystem !== 'undefined') {
        AudioSystem.play('squeak', { volume: 0.2, pitch: 1.1 + Math.random() * 0.3 });
      }
    }

    _game.data.escaped++;
  }

  function _updateImitateGame(dt) {
    const cr = typeof Creature !== 'undefined' ? Creature : null;
    if (!cr || cr.x == null) return;

    const d = _game.data;
    d.moveTimer += dt;

    if (d.showing) {
      // Creature shows the pattern
      if (d.moveTimer > 1.2) {
        d.moveTimer = 0;

        if (d.showIndex < d.pattern.length) {
          const dir = d.pattern[d.showIndex];
          const force = 60;
          switch (dir) {
            case 'up':    cr.applyForce(0, -force); break;
            case 'down':  cr.applyForce(0, force); break;
            case 'left':  cr.applyForce(-force, 0); break;
            case 'right': cr.applyForce(force, 0); break;
          }
          if (typeof AudioSystem !== 'undefined' && AudioSystem.isInitialized()) {
            AudioSystem.play('chirp', { volume: 0.3, pitch: 0.8 + d.showIndex * 0.15 });
          }
          d.showIndex++;
        } else {
          // Done showing, wait for player input
          d.showing = false;
          d.moveTimer = 0;
          d.playerMoves = [];
          d.lastSwipe = null;
        }
      }
    } else {
      // Wait for player to replicate with swipes
      if (typeof InputSystem !== 'undefined') {
        // Detect swipe direction from velocity
        const vel = InputSystem.getVelocity();
        const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);

        if (speed > 100 && !d.lastSwipe) {
          let dir;
          if (Math.abs(vel.x) > Math.abs(vel.y)) {
            dir = vel.x > 0 ? 'right' : 'left';
          } else {
            dir = vel.y > 0 ? 'down' : 'up';
          }

          d.lastSwipe = dir;
          d.playerMoves.push(dir);

          // Check if correct so far
          const idx = d.playerMoves.length - 1;
          if (d.playerMoves[idx] !== d.pattern[idx]) {
            // Wrong!
            _endGame(false);
            return;
          }

          if (d.playerMoves.length === d.pattern.length) {
            // All correct!
            d.success = true;
            _endGame(true);
            return;
          }
        } else if (speed < 30) {
          d.lastSwipe = null;
        }
      }

      // Timeout waiting for input
      if (d.moveTimer > 10) {
        _endGame(false);
      }
    }
  }

  function _endGame(won) {
    _game.active = false;
    _game.cooldown = 60; // 60 seconds between games

    if (typeof Creature === 'undefined') return;

    if (won) {
      // Celebration!
      if (typeof EmotionSystem !== 'undefined') {
        EmotionSystem.modify('happiness', 20);
        EmotionSystem.modify('playful', 15);
        EmotionSystem.modify('love', 8);
      }
      if (typeof NeedsSystem !== 'undefined') {
        NeedsSystem.satisfy('fun', 25);
        NeedsSystem.satisfy('affection', 10);
      }
      if (typeof Personality !== 'undefined') {
        Personality.recordEvent('play', { game: _game.type, won: true });
      }
      if (typeof AudioSystem !== 'undefined' && AudioSystem.isInitialized()) {
        AudioSystem.play('chirp', { volume: 0.5, pitch: 1.3 });
        setTimeout(() => AudioSystem.play('chirp', { volume: 0.4, pitch: 1.5 }), 200);
      }
      // Victory bounce
      Creature.applyForce(0, -80);
      if (typeof Particles !== 'undefined') {
        Particles.burst(Creature.x, Creature.y, '55,80%,65%', 20);
      }
    } else {
      // Mild disappointment
      if (typeof EmotionSystem !== 'undefined') {
        EmotionSystem.modify('sadness', 5);
      }
      if (typeof AudioSystem !== 'undefined' && AudioSystem.isInitialized()) {
        AudioSystem.play('whimper', { volume: 0.3 });
      }
    }
  }


  // ── 3. GESTURE RECOGNITION ──
  const _gesture = {
    trail: [],           // last N touch positions
    maxTrail: 60,
    lastCheck: 0,
    cooldown: 0
  };

  function _updateGestures(dt) {
    if (_gesture.cooldown > 0) { _gesture.cooldown -= dt; return; }

    if (typeof InputSystem === 'undefined') return;
    if (!InputSystem.isDown()) {
      // Analyze trail on release
      if (_gesture.trail.length > 15) {
        _analyzeGesture();
      }
      _gesture.trail.length = 0;
      return;
    }

    // Record trail
    const pos = InputSystem.getPosition();
    _gesture.trail.push({ x: pos.x, y: pos.y, t: Date.now() });
    if (_gesture.trail.length > _gesture.maxTrail) {
      _gesture.trail.shift();
    }
  }

  function _analyzeGesture() {
    const trail = _gesture.trail;
    if (trail.length < 15) return;
    if (typeof Creature === 'undefined' || Creature.x == null) return;

    // Check for circle (abrazo)
    const isCircle = _detectCircle(trail);
    if (isCircle) {
      _gesture.cooldown = 3;
      _triggerHug();
      return;
    }

    // Check for zigzag (cosquillas)
    const isZigzag = _detectZigzag(trail);
    if (isZigzag) {
      _gesture.cooldown = 3;
      _triggerTickle();
      return;
    }
  }

  function _detectCircle(trail) {
    if (trail.length < 20) return false;

    // Calculate centroid
    let cx = 0, cy = 0;
    for (let i = 0; i < trail.length; i++) {
      cx += trail[i].x;
      cy += trail[i].y;
    }
    cx /= trail.length;
    cy /= trail.length;

    // Check if creature is near the center
    if (typeof Creature === 'undefined') return false;
    const dcx = cx - Creature.x;
    const dcy = cy - Creature.y;
    if (Math.sqrt(dcx * dcx + dcy * dcy) > Creature.radius * 3) return false;

    // Check if points are roughly equidistant from center (circular)
    let avgR = 0;
    for (let i = 0; i < trail.length; i++) {
      const dx = trail[i].x - cx;
      const dy = trail[i].y - cy;
      avgR += Math.sqrt(dx * dx + dy * dy);
    }
    avgR /= trail.length;

    if (avgR < 30) return false; // Too small

    let variance = 0;
    for (let i = 0; i < trail.length; i++) {
      const dx = trail[i].x - cx;
      const dy = trail[i].y - cy;
      const r = Math.sqrt(dx * dx + dy * dy);
      variance += (r - avgR) * (r - avgR);
    }
    variance /= trail.length;

    // Check that start and end are close (completed the circle)
    const startEnd = Math.sqrt(
      Math.pow(trail[0].x - trail[trail.length - 1].x, 2) +
      Math.pow(trail[0].y - trail[trail.length - 1].y, 2)
    );

    // Circle: low variance + start/end close
    return (variance < avgR * avgR * 0.4) && (startEnd < avgR * 1.5);
  }

  function _detectZigzag(trail) {
    if (trail.length < 20) return false;

    // Count direction changes on X axis
    let changes = 0;
    let lastDx = 0;
    for (let i = 2; i < trail.length; i += 2) {
      const dx = trail[i].x - trail[i - 2].x;
      if (lastDx !== 0 && dx !== 0 && Math.sign(dx) !== Math.sign(lastDx)) {
        changes++;
      }
      if (dx !== 0) lastDx = dx;
    }

    // Check if near creature
    const mid = trail[Math.floor(trail.length / 2)];
    if (typeof Creature === 'undefined') return false;
    const dist = Math.sqrt(Math.pow(mid.x - Creature.x, 2) + Math.pow(mid.y - Creature.y, 2));

    // Zigzag = many direction changes near the creature
    return changes >= 4 && dist < Creature.radius * 3;
  }

  function _triggerHug() {
    if (typeof EmotionSystem !== 'undefined') {
      EmotionSystem.modify('love', 25);
      EmotionSystem.modify('happiness', 15);
      EmotionSystem.modify('fear', -10);
    }
    if (typeof NeedsSystem !== 'undefined') {
      NeedsSystem.satisfy('affection', 20);
    }
    if (typeof Personality !== 'undefined') {
      Personality.recordEvent('pet', { type: 'hug' });
    }
    if (typeof AudioSystem !== 'undefined' && AudioSystem.isInitialized()) {
      AudioSystem.play('chirp', { volume: 0.4, pitch: 1.1 });
      setTimeout(() => AudioSystem.startLoop('purr'), 300);
      setTimeout(() => AudioSystem.stopLoop('purr'), 3000);
    }
    if (typeof Creature !== 'undefined') {
      Creature.triggerSoundGlow();
    }
    if (typeof Particles !== 'undefined' && typeof Creature !== 'undefined') {
      Particles.burst(Creature.x, Creature.y, '330,70%,70%', 25);
    }
  }

  function _triggerTickle() {
    if (typeof EmotionSystem !== 'undefined') {
      EmotionSystem.modify('playful', 20);
      EmotionSystem.modify('happiness', 12);
    }
    if (typeof NeedsSystem !== 'undefined') {
      NeedsSystem.satisfy('fun', 15);
    }
    if (typeof AudioSystem !== 'undefined' && AudioSystem.isInitialized()) {
      // Rapid squeaks
      for (let i = 0; i < 4; i++) {
        setTimeout(() => {
          AudioSystem.play('squeak', { volume: 0.25, pitch: 1.0 + Math.random() * 0.5 });
        }, i * 120);
      }
    }
    // Shake the creature
    if (typeof Creature !== 'undefined') {
      const shakeInterval = setInterval(() => {
        Creature.applyForce((Math.random() - 0.5) * 60, (Math.random() - 0.5) * 40);
      }, 80);
      setTimeout(() => clearInterval(shakeInterval), 800);
    }
  }


  // ── 4. CONTEXTUAL TOUCH RESPONSE ──
  const _context = {
    lastTouchTime: 0,
    lastOpenTime: 0,
    touchesToday: 0,
    firstTouchOfSession: true,
    sessionStart: Date.now(),
    nightWake: false
  };

  function _updateContext(dt) {
    _timers.context += dt;
    if (_timers.context < _intervals.context) return;
    _timers.context = 0;

    // Track if it's night
    const hour = new Date().getHours();
    _context.isNight = hour >= 22 || hour < 7;
  }

  function _onTouch(data) {
    if (GAME.state !== 'living') return;
    if (typeof Creature === 'undefined' || Creature.x == null) return;

    const now = Date.now();

    // First touch of the session — greeting!
    if (_context.firstTouchOfSession) {
      _context.firstTouchOfSession = false;
      _triggerGreeting(now);
      return;
    }

    // Night touch — waking up
    if (_context.isNight && !_context.nightWake) {
      _context.nightWake = true;
      _triggerNightWake();
    }

    _context.lastTouchTime = now;
    _context.touchesToday++;
  }

  function _triggerGreeting(now) {
    const timeSinceOpen = (now - _context.sessionStart) / 1000;
    const trust = _getTrait('trust');

    if (timeSinceOpen < 5) {
      // Just opened the app and touched
      if (trust > 60) {
        // Happy greeting — bounce toward finger
        if (typeof EmotionSystem !== 'undefined') {
          EmotionSystem.modify('happiness', 15);
          EmotionSystem.modify('love', 8);
        }
        if (typeof AudioSystem !== 'undefined' && AudioSystem.isInitialized()) {
          AudioSystem.play('chirp', { volume: 0.4, pitch: 1.2 });
          setTimeout(() => AudioSystem.play('chirp', { volume: 0.3, pitch: 1.4 }), 250);
        }
        Creature.applyForce(0, -50); // Happy jump
        if (typeof Particles !== 'undefined') {
          Particles.burst(Creature.x, Creature.y - Creature.radius, '45,80%,70%', 10);
        }
      } else if (trust < 35) {
        // Distrustful — backs away slightly
        if (typeof EmotionSystem !== 'undefined') {
          EmotionSystem.modify('fear', 8);
        }
        const pos = typeof InputSystem !== 'undefined' ? InputSystem.getPosition() : { x: GAME.width / 2, y: GAME.height / 2 };
        const dx = Creature.x - pos.x;
        const dy = Creature.y - pos.y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        Creature.applyForce((dx / dist) * 25, (dy / dist) * 25);
      } else {
        // Neutral — small curious reaction
        if (typeof AudioSystem !== 'undefined' && AudioSystem.isInitialized()) {
          AudioSystem.play('chirp', { volume: 0.25 });
        }
      }
    }
  }

  function _triggerNightWake() {
    const trust = _getTrait('trust');

    if (trust > 55) {
      // Happy to see you even at night
      if (typeof EmotionSystem !== 'undefined') {
        EmotionSystem.modify('happiness', 8);
        EmotionSystem.modify('sleepy', 5);
      }
      if (typeof AudioSystem !== 'undefined' && AudioSystem.isInitialized()) {
        AudioSystem.play('yawn', { volume: 0.3 });
      }
    } else {
      // Grumpy about being woken up
      if (typeof EmotionSystem !== 'undefined') {
        EmotionSystem.modify('anger', 10);
        EmotionSystem.modify('sleepy', 10);
      }
      if (typeof AudioSystem !== 'undefined' && AudioSystem.isInitialized()) {
        AudioSystem.play('growl', { volume: 0.2 });
      }
    }
  }


  // ── 5. MICRO-MOMENTS (Spontaneous behaviors) ──
  const _moments = {
    cooldown: 0,
    active: false,
    type: null,
    timer: 0,
    nextInterval: 300 + Math.random() * 300 // 5-10 minutes
  };

  const MICRO_MOMENTS = [
    {
      name: 'sneeze',
      duration: 0.8,
      weight: 3,
      execute: function (phase) {
        if (phase < 0.3) {
          // Build up — creature inflates slightly
          if (typeof Creature !== 'undefined') {
            Creature.applyForce(0, -3);
          }
        } else if (phase >= 0.3 && phase < 0.5) {
          // Sneeze! — quick jolt forward
          if (phase < 0.35) {
            if (typeof Creature !== 'undefined') Creature.applyForce(0, 40);
            if (typeof AudioSystem !== 'undefined' && AudioSystem.isInitialized()) {
              AudioSystem.play('squeak', { volume: 0.35, pitch: 1.6 });
            }
          }
        }
        // Recovery — settle back
      }
    },
    {
      name: 'stare',
      duration: 4,
      weight: 4,
      execute: function (phase) {
        // Stare at a random fixed point intently
        if (!this._target) {
          this._target = {
            x: GAME.width * (0.2 + Math.random() * 0.6),
            y: GAME.height * (0.2 + Math.random() * 0.6)
          };
        }
        // Intelligence system will pick up the attention target
        if (typeof Intelligence !== 'undefined' && Intelligence._attention) {
          Intelligence._attention.target = 'point';
          Intelligence._attention.targetPos = this._target;
        }
        if (phase > 0.9) this._target = null;
      }
    },
    {
      name: 'newSound',
      duration: 1.5,
      weight: 2,
      execute: function (phase) {
        if (phase < 0.1) {
          // Make a unique sound the player hasn't heard
          if (typeof AudioSystem !== 'undefined' && AudioSystem.isInitialized()) {
            const pitch = 0.6 + Math.random() * 1.2;
            const sounds = ['chirp', 'squeak', 'respond'];
            const s = sounds[Math.floor(Math.random() * sounds.length)];
            AudioSystem.play(s, { volume: 0.3, pitch: pitch });
          }
          if (typeof Creature !== 'undefined') {
            Creature.triggerSoundGlow();
            Creature.applyForce(0, -15);
          }
        }
      }
    },
    {
      name: 'discover',
      duration: 3,
      weight: 2,
      execute: function (phase) {
        if (!this._spot) {
          this._spot = {
            x: GAME.width * (0.15 + Math.random() * 0.7),
            y: GAME.height * (0.3 + Math.random() * 0.4)
          };
        }
        const cr = typeof Creature !== 'undefined' ? Creature : null;
        if (!cr || cr.x == null) return;

        if (phase < 0.5) {
          // Move toward discovered spot
          const dx = this._spot.x - cr.x;
          const dy = this._spot.y - cr.y;
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
          cr.applyForce((dx / dist) * 12, (dy / dist) * 12);
        } else if (phase >= 0.5 && phase < 0.55) {
          // Excited!
          if (typeof EmotionSystem !== 'undefined') {
            EmotionSystem.modify('curiosity', 12);
            EmotionSystem.modify('happiness', 8);
          }
          if (typeof AudioSystem !== 'undefined' && AudioSystem.isInitialized()) {
            AudioSystem.play('chirp', { volume: 0.35, pitch: 1.3 });
          }
          if (typeof Particles !== 'undefined') {
            Particles.burst(cr.x, cr.y - cr.radius, '170,70%,60%', 8);
          }
          cr.applyForce(0, -30);
        }
        if (phase > 0.95) this._spot = null;
      }
    },
    {
      name: 'stretch',
      duration: 2,
      weight: 3,
      execute: function (phase) {
        if (typeof Creature === 'undefined') return;
        // Stretch is visual — apply gentle vertical force
        if (phase < 0.3) {
          Creature.applyForce(0, -8);
        } else if (phase > 0.5 && phase < 0.7) {
          Creature.applyForce(0, 5);
        }
        if (phase < 0.05 && typeof AudioSystem !== 'undefined' && AudioSystem.isInitialized()) {
          AudioSystem.play('yawn', { volume: 0.2, pitch: 0.9 });
        }
      }
    },
    {
      name: 'sigh',
      duration: 1.5,
      weight: 3,
      execute: function (phase) {
        if (typeof Creature === 'undefined') return;
        // Brief deflation
        if (phase < 0.4) {
          Creature.applyForce(0, 3);
        }
        if (phase < 0.05 && typeof AudioSystem !== 'undefined' && AudioSystem.isInitialized()) {
          AudioSystem.play('whimper', { volume: 0.15, pitch: 0.7 });
        }
      }
    }
  ];

  function _updateMoments(dt) {
    if (_moments.active) {
      _moments.timer += dt;
      const m = MICRO_MOMENTS.find(mm => mm.name === _moments.type);
      if (m) {
        const phase = Math.min(_moments.timer / m.duration, 1);
        m.execute(phase);
        if (_moments.timer >= m.duration) {
          _moments.active = false;
          _moments.cooldown = 0;
          _moments.nextInterval = 300 + Math.random() * 300;
        }
      }
      return;
    }

    _moments.cooldown += dt;
    if (_moments.cooldown < _moments.nextInterval) return;
    _moments.cooldown = 0;

    // Don't trigger during games or requests
    if (_game.active || _request.active) return;

    // Pick a random moment (weighted)
    const totalWeight = MICRO_MOMENTS.reduce((s, m) => s + m.weight, 0);
    let r = Math.random() * totalWeight;
    for (let i = 0; i < MICRO_MOMENTS.length; i++) {
      r -= MICRO_MOMENTS[i].weight;
      if (r <= 0) {
        _moments.active = true;
        _moments.type = MICRO_MOMENTS[i].name;
        _moments.timer = 0;
        break;
      }
    }
  }


  // ── 6. TOUCH SPEED ANALYSIS ──
  const _touchAnalysis = {
    speeds: [],
    maxSpeeds: 10,
    lastAnalysis: 0
  };

  function _analyzeTouchSpeed() {
    if (typeof InputSystem === 'undefined' || !InputSystem.isDown()) return;

    const vel = InputSystem.getVelocity();
    const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
    _touchAnalysis.speeds.push(speed);
    if (_touchAnalysis.speeds.length > _touchAnalysis.maxSpeeds) {
      _touchAnalysis.speeds.shift();
    }
  }

  function _getAverageTouchSpeed() {
    if (_touchAnalysis.speeds.length === 0) return 0;
    let sum = 0;
    for (let i = 0; i < _touchAnalysis.speeds.length; i++) sum += _touchAnalysis.speeds[i];
    return sum / _touchAnalysis.speeds.length;
  }


  // ══════════════════════════════════
  //  PUBLIC API
  // ══════════════════════════════════

  return {
    // State access for other systems
    get isGameActive() { return _game.active; },
    get gameType() { return _game.type; },
    get isRequesting() { return _request.active; },
    get requestType() { return _request.type; },
    get isMomentActive() { return _moments.active; },
    get momentType() { return _moments.type; },

    init: function () {
      if (_initialized) return;
      _initialized = true;
      _context.sessionStart = Date.now();
      _context.firstTouchOfSession = true;
      _context.nightWake = false;
      _context.touchesToday = 0;

      // Listen for first touch for contextual greeting
      if (typeof InputSystem !== 'undefined') {
        InputSystem.on('tap', _onTouch);
        InputSystem.on('down', _onTouch);
      }
    },

    update: function (dt) {
      if (!_initialized || GAME.state !== 'living') return;

      _updateRequests(dt);
      _updateGames(dt);
      _updateGestures(dt);
      _updateContext(dt);
      _updateMoments(dt);
      _analyzeTouchSpeed();
    },

    // Get touch analysis
    getAverageTouchSpeed: function () {
      return _getAverageTouchSpeed();
    },

    // Check if creature is in a mini-game
    isInGame: function () {
      return _game.active;
    },

    // Get current request info
    getRequest: function () {
      if (!_request.active) return null;
      return { type: _request.type, intensity: _request.intensity, timer: _request.timer };
    },

    serialize: function () {
      return {
        touchesToday: _context.touchesToday,
        gameCooldown: _game.cooldown,
        momentCooldown: _moments.cooldown
      };
    },

    deserialize: function (data) {
      if (!data) return;
      _context.touchesToday = data.touchesToday || 0;
      _game.cooldown = data.gameCooldown || 0;
      _moments.cooldown = data.momentCooldown || 0;
    }
  };
})();
