/**
 * ===================================================
 * AudioSystem — Sonido procedural con Web Audio API
 * ===================================================
 * Todos los sonidos generados en tiempo real.
 * Ningún archivo de audio externo.
 *
 * Sonidos de criatura:
 *   purr, chirp, whimper, growl, yawn, squeak, hum
 * Sonidos ambientales:
 *   heartbeat
 * Sonidos UI:
 *   menu_open, menu_close, item_select
 *
 * Uso:
 *   AudioSystem.init()            // en primera interacción
 *   AudioSystem.play('chirp')     // sonido puntual
 *   AudioSystem.startLoop('purr') // sonido continuo
 *   AudioSystem.stopLoop('purr')
 *   AudioSystem.setMasterVolume(0.3)
 * ===================================================
 */
(function() {
  'use strict';

  // ─── State ───
  var _ctx = null;           // AudioContext
  var _master = null;        // GainNode master
  var _initialized = false;
  var _masterVol = 0.3;
  var _muted = false;

  // ─── Active voices (limit simultaneous sounds) ───
  var MAX_VOICES = 4;
  var _activeVoices = 0;

  // ─── Active loops ───
  var _loops = {};           // { name: { nodes..., active: bool } }

  // ─── Cooldowns (prevent sound spam) ───
  var _lastPlayTime = {};
  var COOLDOWN_MS = 80;

  // ──────────────────────────────────────────────
  // Utilities
  // ──────────────────────────────────────────────

  function now() {
    return _ctx ? _ctx.currentTime : 0;
  }

  function clamp(v, min, max) {
    return v < min ? min : (v > max ? max : v);
  }

  /**
   * Create a gain node with optional connection target
   */
  function makeGain(value, target) {
    var g = _ctx.createGain();
    g.gain.setValueAtTime(value, now());
    g.connect(target || _master);
    return g;
  }

  /**
   * Create an oscillator (does NOT start it)
   */
  function makeOsc(type, freq, target) {
    var osc = _ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now());
    osc.connect(target);
    return osc;
  }

  /**
   * ADSR envelope on a GainNode
   * @param {GainNode} gain
   * @param {number} peak — max volume
   * @param {number} a — attack time (s)
   * @param {number} d — decay time (s)
   * @param {number} s — sustain level (0-1 of peak)
   * @param {number} r — release time (s)
   * @param {number} dur — total duration before release (s)
   */
  function adsr(gain, peak, a, d, s, r, dur) {
    var t = now();
    var param = gain.gain;
    param.cancelScheduledValues(t);
    param.setValueAtTime(0.001, t);
    // Attack
    param.linearRampToValueAtTime(peak, t + a);
    // Decay → Sustain
    param.linearRampToValueAtTime(peak * s, t + a + d);
    // Hold sustain
    param.setValueAtTime(peak * s, t + dur - r);
    // Release
    param.linearRampToValueAtTime(0.001, t + dur);
  }

  /**
   * Schedule voice cleanup
   */
  function scheduleEnd(nodes, duration) {
    _activeVoices++;
    var endTime = now() + duration + 0.05;

    // Stop all oscillators
    for (var i = 0; i < nodes.length; i++) {
      try { nodes[i].stop(endTime); } catch (e) {}
    }

    setTimeout(function() {
      _activeVoices = Math.max(0, _activeVoices - 1);
      for (var j = 0; j < nodes.length; j++) {
        try { nodes[j].disconnect(); } catch (e) {}
      }
    }, (duration + 0.1) * 1000);
  }

  // ──────────────────────────────────────────────
  // Sound Definitions
  // ──────────────────────────────────────────────

  var SOUNDS = {};

  /**
   * PURR — Gentle warm rumble (continuous loop)
   * Very soft sine at low freq with slow tremolo
   */
  SOUNDS.purr = {
    loop: true,
    create: function(opts) {
      var vol = (opts.volume || 0.5) * 0.08; // Much quieter
      var pitch = opts.pitch || 1;

      // Main tone — very low, warm
      var gainNode = makeGain(0);
      var osc = makeOsc('sine', 65 * pitch, gainNode);

      // Gentle slow tremolo (not fast scary vibrato)
      var lfoGain = _ctx.createGain();
      lfoGain.gain.setValueAtTime(vol * 0.15, now());
      lfoGain.connect(gainNode.gain);
      var lfo = _ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(2.2, now()); // Slow pulse, not fast buzz
      lfo.connect(lfoGain);

      // Soft harmonic — gentle warmth
      var gain2 = makeGain(0);
      var osc2 = makeOsc('sine', 130 * pitch, gain2);

      // Very slow fade in
      var t = now();
      gainNode.gain.linearRampToValueAtTime(vol, t + 1.5);
      gain2.gain.linearRampToValueAtTime(vol * 0.06, t + 2.0);

      osc.start(t);
      osc2.start(t);
      lfo.start(t);

      return {
        oscs: [osc, osc2, lfo],
        gains: [gainNode, gain2, lfoGain],
        stop: function() {
          var st = now();
          gainNode.gain.linearRampToValueAtTime(0.001, st + 1.0);
          gain2.gain.linearRampToValueAtTime(0.001, st + 1.0);
          setTimeout(function() {
            try { osc.stop(); osc2.stop(); lfo.stop(); } catch (e) {}
            try { osc.disconnect(); osc2.disconnect(); lfo.disconnect(); } catch (e) {}
            try { gainNode.disconnect(); gain2.disconnect(); lfoGain.disconnect(); } catch (e) {}
          }, 1100);
        }
      };
    }
  };

  /**
   * CHIRP — Happy rising tone, short and bright
   */
  SOUNDS.chirp = {
    loop: false,
    create: function(opts) {
      var vol = (opts.volume || 0.5) * 0.3;
      var pitch = opts.pitch || 1;
      var dur = (opts.duration || 150) / 1000;

      var gainNode = makeGain(0);
      var osc = makeOsc('sine', 220 * pitch, gainNode);

      // Rising frequency
      osc.frequency.linearRampToValueAtTime(440 * pitch, now() + dur * 0.7);
      osc.frequency.linearRampToValueAtTime(520 * pitch, now() + dur);

      adsr(gainNode, vol, 0.01, dur * 0.3, 0.6, dur * 0.3, dur);

      // Second chirp (echo)
      var gain2 = makeGain(0);
      var osc2 = makeOsc('sine', 330 * pitch, gain2);
      osc2.frequency.linearRampToValueAtTime(550 * pitch, now() + dur * 0.5 + dur);
      adsr(gain2, vol * 0.4, 0.01, dur * 0.2, 0.3, dur * 0.4, dur * 0.8);

      osc.start(now());
      osc2.start(now() + dur * 0.15);

      scheduleEnd([osc, osc2], dur + 0.2);
      return { gains: [gainNode, gain2] };
    }
  };

  /**
   * WHIMPER — Sad descending tone, slow and soft
   */
  SOUNDS.whimper = {
    loop: false,
    create: function(opts) {
      var vol = (opts.volume || 0.5) * 0.2;
      var pitch = opts.pitch || 1;
      var dur = (opts.duration || 600) / 1000;

      var gainNode = makeGain(0);
      var osc = makeOsc('sine', 320 * pitch, gainNode);

      // Descending with slight wobble
      var t = now();
      osc.frequency.setValueAtTime(320 * pitch, t);
      osc.frequency.linearRampToValueAtTime(260 * pitch, t + dur * 0.4);
      osc.frequency.linearRampToValueAtTime(180 * pitch, t + dur * 0.8);
      osc.frequency.linearRampToValueAtTime(140 * pitch, t + dur);

      adsr(gainNode, vol, 0.05, dur * 0.2, 0.7, dur * 0.4, dur);

      // Slight vibrato LFO
      var vGain = _ctx.createGain();
      vGain.gain.setValueAtTime(4, t);
      vGain.connect(osc.frequency);
      var vib = makeOsc('sine', 5, vGain);

      osc.start(t);
      vib.start(t);

      scheduleEnd([osc, vib], dur + 0.1);
      return { gains: [gainNode] };
    }
  };

  /**
   * GROWL — Filtered noise with low vibrato
   */
  SOUNDS.growl = {
    loop: false,
    create: function(opts) {
      var vol = (opts.volume || 0.5) * 0.18;
      var pitch = opts.pitch || 1;
      var dur = (opts.duration || 500) / 1000;

      // Noise source via oscillator + waveshaping
      var gainNode = makeGain(0);
      var osc = makeOsc('sawtooth', 70 * pitch, gainNode);

      // Low-pass filter
      var filter = _ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(200 * pitch, now());
      filter.Q.setValueAtTime(3, now());
      osc.disconnect();
      osc.connect(filter);
      filter.connect(gainNode);

      // Vibrato
      var vGain = _ctx.createGain();
      vGain.gain.setValueAtTime(15, now());
      vGain.connect(osc.frequency);
      var vib = makeOsc('sine', 7, vGain);

      adsr(gainNode, vol, 0.03, dur * 0.15, 0.8, dur * 0.4, dur);

      osc.start(now());
      vib.start(now());

      scheduleEnd([osc, vib], dur + 0.1);
      return { gains: [gainNode] };
    }
  };

  /**
   * YAWN — Rises then falls, long and breathy
   */
  SOUNDS.yawn = {
    loop: false,
    create: function(opts) {
      var vol = (opts.volume || 0.5) * 0.2;
      var pitch = opts.pitch || 1;
      var dur = (opts.duration || 900) / 1000;

      var gainNode = makeGain(0);
      var osc = makeOsc('sine', 160 * pitch, gainNode);

      var t = now();
      // Rise
      osc.frequency.linearRampToValueAtTime(280 * pitch, t + dur * 0.35);
      // Peak hold
      osc.frequency.setValueAtTime(280 * pitch, t + dur * 0.45);
      // Fall
      osc.frequency.linearRampToValueAtTime(110 * pitch, t + dur * 0.9);
      osc.frequency.linearRampToValueAtTime(90 * pitch, t + dur);

      adsr(gainNode, vol, 0.08, dur * 0.15, 0.65, dur * 0.35, dur);

      // Breathy noise layer
      var noiseGain = makeGain(0);
      var noiseOsc = makeOsc('triangle', 180 * pitch, noiseGain);
      noiseOsc.frequency.linearRampToValueAtTime(300 * pitch, t + dur * 0.35);
      noiseOsc.frequency.linearRampToValueAtTime(100 * pitch, t + dur);
      adsr(noiseGain, vol * 0.15, 0.1, dur * 0.1, 0.4, dur * 0.3, dur);

      osc.start(t);
      noiseOsc.start(t);

      scheduleEnd([osc, noiseOsc], dur + 0.1);
      return { gains: [gainNode, noiseGain] };
    }
  };

  /**
   * SQUEAK — Short high-pitched pip
   */
  SOUNDS.squeak = {
    loop: false,
    create: function(opts) {
      var vol = (opts.volume || 0.5) * 0.22;
      var pitch = opts.pitch || 1;
      var dur = (opts.duration || 80) / 1000;

      var gainNode = makeGain(0);
      var freq = (550 + Math.random() * 250) * pitch;
      var osc = makeOsc('sine', freq, gainNode);

      // Quick pitch bend up
      osc.frequency.linearRampToValueAtTime(freq * 1.3, now() + dur * 0.5);
      osc.frequency.linearRampToValueAtTime(freq * 1.1, now() + dur);

      adsr(gainNode, vol, 0.005, dur * 0.3, 0.4, dur * 0.5, dur);

      osc.start(now());
      scheduleEnd([osc], dur + 0.05);
      return { gains: [gainNode] };
    }
  };

  /**
   * HUM — Two oscillators in gentle harmony
   */
  SOUNDS.hum = {
    loop: true,
    create: function(opts) {
      var vol = (opts.volume || 0.5) * 0.12;
      var pitch = opts.pitch || 1;

      // Root note
      var gain1 = makeGain(0);
      var osc1 = makeOsc('sine', 180 * pitch, gain1);

      // Perfect fifth above
      var gain2 = makeGain(0);
      var osc2 = makeOsc('sine', 270 * pitch, gain2);

      // Soft octave below
      var gain3 = makeGain(0);
      var osc3 = makeOsc('sine', 90 * pitch, gain3);

      // Slow volume modulation
      var lfoGain = _ctx.createGain();
      lfoGain.gain.setValueAtTime(vol * 0.08, now());
      lfoGain.connect(gain1.gain);
      var lfo = makeOsc('sine', 0.3, lfoGain);

      // Fade in
      var t = now();
      gain1.gain.linearRampToValueAtTime(vol, t + 1.5);
      gain2.gain.linearRampToValueAtTime(vol * 0.5, t + 2.0);
      gain3.gain.linearRampToValueAtTime(vol * 0.3, t + 1.8);

      osc1.start(t);
      osc2.start(t + 0.2);
      osc3.start(t + 0.1);
      lfo.start(t);

      return {
        oscs: [osc1, osc2, osc3, lfo],
        gains: [gain1, gain2, gain3, lfoGain],
        stop: function() {
          var st = now();
          gain1.gain.linearRampToValueAtTime(0.001, st + 1.0);
          gain2.gain.linearRampToValueAtTime(0.001, st + 1.0);
          gain3.gain.linearRampToValueAtTime(0.001, st + 1.0);
          setTimeout(function() {
            try { osc1.stop(); osc2.stop(); osc3.stop(); lfo.stop(); } catch (e) {}
            try { osc1.disconnect(); osc2.disconnect(); osc3.disconnect(); } catch (e) {}
            try { gain1.disconnect(); gain2.disconnect(); gain3.disconnect(); } catch (e) {}
            try { lfoGain.disconnect(); lfo.disconnect(); } catch (e) {}
          }, 1100);
        }
      };
    }
  };

  /**
   * HEARTBEAT — Two sub-bass thumps
   */
  SOUNDS.heartbeat = {
    loop: false,
    create: function(opts) {
      var vol = (opts.volume || 0.5) * 0.25;
      var pitch = opts.pitch || 1;

      function thump(time, strength) {
        var g = makeGain(0);
        var o = makeOsc('sine', 55 * pitch, g);
        var p = g.gain;
        p.setValueAtTime(0.001, time);
        p.linearRampToValueAtTime(vol * strength, time + 0.02);
        p.exponentialRampToValueAtTime(0.001, time + 0.18);
        o.start(time);
        o.stop(time + 0.22);
        return o;
      }

      var t = now();
      var o1 = thump(t, 1.0);
      var o2 = thump(t + 0.15, 0.6);

      scheduleEnd([o1, o2], 0.4);
      return {};
    }
  };

  /**
   * CALL — User calling the creature (talk button)
   * Short melodic note, friendly and warm
   */
  SOUNDS.call = {
    loop: false,
    create: function(opts) {
      var vol = (opts.volume || 0.5) * 0.25;
      var pitch = opts.pitch || 1;
      var dur = (opts.duration || 200) / 1000;

      var gainNode = makeGain(0);
      var osc = makeOsc('sine', 330 * pitch, gainNode);

      // Pleasant rising tone
      osc.frequency.linearRampToValueAtTime(440 * pitch, now() + dur * 0.6);
      osc.frequency.linearRampToValueAtTime(390 * pitch, now() + dur);

      adsr(gainNode, vol, 0.02, dur * 0.25, 0.5, dur * 0.4, dur);

      osc.start(now());
      scheduleEnd([osc], dur + 0.05);
      return { gains: [gainNode] };
    }
  };

  /**
   * RESPOND — Creature responding to user's call
   * Mimics the call with slight variation
   */
  SOUNDS.respond = {
    loop: false,
    create: function(opts) {
      var vol = (opts.volume || 0.5) * 0.22;
      var pitch = opts.pitch || 1;
      var dur = (opts.duration || 250) / 1000;

      // Two-tone response
      var gain1 = makeGain(0);
      var osc1 = makeOsc('sine', 280 * pitch, gain1);
      osc1.frequency.linearRampToValueAtTime(380 * pitch, now() + dur * 0.5);
      osc1.frequency.linearRampToValueAtTime(350 * pitch, now() + dur);
      adsr(gain1, vol, 0.015, dur * 0.2, 0.55, dur * 0.35, dur);

      // Soft harmony
      var gain2 = makeGain(0);
      var osc2 = makeOsc('sine', 420 * pitch, gain2);
      osc2.frequency.linearRampToValueAtTime(520 * pitch, now() + dur * 0.4);
      osc2.frequency.linearRampToValueAtTime(470 * pitch, now() + dur);
      adsr(gain2, vol * 0.3, 0.02, dur * 0.15, 0.4, dur * 0.4, dur);

      osc1.start(now());
      osc2.start(now() + dur * 0.08);

      scheduleEnd([osc1, osc2], dur + 0.1);
      return { gains: [gain1, gain2] };
    }
  };

  /**
   * MENU_OPEN — Soft ascending chime
   */
  SOUNDS.menu_open = {
    loop: false,
    create: function(opts) {
      var vol = (opts.volume || 0.5) * 0.18;
      var dur = 0.2;

      var gainNode = makeGain(0);
      var osc = makeOsc('sine', 400, gainNode);
      osc.frequency.linearRampToValueAtTime(600, now() + dur);
      adsr(gainNode, vol, 0.01, dur * 0.3, 0.3, dur * 0.5, dur);

      osc.start(now());
      scheduleEnd([osc], dur + 0.05);
      return { gains: [gainNode] };
    }
  };

  /**
   * MENU_CLOSE — Soft descending chime
   */
  SOUNDS.menu_close = {
    loop: false,
    create: function(opts) {
      var vol = (opts.volume || 0.5) * 0.18;
      var dur = 0.18;

      var gainNode = makeGain(0);
      var osc = makeOsc('sine', 550, gainNode);
      osc.frequency.linearRampToValueAtTime(350, now() + dur);
      adsr(gainNode, vol, 0.01, dur * 0.2, 0.3, dur * 0.5, dur);

      osc.start(now());
      scheduleEnd([osc], dur + 0.05);
      return { gains: [gainNode] };
    }
  };

  /**
   * ITEM_SELECT — Tiny click/pop
   */
  SOUNDS.item_select = {
    loop: false,
    create: function(opts) {
      var vol = (opts.volume || 0.5) * 0.15;
      var dur = 0.06;

      var gainNode = makeGain(0);
      var osc = makeOsc('sine', 800, gainNode);
      osc.frequency.exponentialRampToValueAtTime(1200, now() + dur * 0.3);
      osc.frequency.exponentialRampToValueAtTime(600, now() + dur);

      var p = gainNode.gain;
      p.setValueAtTime(0.001, now());
      p.linearRampToValueAtTime(vol, now() + 0.005);
      p.exponentialRampToValueAtTime(0.001, now() + dur);

      osc.start(now());
      scheduleEnd([osc], dur + 0.02);
      return { gains: [gainNode] };
    }
  };

  // ──────────────────────────────────────────────
  // Emotional auto-sounds (integrated with game)
  // ──────────────────────────────────────────────

  var _emotionSoundTimer = 0;
  var EMOTION_SOUND_INTERVAL = 5; // seconds between creature sounds
  var _lastEmotionMood = 'neutral';

  function updateEmotionSounds(dt) {
    if (!_initialized || _muted) return;

    _emotionSoundTimer += dt;
    if (_emotionSoundTimer < EMOTION_SOUND_INTERVAL) return;
    _emotionSoundTimer = 0;

    // Vary interval (4-10s) — creature babbles often
    EMOTION_SOUND_INTERVAL = 4 + Math.random() * 6;

    var mood = 'neutral';
    if (window.EmotionSystem) {
      mood = window.EmotionSystem.getDominant();
    }
    _lastEmotionMood = mood;

    // Play mood-appropriate sound at low volume
    var opts = { volume: 0.3 };

    switch (mood) {
      case 'happiness':
      case 'happy':
        AudioSystem.play('chirp', opts);
        break;
      case 'sadness':
      case 'sad':
        AudioSystem.play('whimper', opts);
        break;
      case 'sleepy':
        AudioSystem.play('yawn', { volume: 0.25 });
        break;
      case 'fear':
      case 'scared':
        AudioSystem.play('squeak', { volume: 0.2, pitch: 0.8 });
        break;
      case 'anger':
      case 'excited':
        AudioSystem.play('growl', { volume: 0.2 });
        break;
      case 'love':
        // Start purring if not already
        if (!_loops.purr || !_loops.purr.active) {
          AudioSystem.startLoop('purr');
        }
        break;
      case 'playful':
        AudioSystem.play('chirp', { volume: 0.35, pitch: 1.2 });
        break;
      // neutral/idle: random cute sounds
      default:
        var roll = Math.random();
        if (roll < 0.25) {
          // Soft chirp with random pitch variation
          AudioSystem.play('chirp', { volume: 0.2, pitch: 0.85 + Math.random() * 0.3 });
        } else if (roll < 0.45) {
          // Tiny squeak
          AudioSystem.play('squeak', { volume: 0.18, pitch: 0.9 + Math.random() * 0.4 });
        } else if (roll < 0.55) {
          // Gentle heartbeat
          AudioSystem.play('heartbeat', { volume: 0.12 });
        } else if (roll < 0.65) {
          // Happy little hum note
          AudioSystem.play('chirp', { volume: 0.15, pitch: 0.7, duration: 250 });
        }
        // 35% chance of silence — not every interval needs a sound
        break;
    }

    // Stop purr if mood changed away from love
    if (mood !== 'love' && _loops.purr && _loops.purr.active) {
      AudioSystem.stopLoop('purr');
    }
  }

  // ──────────────────────────────────────────────
  // Input-triggered sounds
  // ──────────────────────────────────────────────

  var _inputBound = false;

  function bindInputSounds() {
    if (_inputBound || !window.InputSystem) return;
    _inputBound = true;

    InputSystem.on('tap', function(e) {
      if (window.GAME.state === 'egg') {
        AudioSystem.play('heartbeat', { volume: 0.4 });
        return;
      }
      if (window.GAME.state !== 'living') return;
      if (window.Creature && window.Creature.isPointInside(e.x, e.y)) {
        AudioSystem.play('squeak', { volume: 0.35 });
      }
    });

    InputSystem.on('double_tap', function(e) {
      if (window.GAME.state !== 'living') return;
      if (window.Creature && window.Creature.isPointInside(e.x, e.y)) {
        AudioSystem.play('chirp', { volume: 0.4, pitch: 1.1 });
      }
    });

    InputSystem.on('hold', function(e) {
      if (window.GAME.state === 'egg') {
        AudioSystem.play('heartbeat', { volume: 0.5 });
        return;
      }
      if (window.GAME.state !== 'living') return;
      if (window.Creature && window.Creature.isPointInside(e.x, e.y)) {
        // Start purring on hold
        if (!_loops.purr || !_loops.purr.active) {
          AudioSystem.startLoop('purr');
        }
      }
    });

    InputSystem.on('release', function() {
      // Stop purr on release (unless mood is love)
      var mood = window.EmotionSystem ? window.EmotionSystem.getDominant() : 'neutral';
      if (mood !== 'love' && _loops.purr && _loops.purr.active) {
        AudioSystem.stopLoop('purr');
      }
    });
  }

  // ══════════════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════════════

  var AudioSystem = {

    /**
     * Initialize AudioContext (MUST be called from user gesture)
     * Safe to call multiple times — only creates context once
     */
    init: function() {
      if (_initialized) return;

      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) {
          console.warn('[AudioSystem] Web Audio API not supported');
          return;
        }

        _ctx = new AC();

        // Resume if suspended (Chrome autoplay policy)
        if (_ctx.state === 'suspended') {
          _ctx.resume();
        }

        // Master gain
        _master = _ctx.createGain();
        _master.gain.setValueAtTime(_masterVol, _ctx.currentTime);
        _master.connect(_ctx.destination);

        // Soft compressor to prevent clipping
        var compressor = _ctx.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-24, _ctx.currentTime);
        compressor.knee.setValueAtTime(12, _ctx.currentTime);
        compressor.ratio.setValueAtTime(4, _ctx.currentTime);
        compressor.attack.setValueAtTime(0.003, _ctx.currentTime);
        compressor.release.setValueAtTime(0.15, _ctx.currentTime);

        // Re-route: master → compressor → destination
        _master.disconnect();
        _master.connect(compressor);
        compressor.connect(_ctx.destination);

        _initialized = true;

        // Bind input sounds
        bindInputSounds();

        console.log('[AudioSystem] Initialized — sampleRate:', _ctx.sampleRate);

      } catch (e) {
        console.warn('[AudioSystem] Init failed:', e.message);
      }
    },

    /**
     * Play a one-shot sound
     * @param {string} name — sound name (chirp, whimper, etc.)
     * @param {Object} [opts] — { volume: 0-1, pitch: multiplier, duration: ms }
     */
    play: function(name, opts) {
      if (!_initialized || _muted) return;
      if (!SOUNDS[name]) {
        console.warn('[AudioSystem] Unknown sound:', name);
        return;
      }
      if (SOUNDS[name].loop) {
        console.warn('[AudioSystem] Use startLoop() for looping sounds:', name);
        return;
      }

      // Cooldown check (skip for 'call' — user should mash freely)
      var t = Date.now();
      if (name !== 'call') {
        if (_lastPlayTime[name] && t - _lastPlayTime[name] < COOLDOWN_MS) return;
      }
      _lastPlayTime[name] = t;

      // Voice limit
      if (_activeVoices >= MAX_VOICES) return;

      // Resume context if needed (mobile)
      if (_ctx.state === 'suspended') {
        _ctx.resume();
      }

      var options = opts || {};
      options.volume = options.volume !== undefined ? options.volume : 0.5;
      options.pitch = options.pitch || 1;

      try {
        SOUNDS[name].create(options);

        // Trigger creature glow + haptic on creature sounds
        // NOTE: 'call' is the USER's sound — no glow, no haptic
        if (window.Creature && window.Creature.triggerSoundGlow) {
          var creatureSounds = { chirp:1, whimper:1, growl:1, yawn:1, squeak:1, respond:1 };
          if (creatureSounds[name]) {
            window.Creature.triggerSoundGlow(options.volume || 0.5);
            // Haptic feedback for creature sounds
            try {
              if (navigator.vibrate) {
                if (name === 'respond' || name === 'chirp') navigator.vibrate(20);
                else if (name === 'growl') navigator.vibrate([15, 30, 15]);
                else navigator.vibrate(12);
              }
            } catch(e) {}
          }
        }
      } catch (e) {
        console.warn('[AudioSystem] Play error:', name, e.message);
      }
    },

    /**
     * Start a looping sound (purr, hum)
     * @param {string} name
     * @param {Object} [opts]
     */
    startLoop: function(name, opts) {
      if (!_initialized || _muted) return;
      if (!SOUNDS[name] || !SOUNDS[name].loop) {
        console.warn('[AudioSystem] Not a loop sound:', name);
        return;
      }

      // Already active?
      if (_loops[name] && _loops[name].active) return;

      if (_ctx.state === 'suspended') {
        _ctx.resume();
      }

      var options = opts || {};
      options.volume = options.volume !== undefined ? options.volume : 0.5;
      options.pitch = options.pitch || 1;

      try {
        var instance = SOUNDS[name].create(options);
        instance.active = true;
        _loops[name] = instance;
        console.log('[AudioSystem] Loop started:', name);
      } catch (e) {
        console.warn('[AudioSystem] Loop error:', name, e.message);
      }
    },

    /**
     * Stop a looping sound
     * @param {string} name
     */
    stopLoop: function(name) {
      var loop = _loops[name];
      if (!loop || !loop.active) return;

      loop.active = false;
      if (loop.stop) {
        loop.stop();
      }
      console.log('[AudioSystem] Loop stopped:', name);
    },

    /**
     * Stop all sounds
     */
    stopAll: function() {
      // Stop all loops
      for (var name in _loops) {
        if (_loops[name] && _loops[name].active) {
          this.stopLoop(name);
        }
      }
      _activeVoices = 0;
    },

    /**
     * Set master volume (0-1)
     * @param {number} v
     */
    setMasterVolume: function(v) {
      _masterVol = clamp(v, 0, 1);
      if (_master) {
        _master.gain.linearRampToValueAtTime(_masterVol, now() + 0.1);
      }
    },

    /**
     * Get master volume
     * @returns {number}
     */
    getMasterVolume: function() {
      return _masterVol;
    },

    /**
     * Mute/unmute all audio
     * @param {boolean} muted
     */
    setMuted: function(muted) {
      _muted = muted;
      if (_master) {
        _master.gain.linearRampToValueAtTime(
          muted ? 0.001 : _masterVol,
          now() + 0.2
        );
      }
      if (muted) {
        this.stopAll();
      }
    },

    /**
     * Check if AudioContext is initialized
     * @returns {boolean}
     */
    isInitialized: function() {
      return _initialized;
    },

    /**
     * Update (called every frame from main.js)
     * Handles emotional auto-sounds
     * @param {number} dt
     */
    update: function(dt) {
      if (!_initialized) return;

      if (window.GAME && window.GAME.state === 'living') {
        updateEmotionSounds(dt);
      }
    },

    /**
     * Get active voice count (debug)
     * @returns {number}
     */
    getActiveVoices: function() {
      return _activeVoices;
    }
  };

  window.AudioSystem = AudioSystem;

})();
