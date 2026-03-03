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
  // WORLD TOYS — Stationary floating toys
  // ═══════════════════════════════════════════
  // Toys stay fixed in space. The creature moves toward
  // them and interacts based on mood. Full size, visible.

  var worldToys = [];
  var MAX_WORLD_TOYS = 3;
  var TOY_LIFETIME = 60; // seconds (1 minute)

  // ─── Creature-toy interaction state ───
  var _interactTimer = 0;
  var INTERACT_INTERVAL = 2.5; // check every 2.5 seconds
  var _toyBounceTimers = {}; // toy index → bounce phase

  function spawnWorldToy(itemId) {
    var item = ITEM_MAP[itemId];
    if (!item || item.category !== 'toys') return;

    // Remove oldest if at max
    if (worldToys.length >= MAX_WORLD_TOYS) {
      worldToys.shift();
    }

    var G = window.GAME;
    var margin = 60;
    // Place randomly on screen but away from edges
    var tx = margin + Math.random() * (G.width - margin * 2);
    var ty = G.height * 0.25 + Math.random() * (G.height * 0.45);

    // Avoid placing on top of creature
    if (window.Creature) {
      var dx = tx - window.Creature.x;
      var dy = ty - window.Creature.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 100) {
        tx += (dx > 0 ? 1 : -1) * 120;
        tx = clamp(tx, margin, G.width - margin);
      }
    }

    // Avoid overlapping with existing toys (min 90px apart)
    var MIN_TOY_DIST = 90;
    for (var attempt = 0; attempt < 8; attempt++) {
      var tooClose = false;
      for (var t = 0; t < worldToys.length; t++) {
        var edx = tx - worldToys[t].x;
        var edy = ty - worldToys[t].baseY;
        if (Math.sqrt(edx * edx + edy * edy) < MIN_TOY_DIST) {
          tooClose = true;
          break;
        }
      }
      if (!tooClose) break;
      // Try a new random position
      tx = margin + Math.random() * (G.width - margin * 2);
      ty = G.height * 0.25 + Math.random() * (G.height * 0.45);
    }

    worldToys.push({
      emoji: item.emoji,
      id: item.id,
      x: tx,
      y: ty,
      baseY: ty,
      phase: Math.random() * Math.PI * 2,
      bobSpeed: 0.6 + Math.random() * 0.4,
      rotation: 0,
      rotSpeed: (Math.random() - 0.5) * 0.3,
      scale: 0,
      targetScale: 1.0,
      alpha: 0,
      life: 0,
      maxLife: TOY_LIFETIME + Math.random() * 60,
      bouncePhase: 0,
      bounceAmp: 0,
      glowAlpha: 0
    });
  }

  // ─── Creature interaction with toys ───
  function updateToyInteractions(dt) {
    if (worldToys.length === 0) return;
    _interactTimer += dt;
    if (_interactTimer < INTERACT_INTERVAL) return;
    _interactTimer -= INTERACT_INTERVAL;

    if (!window.Creature || !window.EmotionSystem || !window.CreaturePhysics) return;

    var P = window.CreaturePhysics;
    var cx = P.x;
    var cy = P.y;
    var mood = window.EmotionSystem.getDominant();
    var br = P.baseRadius;

    for (var i = 0; i < worldToys.length; i++) {
      var toy = worldToys[i];
      if (toy.alpha < 0.3) continue;

      var dx = toy.x - cx;
      var dy = toy.y - cy;
      var dist = Math.sqrt(dx * dx + dy * dy);

      // Nearby detection radius
      var nearRadius = br * 4;

      if (dist < nearRadius) {
        // ── Toy is nearby — trigger curiosity ──
        window.EmotionSystem.modify('curiosity', 2);
        window.EmotionSystem.modify('playful', 1);

        // Very close — physical interaction
        if (dist < br * 2) {
          // Toy bounces when creature touches it
          toy.bounceAmp = 8 + Math.random() * 5;
          toy.glowAlpha = 0.4;

          // Emotional reaction based on mood
          if (mood === 'playful' || mood === 'excited' || mood === 'happy' || mood === 'happiness') {
            window.EmotionSystem.modify('happiness', 3);
            window.EmotionSystem.modify('playful', 4);
            // Creature bounces away playfully
            var nx = dist > 1 ? dx / dist : 0;
            var ny = dist > 1 ? dy / dist : 0;
            P.applyForce(-nx * 30, -ny * 25);
          } else if (mood === 'curiosity') {
            window.EmotionSystem.modify('curiosity', 5);
          }
        }
      }

      // ── Mood-based approach behavior ──
      if (dist > br * 1.5 && dist < br * 8 && !window.CreatureAI.interacting) {
        var approachChance = 0;

        if (mood === 'playful' || mood === 'excited') approachChance = 0.4;
        else if (mood === 'curiosity') approachChance = 0.35;
        else if (mood === 'happiness' || mood === 'happy') approachChance = 0.2;
        else if (mood === 'neutral') approachChance = 0.08;
        // Sad/sleepy/scared → don't approach

        if (Math.random() < approachChance) {
          var ndx = dx / (dist || 1);
          var ndy = dy / (dist || 1);
          P.applyForce(ndx * 15, ndy * 12);
        }
      }
    }
  }

  function updateWorldToys(dt) {
    // Creature-toy interactions
    updateToyInteractions(dt);

    for (var i = worldToys.length - 1; i >= 0; i--) {
      var t = worldToys[i];
      t.life += dt;
      t.phase += dt * t.bobSpeed;

      // Stay in place — gentle floating bob only
      t.y = t.baseY + Math.sin(t.phase) * 4;
      t.rotation += t.rotSpeed * dt;

      // Bounce decay (when creature interacts)
      if (t.bounceAmp > 0.1) {
        t.bouncePhase += dt * 12;
        t.bounceAmp *= 0.92;
      } else {
        t.bounceAmp = 0;
      }

      // Glow decay
      if (t.glowAlpha > 0.01) {
        t.glowAlpha *= 0.94;
      } else {
        t.glowAlpha = 0;
      }

      // Scale pop-in
      if (t.life < 0.6) {
        t.scale += (t.targetScale - t.scale) * dt * 5;
        t.alpha = Math.min(1, t.life / 0.6);
      } else if (t.life > t.maxLife - 5) {
        // Slow fade out near end of life
        var fadeT = (t.maxLife - t.life) / 5;
        t.alpha = Math.max(0, fadeT);
        t.scale = t.targetScale * Math.max(0.5, fadeT);
      } else {
        t.alpha = 1;
        t.scale = t.targetScale;
      }

      // Keep in screen bounds
      var G = window.GAME;
      t.x = clamp(t.x, 40, G.width - 40);
      t.baseY = clamp(t.baseY, 80, G.height - 100);

      if (t.life >= t.maxLife) {
        worldToys.splice(i, 1);
      }
    }
  }

  function renderWorldToys(ctx) {
    var fontSize = Math.round(window.GAME.width * 0.1);
    for (var i = 0; i < worldToys.length; i++) {
      var t = worldToys[i];
      if (t.alpha < 0.01) continue;

      var bounceY = t.bounceAmp > 0.1
        ? Math.sin(t.bouncePhase) * t.bounceAmp
        : 0;

      // Glow behind toy when interacted with
      if (t.glowAlpha > 0.01) {
        ctx.save();
        ctx.globalAlpha = t.glowAlpha * t.alpha;
        var glowGrad = ctx.createRadialGradient(t.x, t.y + bounceY, 5, t.x, t.y + bounceY, fontSize * 0.8);
        glowGrad.addColorStop(0, 'rgba(224, 170, 255, 0.3)');
        glowGrad.addColorStop(1, 'rgba(224, 170, 255, 0)');
        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.arc(t.x, t.y + bounceY, fontSize * 0.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Shadow
      ctx.save();
      ctx.globalAlpha = t.alpha * 0.15;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(t.x, t.baseY + fontSize * 0.35, fontSize * 0.25 * t.scale, 4 * t.scale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Toy emoji
      ctx.save();
      ctx.globalAlpha = t.alpha;
      ctx.translate(t.x, t.y + bounceY);
      ctx.scale(t.scale, t.scale);
      ctx.rotate(Math.sin(t.rotation) * 0.12);
      ctx.font = fontSize + 'px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t.emoji, 0, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
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
      updateWorldToys(dt);
    },

    render: function(ctx) {
      renderWorldToys(ctx);
      renderFlyingItems(ctx);
    },

    /** Get world toys count for debug */
    getWorldToyCount: function() {
      return worldToys.length;
    },

    serialize: function() {
      var data = {};
      for (var id in preferences) {
        if (Math.abs(preferences[id]) > 0.01) {
          data[id] = Math.round(preferences[id] * 100) / 100;
        }
      }
      var toys = [];
      for (var i = 0; i < worldToys.length; i++) {
        var t = worldToys[i];
        toys.push({ id: t.id, emoji: t.emoji, life: Math.round(t.life), maxLife: Math.round(t.maxLife) });
      }
      return { preferences: data, worldToys: toys };
    },

    deserialize: function(data) {
      if (data && data.preferences) {
        for (var id in data.preferences) {
          preferences[id] = clamp(data.preferences[id], -1, 1);
        }
      }
      if (data && data.worldToys && Array.isArray(data.worldToys)) {
        worldToys = [];
        for (var i = 0; i < data.worldToys.length; i++) {
          var td = data.worldToys[i];
          var G = window.GAME;
          var margin = 60;
          // Place at random fixed positions (stationary, no orbit)
          var tx = margin + Math.random() * (G.width - margin * 2);
          var ty = G.height * 0.25 + Math.random() * (G.height * 0.45);
          worldToys.push({
            emoji: td.emoji, id: td.id,
            x: tx,
            y: ty,
            baseY: ty,
            phase: Math.random() * Math.PI * 2,
            bobSpeed: 0.6 + Math.random() * 0.4,
            rotation: 0,
            rotSpeed: (Math.random() - 0.5) * 0.3,
            scale: 0.8, targetScale: 1.0,
            alpha: 0.8,
            life: td.life || 0, maxLife: td.maxLife || TOY_LIFETIME,
            bouncePhase: 0,
            bounceAmp: 0,
            glowAlpha: 0
          });
        }
      }
      console.log('[Items] Preferences restored');
    }
  };
})();
