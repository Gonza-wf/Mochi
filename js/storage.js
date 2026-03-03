/**
 * ===================================================
 * Storage — Persistencia y gestión de tiempo offline
 * ===================================================
 * Guarda/carga el estado completo del juego en
 * localStorage. Auto-guarda cada 30s y en lifecycle
 * events (visibilitychange, beforeunload, pagehide).
 *
 * Calcula tiempo offline al restaurar y lo propaga
 * a NeedsSystem y Personality.
 *
 * Uso:
 *   Storage.init()       // cargar o crear nuevo
 *   Storage.save()       // guardar todo
 *   Storage.load()       // restaurar estado
 *   Storage.exists()     // ¿hay datos guardados?
 *   Storage.reset()      // borrar todo
 *   Storage.getAge()     // días desde creación
 * ===================================================
 */
(function() {
  'use strict';

  // ─── Constants ───
  var SAVE_KEY = 'mochi_save';
  var SAVE_VERSION = 1;
  var AUTO_SAVE_INTERVAL = 30; // seconds

  // ─── State ───
  var _data = null;
  var _autoSaveTimer = 0;
  var _initialized = false;
  var _dirty = false; // track if anything changed since last save

  // ─── Stats tracking ───
  var _sessionStartTime = 0;
  var _totalPlayTimeThisSession = 0;

  // ──────────────────────────────────────────────
  // Default data structure
  // ──────────────────────────────────────────────

  function createDefaultData() {
    var now = Date.now();
    return {
      version: SAVE_VERSION,
      createdAt: now,
      lastSaved: now,
      lastOpened: now,
      name: '',
      state: 'egg',
      eggProgress: 0,
      creature: null,
      emotions: null,
      needs: null,
      personality: null,
      items: null,
      stats: {
        totalPlayTime: 0,
        totalPets: 0,
        totalFeedings: 0,
        daysAlive: 0,
        timesOpened: 1
      }
    };
  }

  // ──────────────────────────────────────────────
  // localStorage helpers (with error handling)
  // ──────────────────────────────────────────────

  function readFromStorage() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return parsed;
    } catch (e) {
      console.warn('[Storage] Error reading localStorage:', e.message);
      return null;
    }
  }

  function writeToStorage(data) {
    try {
      var json = JSON.stringify(data);
      localStorage.setItem(SAVE_KEY, json);
      return true;
    } catch (e) {
      console.warn('[Storage] Error writing localStorage:', e.message);
      // Quota exceeded? Try clearing old data
      if (e.name === 'QuotaExceededError') {
        try {
          // Try saving without memory (largest field)
          var slim = Object.assign({}, data);
          if (slim.personality && slim.personality.memory) {
            slim.personality.memory = slim.personality.memory.slice(-20);
          }
          localStorage.setItem(SAVE_KEY, JSON.stringify(slim));
          console.log('[Storage] Saved slim version (trimmed memory)');
          return true;
        } catch (e2) {
          console.error('[Storage] Cannot save even slim version');
          return false;
        }
      }
      return false;
    }
  }

  // ──────────────────────────────────────────────
  // Data validation
  // ──────────────────────────────────────────────

  function validateData(data) {
    if (!data || typeof data !== 'object') return false;
    if (data.version !== SAVE_VERSION) {
      console.log('[Storage] Version mismatch:', data.version, '→', SAVE_VERSION);
      return migrateData(data);
    }
    if (!data.createdAt || !data.lastSaved) return false;
    if (!data.stats || typeof data.stats !== 'object') return false;
    return true;
  }

  /**
   * Migrate data from older versions.
   * Returns true if migration succeeded, false if data is unusable.
   */
  function migrateData(data) {
    // Currently only version 1 exists
    // Future migrations would go here:
    // if (data.version === 1) { ... migrate to 2 ... }

    if (!data.version) {
      // Very old or corrupt data — can't migrate
      console.warn('[Storage] Cannot migrate data without version');
      return false;
    }

    // Unknown future version — try to use it anyway
    data.version = SAVE_VERSION;
    console.log('[Storage] Data migrated to version', SAVE_VERSION);
    return true;
  }

  // ──────────────────────────────────────────────
  // Collect state from all systems
  // ──────────────────────────────────────────────

  function collectState() {
    var G = window.GAME;
    var now = Date.now();

    // Update play time
    if (_sessionStartTime > 0) {
      _totalPlayTimeThisSession = now - _sessionStartTime;
    }

    _data.lastSaved = now;
    _data.lastOpened = _data.lastOpened || now;
    _data.state = G.state === 'naming' ? 'egg' : G.state; // don't save "naming" mid-state

    // Creature name
    if (G.creature && G.creature.name) {
      _data.name = G.creature.name;
    }

    // Egg progress
    if (G.state === 'egg' && window.EggSystem) {
      _data.eggProgress = window.EggSystem.getProgress();
    }

    // Living state — serialize all systems
    if (G.state === 'living') {
      if (window.Creature && window.Creature.serialize) {
        _data.creature = window.Creature.serialize();
      }
      if (window.EmotionSystem && window.EmotionSystem.serialize) {
        _data.emotions = window.EmotionSystem.serialize();
      }
      if (window.NeedsSystem && window.NeedsSystem.serialize) {
        _data.needs = window.NeedsSystem.serialize();
      }
      if (window.Personality && window.Personality.serialize) {
        _data.personality = window.Personality.serialize();
      }
      if (window.Items && window.Items.serialize) {
        _data.items = window.Items.serialize();
      }
    }

    // Update stats
    _data.stats.totalPlayTime += _totalPlayTimeThisSession;
    _totalPlayTimeThisSession = 0;
    _sessionStartTime = now;

    if (_data.createdAt) {
      _data.stats.daysAlive = Math.floor((now - _data.createdAt) / (24 * 3600 * 1000));
    }
  }

  // ──────────────────────────────────────────────
  // Restore state to all systems
  // ──────────────────────────────────────────────

  function restoreState() {
    var G = window.GAME;

    if (!_data) return false;

    var now = Date.now();
    var offlineTime = now - (_data.lastSaved || now);

    console.log('[Storage] Restoring state:', _data.state,
      '— offline:', Math.round(offlineTime / 1000) + 's',
      '(' + Math.round(offlineTime / 60000) + 'min)');

    // Restore creature name
    if (_data.name) {
      G.creature = G.creature || {};
      G.creature.name = _data.name;

      var nameEl = document.getElementById('creature-name');
      if (nameEl) nameEl.textContent = _data.name;
    }

    // Update stats
    _data.stats.timesOpened = (_data.stats.timesOpened || 0) + 1;
    _data.lastOpened = now;

    return {
      state: _data.state || 'egg',
      offlineTime: offlineTime,
      eggProgress: _data.eggProgress || 0
    };
  }

  /**
   * Called after changeState('living') has initialized all systems.
   * Deserializes saved data into them.
   */
  function restoreLivingSystems() {
    if (!_data) return;

    // Restore creature
    if (_data.creature && window.Creature && window.Creature.deserialize) {
      window.Creature.deserialize(_data.creature);
    }

    // Restore emotions
    if (_data.emotions && window.EmotionSystem && window.EmotionSystem.deserialize) {
      window.EmotionSystem.deserialize(_data.emotions);
    }

    // Restore needs (this also processes offline time internally)
    if (_data.needs && window.NeedsSystem && window.NeedsSystem.deserialize) {
      window.NeedsSystem.deserialize(_data.needs);
    }

    // Restore personality (this also processes session gap)
    if (_data.personality && window.Personality && window.Personality.deserialize) {
      window.Personality.deserialize(_data.personality);
    }

    // Restore item preferences
    if (_data.items && window.Items && window.Items.deserialize) {
      window.Items.deserialize(_data.items);
    }

    // Show header
    var header = document.getElementById('ui-header');
    if (header) header.classList.add('visible');

    console.log('[Storage] Living systems restored');
  }

  // ──────────────────────────────────────────────
  // Lifecycle event handlers
  // ──────────────────────────────────────────────

  function onVisibilityChange() {
    if (document.visibilityState === 'hidden') {
      // App going to background — save immediately
      if (_initialized) {
        window.Storage.save();
        console.log('[Storage] Saved on visibility hidden');
      }
    }
  }

  function onBeforeUnload() {
    if (_initialized) {
      window.Storage.save();
    }
  }

  function onPageHide() {
    // iOS Safari uses pagehide instead of beforeunload
    if (_initialized) {
      window.Storage.save();
    }
  }

  function bindLifecycleEvents() {
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('pagehide', onPageHide);
  }

  // ──────────────────────────────────────────────
  // Stats tracking helpers
  // ──────────────────────────────────────────────

  function bindStatTracking() {
    if (!window.InputSystem) return;

    // Count pets
    InputSystem.on('hold', function(e) {
      if (window.GAME.state === 'living' && _data && _data.stats) {
        if (window.Creature && window.Creature.isPointInside(e.x, e.y)) {
          _data.stats.totalPets = (_data.stats.totalPets || 0) + 1;
          _dirty = true;
        }
      }
    });

    InputSystem.on('drag', function(e) {
      if (window.GAME.state === 'living' && _data && _data.stats) {
        if (window.Creature && window.Creature.isPointInside(e.x, e.y)) {
          _data.stats.totalPets = (_data.stats.totalPets || 0) + 1;
          _dirty = true;
        }
      }
    });
  }

  // ══════════════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════════════

  window.Storage = {

    /**
     * Initialize storage system.
     * Loads existing save or creates default data.
     * @returns {Object|null} restore info: {state, offlineTime, eggProgress}
     */
    init: function() {
      _sessionStartTime = Date.now();
      _totalPlayTimeThisSession = 0;
      _autoSaveTimer = 0;

      // Try to load existing save
      var saved = readFromStorage();

      if (saved && validateData(saved)) {
        _data = saved;
        _initialized = true;

        bindLifecycleEvents();
        bindStatTracking();

        var info = restoreState();
        console.log('[Storage] Loaded save — state:', info.state,
          '— age:', this.getAge(), 'days',
          '— opens:', _data.stats.timesOpened);
        return info;
      }

      // No valid save — create fresh
      _data = createDefaultData();
      _initialized = true;

      bindLifecycleEvents();
      bindStatTracking();

      console.log('[Storage] No save found — fresh start');
      return null;
    },

    /**
     * Save current game state to localStorage.
     * Called automatically every 30s and on lifecycle events.
     */
    save: function() {
      if (!_initialized || !_data) return;

      collectState();
      var success = writeToStorage(_data);

      if (success) {
        _dirty = false;
      }

      return success;
    },

    /**
     * Load and restore game state.
     * Usually called once at startup via init().
     * @returns {Object|null}
     */
    load: function() {
      var saved = readFromStorage();
      if (!saved || !validateData(saved)) return null;

      _data = saved;
      return restoreState();
    },

    /**
     * Restore living-state systems after they've been initialized.
     * Must be called AFTER changeState('living') has set up all systems.
     */
    restoreLivingSystems: function() {
      restoreLivingSystems();
    },

    /**
     * Check if a save file exists
     * @returns {boolean}
     */
    exists: function() {
      try {
        return localStorage.getItem(SAVE_KEY) !== null;
      } catch (e) {
        return false;
      }
    },

    /**
     * Delete all saved data and start fresh.
     * WARNING: This is irreversible!
     */
    reset: function() {
      try {
        localStorage.removeItem(SAVE_KEY);
      } catch (e) {
        console.warn('[Storage] Error clearing save:', e.message);
      }

      _data = createDefaultData();
      _dirty = false;

      console.log('[Storage] Save data RESET — fresh start');
    },

    /**
     * Get milliseconds since last app open
     * @returns {number}
     */
    getTimeSinceLastOpen: function() {
      if (!_data || !_data.lastOpened) return 0;
      return Date.now() - _data.lastOpened;
    },

    /**
     * Get creature age in days (fractional)
     * @returns {number}
     */
    getAge: function() {
      if (!_data || !_data.createdAt) return 0;
      return (Date.now() - _data.createdAt) / (24 * 3600 * 1000);
    },

    /**
     * Get days alive as integer
     * @returns {number}
     */
    getDaysAlive: function() {
      return Math.floor(this.getAge());
    },

    /**
     * Get the full data object (read-only snapshot)
     * @returns {Object}
     */
    getData: function() {
      return _data ? Object.assign({}, _data) : null;
    },

    /**
     * Get stats object
     * @returns {Object}
     */
    getStats: function() {
      if (!_data || !_data.stats) return {};
      return Object.assign({}, _data.stats);
    },

    /**
     * Record a feeding event in stats
     */
    recordFeeding: function() {
      if (_data && _data.stats) {
        _data.stats.totalFeedings = (_data.stats.totalFeedings || 0) + 1;
        _dirty = true;
      }
    },

    /**
     * Mark state as dirty (triggers save on next auto-save)
     */
    markDirty: function() {
      _dirty = true;
    },

    /**
     * Update — called every frame from main.js.
     * Handles auto-save timer.
     * @param {number} dt — delta time in seconds
     */
    update: function(dt) {
      if (!_initialized) return;

      _autoSaveTimer += dt;

      if (_autoSaveTimer >= AUTO_SAVE_INTERVAL) {
        _autoSaveTimer = 0;
        this.save();
        console.log('[Storage] Auto-saved');
      }
    },

    /**
     * Check if storage is initialized
     * @returns {boolean}
     */
    isInitialized: function() {
      return _initialized;
    },

    /**
     * Get save file size in bytes (approximate)
     * @returns {number}
     */
    getSaveSize: function() {
      try {
        var raw = localStorage.getItem(SAVE_KEY);
        return raw ? raw.length * 2 : 0; // UTF-16
      } catch (e) {
        return 0;
      }
    }
  };

})();
