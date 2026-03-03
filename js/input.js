/**
 * ===================================================
 * InputSystem — Sistema de Input Táctil Completo
 * ===================================================
 * Gestiona touch y mouse sobre el canvas del juego.
 * Detecta: TAP, DOUBLE_TAP, HOLD, DRAG, SWIPE_UP,
 * SWIPE_DOWN, RELEASE.
 * 
 * Uso:
 *   InputSystem.init(canvas)
 *   InputSystem.on('tap', function(e) { ... })
 *   InputSystem.update(dt) // llamar cada frame
 * ===================================================
 */
(function() {
  'use strict';

  // ─────────────────────────────────────────────
  // Constantes de configuración
  // ─────────────────────────────────────────────

  /** Tiempo máximo (ms) para considerar un toque como TAP */
  const TAP_MAX_DURATION = 200;

  /** Distancia máxima (px) de movimiento permitido para un TAP */
  const TAP_MAX_DISTANCE = 12;

  /** Tiempo máximo (ms) entre dos taps para DOUBLE_TAP */
  const DOUBLE_TAP_INTERVAL = 300;

  /** Tiempo mínimo (ms) tocando sin mover para HOLD */
  const HOLD_MIN_DURATION = 500;

  /** Distancia máxima (px) de movimiento permitido durante HOLD */
  const HOLD_MAX_DISTANCE = 15;

  /** Distancia mínima (px) para considerar un SWIPE */
  const SWIPE_MIN_DISTANCE = 50;

  /** Velocidad mínima (px/s) para considerar un SWIPE */
  const SWIPE_MIN_VELOCITY = 200;

  /** Factor de suavizado para velocidad (0-1, menor = más suave) */
  const VELOCITY_SMOOTHING = 0.15;

  /** Fracción inferior de la pantalla que es "zona de menú" */
  const MENU_ZONE_RATIO = 0.15;

  // ─────────────────────────────────────────────
  // Estado interno privado
  // ─────────────────────────────────────────────
  let _canvas = null;

  /** ¿Está el dedo/ratón presionado? */
  let _isDown = false;

  /** Posición actual del dedo en coordenadas canvas (CSS px) */
  let _currentX = 0;
  let _currentY = 0;

  /** Posición donde empezó el toque */
  let _startX = 0;
  let _startY = 0;

  /** Timestamp (ms) de cuando empezó el toque */
  let _startTime = 0;

  /** Duración actual del toque (ms) */
  let _holdDuration = 0;

  /** Velocidad instantánea suavizada (px/s) */
  let _velocityX = 0;
  let _velocityY = 0;

  /** Posición del frame anterior (para calcular velocidad) */
  let _prevX = 0;
  let _prevY = 0;

  /** ¿Ya se emitió un HOLD para este toque? (evitar repetición) */
  let _holdEmitted = false;

  /** ¿El toque se ha movido lo suficiente para ser DRAG? */
  let _isDragging = false;

  /** ¿Estamos en la zona de menú? */
  let _isInMenuZone = false;

  /** Para detección de DOUBLE_TAP */
  let _lastTapTime = 0;
  let _lastTapX = 0;
  let _lastTapY = 0;

  /** Prevenir que un solo touchstart dispare mouse también */
  let _lastTouchTime = 0;

  // ─────────────────────────────────────────────
  // Sistema de callbacks
  // ─────────────────────────────────────────────

  const _listeners = {
    'tap':        [],
    'double_tap': [],
    'hold':       [],
    'drag':       [],
    'swipe_up':   [],
    'swipe_down': [],
    'release':    [],
    'down':       []
  };

  function emit(type, extra) {
    var cbs = _listeners[type];
    if (!cbs || cbs.length === 0) return;

    var event = {
      type:      type,
      x:         _currentX,
      y:         _currentY,
      startX:    _startX,
      startY:    _startY,
      velocityX: _velocityX,
      velocityY: _velocityY,
      duration:  _holdDuration,
      isInMenuZone: _isInMenuZone
    };

    if (extra) {
      for (var key in extra) {
        event[key] = extra[key];
      }
    }

    for (var i = 0; i < cbs.length; i++) {
      cbs[i](event);
    }
  }

  // ─────────────────────────────────────────────
  // Conversión de coordenadas
  // ─────────────────────────────────────────────

  function toCanvasCoords(clientX, clientY) {
    if (!_canvas) return { x: 0, y: 0 };
    var rect = _canvas.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  }

  // ─────────────────────────────────────────────
  // Utilidades
  // ─────────────────────────────────────────────

  function distance(x1, y1, x2, y2) {
    var dx = x2 - x1;
    var dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // ─────────────────────────────────────────────
  // Handlers de eventos (touch)
  // ─────────────────────────────────────────────

  function onTouchStart(e) {
    if (e.touches.length > 1) return;
    _lastTouchTime = Date.now();
    var touch = e.touches[0];
    var coords = toCanvasCoords(touch.clientX, touch.clientY);
    handlePointerDown(coords.x, coords.y);
  }

  function onTouchMove(e) {
    if (!_isDown) return;
    if (e.touches.length > 1) return;
    var touch = e.touches[0];
    var coords = toCanvasCoords(touch.clientX, touch.clientY);
    handlePointerMove(coords.x, coords.y);
  }

  function onTouchEnd(e) {
    if (!_isDown) return;
    var touch = e.changedTouches[0];
    var coords = toCanvasCoords(touch.clientX, touch.clientY);
    handlePointerUp(coords.x, coords.y);
  }

  function onTouchCancel(e) {
    if (!_isDown) return;
    handlePointerUp(_currentX, _currentY);
  }

  // ─────────────────────────────────────────────
  // Handlers de eventos (mouse)
  // ─────────────────────────────────────────────

  function onMouseDown(e) {
    if (Date.now() - _lastTouchTime < 500) return;
    if (e.button !== 0) return;
    var coords = toCanvasCoords(e.clientX, e.clientY);
    handlePointerDown(coords.x, coords.y);
  }

  function onMouseMove(e) {
    if (!_isDown) return;
    if (Date.now() - _lastTouchTime < 500) return;
    var coords = toCanvasCoords(e.clientX, e.clientY);
    handlePointerMove(coords.x, coords.y);
  }

  function onMouseUp(e) {
    if (!_isDown) return;
    if (Date.now() - _lastTouchTime < 500) return;
    var coords = toCanvasCoords(e.clientX, e.clientY);
    handlePointerUp(coords.x, coords.y);
  }

  // ─────────────────────────────────────────────
  // Lógica unificada de pointer
  // ─────────────────────────────────────────────

  function handlePointerDown(x, y) {
    _isDown = true;
    _currentX = x; _currentY = y;
    _startX = x; _startY = y;
    _prevX = x; _prevY = y;
    _startTime = Date.now();
    _holdDuration = 0;
    _holdEmitted = false;
    _isDragging = false;
    _velocityX = 0; _velocityY = 0;

    var G = window.GAME;
    _isInMenuZone = G.height > 0 && y > G.height * (1 - MENU_ZONE_RATIO);

    emit('down');
  }

  function handlePointerMove(x, y) {
    _currentX = x; _currentY = y;

    var dist = distance(_startX, _startY, x, y);
    if (!_isDragging && dist > TAP_MAX_DISTANCE) {
      _isDragging = true;
    }

    var G = window.GAME;
    _isInMenuZone = G.height > 0 && y > G.height * (1 - MENU_ZONE_RATIO);

    if (_isDragging) {
      emit('drag', {
        deltaX: x - _startX,
        deltaY: y - _startY,
        distance: dist
      });
    }
  }

  function handlePointerUp(x, y) {
    if (!_isDown) return;
    _currentX = x; _currentY = y;

    var now = Date.now();
    var duration = now - _startTime;
    var dist = distance(_startX, _startY, x, y);
    _holdDuration = duration;

    var G = window.GAME;
    _isInMenuZone = G.height > 0 && y > G.height * (1 - MENU_ZONE_RATIO);

    // SWIPE
    if (dist >= SWIPE_MIN_DISTANCE && duration > 0) {
      var speed = (dist / duration) * 1000;
      if (speed >= SWIPE_MIN_VELOCITY) {
        var dy = y - _startY;
        var dx = x - _startX;
        if (Math.abs(dy) > Math.abs(dx)) {
          if (dy < 0) {
            emit('swipe_up', { distance: dist, speed: speed });
          } else {
            emit('swipe_down', { distance: dist, speed: speed });
          }
        }
      }
    }

    // TAP
    if (duration <= TAP_MAX_DURATION && dist <= TAP_MAX_DISTANCE) {
      var timeSinceLastTap = now - _lastTapTime;
      var distFromLastTap = distance(_lastTapX, _lastTapY, x, y);

      if (timeSinceLastTap <= DOUBLE_TAP_INTERVAL && distFromLastTap < TAP_MAX_DISTANCE * 3) {
        emit('double_tap');
        _lastTapTime = 0;
      } else {
        emit('tap');
        _lastTapTime = now;
        _lastTapX = x;
        _lastTapY = y;
      }
    }

    // RELEASE
    emit('release', { distance: dist, wasDrag: _isDragging });

    _isDown = false;
    _isDragging = false;
    _holdEmitted = false;
  }

  // ─────────────────────────────────────────────
  // Prevención de comportamientos del navegador
  // ─────────────────────────────────────────────

  function preventCanvasDefaults(canvas) {
    canvas.addEventListener('touchmove', function(e) { e.preventDefault(); }, { passive: false });
    canvas.addEventListener('contextmenu', function(e) { e.preventDefault(); });
    canvas.addEventListener('selectstart', function(e) { e.preventDefault(); });
    canvas.addEventListener('dragstart', function(e) { e.preventDefault(); });
  }

  function preventGlobalDefaults() {
    document.addEventListener('gesturestart', function(e) { e.preventDefault(); }, { passive: false });
    document.addEventListener('gesturechange', function(e) { e.preventDefault(); }, { passive: false });
    document.addEventListener('gestureend', function(e) { e.preventDefault(); }, { passive: false });

    var lastTouchEnd = 0;
    document.addEventListener('touchend', function(e) {
      var now = Date.now();
      if (now - lastTouchEnd <= 300) { e.preventDefault(); }
      lastTouchEnd = now;
    }, false);

    document.addEventListener('touchmove', function(e) {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      e.preventDefault();
    }, { passive: false });

    document.addEventListener('contextmenu', function(e) { e.preventDefault(); });
  }

  // ─────────────────────────────────────────────
  // API Pública
  // ─────────────────────────────────────────────

  window.InputSystem = {

    init: function(canvas) {
      _canvas = canvas;
      canvas.addEventListener('touchstart',  onTouchStart,  { passive: true });
      canvas.addEventListener('touchmove',   onTouchMove,   { passive: true });
      canvas.addEventListener('touchend',    onTouchEnd,    { passive: true });
      canvas.addEventListener('touchcancel', onTouchCancel, { passive: true });
      canvas.addEventListener('mousedown', onMouseDown);
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup',   onMouseUp);
      preventCanvasDefaults(canvas);
      preventGlobalDefaults();
      console.log('[InputSystem] Inicializado');
    },

    update: function(dt) {
      if (!_isDown) {
        _velocityX *= 0.9;
        _velocityY *= 0.9;
        if (Math.abs(_velocityX) < 0.1) _velocityX = 0;
        if (Math.abs(_velocityY) < 0.1) _velocityY = 0;
        return;
      }

      _holdDuration = Date.now() - _startTime;

      if (dt > 0) {
        var rawVX = (_currentX - _prevX) / dt;
        var rawVY = (_currentY - _prevY) / dt;
        _velocityX += (rawVX - _velocityX) * VELOCITY_SMOOTHING;
        _velocityY += (rawVY - _velocityY) * VELOCITY_SMOOTHING;
      }

      _prevX = _currentX;
      _prevY = _currentY;

      if (!_holdEmitted && !_isDragging) {
        var dist = distance(_startX, _startY, _currentX, _currentY);
        if (_holdDuration >= HOLD_MIN_DURATION && dist <= HOLD_MAX_DISTANCE) {
          _holdEmitted = true;
          emit('hold');
        }
      }
    },

    on: function(eventType, callback) {
      if (!_listeners[eventType]) {
        console.warn('[InputSystem] Tipo de evento desconocido:', eventType);
        _listeners[eventType] = [];
      }
      _listeners[eventType].push(callback);
    },

    off: function(eventType, callback) {
      var cbs = _listeners[eventType];
      if (!cbs) return;
      var idx = cbs.indexOf(callback);
      if (idx !== -1) cbs.splice(idx, 1);
    },

    getPosition: function() {
      return { x: _currentX, y: _currentY };
    },

    isDown: function() {
      return _isDown;
    },

    getVelocity: function() {
      return { x: _velocityX, y: _velocityY };
    },

    getHoldDuration: function() {
      return _isDown ? _holdDuration : 0;
    },

    get isInMenuZone() {
      return _isInMenuZone;
    },

    destroy: function() {
      if (_canvas) {
        _canvas.removeEventListener('touchstart',  onTouchStart);
        _canvas.removeEventListener('touchmove',   onTouchMove);
        _canvas.removeEventListener('touchend',    onTouchEnd);
        _canvas.removeEventListener('touchcancel', onTouchCancel);
        _canvas.removeEventListener('mousedown',   onMouseDown);
      }
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup',   onMouseUp);
      for (var type in _listeners) { _listeners[type].length = 0; }
      _canvas = null;
      _isDown = false;
    }
  };

})();
