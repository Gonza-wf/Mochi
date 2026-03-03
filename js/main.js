/**
 * ===================================================
 * MOCHI — Director Principal del Juego
 * ===================================================
 * Este módulo es el DIRECTOR que conecta todos los
 * sistemas. No contiene lógica de juego propia, solo
 * coordina la inicialización, el game loop, las
 * transiciones de estado y el flujo de datos entre
 * los 14 módulos del juego.
 *
 * Sistemas coordinados:
 *   InputSystem, Background, ParticleSystem, EggSystem,
 *   CreaturePhysics, CreatureAI, Creature, EmotionSystem,
 *   NeedsSystem, Personality, AudioSystem, Items, Menu,
 *   NotificationSystem, Storage
 *
 * Estados del juego:
 *   loading → egg → naming → living
 * ===================================================
 */
(function() {
  'use strict';

  // ─────────────────────────────────────────────
  // Objeto global del juego
  // ─────────────────────────────────────────────

  window.GAME = {
    /** Estado actual: 'loading' | 'egg' | 'naming' | 'living' */
    state: 'loading',

    /** Canvas y contexto 2D */
    canvas: null,
    ctx: null,

    /** Dimensiones lógicas del canvas (CSS px) */
    width: 0,
    height: 0,
    centerX: 0,
    centerY: 0,

    /** Timing del game loop */
    deltaTime: 0,
    lastTime: 0,

    /** Datos de la criatura (nombre, etc) */
    creature: null,

    /** Factor de escala para pantallas HD (máx 3x) */
    pixelRatio: Math.min(window.devicePixelRatio || 1, 3),

    /** FPS tracking */
    fps: 0,
    _fpsFrames: 0,
    _fpsLastCheck: 0
  };

  // ─────────────────────────────────────────────
  // Referencias DOM (cacheadas una vez)
  // ─────────────────────────────────────────────

  var UI = {
    header:         null,
    creatureName:   null,
    namingOverlay:  null,
    nameInput:      null,
    nameConfirmBtn: null,
    stateInfo:      null
  };

  // ─────────────────────────────────────────────
  // Flag para AudioContext (requiere gesto)
  // ─────────────────────────────────────────────

  var _audioInitDone = false;

  // ═════════════════════════════════════════════
  //  1. CANVAS SETUP
  // ═════════════════════════════════════════════

  function initCanvas() {
    var G = window.GAME;

    G.canvas = document.getElementById('gameCanvas');
    G.ctx = G.canvas.getContext('2d', {
      alpha: false,
      desynchronized: true
    });

    resizeCanvas();

    // Debounced resize
    var resizeTimeout;
    window.addEventListener('resize', function() {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(resizeCanvas, 100);
    });

    window.addEventListener('orientationchange', function() {
      setTimeout(resizeCanvas, 150);
    });

    console.log('[Mochi] Canvas:', G.width + 'x' + G.height, '@', G.pixelRatio + 'x');
  }

  function resizeCanvas() {
    var G = window.GAME;
    var dpr = G.pixelRatio;

    G.width   = window.innerWidth;
    G.height  = window.innerHeight;
    G.centerX = G.width / 2;
    G.centerY = G.height / 2;

    // Physical pixels
    G.canvas.width  = G.width * dpr;
    G.canvas.height = G.height * dpr;

    // CSS size
    G.canvas.style.width  = G.width + 'px';
    G.canvas.style.height = G.height + 'px';

    // Scale context so we draw in CSS coordinates
    G.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    G.ctx.imageSmoothingEnabled = true;
    G.ctx.imageSmoothingQuality = 'high';
  }

  // ═════════════════════════════════════════════
  //  2. UI SETUP
  // ═════════════════════════════════════════════

  function initUI() {
    UI.header         = document.getElementById('ui-header');
    UI.creatureName   = document.getElementById('creature-name');
    UI.namingOverlay  = document.getElementById('naming-overlay');
    UI.nameInput      = document.getElementById('name-input');
    UI.nameConfirmBtn = document.getElementById('name-confirm-btn');
    UI.stateInfo      = document.getElementById('state-info');

    // Name confirmation handlers
    UI.nameConfirmBtn.addEventListener('click', confirmName);
    UI.nameInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        confirmName();
      }
    });

    // ── Settings panel ──
    initSettings();
  }

  // ═════════════════════════════════════════════
  //  2b. SETTINGS
  // ═════════════════════════════════════════════

  var _settingsOpen = false;

  function initSettings() {
    var settingsOverlay = document.getElementById('settings-overlay');
    var closeBtn        = document.getElementById('settings-close-btn');
    var soundToggle     = document.getElementById('sound-toggle');
    var notifToggle     = document.getElementById('notif-toggle');
    var resetBtn        = document.getElementById('reset-btn');
    var confirmYes      = document.getElementById('confirm-yes');
    var confirmNo       = document.getElementById('confirm-no');
    var resetConfirm    = document.getElementById('reset-confirm');

    // Hamburger button → settings (not menu)
    var menuBtn = document.getElementById('menu-btn');
    if (menuBtn) {
      menuBtn.addEventListener('click', function() {
        if (window.GAME.state !== 'living') return;
        toggleSettings();
      });
    }

    // Close button
    if (closeBtn) {
      closeBtn.addEventListener('click', function() {
        toggleSettings();
      });
    }

    // Close on overlay background click
    if (settingsOverlay) {
      settingsOverlay.addEventListener('click', function(e) {
        if (e.target === settingsOverlay) {
          toggleSettings();
        }
      });
    }

    // Sound toggle
    if (soundToggle) {
      soundToggle.addEventListener('click', function() {
        var isMuted = soundToggle.textContent.trim() === 'OFF';
        if (isMuted) {
          soundToggle.textContent = 'ON';
          soundToggle.classList.remove('off');
          if (window.AudioSystem) window.AudioSystem.setMuted(false);
        } else {
          soundToggle.textContent = 'OFF';
          soundToggle.classList.add('off');
          if (window.AudioSystem) window.AudioSystem.setMuted(true);
        }
      });
    }

    // Notification toggle
    if (notifToggle) {
      notifToggle.addEventListener('click', function() {
        var isOff = notifToggle.textContent.trim() === 'OFF';
        if (isOff) {
          notifToggle.textContent = 'ON';
          notifToggle.classList.remove('off');
          if (window.NotificationSystem) {
            window.NotificationSystem.requestPermission();
          }
        } else {
          notifToggle.textContent = 'OFF';
          notifToggle.classList.add('off');
          if (window.NotificationSystem) {
            window.NotificationSystem.cancelAll();
          }
        }
      });
    }

    // Reset button → show confirmation
    if (resetBtn) {
      resetBtn.addEventListener('click', function() {
        if (resetConfirm) resetConfirm.classList.add('visible');
      });
    }

    // Confirm No → hide confirmation
    if (confirmNo) {
      confirmNo.addEventListener('click', function() {
        if (resetConfirm) resetConfirm.classList.remove('visible');
      });
    }

    // Confirm Yes → reset everything
    if (confirmYes) {
      confirmYes.addEventListener('click', function() {
        if (window.Storage) window.Storage.reset();
        window.location.reload();
      });
    }
  }

  function toggleSettings() {
    var overlay = document.getElementById('settings-overlay');
    var resetConfirm = document.getElementById('reset-confirm');
    _settingsOpen = !_settingsOpen;

    if (_settingsOpen) {
      if (overlay) overlay.classList.add('visible');
      // Close item menu if open
      if (window.Menu && window.Menu.isOpen) window.Menu.close();
    } else {
      if (overlay) overlay.classList.remove('visible');
      if (resetConfirm) resetConfirm.classList.remove('visible');
    }
  }

  // ═════════════════════════════════════════════
  //  3. AUDIO INIT (first user gesture)
  // ═════════════════════════════════════════════

  function initAudioOnFirstGesture() {
    if (_audioInitDone) return;
    _audioInitDone = true;

    // AudioContext (browser policy requires user gesture)
    if (window.AudioSystem) {
      window.AudioSystem.init();
    }

    // Notifications (also needs gesture for permission)
    if (window.NotificationSystem) {
      window.NotificationSystem.init();
      // Request permission after short delay (less intrusive)
      setTimeout(function() {
        window.NotificationSystem.requestPermission();
      }, 3000);
    }
  }

  // ═════════════════════════════════════════════
  //  4. STATE MACHINE
  // ═════════════════════════════════════════════

  /**
   * Transition to a new game state.
   * Handles initialization of systems for each state.
   */
  function changeState(newState) {
    var G = window.GAME;
    var oldState = G.state;
    G.state = newState;

    console.log('[Mochi] Estado:', oldState, '→', newState);

    switch (newState) {

      // ── Egg phase: first experience ──
      case 'egg':
        if (window.EggSystem) {
          window.EggSystem.init();
        }
        break;

      // ── Naming: creature visible, waiting for name ──
      case 'naming':
        UI.namingOverlay.classList.add('visible');
        setTimeout(function() {
          UI.nameInput.focus();
        }, 600);
        break;

      // ── Living: full game ──
      case 'living':
        initLivingSystems();
        break;
    }
  }

  /**
   * Initialize all living-state systems.
   * Called when entering 'living' for the first time
   * or when restoring from a save.
   */
  function initLivingSystems() {
    var G = window.GAME;

    // Creature (physics + AI + rendering)
    if (window.Creature) {
      window.Creature.init(G.centerX, G.centerY * 1.15);
      if (G.creature && G.creature.name) {
        window.Creature.name = G.creature.name;
      }
    }

    // Emotion system (color/mood)
    if (window.EmotionSystem) {
      window.EmotionSystem.init();
    }

    // Needs system (hunger, fun, energy, etc)
    if (window.NeedsSystem) {
      window.NeedsSystem.init();
    }

    // Personality (adaptive AI)
    if (window.Personality) {
      window.Personality.init();
    }

    // Menu + Items
    if (window.Menu) {
      window.Menu.init();
    }

    // Show header with creature name
    UI.header.classList.add('visible');
  }

  // ═════════════════════════════════════════════
  //  5. NAMING CONFIRMATION
  // ═════════════════════════════════════════════

  function confirmName() {
    var nameVal = UI.nameInput.value.trim();
    var finalName = nameVal.length > 0 ? nameVal : 'Mochi';

    // Store name globally
    window.GAME.creature = { name: finalName };

    // Update DOM header
    UI.creatureName.textContent = finalName;
    UI.namingOverlay.classList.remove('visible');

    // Transition to living
    changeState('living');

    // Save immediately (important milestone)
    if (window.Storage) {
      window.Storage.markDirty();
      window.Storage.save();
    }

    console.log('[Mochi] Criatura nombrada:', finalName);
  }

  // ═════════════════════════════════════════════
  //  6. UPDATE — Called every frame
  // ═════════════════════════════════════════════

  function update(dt) {
    var G = window.GAME;

    // ── Input (always active) ──
    if (window.InputSystem) {
      window.InputSystem.update(dt);
    }

    // ── State-specific updates ──
    switch (G.state) {

      case 'loading':
        // First frame: transition based on saved data
        // (handled in init(), this is fallback)
        changeState('egg');
        break;

      case 'egg':
        if (window.Background)      window.Background.update(dt);
        if (window.EggSystem)        window.EggSystem.update(dt);
        break;

      case 'naming':
        if (window.Background)      window.Background.update(dt);
        if (window.ParticleSystem)   window.ParticleSystem.update(dt);
        break;

      case 'living':
        updateLiving(dt);
        break;
    }
  }

  /**
   * Living state update — the core game loop.
   * Order matters: background → needs/emotions → creature → particles → menu → storage
   */
  function updateLiving(dt) {
    // Visual environment
    if (window.Background)    window.Background.update(dt);

    // Creature physics + AI + behavior
    if (window.Creature)      window.Creature.update(dt);

    // Emotion system (reads input, updates color/mood)
    if (window.EmotionSystem) window.EmotionSystem.update(dt);

    // Needs system (decays needs, pushes emotions)
    if (window.NeedsSystem)   window.NeedsSystem.update(dt);

    // Personality (very slow adaptation)
    if (window.Personality)   window.Personality.update(dt);

    // Particles (reads mood for emotional particles)
    if (window.ParticleSystem) window.ParticleSystem.update(dt);

    // Audio (emotional auto-sounds)
    if (window.AudioSystem)   window.AudioSystem.update(dt);

    // Menu + item interactions
    if (window.Menu)          window.Menu.update(dt);

    // Auto-save timer
    if (window.Storage)       window.Storage.update(dt);
  }

  // ═════════════════════════════════════════════
  //  7. RENDER — Called every frame after update
  // ═════════════════════════════════════════════

  function render(ctx) {
    var G = window.GAME;

    // ── Clear canvas ──
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, G.width, G.height);

    // ── State-specific rendering ──
    switch (G.state) {

      case 'egg':
        if (window.Background)    window.Background.render(ctx);
        if (window.ParticleSystem) window.ParticleSystem.render(ctx);
        if (window.EggSystem)     window.EggSystem.render(ctx);
        break;

      case 'naming':
        if (window.Background)    window.Background.render(ctx);
        if (window.ParticleSystem) window.ParticleSystem.render(ctx);
        break;

      case 'living':
        renderLiving(ctx);
        break;
    }

    // ── Debug overlay (always) ──
    renderDebug(ctx);
  }

  /**
   * Living state render.
   * Layer order: background → particles → creature → name label → menu → flying items
   */
  function renderLiving(ctx) {
    var G = window.GAME;

    // Layer 1: Dynamic background gradient
    if (window.Background)     window.Background.render(ctx);

    // Layer 2: Ambient + emotional particles
    if (window.ParticleSystem) window.ParticleSystem.render(ctx);

    // Layer 3: The creature (shadow → glow → body → hairs)
    if (window.Creature)       window.Creature.render(ctx);

    // Layer 4: Menu panel + dragged items + flying items
    if (window.Menu)           window.Menu.render(ctx);
  }

  // ═════════════════════════════════════════════
  //  8. DEBUG OVERLAY
  // ═════════════════════════════════════════════

  function renderDebug(ctx) {
    if (!UI.stateInfo) return;

    var G = window.GAME;
    var parts = [G.state, G.fps + ' fps'];

    // Egg progress
    if (G.state === 'egg' && window.EggSystem) {
      parts.push(Math.round(window.EggSystem.getProgress()) + '%');
    }

    // Living state info
    if (G.state === 'living') {

      // Dominant emotion + intensity
      if (window.EmotionSystem) {
        var emo = window.EmotionSystem.getDominant();
        var intensity = Math.round(window.EmotionSystem.getIntensity() * 100);
        parts.push(emo + ' ' + intensity + '%');
      }

      // Lowest need
      if (window.NeedsSystem) {
        var low = window.NeedsSystem.getLowest();
        if (low) {
          parts.push(low.name + ':' + Math.round(low.value));
        }
      }

      // Audio voices
      if (window.AudioSystem && window.AudioSystem.isInitialized()) {
        parts.push('♪' + window.AudioSystem.getActiveVoices());
      }

      // Menu state
      if (window.Menu && window.Menu.isOpen) {
        var menuInfo = '[MENU]';
        if (window.Menu.isDraggingItem && window.Menu.selectedItem) {
          menuInfo += ' drag:' + window.Menu.selectedItem.id;
        }
        parts.push(menuInfo);
      }

      // Save info
      if (window.Storage && window.Storage.isInitialized()) {
        var age = window.Storage.getDaysAlive();
        var saveSize = window.Storage.getSaveSize();
        if (age > 0) parts.push('d' + age);
        if (saveSize > 0) parts.push(Math.round(saveSize / 1024) + 'kb');
      }

      // Personality (most prominent trait deviation from 50)
      if (window.Personality) {
        var traits = window.Personality.getTraits();
        var maxDev = 0;
        var maxTrait = '';
        for (var key in traits) {
          var dev = Math.abs(traits[key] - 50);
          if (dev > maxDev) {
            maxDev = dev;
            maxTrait = key;
          }
        }
        if (maxDev > 5) {
          var label = window.Personality.getTraitLabel(maxTrait);
          parts.push(label);
        }
      }
    }

    // Touch info (any state)
    if (window.InputSystem && window.InputSystem.isDown()) {
      var pos = window.InputSystem.getPosition();
      var vel = window.InputSystem.getVelocity();
      parts.push('touch(' + Math.round(pos.x) + ',' + Math.round(pos.y) + ')');
      if (Math.abs(vel.x) > 1 || Math.abs(vel.y) > 1) {
        parts.push('v(' + Math.round(vel.x) + ',' + Math.round(vel.y) + ')');
      }
      var holdMs = window.InputSystem.getHoldDuration();
      if (holdMs > 200) parts.push(holdMs + 'ms');
      if (window.InputSystem.isInMenuZone) parts.push('[ZONE]');
    }

    UI.stateInfo.textContent = parts.join(' · ');
  }

  // ═════════════════════════════════════════════
  //  9. GAME LOOP
  // ═════════════════════════════════════════════

  function gameLoop(timestamp) {
    var G = window.GAME;

    // ── Delta time (capped at 33ms to prevent physics explosions) ──
    var rawDt = timestamp - G.lastTime;
    G.deltaTime = Math.min(rawDt, 33) / 1000;
    G.lastTime = timestamp;

    // ── FPS counter ──
    G._fpsFrames++;
    if (timestamp - G._fpsLastCheck >= 1000) {
      G.fps = G._fpsFrames;
      G._fpsFrames = 0;
      G._fpsLastCheck = timestamp;
    }

    // ── Frame ──
    update(G.deltaTime);
    render(G.ctx);

    // ── Next frame ──
    requestAnimationFrame(gameLoop);
  }

  // ═════════════════════════════════════════════
  //  10. INITIALIZATION — Entry point
  // ═════════════════════════════════════════════

  function init() {
    console.log('[Mochi] ══════════════════════════════════');
    console.log('[Mochi] Inicializando Mochi v1.0');
    console.log('[Mochi] ══════════════════════════════════');

    // ── Step 1: Canvas ──
    initCanvas();

    // ── Step 2: UI DOM references ──
    initUI();

    // ── Step 3: Input system ──
    if (window.InputSystem) {
      window.InputSystem.init(window.GAME.canvas);

      // Register audio init on first user gesture
      InputSystem.on('tap', initAudioOnFirstGesture);
      InputSystem.on('down', initAudioOnFirstGesture);
      InputSystem.on('hold', initAudioOnFirstGesture);
    }

    // ── Step 4: Background (always active) ──
    if (window.Background) {
      window.Background.init();
    }

    // ── Step 5: Particles (always active) ──
    if (window.ParticleSystem) {
      window.ParticleSystem.init();
    }

    // ── Step 6: Load saved game or start fresh ──
    var restoreInfo = null;
    if (window.Storage) {
      restoreInfo = window.Storage.init();
    }

    // ── Step 7: Determine starting state ──
    if (restoreInfo) {
      restoreFromSave(restoreInfo);
    } else {
      // No save → fresh start (loading → egg on first frame)
      console.log('[Mochi] No save found — starting fresh');
    }

    // ── Step 8: Start game loop ──
    window.GAME.lastTime = performance.now();
    window.GAME._fpsLastCheck = performance.now();
    requestAnimationFrame(gameLoop);

    console.log('[Mochi] ══════════════════════════════════');
    console.log('[Mochi] Game loop running!');
    console.log('[Mochi] ══════════════════════════════════');
  }

  /**
   * Restore game from saved data.
   * Routes to the correct state and deserializes all systems.
   */
  function restoreFromSave(restoreInfo) {
    var savedState = restoreInfo.state;
    var offlineMin = Math.round(restoreInfo.offlineTime / 60000);

    console.log('[Mochi] Save found — state:', savedState,
      '— offline:', offlineMin + 'min');

    if (savedState === 'living') {
      // ── Restore living state ──
      var G = window.GAME;
      var savedData = window.Storage.getData();

      // Restore name before changeState
      if (savedData && savedData.name) {
        G.creature = { name: savedData.name };
        UI.creatureName.textContent = savedData.name;
      }

      // Enter living state (initializes all systems)
      changeState('living');

      // Deserialize saved data into all systems
      if (window.Storage.restoreLivingSystems) {
        window.Storage.restoreLivingSystems();
      }

    } else if (savedState === 'egg') {
      // ── Restore egg state ──
      changeState('egg');
      // Note: EggSystem doesn't persist progress, starts fresh

    } else {
      // Unknown state — start fresh
      console.warn('[Mochi] Unknown saved state:', savedState, '— starting fresh');
    }
  }

  // ═════════════════════════════════════════════
  //  11. BOOT
  // ═════════════════════════════════════════════

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
