// --- Gesture Engine ---
// Detects different touch gestures and maps them to interactions.
// Only fires touch events if the touch is near the fairy.
// Hold = comfort, rapid taps = play, single tap = greet, swipe = explore

export type GestureType = 'tap' | 'hold' | 'rapid_tap' | 'swipe' | 'drag' | 'none';

export interface GestureCallbacks {
  onTap: (x: number, y: number) => void;
  onHold: (durationMs: number) => void;
  onRapidTap: (count: number) => void;
  onSwipe: (direction: string) => void;
  onDragStart: () => void;
  onDragMove: (x: number, y: number) => void;
  onDragEnd: () => void;
}

// Radius around the fairy that counts as "touching it"
const FAIRY_HIT_RADIUS = 80; // px — generous for mobile fingers

export class GestureEngine {
  private startX = 0;
  private startY = 0;
  private startTime = 0;
  private lastTapTime = 0;
  private tapCount = 0;
  private tapTimer: ReturnType<typeof setTimeout> | null = null;
  private holdTimer: ReturnType<typeof setTimeout> | null = null;
  private isHolding = false;
  private holdStartTime = 0;
  private isDragging = false;
  private hasMoved = false;
  private isActive = false;
  private currentX = 0;
  private currentY = 0;
  private callbacks: GestureCallbacks;
  private lastGesture: GestureType = 'none';
  private holdPulseInterval: ReturnType<typeof setInterval> | null = null;

  // Current fairy position — updated each frame from App.tsx
  private fairyX = 0;
  private fairyY = 0;

  // Was the touch start near the fairy?
  private touchedFairy = false;

  private sessionStats = {
    taps: 0,
    holds: 0,
    holdTotalMs: 0,
    rapidTaps: 0,
    swipes: 0,
    drags: 0,
    maxHoldMs: 0,
    avgTapInterval: 0,
    tapIntervals: [] as number[],
  };

  constructor(callbacks: GestureCallbacks) {
    this.callbacks = callbacks;
  }

  /** Call this every frame to keep the fairy position updated */
  setFairyPosition(x: number, y: number) {
    this.fairyX = x;
    this.fairyY = y;
  }

  isNearFairy(x: number, y: number): boolean {
    const dx = x - this.fairyX;
    const dy = y - this.fairyY;
    return Math.sqrt(dx * dx + dy * dy) <= FAIRY_HIT_RADIUS;
  }

  getLastGesture(): GestureType { return this.lastGesture; }
  getSessionStats() { return { ...this.sessionStats }; }

  getInteractionStyle(): 'gentle' | 'playful' | 'nervous' | 'patient' | 'mixed' {
    const s = this.sessionStats;
    const totalGestures = s.taps + s.holds + s.rapidTaps + s.swipes;
    if (totalGestures < 3) return 'mixed';
    const holdRatio = s.holds / Math.max(totalGestures, 1);
    const rapidRatio = s.rapidTaps / Math.max(totalGestures, 1);
    const swipeRatio = s.swipes / Math.max(totalGestures, 1);
    if (holdRatio > 0.4 && s.avgTapInterval > 2000) return 'patient';
    if (holdRatio > 0.3) return 'gentle';
    if (rapidRatio > 0.3 || swipeRatio > 0.3) return 'playful';
    if (s.avgTapInterval < 500 && s.tapIntervals.length > 3) return 'nervous';
    return 'mixed';
  }

  onTouchStart(x: number, y: number) {
    // Check if touch is near the fairy
    this.touchedFairy = this.isNearFairy(x, y);

    this.isActive = true;
    this.startX = x;
    this.startY = y;
    this.currentX = x;
    this.currentY = y;
    this.startTime = Date.now();
    this.hasMoved = false;
    this.isDragging = false;
    this.isHolding = false;

    // Only start hold detection if touching the fairy
    if (!this.touchedFairy) return;

    this.holdTimer = setTimeout(() => {
      if (this.isActive && !this.hasMoved) {
        this.isHolding = true;
        this.holdStartTime = Date.now();
        this.lastGesture = 'hold';
        this.holdPulseInterval = setInterval(() => {
          if (this.isHolding) {
            const holdDuration = Date.now() - this.holdStartTime;
            this.callbacks.onHold(holdDuration);
          }
        }, 500);
      }
    }, 600);
  }

