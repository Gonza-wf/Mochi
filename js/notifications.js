/**
 * ===================================================
 * NotificationSystem — Notificaciones sutiles
 * ===================================================
 * Notificaciones mínimas, no molestas. Solo emojis
 * de color y mensajes cortos. Máximo 3 por día.
 *
 * Tipos:
 *   hunger    — "🟡" cuando hambre < 20 (2h sin abrir)
 *   lonely    — "🟣" cuando affection < 15 (4h sin abrir)
 *   miss      — "💜 [nombre] te busca" (8h sin abrir)
 *   egg       — "🥚 Algo está pasando..." (1h después)
 *
 * Uso:
 *   NotificationSystem.init()
 *   NotificationSystem.schedule('hunger', 7200000)
 *   NotificationSystem.cancel('hunger')
 *   NotificationSystem.checkAndSchedule()
 * ===================================================
 */
(function() {
  'use strict';

  // ─── Constants ───
  var MAX_DAILY = 3;
  var STORAGE_KEY = 'mochi_notif_state';

  // ─── Notification definitions ───
  var NOTIF_DEFS = {
    hunger: {
      title: '🟡',
      body: '',
      tag: 'mochi-hunger',
      delay: 2 * 60 * 60 * 1000,     // 2 hours
      silent: true
    },
    lonely: {
      title: '🟣',
      body: '',
      tag: 'mochi-lonely',
      delay: 4 * 60 * 60 * 1000,     // 4 hours
      silent: true
    },
    miss: {
      title: '💜',
      body: '',  // Will be filled with creature name
      tag: 'mochi-miss',
      delay: 8 * 60 * 60 * 1000,     // 8 hours
      silent: false
    },
    egg: {
      title: '🥚',
      body: 'Algo está pasando...',
      tag: 'mochi-egg',
      delay: 1 * 60 * 60 * 1000,     // 1 hour
      silent: true
    }
  };

  // ─── State ───
  var _permitted = false;
  var _supported = false;
  var _swRegistration = null;
  var _scheduled = {};          // tag → timeout ID
  var _dailyCount = 0;
  var _dailyDate = '';          // 'YYYY-MM-DD' of last count reset
  var _initialized = false;

  // ─── Check/update daily count ───
  function getTodayKey() {
    var d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  function checkDailyReset() {
    var today = getTodayKey();
    if (_dailyDate !== today) {
      _dailyDate = today;
      _dailyCount = 0;
      saveState();
    }
  }

  function canSendToday() {
    checkDailyReset();
    return _dailyCount < MAX_DAILY;
  }

  // ─── Persist notification state ───
  function saveState() {
    try {
      var data = {
        dailyCount: _dailyCount,
        dailyDate: _dailyDate,
        scheduled: Object.keys(_scheduled)
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      // Silent fail
    }
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var data = JSON.parse(raw);
      _dailyCount = data.dailyCount || 0;
      _dailyDate = data.dailyDate || '';
      checkDailyReset();
    } catch (e) {
      // Silent fail
    }
  }

  // ─── Show notification via Service Worker ───
  function showNotification(def) {
    if (!canSendToday()) {
      console.log('[Notifications] Daily limit reached (' + MAX_DAILY + ')');
      return;
    }

    // Method 1: Via Service Worker (preferred — works when app closed)
    if (_swRegistration && _swRegistration.showNotification) {
      _swRegistration.showNotification(def.title, {
        body: def.body || '',
        tag: def.tag,
        renotify: false,
        silent: def.silent !== false,
        icon: 'data:image/svg+xml,' + encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
          '<rect width="64" height="64" rx="16" fill="#0a0a0f"/>' +
          '<circle cx="32" cy="34" r="16" fill="#e0aaff"/></svg>'
        ),
        badge: 'data:image/svg+xml,' + encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
          '<circle cx="12" cy="12" r="10" fill="#e0aaff"/></svg>'
        ),
        data: { url: './index.html' }
      }).then(function() {
        _dailyCount++;
        saveState();
        console.log('[Notifications] Shown:', def.tag, '(' + _dailyCount + '/' + MAX_DAILY + ' today)');
      }).catch(function(err) {
        console.warn('[Notifications] Show failed:', err.message);
      });
      return;
    }

    // Method 2: Notification API directly (only works when app open)
    if (window.Notification && _permitted) {
      try {
        var n = new Notification(def.title, {
          body: def.body || '',
          tag: def.tag,
          silent: def.silent !== false
        });
        n.onclick = function() {
          window.focus();
          n.close();
        };
        _dailyCount++;
        saveState();
      } catch (e) {
        console.warn('[Notifications] Direct notification failed:', e.message);
      }
    }
  }

  // ─── Schedule via SW message (survives app close) ───
  function scheduleViaSW(def) {
    if (_swRegistration && _swRegistration.active) {
      _swRegistration.active.postMessage({
        type: 'SCHEDULE_NOTIFICATION',
        title: def.title,
        body: def.body || '',
        tag: def.tag,
        delay: def.delay,
        silent: def.silent
      });
      console.log('[Notifications] Scheduled via SW:', def.tag,
        'in', Math.round(def.delay / 60000), 'min');
    }
  }

  // ─── Night hours check (don't notify 23:00-07:00) ───
  function isQuietHours() {
    var hour = new Date().getHours();
    return hour >= 23 || hour < 7;
  }

  /**
   * Predict if it will be quiet hours when the notification fires
   */
  function willBeQuietHours(delayMs) {
    var fireTime = new Date(Date.now() + delayMs);
    var hour = fireTime.getHours();
    return hour >= 23 || hour < 7;
  }

  // ══════════════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════════════

  window.NotificationSystem = {

    /**
     * Initialize the notification system.
     * Does NOT request permission — call requestPermission() separately
     * after a user gesture.
     */
    init: function() {
      _supported = ('Notification' in window);

      if (_supported) {
        _permitted = (Notification.permission === 'granted');
      }

      loadState();

      // Get SW registration if available
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then(function(reg) {
          _swRegistration = reg;
          console.log('[Notifications] SW registration acquired');
        }).catch(function() {
          // No SW, fallback to direct Notifications
        });
      }

      _initialized = true;
      console.log('[Notifications] Initialized — supported:', _supported,
        'permitted:', _permitted,
        'today:', _dailyCount + '/' + MAX_DAILY);
    },

    /**
     * Request notification permission from the user.
     * MUST be called from a user gesture (tap/click).
     * @returns {Promise<boolean>} true if granted
     */
    requestPermission: function() {
      if (!_supported) {
        console.log('[Notifications] Not supported in this browser');
        return Promise.resolve(false);
      }

      if (_permitted) {
        return Promise.resolve(true);
      }

      return Notification.requestPermission()
        .then(function(result) {
          _permitted = (result === 'granted');
          console.log('[Notifications] Permission:', result);
          return _permitted;
        })
        .catch(function(err) {
          console.warn('[Notifications] Permission request failed:', err.message);
          return false;
        });
    },

    /**
     * Schedule a notification.
     * @param {string} type — 'hunger', 'lonely', 'miss', 'egg'
     * @param {number} [delayOverride] — custom delay in ms (optional)
     */
    schedule: function(type, delayOverride) {
      if (!_supported || !_permitted) return;
      if (!NOTIF_DEFS[type]) {
        console.warn('[Notifications] Unknown type:', type);
        return;
      }

      // Cancel existing of same type
      this.cancel(type);

      var def = Object.assign({}, NOTIF_DEFS[type]);
      if (delayOverride !== undefined) {
        def.delay = delayOverride;
      }

      // Fill in creature name for 'miss' type
      if (type === 'miss') {
        var name = 'Mochi';
        if (window.GAME && window.GAME.creature && window.GAME.creature.name) {
          name = window.GAME.creature.name;
        }
        def.body = name + ' te busca';
      }

      // Don't schedule if it would fire during quiet hours
      if (willBeQuietHours(def.delay)) {
        // Push to 7:00 AM next day
        var now = new Date();
        var nextMorning = new Date(now);
        nextMorning.setDate(nextMorning.getDate() + (now.getHours() >= 7 ? 1 : 0));
        nextMorning.setHours(7, 0, 0, 0);
        def.delay = nextMorning.getTime() - now.getTime();
        console.log('[Notifications] Delayed to morning:', type);
      }

      // Schedule via SW (persists after app close)
      scheduleViaSW(def);

      // Also schedule locally as fallback (only works while app open)
      var tag = def.tag;
      var localDef = def;
      _scheduled[tag] = setTimeout(function() {
        showNotification(localDef);
        delete _scheduled[tag];
      }, def.delay);

      saveState();
    },

    /**
     * Cancel a scheduled notification.
     * @param {string} type — notification type
     */
    cancel: function(type) {
      var def = NOTIF_DEFS[type];
      if (!def) return;

      var tag = def.tag;

      // Cancel local timer
      if (_scheduled[tag]) {
        clearTimeout(_scheduled[tag]);
        delete _scheduled[tag];
      }

      // Cancel via SW
      if (_swRegistration && _swRegistration.active) {
        _swRegistration.active.postMessage({
          type: 'CANCEL_NOTIFICATIONS',
          tag: tag
        });
      }

      saveState();
    },

    /**
     * Cancel all scheduled notifications.
     */
    cancelAll: function() {
      for (var tag in _scheduled) {
        clearTimeout(_scheduled[tag]);
      }
      _scheduled = {};

      // Cancel all via SW
      if (_swRegistration && _swRegistration.active) {
        _swRegistration.active.postMessage({ type: 'CANCEL_NOTIFICATIONS', tag: 'mochi-hunger' });
        _swRegistration.active.postMessage({ type: 'CANCEL_NOTIFICATIONS', tag: 'mochi-lonely' });
        _swRegistration.active.postMessage({ type: 'CANCEL_NOTIFICATIONS', tag: 'mochi-miss' });
        _swRegistration.active.postMessage({ type: 'CANCEL_NOTIFICATIONS', tag: 'mochi-egg' });
      }

      saveState();
    },

    /**
     * Check current game state and schedule appropriate notifications.
     * Called when the app goes to background (visibilitychange).
     */
    checkAndSchedule: function() {
      if (!_supported || !_permitted || !_initialized) return;

      var G = window.GAME;
      if (!G) return;

      // Cancel all existing first
      this.cancelAll();

      // ── Egg state ──
      if (G.state === 'egg') {
        this.schedule('egg');
        return;
      }

      // ── Living state ──
      if (G.state === 'living') {
        // Check hunger
        if (window.NeedsSystem) {
          var hunger = window.NeedsSystem.get('hunger');
          if (hunger < 40) {
            // Hungry → notify sooner
            var hungerDelay = hunger < 20
              ? 30 * 60 * 1000       // 30 minutes if very hungry
              : 2 * 60 * 60 * 1000;  // 2 hours otherwise
            this.schedule('hunger', hungerDelay);
          } else {
            // Will become hungry eventually
            this.schedule('hunger');
          }

          var affection = window.NeedsSystem.get('affection');
          if (affection < 30) {
            this.schedule('lonely', 2 * 60 * 60 * 1000);
          } else {
            this.schedule('lonely');
          }
        }

        // Always schedule the "miss" notification
        this.schedule('miss');
      }
    },

    /**
     * Check if notifications are supported
     * @returns {boolean}
     */
    isSupported: function() {
      return _supported;
    },

    /**
     * Check if permission has been granted
     * @returns {boolean}
     */
    isPermitted: function() {
      return _permitted;
    },

    /**
     * Get today's notification count
     * @returns {number}
     */
    getDailyCount: function() {
      checkDailyReset();
      return _dailyCount;
    },

    /**
     * Check if system is initialized
     * @returns {boolean}
     */
    isInitialized: function() {
      return _initialized;
    }
  };

})();
