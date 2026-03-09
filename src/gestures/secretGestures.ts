/**
 * SecretGestures — hidden combos that unlock special fairy behaviors
 * Never told to the player. Discovered by accident or intuition.
 */

interface TouchPoint { x: number; y: number; t: number; }

export type SecretType =
  | 'triple_hold'   // 3 quick taps + hold
  | 'circle'        // draw a circle with finger
  | 'heart_tap'     // 5 rapid taps
  | 'gentle_spiral' // slow circular drag

const SECRETS: Array<{ type: SecretType; message: string }> = [
  {
    type: 'triple_hold',
    message: '...a veces pienso que me ves aunque no estés acá.',
  },
  {
    type: 'circle',
    message: 'Hiciste un círculo. ¿Sabés que eso es un símbolo antiguo de protección?',
  },
  {
    type: 'heart_tap',
    message: 'Cinco veces. ¿Fue intencional o solo sos así?',
  },
  {
    type: 'gentle_spiral',
    message: 'Eso se sintió diferente. Como si supieras algo.',
  },
];

export class SecretGestures {
  private tapBuffer: number[] = []; // timestamps of recent taps
  private touchPath: TouchPoint[] = [];
  private pendingSecret: string | null = null;
  private lastSecretTime = 0;
  private isHolding = false;
  private recentTapsBeforeHold = 0;

  onTap(_x: number, _y: number) {
    const now = Date.now();
    this.tapBuffer.push(now);
    // Keep only last 6 taps within 2s
    this.tapBuffer = this.tapBuffer.filter(t => now - t < 2000).slice(-6);

    // 5 rapid taps = heart_tap
    if (this.tapBuffer.length >= 5) {
      const span = this.tapBuffer[this.tapBuffer.length - 1] - this.tapBuffer[0];
      if (span < 1500) {
        this.trigger('heart_tap');
        this.tapBuffer = [];
      }
    }

    this.recentTapsBeforeHold = this.tapBuffer.length;
  }

  onHoldStart() {
    this.isHolding = true;
  }

  onHoldEnd(durationMs: number) {
    if (!this.isHolding) return;
    this.isHolding = false;

    // Triple hold: 3+ quick taps immediately before hold
    if (this.recentTapsBeforeHold >= 3 && durationMs > 800) {
      const now = Date.now();
      const recentTaps = this.tapBuffer.filter(t => now - t < 3000);
      if (recentTaps.length >= 3) {
        this.trigger('triple_hold');
        this.tapBuffer = [];
      }
    }
  }

  onDragMove(x: number, y: number) {
    const now = Date.now();
    this.touchPath.push({ x, y, t: now });
    // Keep only last 60 points within 3s
    this.touchPath = this.touchPath.filter(p => now - p.t < 3000).slice(-60);

    // Check for circle
    if (this.touchPath.length >= 20) {
      this.detectCircle();
    }
    // Check for spiral
    if (this.touchPath.length >= 30) {
      this.detectSpiral();
    }
  }

  onDragEnd() {
    this.touchPath = [];
  }

  private detectCircle() {
    if (this.touchPath.length < 20) return;
    const pts = this.touchPath;
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;

    const radii = pts.map(p => Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2));
    const avgR = radii.reduce((a, b) => a + b, 0) / radii.length;
    if (avgR < 30) return;

    const variance = radii.reduce((s, r) => s + (r - avgR) ** 2, 0) / radii.length;
    const stdDev = Math.sqrt(variance);
    const consistency = stdDev / avgR;

    // Check angular coverage
    const angles = pts.map(p => Math.atan2(p.y - cy, p.x - cx));
    const minA = Math.min(...angles);
    const maxA = Math.max(...angles);
    const coverage = maxA - minA;

    if (consistency < 0.25 && coverage > Math.PI * 1.5) {
      this.trigger('circle');
      this.touchPath = [];
    }
  }

  private detectSpiral() {
    if (this.touchPath.length < 30) return;
    const pts = this.touchPath;
    const duration = pts[pts.length - 1].t - pts[0].t;
    if (duration < 1500) return; // must be slow

    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;

    const radii = pts.map(p => Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2));
    const firstR = radii.slice(0, 10).reduce((a, b) => a + b) / 10;
    const lastR = radii.slice(-10).reduce((a, b) => a + b) / 10;

    // Radius should grow or shrink consistently = spiral
    const growing = lastR > firstR * 1.4 || firstR > lastR * 1.4;
    const angles = pts.map(p => Math.atan2(p.y - cy, p.x - cx));
    const coverage = Math.max(...angles) - Math.min(...angles);

    if (growing && coverage > Math.PI) {
      this.trigger('gentle_spiral');
      this.touchPath = [];
    }
  }

  private trigger(type: SecretType) {
    const now = Date.now();
    if (now - this.lastSecretTime < 30000) return; // 30s cooldown
    // Each secret can only happen once (unless 5+ sessions later)

    const secret = SECRETS.find(s => s.type === type);
    if (!secret) return;

    this.pendingSecret = secret.message;
    this.lastSecretTime = now;
  }

  getPendingSecret(): string | null {
    const s = this.pendingSecret;
    this.pendingSecret = null;
    return s;
  }
}