  onTouchMove(x: number, y: number) {
    if (!this.isActive) return;

    const dx = x - this.startX;
    const dy = y - this.startY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    this.currentX = x;
    this.currentY = y;

    if (dist > 15) {
      this.hasMoved = true;

      if (this.holdTimer) { clearTimeout(this.holdTimer); this.holdTimer = null; }
      if (this.isHolding) {
        this.isHolding = false;
        if (this.holdPulseInterval) { clearInterval(this.holdPulseInterval); this.holdPulseInterval = null; }
      }

      // Only start drag if we started near the fairy
      if (!this.isDragging && this.touchedFairy) {
        this.isDragging = true;
        this.lastGesture = 'drag';
        this.callbacks.onDragStart();
      }

      if (this.isDragging) this.callbacks.onDragMove(x, y);
    }
  }

  onTouchEnd() {
    if (!this.isActive) return;
    this.isActive = false;

    const endTime = Date.now();
    const duration = endTime - this.startTime;
    const dx = this.currentX - this.startX;
    const dy = this.currentY - this.startY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (this.holdTimer) { clearTimeout(this.holdTimer); this.holdTimer = null; }
    if (this.holdPulseInterval) { clearInterval(this.holdPulseInterval); this.holdPulseInterval = null; }

    // Hold end — only if we started near the fairy
    if (this.isHolding && this.touchedFairy) {
      const holdDuration = endTime - this.holdStartTime;
      this.sessionStats.holds++;
      this.sessionStats.holdTotalMs += holdDuration;
      this.sessionStats.maxHoldMs = Math.max(this.sessionStats.maxHoldMs, holdDuration);
      this.callbacks.onHold(holdDuration);
      this.isHolding = false;
      // Do NOT call onDragEnd for holds — that resets fairy movement state incorrectly
      return;
    }

    // Drag end
    if (this.isDragging) {
      this.isDragging = false;
      this.callbacks.onDragEnd();
      const velocity = dist / Math.max(duration, 1);
      if (dist > 80 && velocity > 0.3) {
        const angle = Math.atan2(dy, dx);
        let direction: string;
        if (angle > -Math.PI / 4 && angle <= Math.PI / 4) direction = 'right';
        else if (angle > Math.PI / 4 && angle <= 3 * Math.PI / 4) direction = 'down';
        else if (angle > -3 * Math.PI / 4 && angle <= -Math.PI / 4) direction = 'up';
        else direction = 'left';
        this.lastGesture = 'swipe';
        this.sessionStats.swipes++;
        this.callbacks.onSwipe(direction);
      } else {
        this.sessionStats.drags++;
      }
      return;
    }

    // Tap — only if we started near the fairy
    if (!this.touchedFairy) return;

    if (!this.hasMoved && duration < 600) {
      const timeSinceLastTap = endTime - this.lastTapTime;

      if (timeSinceLastTap < 400 && this.lastTapTime > 0) {
        this.tapCount++;
        if (this.tapTimer) clearTimeout(this.tapTimer);
        this.tapTimer = setTimeout(() => {
          if (this.tapCount >= 2) {
            this.lastGesture = 'rapid_tap';
            this.sessionStats.rapidTaps++;
            this.callbacks.onRapidTap(this.tapCount);
          }
          this.tapCount = 0;
        }, 350);
      } else {
        this.tapCount = 1;
        if (this.tapTimer) clearTimeout(this.tapTimer);
        this.tapTimer = setTimeout(() => {
          if (this.tapCount === 1) {
            this.lastGesture = 'tap';
            this.sessionStats.taps++;
            this.callbacks.onTap(this.currentX, this.currentY);
          }
          this.tapCount = 0;
        }, 350);
      }

      if (this.lastTapTime > 0) {
        this.sessionStats.tapIntervals.push(timeSinceLastTap);
        if (this.sessionStats.tapIntervals.length > 20) this.sessionStats.tapIntervals.shift();
        const sum = this.sessionStats.tapIntervals.reduce((a, b) => a + b, 0);
        this.sessionStats.avgTapInterval = sum / this.sessionStats.tapIntervals.length;
      }

      this.lastTapTime = endTime;
    }
  }

  destroy() {
    if (this.holdTimer) clearTimeout(this.holdTimer);
    if (this.tapTimer) clearTimeout(this.tapTimer);
    if (this.holdPulseInterval) clearInterval(this.holdPulseInterval);
  }
}
