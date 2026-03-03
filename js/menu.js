/**
 * ===================================================
 * Menu — Panel deslizante inferior + drag-to-feed
 * ===================================================
 * Faster spring animation, no backdrop darkening.
 * Hamburger button handled by main.js (settings).
 * ===================================================
 */
(function() {
  'use strict';

  var MENU_HEIGHT_RATIO = 0.28;
  var TAB_HEIGHT = 44;
  var HANDLE_W = 40;
  var HANDLE_H = 4;
  var HANDLE_MARGIN = 10;
  var ITEM_SIZE_RATIO = 0.135;
  var ITEM_MAX_PX = 62;
  var ITEM_GAP = 14;

  /** Faster spring: snappier menu open/close */
  var SPRING_K = 28;
  var SPRING_DAMP = 0.82;

  var CATEGORIES = [
    { key: 'food', emoji: '🍎', label: 'Comida' },
    { key: 'toys', emoji: '🧸', label: 'Juguetes' },
    { key: 'care', emoji: '💊', label: 'Cuidado' }
  ];

  var _isOpen = false;
  var _slidePos = 0;
  var _slideVel = 0;
  var _activeTab = 0;
  var _menuH = 0;
  var _menuY = 0;
  var _menuBaseY = 0;
  var _itemSize = 0;
  var _dragging = false;
  var _dragItem = null;
  var _dragX = 0;
  var _dragY = 0;
  var _dragStartX = 0;
  var _dragStartY = 0;
  var _dragAlpha = 1;
  var _returning = false;
  var _returnT = 0;
  var _returnFromX = 0;
  var _returnFromY = 0;
  var _returnToX = 0;
  var _returnToY = 0;
  var _hoverItem = null;
  var _hoverTimer = 0;
  var _hoverIndex = -1;
  var _itemPositions = [];
  var _cbDown, _cbDrag, _cbRelease, _cbSwipeUp, _cbSwipeDown, _cbTap;
  var _openBtn = null;

  function clamp(v, min, max) {
    return v < min ? min : (v > max ? max : v);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function recalcGeometry() {
    var G = window.GAME;
    _menuH = Math.round(G.height * MENU_HEIGHT_RATIO);
    _menuBaseY = G.height - _menuH;
    _itemSize = Math.min(Math.round(G.width * ITEM_SIZE_RATIO), ITEM_MAX_PX);
  }

  function calcItemPositions() {
    _itemPositions = [];
    if (!window.Items) return;

    var G = window.GAME;
    var cat = CATEGORIES[_activeTab].key;
    var items = window.Items.getCategory(cat);

    var startY = _menuBaseY + TAB_HEIGHT + HANDLE_MARGIN + HANDLE_H + 8;
    var rowY = startY + (_menuH - TAB_HEIGHT - HANDLE_MARGIN - HANDLE_H - 16) / 2;

    // Ensure items fit: reduce gap or size if needed
    var effectiveGap = ITEM_GAP;
    var effectiveSize = _itemSize;
    var totalW = items.length * (effectiveSize + effectiveGap) - effectiveGap;
    var availW = G.width - ITEM_GAP * 2; // padding on both sides

    // If items overflow, shrink gap first, then size
    if (totalW > availW) {
      effectiveGap = Math.max(6, Math.floor((availW - items.length * effectiveSize) / Math.max(1, items.length - 1)));
      totalW = items.length * (effectiveSize + effectiveGap) - effectiveGap;
    }
    if (totalW > availW) {
      effectiveSize = Math.floor((availW - (items.length - 1) * effectiveGap) / items.length);
      totalW = items.length * (effectiveSize + effectiveGap) - effectiveGap;
    }

    var startX = Math.max(ITEM_GAP, (G.width - totalW) / 2);

    for (var i = 0; i < items.length; i++) {
      _itemPositions.push({
        x: startX + i * (effectiveSize + effectiveGap) + effectiveSize / 2,
        y: rowY,
        item: items[i],
        index: i,
        size: effectiveSize
      });
    }
  }

  function hitTestItem(px, py) {
    var half = _itemSize / 2 + 6;
    for (var i = 0; i < _itemPositions.length; i++) {
      var ip = _itemPositions[i];
      var dx = px - ip.x;
      var dy = py - ip.y;
      if (dx * dx + dy * dy <= half * half) {
        return ip;
      }
    }
    return null;
  }

  function hitTestTab(px, py) {
    if (!_isOpen) return -1;
    var tabY = _menuY;
    if (py < tabY || py > tabY + TAB_HEIGHT) return -1;
    var tabW = window.GAME.width / CATEGORIES.length;
    var idx = Math.floor(px / tabW);
    return idx >= 0 && idx < CATEGORIES.length ? idx : -1;
  }

  function isInMenuArea(px, py) {
    return _isOpen && py >= _menuY;
  }

  function reactToItem(itemId, dragX, dragY) {
    if (!window.Creature || !window.Items || !window.CreaturePhysics) return;
    var reaction = window.Items.getReaction(itemId);
    var P = window.CreaturePhysics;
    var dx = dragX - P.x;
    var dy = dragY - P.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var cr = P.baseRadius;
    if (dist > cr * 5) return;
    var nx = dist > 1 ? dx / dist : 0;
    var ny = dist > 1 ? dy / dist : 0;
    var strength = clamp(1 - dist / (cr * 5), 0, 1);
    if (reaction === 'approach') {
      P.applyForce(nx * strength * 3, ny * strength * 3);
    } else if (reaction === 'avoid') {
      P.applyForce(-nx * strength * 5, -ny * strength * 5);
    }
  }

  // ─── Input handlers ───

  function onSwipeUp(e) {
    if (window.GAME.state !== 'living') return;
    if (e.isInMenuZone || e.startY > window.GAME.height * 0.8) {
      Menu.open();
    }
  }

  function onSwipeDown(e) {
    if (window.GAME.state !== 'living') return;
    if (_isOpen && !_dragging) {
      Menu.close();
    }
  }

  function onTap(e) {
    if (window.GAME.state !== 'living') return;
    if (!_isOpen) return;

    var tabIdx = hitTestTab(e.x, e.y);
    if (tabIdx >= 0) {
      _activeTab = tabIdx;
      calcItemPositions();
      if (window.AudioSystem) window.AudioSystem.play('item_select', { volume: 0.3 });
      return;
    }

    if (isInMenuArea(e.x, e.y)) {
      var hit = hitTestItem(e.x, e.y);
      if (hit) {
        window.Items.apply(hit.item.id, hit.x, hit.y);
        if (window.AudioSystem) window.AudioSystem.play('item_select', { volume: 0.3 });
      }
    }
  }

  function onDown(e) {
    if (window.GAME.state !== 'living') return;
    if (!_isOpen) return;
    if (!isInMenuArea(e.x, e.y)) return;
    var hit = hitTestItem(e.x, e.y);
    if (hit) {
      _hoverItem = hit;
      _hoverTimer = 0;
      _hoverIndex = hit.index;
    }
  }

  function onDrag(e) {
    if (window.GAME.state !== 'living') return;
    if (_dragging && _dragItem) {
      _dragX = e.x;
      _dragY = e.y;
      reactToItem(_dragItem.id, _dragX, _dragY);
      return;
    }
    if (_hoverItem && !_dragging) {
      var dist = Math.sqrt(
        (e.x - _hoverItem.x) * (e.x - _hoverItem.x) +
        (e.y - _hoverItem.y) * (e.y - _hoverItem.y)
      );
      if (dist > _itemSize * 0.3) {
        _dragging = true;
        _dragItem = _hoverItem.item;
        _dragX = e.x;
        _dragY = e.y;
        _dragStartX = _hoverItem.x;
        _dragStartY = _hoverItem.y;
        _dragAlpha = 1;
        _returning = false;
        _hoverItem = null;
        _hoverTimer = 0;

        // ── Auto-close menu when dragging FOOD ──
        // Close visually but keep drag state alive
        if (_dragItem && _dragItem.category === 'food') {
          _isOpen = false;
          updateButtonVisibility();
          if (window.AudioSystem) window.AudioSystem.play('menu_close', { volume: 0.15 });
        }
      }
    }
  }

  function onRelease(e) {
    if (window.GAME.state !== 'living') return;
    if (_dragging && _dragItem) {
      var dropOnCreature = window.Creature && window.Creature.isPointInside(_dragX, _dragY);
      if (dropOnCreature) {
        window.Items.apply(_dragItem.id, _dragX, _dragY);
        _dragging = false;
        _dragItem = null;
      } else {
        _returning = true;
        _returnT = 0;
        _returnFromX = _dragX;
        _returnFromY = _dragY;
        _returnToX = _dragStartX;
        _returnToY = _dragStartY;
        _dragging = false;
      }
    }
    _hoverItem = null;
    _hoverTimer = 0;
    _hoverIndex = -1;
  }

  function updateButtonVisibility() {
    if (!_openBtn) return;
    if (_isOpen) {
      _openBtn.classList.remove('visible');
      _openBtn.classList.add('hidden');
    } else {
      _openBtn.classList.remove('hidden');
      _openBtn.classList.add('visible');
    }
  }

  function bindInputs() {
    if (!window.InputSystem) return;
    _cbSwipeUp = onSwipeUp;
    _cbSwipeDown = onSwipeDown;
    _cbTap = onTap;
    _cbDown = onDown;
    _cbDrag = onDrag;
    _cbRelease = onRelease;
    InputSystem.on('swipe_up', _cbSwipeUp);
    InputSystem.on('swipe_down', _cbSwipeDown);
    InputSystem.on('tap', _cbTap);
    InputSystem.on('down', _cbDown);
    InputSystem.on('drag', _cbDrag);
    InputSystem.on('release', _cbRelease);
  }

  // ─── Rendering ───

  function renderMenuPanel(ctx) {
    var G = window.GAME;

    // NO backdrop darkening — menu panel only
    if (_slidePos < 0.01) return;

    var panelY = G.height - _menuH * _slidePos;
    _menuY = panelY;

    // Panel background with rounded top corners
    var cornerR = 20;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, panelY + cornerR);
    ctx.arcTo(0, panelY, cornerR, panelY, cornerR);
    ctx.lineTo(G.width - cornerR, panelY);
    ctx.arcTo(G.width, panelY, G.width, panelY + cornerR, cornerR);
    ctx.lineTo(G.width, G.height);
    ctx.lineTo(0, G.height);
    ctx.closePath();

    var bgH = 260, bgS = 15, bgL = 8;
    if (window.EmotionSystem) {
      var ec = window.EmotionSystem.getColor();
      bgH = ec.h;
      bgS = Math.round(ec.s * 0.25);
    }
    ctx.fillStyle = 'hsla(' + Math.round(bgH) + ',' + bgS + '%,' + bgL + '%, 0.94)';
    ctx.fill();

    ctx.strokeStyle = 'rgba(224, 170, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cornerR, panelY);
    ctx.lineTo(G.width - cornerR, panelY);
    ctx.stroke();
    ctx.restore();

    // Handle bar
    var handleY = panelY + HANDLE_MARGIN;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.beginPath();
    ctx.roundRect((G.width - HANDLE_W) / 2, handleY, HANDLE_W, HANDLE_H, HANDLE_H / 2);
    ctx.fill();

    // Tabs
    var tabY = handleY + HANDLE_H + 6;
    var tabW = G.width / CATEGORIES.length;
    var tabFontSize = Math.round(G.width * 0.035);
    var emojiFontSize = Math.round(G.width * 0.045);

    for (var t = 0; t < CATEGORIES.length; t++) {
      var cat = CATEGORIES[t];
      var tabCX = tabW * t + tabW / 2;
      var isActive = t === _activeTab;

      ctx.globalAlpha = isActive ? 1 : 0.45;
      ctx.font = emojiFontSize + 'px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(cat.emoji, tabCX - tabFontSize * 1.2, tabY + TAB_HEIGHT * 0.45);

      ctx.font = '300 ' + tabFontSize + 'px system-ui';
      ctx.fillStyle = isActive ? '#e0aaff' : '#888';
      ctx.fillText(cat.label, tabCX + emojiFontSize * 0.5, tabY + TAB_HEIGHT * 0.45);

      if (isActive) {
        ctx.fillStyle = '#e0aaff';
        ctx.fillRect(tabCX - tabW * 0.3, tabY + TAB_HEIGHT - 2, tabW * 0.6, 2);
      }
    }

    ctx.globalAlpha = 1;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.fillRect(0, tabY + TAB_HEIGHT, G.width, 1);

    // Items
    for (var i = 0; i < _itemPositions.length; i++) {
      var ip = _itemPositions[i];
      var ipSize = ip.size || _itemSize;
      var itemFontSize = Math.round(ipSize * 0.55);
      var isHover = (_hoverItem && _hoverItem.index === i);
      var isDragSource = (_dragging && _dragItem && _dragItem.id === ip.item.id);

      var circleScale = isHover ? 1.15 : 1.0;
      var circleAlpha = isDragSource ? 0.3 : 1.0;
      var circleR = (ipSize / 2) * circleScale;

      ctx.globalAlpha = circleAlpha * _slidePos;

      ctx.fillStyle = isHover
        ? 'rgba(224, 170, 255, 0.15)'
        : 'rgba(255, 255, 255, 0.06)';
      ctx.beginPath();
      ctx.arc(ip.x, ip.y, circleR, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = isHover
        ? 'rgba(224, 170, 255, 0.3)'
        : 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.font = itemFontSize + 'px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = circleAlpha * _slidePos;
      ctx.fillText(ip.item.emoji, ip.x, ip.y);

      if (window.Items) {
        var pref = window.Items.getPreference(ip.item.id);
        if (Math.abs(pref) > 0.3) {
          var dotColor = pref > 0
            ? 'rgba(100, 255, 100, ' + (Math.abs(pref) * 0.6) + ')'
            : 'rgba(255, 100, 100, ' + (Math.abs(pref) * 0.6) + ')';
          ctx.fillStyle = dotColor;
          ctx.beginPath();
          ctx.arc(ip.x + circleR * 0.7, ip.y - circleR * 0.7, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    ctx.globalAlpha = 1;
  }

  function renderDraggedItem(ctx) {
    var G = window.GAME;

    if (_returning && _dragItem) {
      _returnT += G.deltaTime * 3;
      if (_returnT >= 1) {
        _returning = false;
        _dragItem = null;
        return;
      }
      var ease = 1 - Math.pow(1 - _returnT, 3);
      var rx = lerp(_returnFromX, _returnToX, ease);
      var ry = lerp(_returnFromY, _returnToY, ease);
      ctx.globalAlpha = 1 - ease * 0.5;
      ctx.font = Math.round(_itemSize * 0.7) + 'px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(_dragItem.emoji, rx, ry);
      ctx.globalAlpha = 1;
      return;
    }

    if (!_dragging || !_dragItem) return;

    var fontSize = Math.round(_itemSize * 0.8);

    if (window.Creature) {
      var onCreature = window.Creature.isPointInside(_dragX, _dragY);
      if (onCreature) {
        ctx.save();
        var cr = window.Creature.radius || 50;
        var glowGrad = ctx.createRadialGradient(
          window.Creature.x, window.Creature.y, cr * 0.5,
          window.Creature.x, window.Creature.y, cr * 1.5
        );
        glowGrad.addColorStop(0, 'rgba(224, 170, 255, 0.15)');
        glowGrad.addColorStop(1, 'rgba(224, 170, 255, 0)');
        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.arc(window.Creature.x, window.Creature.y, cr * 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    ctx.globalAlpha = 0.2;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(_dragX, _dragY + fontSize * 0.4, fontSize * 0.35, fontSize * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = _dragAlpha;
    ctx.font = fontSize + 'px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var bob = Math.sin(Date.now() * 0.008) * 3;
    ctx.fillText(_dragItem.emoji, _dragX, _dragY - 10 + bob);

    ctx.font = '300 ' + Math.round(G.width * 0.028) + 'px system-ui';
    ctx.fillStyle = 'rgba(224, 170, 255, 0.7)';
    ctx.fillText(_dragItem.name, _dragX, _dragY - fontSize * 0.5 - 12 + bob);

    ctx.globalAlpha = 1;
  }

  // ═══ PUBLIC API ═══

  var Menu = {

    get isOpen() { return _isOpen; },
    get isDraggingItem() { return _dragging; },
    get selectedItem() { return _dragItem; },
    get dragPosition() { return { x: _dragX, y: _dragY }; },

    init: function() {
      _isOpen = false;
      _slidePos = 0;
      _slideVel = 0;
      _activeTab = 0;
      _dragging = false;
      _dragItem = null;
      _returning = false;
      _hoverItem = null;

      recalcGeometry();
      bindInputs();

      // Bind the bottom arrow button
      _openBtn = document.getElementById('menu-open-btn');
      if (_openBtn) {
        _openBtn.addEventListener('click', function() {
          if (window.GAME.state !== 'living') return;
          Menu.toggle();
        });
      }

      if (window.Items) {
        window.Items.init();
      }

      calcItemPositions();
      updateButtonVisibility();
      console.log('[Menu] Initialized');
    },

    update: function(dt) {
      if (window.GAME.state !== 'living') return;

      var target = _isOpen ? 1 : 0;
      var diff = target - _slidePos;
      _slideVel += diff * SPRING_K * dt;
      _slideVel *= SPRING_DAMP;
      _slidePos += _slideVel * dt;
      _slidePos = clamp(_slidePos, 0, 1);

      if (Math.abs(diff) < 0.005 && Math.abs(_slideVel) < 0.01) {
        _slidePos = target;
        _slideVel = 0;
      }

      _menuY = window.GAME.height - _menuH * _slidePos;

      if (_slidePos > 0.1) {
        calcItemPositions();
      }

      if (_hoverItem) {
        _hoverTimer += dt;
      }

      if (window.Items) {
        window.Items.update(dt);
      }
    },

    render: function(ctx) {
      if (window.GAME.state !== 'living') return;

      if (_slidePos > 0.005) {
        renderMenuPanel(ctx);
      }

      renderDraggedItem(ctx);

      if (window.Items) {
        window.Items.render(ctx);
      }
    },

    open: function() {
      if (_isOpen) return;
      _isOpen = true;
      recalcGeometry();
      calcItemPositions();
      updateButtonVisibility();
      if (window.AudioSystem) window.AudioSystem.play('menu_open', { volume: 0.25 });
    },

    close: function() {
      if (!_isOpen) return;
      _isOpen = false;
      _dragging = false;
      _dragItem = null;
      _hoverItem = null;
      _returning = false;
      updateButtonVisibility();
      if (window.AudioSystem) window.AudioSystem.play('menu_close', { volume: 0.25 });
    },

    toggle: function() {
      if (_isOpen) this.close();
      else this.open();
    },

    isHandlingTouch: function(x, y) {
      if (!_isOpen) return false;
      return y >= _menuY || _dragging;
    },

    destroy: function() {
      if (window.InputSystem) {
        if (_cbSwipeUp) InputSystem.off('swipe_up', _cbSwipeUp);
        if (_cbSwipeDown) InputSystem.off('swipe_down', _cbSwipeDown);
        if (_cbTap) InputSystem.off('tap', _cbTap);
        if (_cbDown) InputSystem.off('down', _cbDown);
        if (_cbDrag) InputSystem.off('drag', _cbDrag);
        if (_cbRelease) InputSystem.off('release', _cbRelease);
      }
    }
  };

  window.Menu = Menu;
})();
