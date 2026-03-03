/**
 * ===================================================
 * Items — Catálogo + preferencias + juguetes flotantes
 * ===================================================
 * Los juguetes permanecen en el mapa flotando cerca
 * de la criatura después de usarlos (máx 3).
 * ===================================================
 */
(function() {
  'use strict';

  // ─── Item catalog ───
  var CATALOG = {
    food: [
      { id: 'apple',  emoji: '🍎', name: 'Manzana',  needs: { hunger: 20 }, emotions: { happiness: 5 } },
      { id: 'cheese', emoji: '🧀', name: 'Queso',    needs: { hunger: 15 }, emotions: { happiness: 3 } },
      { id: 'meat',   emoji: '🍖', name: 'Carne',    needs: { hunger: 30 }, emotions: { happiness: 8 } },
      { id: 'donut',  emoji: '🍩', name: 'Dona',     needs: { hunger: 10 }, emotions: { happiness: 15, health: -3 } },
      { id: 'berry',  emoji: '🫐', name: 'Bayas',    needs: { hunger: 12 }, emotions: { happiness: 5, health: 2 } },
      { id: 'tea',    emoji: '🍵', name: 'Té',       needs: { hunger: 5 },  emotions: { sleepy: 10, love: 5 } }
    ],
    toys: [
      { id: 'ball',    emoji: '⚽', name: 'Pelota',   needs: { fun: 20 }, emotions: { playful: 15 } },
      { id: 'box',     emoji: '📦', name: 'Caja',     needs: { fun: 15 }, emotions: { curiosity: 20 } },
      { id: 'feather', emoji: '🪶', name: 'Pluma',    needs: { fun: 25 }, emotions: { playful: 20 } },
      { id: 'light',   emoji: '💡', name: 'Luz',      needs: { fun: 10 }, emotions: { curiosity: 15 } },
      { id: 'music',   emoji: '🎵', name: 'Música',   needs: { fun: 15 }, emotions: { happiness: 10 } },
      { id: 'teddy',   emoji: '🧸', name: 'Peluche',  needs: { fun: 10, affection: 10 }, emotions: { love: 15 } }
    ],
    care: [
      { id: 'bath',     emoji: '🛁', name: 'Baño',     needs: { health: 10 },  emotions: { happiness: -5 } },
      { id: 'medicine', emoji: '💊', name: 'Medicina', needs: { health: 30 },  emotions: { happiness: -10 } },
      { id: 'sleep',    emoji: '🌙', name: 'Dormir',   needs: { energy: 40 },  emotions: { sleepy: 15 },    condition: 'sleepy' },
      { id: 'fire',     emoji: '🔥', name: 'Calidez',  needs: { affection: 10 }, emotions: { love: 10 } },
      { id: 'cold',     emoji: '❄️', name: 'Frío',     needs: { energy: 5 },   emotions: { sleepy: -15 } },
      { id: 'plant',    emoji: '🌿', name: 'Hierba',   needs: { health: 5 },   emotions: { happiness: 3 } }
    ]
  };

  var ITEM_MAP = {};
  var ALL_CATEGORIES = ['food', 'toys', 'care'];

  function buildMap() {
    for (var c = 0; c < ALL_CATEGORIES.length; c++) {
      var cat = ALL_CATEGORIES[c];
      var items = CATALOG[cat];
      for (var i = 0; i < items.length; i++) {
        items[i].category = cat;
        ITEM_MAP[items[i].id] = items[i];
      }
    }
  }

  // ─── Preferences ───
  var preferences = {};
  var PREF_SHIFT = 0.1;

  function clamp(v, min, max) {
    return v < min ? min : (v > max ? max : v);
  }

  function adjustPreference(itemId) {
    if (!window.EmotionSystem) return;
    var dom = window.EmotionSystem.getDominant();
    var happyVal = window.EmotionSystem.get('happiness');
    if (happyVal > 55 || dom === 'happiness' || dom === 'love' || dom === 'playful') {
      preferences[itemId] = clamp((preferences[itemId] || 0) + PREF_SHIFT, -1, 1);
    } else if (dom === 'anger' || dom === 'sick' || dom === 'sadness') {
      preferences[itemId] = clamp((preferences[itemId] || 0) - PREF_SHIFT, -1, 1);
    }
  }

  // ─── Flying items (menu → creature arc) ───
  var flyingItems = [];
  var MAX_FLYING = 5;

  function createFlyingItem(itemId, fromX, fromY, toX, toY) {
    var item = ITEM_MAP[itemId];
    if (!item) return;
    var fi = null;
    for (var i = 0; i < flyingItems.length; i++) {
      if (!flyingItems[i].active) { fi = flyingItems[i]; break; }
    }
    if (!fi) {
      if (flyingItems.length >= MAX_FLYING) return;
      fi = {};
      flyingItems.push(fi);
    }
    fi.active = true;
    fi.emoji = item.emoji;
    fi.itemId = itemId;
    fi.x = fromX; fi.y = fromY;
    fi.startX = fromX; fi.startY = fromY;
    fi.endX = toX; fi.endY = toY;
    fi.t = 0;
    fi.duration = 0.4;
    fi.scale = 1;
    fi.alpha = 1;
    fi.applied = false;
  }

  function updateFlyingItems(dt) {
    for (var i = 0; i < flyingItems.length; i++) {
      var fi = flyingItems[i];
      if (!fi.active) continue;
      fi.t += dt / fi.duration;
      if (fi.t >= 1) {
        fi.t = 1;
        if (!fi.applied) {
          fi.applied = true;
          applyItemEffect(fi.itemId);
        }
        fi.alpha -= dt * 4;
        fi.scale = Math.max(0.1, fi.scale - dt * 3);
        if (fi.alpha <= 0) fi.active = false;
        continue;
      }
      var t = fi.t;
      var ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      fi.x = fi.startX + (fi.endX - fi.startX) * ease;
      fi.y = fi.startY + (fi.endY - fi.startY) * ease - Math.sin(t * Math.PI) * 80;
      fi.scale = 1 + Math.sin(t * Math.PI) * 0.3;
    }
  }

  function renderFlyingItems(ctx) {
    var fontSize = Math.round(window.GAME.width * 0.09);
    for (var i = 0; i < flyingItems.length; i++) {
      var fi = flyingItems[i];
      if (!fi.active || fi.alpha < 0.01) continue;
      ctx.save();
      ctx.globalAlpha = clamp(fi.alpha, 0, 1);
      ctx.translate(fi.x, fi.y);
      ctx.scale(fi.scale, fi.scale);
      ctx.font = fontSize + 'px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(fi.emoji, 0, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // ═══════════════════════════════════════════
  // WORLD TOYS — Delegated to ToySystem
  // ═══════════════════════════════════════════

  function spawnWorldToy(itemId) {
    if (!window.ToySystem) return;
    var G = window.GAME;
    var cx = window.Creature ? window.Creature.x : G.centerX;
    var cy = window.Creature ? window.Creature.y : G.centerY;
    // Spawn near creature but offset
    var angle = Math.random() * Math.PI * 2;
    var dist = 80 + Math.random() * 60;
    var tx = clamp(cx + Math.cos(angle) * dist, 50, G.width - 50);
    var ty = clamp(cy + Math.sin(angle) * dist, 80, G.height - 100);
    window.ToySystem.spawnToy(itemId, tx, ty);
  }

  // ─── Apply item effect ───
  function applyItemEffect(itemId) {
    var item = ITEM_MAP[itemId];
    if (!item) return;

    if (item.condition === 'sleepy') {
      if (window.EmotionSystem && window.EmotionSystem.get('sleepy') < 40) {
        if (window.EmotionSystem) window.EmotionSystem.modify('anger', 3);
        if (window.AudioSystem) window.AudioSystem.play('growl', { volume: 0.25 });
        return;
      }
    }

    if (window.NeedsSystem && item.needs) {
      for (var needKey in item.needs) {
        var amount = item.needs[needKey];
        if (amount >= 0) window.NeedsSystem.satisfy(needKey, amount);
        else window.NeedsSystem.damage(needKey, -amount);
      }
    }

    if (window.EmotionSystem && item.emotions) {
      for (var emoKey in item.emotions) {
        window.EmotionSystem.modify(emoKey, item.emotions[emoKey]);
      }
    }

    if (window.ParticleSystem && window.Creature) {
      var burstColor = { h: 45, s: 80, l: 70 };
      if (item.category === 'care') burstColor = { h: 170, s: 60, l: 65 };
      else if (item.category === 'toys') burstColor = { h: 130, s: 70, l: 65 };
      window.ParticleSystem.burst(window.Creature.x, window.Creature.y, burstColor, 8);
    }

    if (window.AudioSystem) {
      var pref = preferences[itemId] || 0;
      if (item.emotions && item.emotions.happiness && item.emotions.happiness > 0) {
        window.AudioSystem.play('chirp', { volume: 0.35, pitch: 1 + pref * 0.2 });
      } else if (item.emotions && item.emotions.happiness && item.emotions.happiness < 0) {
        window.AudioSystem.play('whimper', { volume: 0.25 });
      } else {
        window.AudioSystem.play('squeak', { volume: 0.3 });
      }
    }

    if (window.Creature) window.Creature.applyForce(0, -60);

    // Spawn floating toy on map
    if (item.category === 'toys') {
      spawnWorldToy(itemId);
    }

    // Personality recording
    if (window.Personality) {
      var eventType = 'feed';
      if (item.category === 'toys') eventType = 'toy';
      else if (item.category === 'care') {
        if (item.id === 'medicine') eventType = 'medicine';
        else if (item.id === 'sleep') eventType = 'sleep';
        else eventType = 'comfort';
      }
      if (item.category === 'food') {
        eventType = (item.emotions && item.emotions.health && item.emotions.health < 0) ? 'feed_bad' : 'feed_good';
      }
      window.Personality.recordEvent(eventType, { itemId: itemId });
    }

    var id = itemId;
    setTimeout(function() { adjustPreference(id); }, 500);
  }

  // ═══ PUBLIC API ═══
  window.Items = {

    init: function() {
      buildMap();
      for (var id in ITEM_MAP) {
        if (preferences[id] === undefined) preferences[id] = 0;
      }
      console.log('[Items] Initialized —', Object.keys(ITEM_MAP).length, 'items');
    },

    getCategory: function(category) { return CATALOG[category] || []; },
    getCategories: function() { return ALL_CATEGORIES.slice(); },
    getItem: function(itemId) { return ITEM_MAP[itemId] || null; },

    apply: function(itemId, fromX, fromY) {
      if (!ITEM_MAP[itemId]) return;
      if (fromX !== undefined && fromY !== undefined && window.Creature) {
        createFlyingItem(itemId, fromX, fromY, window.Creature.x, window.Creature.y);
      } else {
        applyItemEffect(itemId);
      }
    },

    getPreference: function(itemId) { return preferences[itemId] || 0; },

    getReaction: function(itemId) {
      var pref = preferences[itemId] || 0;
      if (pref > 0.5) return 'approach';
      if (pref < -0.5) return 'avoid';
      return 'neutral';
    },

    update: function(dt) {
      updateFlyingItems(dt);
    },

    render: function(ctx) {
      renderFlyingItems(ctx);
    },

    /** Get world toys count for debug */
    getWorldToyCount: function() {
      return window.ToySystem ? window.ToySystem.getCount() : 0;
    },

    serialize: function() {
      var data = {};
      for (var id in preferences) {
        if (Math.abs(preferences[id]) > 0.01) {
          data[id] = Math.round(preferences[id] * 100) / 100;
        }
      }
      var toysData = window.ToySystem ? window.ToySystem.serialize() : {};
      return { preferences: data, toySystem: toysData };
    },

    deserialize: function(data) {
      if (data && data.preferences) {
        for (var id in data.preferences) {
          preferences[id] = clamp(data.preferences[id], -1, 1);
        }
      }
      if (data && data.toySystem && window.ToySystem) {
        window.ToySystem.deserialize(data.toySystem);
      }
      // Legacy world toys format (ignore, ToySystem handles it)
      console.log('[Items] Preferences restored');
    }
  };
})();
