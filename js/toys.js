/* ============================================
   js/toys.js — Sistema de Juguetes con Física
   Juguetes físicos, comportamiento único,
   interacción criatura-juguete-jugador
   ============================================ */

window.ToySystem = (function () {

  // ── Constantes ──
  const MAX_TOYS = 3;
  const TOY_LIFETIME = 180; // 3 minutos
  const FADE_TIME = 5;
  const GRAVITY = 40;
  const FRICTION = 0.985;
  const BOUNCE = 0.6;
  const MIN_SPACING = 70;

  // ── Definiciones de juguetes ──
  const TOY_DEFS = {
    ball: {
      emoji: '⚽', name: 'Pelota',
      mass: 1.0, bounciness: 0.85, friction: 0.99,
      floaty: 0, pulseRate: 0,
      creaturePlay: 'chase', // persigue y empuja
      sound: 'bounce',
      trailColor: { h: 45, s: 70, l: 60 }
    },
    box: {
      emoji: '📦', name: 'Caja',
      mass: 3.0, bounciness: 0.2, friction: 0.95,
      floaty: 0, pulseRate: 0,
      creaturePlay: 'hide', // se esconde detrás
      sound: 'thud',
      trailColor: { h: 30, s: 50, l: 45 }
    },
    feather: {
      emoji: '🪶', name: 'Pluma',
      mass: 0.1, bounciness: 0.3, friction: 0.998,
      floaty: 0.8, pulseRate: 0,
      creaturePlay: 'catch', // salta para atraparla
      sound: 'whisper',
      trailColor: { h: 200, s: 40, l: 70 }
    },
    light: {
      emoji: '💡', name: 'Luz',
      mass: 0.2, bounciness: 0.1, friction: 0.99,
      floaty: 1.0, pulseRate: 2.5,
      creaturePlay: 'orbit', // la orbita mirándola
      sound: 'hum',
      trailColor: { h: 50, s: 90, l: 75 }
    },
    music: {
      emoji: '🎵', name: 'Música',
      mass: 0.3, bounciness: 0.4, friction: 0.99,
      floaty: 0.6, pulseRate: 1.8,
      creaturePlay: 'dance', // baila cerca
      sound: 'note',
      trailColor: { h: 280, s: 60, l: 65 }
    },
    teddy: {
      emoji: '🧸', name: 'Peluche',
      mass: 2.0, bounciness: 0.15, friction: 0.96,
      floaty: 0, pulseRate: 0,
      creaturePlay: 'cuddle', // se acurruca
      sound: 'purr',
      trailColor: { h: 25, s: 50, l: 55 }
    }
  };

  // ── Estado ──
  let _toys = [];
  let _dragToy = null;
  let _dragOffX = 0;
  let _dragOffY = 0;
  let _trashZone = { active: false, x: 0, y: 0, r: 35, alpha: 0 };
  let _combos = [];
  let _favorite = null;
  let _useCount = {};
  let _time = 0;

  // ── Pre-calc ──
  const _sin = Math.sin, _cos = Math.cos, _abs = Math.abs;
  const _sqrt = Math.sqrt, _min = Math.min, _max = Math.max;
  const _rnd = Math.random, _PI = Math.PI, _PI2 = _PI * 2;

  // ── Reusable vec ──
  const _v = { x: 0, y: 0 };

  // ── Clase Toy ──
  function createToy(id, x, y) {
    const def = TOY_DEFS[id];
    if (!def) return null;

    return {
      id: id,
      def: def,
      x: x, y: y,
      vx: 0, vy: 0,
      size: _min(GAME.width, GAME.height) * 0.09,
      rotation: 0,
      rotVel: 0,
      alpha: 1,
      scale: 0, // pop-in
      age: 0,
      life: TOY_LIFETIME,
      phase: _rnd() * _PI2,
      active: true,
      beingDragged: false,
      // Creature interaction state
      playState: 'idle', // idle, playing, cooldown
      playTimer: 0,
      // Effects
      trail: [],
      pulsePhase: _rnd() * _PI2,
      glowAlpha: 0,
      // Wear
      wear: 1.0, // 1 = new, 0 = worn out
      novelty: 1.0
    };
  }

  // ── Física de un juguete ──
  function updateToyPhysics(toy, dt) {
    if (toy.beingDragged) return;

    const def = toy.def;
    const w = GAME.width, h = GAME.height;
    const margin = toy.size * 0.5;

    // Gravedad (reducida por floaty)
    const grav = GRAVITY * (1 - def.floaty) * dt;
    toy.vy += grav;

    // Floaty: movimiento sinusoidal
    if (def.floaty > 0) {
      toy.phase += dt * 1.5;
      toy.vy += _sin(toy.phase) * def.floaty * 15 * dt;
      toy.vx += _sin(toy.phase * 0.7) * def.floaty * 5 * dt;
    }

    // Fricción
    toy.vx *= def.friction;
    toy.vy *= def.friction;

    // Mover
    toy.x += toy.vx * dt;
    toy.y += toy.vy * dt;

    // Rotación por velocidad
    const speed = _sqrt(toy.vx * toy.vx + toy.vy * toy.vy);
    if (speed > 5) {
      toy.rotVel = toy.vx * 0.003 * (1 / _max(def.mass, 0.3));
    }
    toy.rotVel *= 0.95;
    toy.rotation += toy.rotVel * dt * 60;

    // Rebote en bordes
    if (toy.x < margin) {
      toy.x = margin;
      toy.vx = _abs(toy.vx) * def.bounciness;
      toy.rotVel = -toy.rotVel * 0.5;
      playToySound(toy, 0.3);
    }
    if (toy.x > w - margin) {
      toy.x = w - margin;
      toy.vx = -_abs(toy.vx) * def.bounciness;
      toy.rotVel = -toy.rotVel * 0.5;
      playToySound(toy, 0.3);
    }
    if (toy.y < margin) {
      toy.y = margin;
      toy.vy = _abs(toy.vy) * def.bounciness;
      playToySound(toy, 0.3);
    }
    if (toy.y > h - margin) {
      toy.y = h - margin;
      toy.vy = -_abs(toy.vy) * def.bounciness;
      toy.rotVel *= 0.8;
      playToySound(toy, _min(speed / 200, 0.6));
    }

    // Trail
    if (speed > 30) {
      toy.trail.push({ x: toy.x, y: toy.y, alpha: 0.5, life: 0.4 });
      if (toy.trail.length > 8) toy.trail.shift();
    }
  }

  // ── Colisión entre juguetes ──
  function toyToyCollision() {
    for (let i = 0; i < _toys.length; i++) {
      for (let j = i + 1; j < _toys.length; j++) {
        const a = _toys[i], b = _toys[j];
        if (!a.active || !b.active || a.beingDragged || b.beingDragged) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = _sqrt(dx * dx + dy * dy);
        const minDist = (a.size + b.size) * 0.45;
        if (dist < minDist && dist > 0.1) {
          const nx = dx / dist, ny = dy / dist;
          const overlap = minDist - dist;
          const totalMass = a.def.mass + b.def.mass;
          const ratioA = b.def.mass / totalMass;
          const ratioB = a.def.mass / totalMass;

          a.x -= nx * overlap * ratioA * 0.5;
          a.y -= ny * overlap * ratioA * 0.5;
          b.x += nx * overlap * ratioB * 0.5;
          b.y += ny * overlap * ratioB * 0.5;

          // Elastic collision
          const relVx = a.vx - b.vx, relVy = a.vy - b.vy;
          const relVn = relVx * nx + relVy * ny;
          if (relVn > 0) {
            const impulse = relVn / totalMass;
            a.vx -= impulse * b.def.mass * nx * 1.2;
            a.vy -= impulse * b.def.mass * ny * 1.2;
            b.vx += impulse * a.def.mass * nx * 1.2;
            b.vy += impulse * a.def.mass * ny * 1.2;
          }

          // Check combo
          checkCombo(a, b);
        }
      }
    }
  }

  // ── Colisión criatura-juguete ──
  function creatureToyCollision() {
    if (!window.Creature || !Creature.x) return;
    const cx = Creature.x, cy = Creature.y;
    const cr = Creature.getRadius ? Creature.getRadius() : 40;

    for (let i = 0; i < _toys.length; i++) {
      const toy = _toys[i];
      if (!toy.active || toy.beingDragged) continue;

      const dx = toy.x - cx, dy = toy.y - cy;
      const dist = _sqrt(dx * dx + dy * dy);
      const minDist = cr + toy.size * 0.4;

      if (dist < minDist && dist > 0.1) {
        const nx = dx / dist, ny = dy / dist;
        const pushForce = 80 / _max(toy.def.mass, 0.3);

        toy.vx += nx * pushForce * 0.3;
        toy.vy += ny * pushForce * 0.3;

        // Separate
        const overlap = minDist - dist;
        toy.x += nx * overlap * 0.6;
        toy.y += ny * overlap * 0.6;

        // Wear
        toy.wear = _max(0.1, toy.wear - 0.002);
        playToySound(toy, 0.2);
      }
    }
  }

  // ── Sonidos de juguete ──
  function playToySound(toy, vol) {
    if (!window.AudioSystem || !AudioSystem.isInitialized()) return;
    const v = _min(vol, 0.4);
    const id = toy.def.sound;

    if (id === 'bounce') {
      AudioSystem.play('squeak', { volume: v * 0.3, pitch: 0.5 + _rnd() * 0.3 });
    } else if (id === 'thud') {
      AudioSystem.play('squeak', { volume: v * 0.4, pitch: 0.3 });
    } else if (id === 'whisper') {
      // Very soft chirp
      AudioSystem.play('chirp', { volume: v * 0.15, pitch: 1.5 });
    } else if (id === 'note') {
      const notes = [0.8, 1.0, 1.2, 1.5];
      AudioSystem.play('chirp', { volume: v * 0.25, pitch: notes[~~(_rnd() * notes.length)] });
    } else if (id === 'hum') {
      AudioSystem.play('chirp', { volume: v * 0.1, pitch: 0.6 });
    } else if (id === 'purr') {
      AudioSystem.play('chirp', { volume: v * 0.15, pitch: 0.4 });
    }
  }

  // ── Combos ──
  function checkCombo(a, b) {
    const pair = [a.id, b.id].sort().join('+');
    const existing = _combos.find(c => c.pair === pair);
    if (existing && existing.cooldown > 0) return;

    let effect = null;
    if (pair === 'ball+box') effect = { type: 'contain', desc: 'Pelota rebota en caja' };
    else if (pair === 'feather+music') effect = { type: 'rhythm', desc: 'Pluma baila' };
    else if (pair === 'light+teddy') effect = { type: 'glow', desc: 'Peluche brilla' };
    else if (pair === 'ball+feather') effect = { type: 'juggle', desc: 'Malabar' };
    else if (pair === 'light+music') effect = { type: 'disco', desc: 'Disco' };
    else if (pair === 'box+teddy') effect = { type: 'nest', desc: 'Nido acogedor' };

    if (effect) {
      _combos.push({ pair: pair, effect: effect, timer: 5, cooldown: 10 });
      // Trigger combo effects
      applyComboEffect(effect, a, b);
    }
  }

  function applyComboEffect(effect, a, b) {
    if (!window.Creature) return;

    if (effect.type === 'contain') {
      // Ball bounces more
      a.vx *= 1.5; a.vy *= 1.5;
    } else if (effect.type === 'rhythm') {
      // Feather dances
      const f = (a.id === 'feather') ? a : b;
      f.vx += (_rnd() - 0.5) * 100;
      f.vy -= 50;
    } else if (effect.type === 'glow') {
      // Teddy glows
      const t = (a.id === 'teddy') ? a : b;
      t.glowAlpha = 0.8;
    }

    // Creature reacts to combos
    if (window.EmotionSystem) {
      EmotionSystem.modify('curiosity', 8);
      EmotionSystem.modify('happiness', 5);
    }
    if (window.Particles) {
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      Particles.burst(mx, my, { h: 50, s: 80, l: 70 }, 8);
    }
  }

  // ── Criatura juega sola con juguetes ──
  function getCreaturePlayTarget() {
    if (!window.Creature || !Creature.x) return null;
    if (!window.EmotionSystem) return null;

    const dom = EmotionSystem.getDominant ? EmotionSystem.getDominant() : 'neutral';
    let funNeed = 100;
    if (window.NeedsSystem && NeedsSystem.get) funNeed = NeedsSystem.get('fun');

    // Only play if bored or playful
    if (funNeed > 60 && dom !== 'playful') return null;

    // Find best toy to play with
    let best = null, bestScore = -1;
    for (let i = 0; i < _toys.length; i++) {
      const t = _toys[i];
      if (!t.active || t.beingDragged) continue;

      let score = t.novelty * 0.5 + t.wear * 0.3;

      // Personality preference
      if (window.Personality && Personality.getTrait) {
        const p = Personality.getTrait('playfulness') || 50;
        const c = Personality.getTrait('curiosity') || 50;
        if (t.id === 'ball' && p > 55) score += 0.3;
        if (t.id === 'box' && c > 55) score += 0.3;
        if (t.id === 'feather' && p > 50) score += 0.2;
        if (t.id === 'light' && c > 50) score += 0.3;
        if (t.id === 'teddy') {
          const soc = Personality.getTrait('sociability') || 50;
          if (soc > 55) score += 0.4;
        }
      }

      if (dom === 'sleepy' && t.id === 'teddy') score += 0.5;
      if (score > bestScore) { bestScore = score; best = t; }
    }

    if (best) _favorite = best.id;
    return best;
  }

  function updateCreaturePlay(dt) {
    if (!window.Creature || !Creature.x) return;
    const toy = getCreaturePlayTarget();
    if (!toy) return;

    const cx = Creature.x, cy = Creature.y;
    const cr = Creature.getRadius ? Creature.getRadius() : 40;
    const dx = toy.x - cx, dy = toy.y - cy;
    const dist = _sqrt(dx * dx + dy * dy);

    const playType = toy.def.creaturePlay;
    const force = { x: 0, y: 0 };

    switch (playType) {
      case 'chase': // Pelota - persigue y empuja
        if (dist > cr * 2.5) {
          // Move toward ball
          force.x = (dx / dist) * 60;
          force.y = (dy / dist) * 60;
        } else if (dist < cr * 1.8) {
          // Push ball
          toy.vx += (dx / dist) * 120;
          toy.vy += (dy / dist) * 80 - 30;
          toy.wear = _max(0.1, toy.wear - 0.005);
          playToySound(toy, 0.4);
        }
        break;

      case 'hide': // Caja - se esconde detrás
        const behindX = toy.x + (toy.x > GAME.width / 2 ? toy.size : -toy.size);
        const behindY = toy.y;
        const bdx = behindX - cx, bdy = behindY - cy;
        const bdist = _sqrt(bdx * bdx + bdy * bdy);
        if (bdist > 10) {
          force.x = (bdx / bdist) * 30;
          force.y = (bdy / bdist) * 30;
        }
        break;

      case 'catch': // Pluma - salta para atrapar
        if (dist > cr * 3) {
          force.x = (dx / dist) * 50;
          force.y = (dy / dist) * 50;
        } else if (dist < cr * 2) {
          // Jump!
          if (Creature.applyForce) Creature.applyForce(0, -180);
          toy.vy -= 60;
          toy.vx += (_rnd() - 0.5) * 80;
          playToySound(toy, 0.2);
        }
        break;

      case 'orbit': // Luz - orbita mirándola
        const orbitDist = cr * 2.5;
        const angle = _time * 0.5;
        const targetX = toy.x + _cos(angle) * orbitDist;
        const targetY = toy.y + _sin(angle) * orbitDist;
        force.x = (targetX - cx) * 2;
        force.y = (targetY - cy) * 2;
        break;

      case 'dance': // Música - baila de lado a lado
        const dancePeriod = 1.2;
        const danceX = toy.x + _sin(_time / dancePeriod * _PI2) * cr * 2;
        force.x = (danceX - cx) * 3;
        force.y = (toy.y - cy) * 1.5;
        break;

      case 'cuddle': // Peluche - se acurruca
        const cuddleDist = cr * 0.8;
        if (dist > cuddleDist) {
          force.x = (dx / dist) * 25;
          force.y = (dy / dist) * 25;
        }
        // Sleepy near teddy
        if (dist < cr * 1.5 && window.EmotionSystem) {
          EmotionSystem.modify('love', 0.3 * dt);
          EmotionSystem.modify('happiness', 0.2 * dt);
        }
        break;
    }

    if (Creature.applyForce && (_abs(force.x) > 0.1 || _abs(force.y) > 0.1)) {
      Creature.applyForce(force.x * dt, force.y * dt);
    }

    // Novelty decay
    toy.novelty = _max(0.1, toy.novelty - 0.001 * dt);

    // Curiosity from toys
    if (window.EmotionSystem) {
      EmotionSystem.modify('curiosity', 0.5 * dt);
    }
  }

  // ── Input (Drag juguetes) ──
  function initInput() {
    if (!window.InputSystem) return;

    InputSystem.on('down', function (e) {
      if (GAME.state !== 'living') return;
      if (window.Menu && Menu.isOpen) return;

      for (let i = _toys.length - 1; i >= 0; i--) {
        const t = _toys[i];
        if (!t.active) continue;
        const dx = e.x - t.x, dy = e.y - t.y;
        if (_sqrt(dx * dx + dy * dy) < t.size * 0.6) {
          _dragToy = t;
          t.beingDragged = true;
          t.vx = 0; t.vy = 0;
          _dragOffX = dx;
          _dragOffY = dy;
          // Show trash zone
          _trashZone.active = true;
          _trashZone.x = GAME.width / 2;
          _trashZone.y = GAME.height - 50;
          break;
        }
      }
    });

    InputSystem.on('drag', function (e) {
      if (!_dragToy) return;
      _dragToy.x = e.x - _dragOffX;
      _dragToy.y = e.y - _dragOffY;
    });

    InputSystem.on('release', function (e) {
      if (!_dragToy) return;

      // Check trash zone
      const dx = _dragToy.x - _trashZone.x;
      const dy = _dragToy.y - _trashZone.y;
      if (_sqrt(dx * dx + dy * dy) < _trashZone.r * 2) {
        // Delete toy with poof
        if (window.Particles) {
          Particles.burst(_dragToy.x, _dragToy.y, _dragToy.def.trailColor, 10);
        }
        _dragToy.active = false;
        // Sad if favorite
        if (_dragToy.id === _favorite && window.EmotionSystem) {
          EmotionSystem.modify('sadness', 8);
          if (window.AudioSystem && AudioSystem.isInitialized()) {
            AudioSystem.play('whimper', { volume: 0.2 });
          }
        }
      } else {
        // Fling with velocity
        if (e.velocityX !== undefined) {
          _dragToy.vx = e.velocityX * 0.8;
          _dragToy.vy = e.velocityY * 0.8;
        }
      }

      _dragToy.beingDragged = false;
      _dragToy = null;
      _trashZone.active = false;
    });
  }

  // ── Render ──
  function renderToy(ctx, toy) {
    const s = toy.scale * toy.size;
    if (s < 1) return;

    ctx.save();
    ctx.globalAlpha = toy.alpha * toy.wear;
    ctx.translate(toy.x, toy.y);

    // Glow for light / combos
    if (toy.glowAlpha > 0 || toy.def.pulseRate > 0) {
      const glowA = toy.def.pulseRate > 0
        ? 0.15 + _sin(toy.pulsePhase) * 0.1
        : toy.glowAlpha;
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.8, 0, _PI2);
      const tc = toy.def.trailColor;
      ctx.fillStyle = `hsla(${tc.h},${tc.s}%,${tc.l}%,${glowA})`;
      ctx.fill();
    }

    // Shadow
    ctx.beginPath();
    ctx.ellipse(0, s * 0.35, s * 0.35, s * 0.08, 0, 0, _PI2);
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fill();

    // Rotation
    ctx.rotate(toy.rotation);

    // Emoji
    ctx.font = `${s}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(toy.def.emoji, 0, 0);

    // Favorite indicator
    if (toy.id === _favorite) {
      ctx.font = `${s * 0.25}px system-ui`;
      ctx.globalAlpha = 0.5 + _sin(_time * 3) * 0.3;
      ctx.fillText('⭐', s * 0.4, -s * 0.4);
    }

    ctx.restore();
  }

  function renderTrails(ctx) {
    for (let i = 0; i < _toys.length; i++) {
      const toy = _toys[i];
      if (!toy.active) continue;
      const trail = toy.trail;
      const tc = toy.def.trailColor;
      for (let j = 0; j < trail.length; j++) {
        const t = trail[j];
        ctx.beginPath();
        ctx.arc(t.x, t.y, 3, 0, _PI2);
        ctx.fillStyle = `hsla(${tc.h},${tc.s}%,${tc.l}%,${t.alpha})`;
        ctx.fill();
      }
    }
  }

  function renderTrash(ctx) {
    if (!_trashZone.active) return;

    // Animate alpha
    _trashZone.alpha = _min(1, _trashZone.alpha + 0.05);

    const tz = _trashZone;
    ctx.save();
    ctx.globalAlpha = tz.alpha * 0.7;
    ctx.translate(tz.x, tz.y);

    // Background circle
    ctx.beginPath();
    ctx.arc(0, 0, tz.r, 0, _PI2);
    ctx.fillStyle = 'rgba(255,60,60,0.3)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,60,60,0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Trash emoji
    ctx.font = `${tz.r}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🗑️', 0, 0);

    // Highlight if toy is near
    if (_dragToy) {
      const dx = _dragToy.x - tz.x, dy = _dragToy.y - tz.y;
      if (_sqrt(dx * dx + dy * dy) < tz.r * 2) {
        ctx.beginPath();
        ctx.arc(0, 0, tz.r * 1.3, 0, _PI2);
        ctx.fillStyle = 'rgba(255,60,60,0.2)';
        ctx.fill();
      }
    }

    ctx.restore();
  }

  function renderCombos(ctx) {
    for (let i = 0; i < _combos.length; i++) {
      const c = _combos[i];
      if (c.timer <= 0) continue;
      // Find the two toys
      const ids = c.pair.split('+');
      const t1 = _toys.find(t => t.active && t.id === ids[0]);
      const t2 = _toys.find(t => t.active && t.id === ids[1]);
      if (!t1 || !t2) continue;

      // Draw connecting line
      ctx.save();
      ctx.globalAlpha = _min(c.timer / 2, 0.4);
      ctx.beginPath();
      ctx.moveTo(t1.x, t1.y);
      ctx.lineTo(t2.x, t2.y);
      ctx.strokeStyle = 'rgba(255,220,100,0.5)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Sparkles along line
      const mx = (t1.x + t2.x) / 2, my = (t1.y + t2.y) / 2;
      ctx.beginPath();
      ctx.arc(mx, my, 4 + _sin(_time * 5) * 2, 0, _PI2);
      ctx.fillStyle = 'rgba(255,220,100,0.6)';
      ctx.fill();
      ctx.restore();
    }
  }

  // ── Music waves effect ──
  function renderMusicWaves(ctx) {
    for (let i = 0; i < _toys.length; i++) {
      const t = _toys[i];
      if (!t.active || t.id !== 'music') continue;
      ctx.save();
      ctx.translate(t.x, t.y);
      for (let w = 0; w < 3; w++) {
        const wPhase = (t.pulsePhase + w * 0.8) % _PI2;
        const wScale = (wPhase / _PI2);
        const wAlpha = (1 - wScale) * 0.2 * t.alpha;
        ctx.beginPath();
        ctx.arc(0, 0, t.size * 0.5 + wScale * t.size, 0, _PI2);
        ctx.strokeStyle = `hsla(280,60%,65%,${wAlpha})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // ── Public API ──
  return {
    MAX_TOYS: MAX_TOYS,

    init: function () {
      _toys = [];
      _dragToy = null;
      _combos = [];
      _favorite = null;
      _useCount = {};
      _time = 0;
      initInput();
    },

    update: function (dt) {
      _time += dt;

      // Update combos
      for (let i = _combos.length - 1; i >= 0; i--) {
        _combos[i].timer -= dt;
        _combos[i].cooldown -= dt;
        if (_combos[i].cooldown < -30) _combos.splice(i, 1);
      }

      // Update toys
      for (let i = _toys.length - 1; i >= 0; i--) {
        const t = _toys[i];
        if (!t.active) { _toys.splice(i, 1); continue; }

        t.age += dt;
        t.pulsePhase += dt * t.def.pulseRate * _PI2;

        // Pop-in animation
        if (t.scale < 1) t.scale = _min(1, t.scale + dt * 3);

        // Glow decay
        if (t.glowAlpha > 0) t.glowAlpha = _max(0, t.glowAlpha - dt * 0.3);

        // Lifetime
        const remaining = t.life - t.age;
        if (remaining < FADE_TIME) {
          t.alpha = _max(0, remaining / FADE_TIME);
          t.scale = _max(0.3, remaining / FADE_TIME);
        }
        if (remaining <= 0) {
          // Poof
          if (window.Particles) {
            Particles.burst(t.x, t.y, t.def.trailColor, 6);
          }
          if (t.id === _favorite && window.EmotionSystem) {
            EmotionSystem.modify('sadness', 5);
          }
          _toys.splice(i, 1);
          continue;
        }

        // Physics
        updateToyPhysics(t, dt);

        // Trail decay
        for (let j = t.trail.length - 1; j >= 0; j--) {
          t.trail[j].life -= dt;
          t.trail[j].alpha = _max(0, t.trail[j].life);
          if (t.trail[j].life <= 0) t.trail.splice(j, 1);
        }
      }

      // Collisions
      toyToyCollision();
      creatureToyCollision();

      // Creature plays with toys (every ~0.5s)
      if (~~(_time * 2) !== ~~((_time - dt) * 2)) {
        updateCreaturePlay(dt * 30); // Amplified since called less often
      }
    },

    render: function (ctx) {
      renderTrails(ctx);
      renderMusicWaves(ctx);

      for (let i = 0; i < _toys.length; i++) {
        if (_toys[i].active) renderToy(ctx, _toys[i]);
      }

      renderCombos(ctx);
      renderTrash(ctx);
    },

    spawnToy: function (id, x, y) {
      if (!TOY_DEFS[id]) return false;

      // Max check
      const active = _toys.filter(t => t.active);
      if (active.length >= MAX_TOYS) {
        // Remove oldest
        const oldest = active.reduce((a, b) => a.age > b.age ? a : b);
        if (window.Particles) {
          Particles.burst(oldest.x, oldest.y, oldest.def.trailColor, 5);
        }
        oldest.active = false;
        _toys = _toys.filter(t => t.active);
      }

      // Spacing check
      let fx = x, fy = y;
      for (let attempt = 0; attempt < 8; attempt++) {
        let tooClose = false;
        for (let i = 0; i < _toys.length; i++) {
          const t = _toys[i];
          if (!t.active) continue;
          const ddx = fx - t.x, ddy = fy - t.y;
          if (_sqrt(ddx * ddx + ddy * ddy) < MIN_SPACING) {
            tooClose = true; break;
          }
        }
        if (!tooClose) break;
        fx = x + (_rnd() - 0.5) * GAME.width * 0.4;
        fy = y + (_rnd() - 0.5) * GAME.height * 0.3;
        fx = _max(50, _min(GAME.width - 50, fx));
        fy = _max(50, _min(GAME.height - 80, fy));
      }

      const toy = createToy(id, fx, fy);
      // Initial velocity (small toss)
      toy.vy = -30 - _rnd() * 40;
      toy.vx = (_rnd() - 0.5) * 60;

      // Track use count
      _useCount[id] = (_useCount[id] || 0) + 1;
      if (_useCount[id] > 3) toy.novelty = _max(0.2, 1 - (_useCount[id] - 3) * 0.15);

      _toys.push(toy);
      return true;
    },

    getToys: function () { return _toys; },
    getFavorite: function () { return _favorite; },
    getDragToy: function () { return _dragToy; },
    getCount: function () { return _toys.filter(t => t.active).length; },

    isToyAt: function (x, y) {
      for (let i = _toys.length - 1; i >= 0; i--) {
        const t = _toys[i];
        if (!t.active) continue;
        const dx = x - t.x, dy = y - t.y;
        if (_sqrt(dx * dx + dy * dy) < t.size * 0.6) return t;
      }
      return null;
    },

    serialize: function () {
      return {
        toys: _toys.filter(t => t.active).map(t => ({
          id: t.id, x: t.x, y: t.y, age: t.age,
          wear: t.wear, novelty: t.novelty
        })),
        favorite: _favorite,
        useCount: _useCount
      };
    },

    deserialize: function (data) {
      if (!data) return;
      _favorite = data.favorite || null;
      _useCount = data.useCount || {};
      _toys = [];
      if (data.toys) {
        for (let i = 0; i < data.toys.length; i++) {
          const d = data.toys[i];
          const toy = createToy(d.id, d.x, d.y);
          if (!toy) continue;
          toy.age = d.age || 0;
          toy.wear = d.wear || 1;
          toy.novelty = d.novelty || 0.5;
          toy.scale = 1;
          _toys.push(toy);
        }
      }
    }
  };

})();
