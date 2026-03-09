/**
 * CompanionEngine — a small creature the fairy finds after many sessions
 * It mirrors how the player treated the fairy
 */

const KEY = 'fairy_companion';

interface CompanionData {
  found: boolean;
  foundAt: number;
  name: string;
  hue: number;           // color based on personality
  bondLevel: number;     // 0..1 — how close it is to fairy
  playerStyle: string;   // inherited from fairy's experience
  x: number; y: number;  // normalized position
  orbitAngle: number;
}

export class CompanionEngine {
  private data: CompanionData;
  private orbitAngle = 0;
  private bobPhase = 0;
  private visible = false;

  constructor() {
    const raw = localStorage.getItem(KEY);
    this.data = raw ? JSON.parse(raw) : {
      found: false,
      foundAt: 0,
      name: '',
      hue: 280,
      bondLevel: 0.5,
      playerStyle: 'gentle',
      x: 0.5, y: 0.5,
      orbitAngle: 0,
    };
    this.orbitAngle = this.data.orbitAngle;
  }

  private save() { localStorage.setItem(KEY, JSON.stringify(this.data)); }

  checkForAppearance(totalSessions: number, personalityType: string, interactionStyle: string) {
    if (this.data.found) return;
    if (totalSessions < 7) return;

    // After 7+ sessions, the companion appears
    this.data.found = true;
    this.data.foundAt = Date.now();
    this.data.playerStyle = interactionStyle;

    // Hue based on personality
    const hues: Record<string, number> = {
      affectionate: 320,  // pink
      curious: 200,       // teal
      sarcastic: 160,     // mint
      independent: 40,    // amber
      clingy: 300,        // magenta
      distant: 220,       // blue
    };
    this.data.hue = hues[personalityType] ?? 280;

    // Bond level based on interaction style
    const bonds: Record<string, number> = {
      gentle: 0.9,
      patient: 0.85,
      mixed: 0.6,
      playful: 0.7,
      nervous: 0.5,
    };
    this.data.bondLevel = bonds[interactionStyle] ?? 0.6;
    this.data.x = 0.45 + Math.random() * 0.1;
    this.data.y = 0.45 + Math.random() * 0.1;
    this.save();
  }

  isFound() { return this.data.found; }
  isVisible() { return this.visible; }

  getFoundMessage(): string {
    const style = this.data.playerStyle;
    if (style === 'gentle' || style === 'patient') {
      return 'Encontré algo. Es pequeño. Tímido. Se parece a cómo me tratás a mí.';
    } else if (style === 'playful') {
      return 'Hay algo acá. Inquieto. Juguetón. No sé de dónde salió.';
    } else if (style === 'nervous') {
      return 'Había algo escondido. Salió solo. Es cauteloso.';
    }
    return 'Encontré algo. No sé qué es todavía.';
  }

  update(dt: number, fairyX: number, fairyY: number, w: number, h: number) {
    if (!this.data.found) return;
    this.visible = true;

    this.bobPhase += 0.02 * dt;

    const bond = this.data.bondLevel;
    const orbitSpeed = 0.008 + bond * 0.004;
    this.orbitAngle += orbitSpeed * dt;

    // Orbit radius depends on bond level (higher bond = closer)
    const maxOrbit = 120;
    const minOrbit = 35;
    const orbitR = minOrbit + (1 - bond) * (maxOrbit - minOrbit);

    // Companion position = fairy position + orbit offset
    const cx = fairyX + Math.cos(this.orbitAngle) * orbitR;
    const cy = fairyY + Math.sin(this.orbitAngle) * orbitR * 0.6 + Math.sin(this.bobPhase) * 5;

    // Clamp to screen
    this.data.x = Math.max(0, Math.min(1, cx / w));
    this.data.y = Math.max(0, Math.min(1, cy / h));
    this.data.orbitAngle = this.orbitAngle;
  }

  getPosition(w: number, h: number): { x: number; y: number } {
    return { x: this.data.x * w, y: this.data.y * h };
  }

  getHue() { return this.data.hue; }
  getBondLevel() { return this.data.bondLevel; }
  getBobPhase() { return this.bobPhase; }
  getPlayerStyle() { return this.data.playerStyle; }
}
