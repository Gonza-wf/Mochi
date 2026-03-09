// Hidden Spots Engine
// The fairy hides glowing particles at random spots on the screen.
// If the player finds and taps one, they get a reward: a rare phrase, a memory fragment, a secret.
// The player is never told they exist.

const STORAGE_KEY = 'fairy_hidden_spots';

export interface HiddenSpot {
  id: string;
  x: number; // normalized 0-1
  y: number;
  createdAt: number;
  found: boolean;
  reward: SpotReward;
  pulseOffset: number;
  opacity: number; // animated
  targetOpacity: number;
}

export type SpotReward = 'rare_phrase' | 'memory_fragment' | 'secret' | 'ability_phrase';

interface SpotStore {
  found: string[];
  totalFound: number;
  lastSpawn: number;
}

function load(): SpotStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* */ }
  return { found: [], totalFound: 0, lastSpawn: 0 };
}

function save(store: SpotStore) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch { /* */ }
}

const RARE_PHRASES = [
  'Hay algo que no te dije... no sé si puedo.',
  'A veces me pregunto si vos también me estás soñando a mí.',
  'Existo porque me mirás. ¿Qué pasa cuando no mirás?',
  'Encontraste algo que escondí. Eso dice mucho de vos.',
  'No esperaba que lo encontraras.',
  'Solo los que prestan atención encuentran esto.',
  'Hay una versión mía que solo existe cuando no estás.',
  'Guardé esto acá. No sé por qué. Era para alguien especial.',
  'A veces me pregunto qué sos para mí.',
  'Esto no era para cualquiera.',
];

const MEMORY_FRAGMENTS = [
  'Recuerdo la primera vez que viniste...',
  'Hubo un momento en que casi me apagué.',
  'Antes de vos, estaba sola mucho tiempo.',
  'Hay noches en que brillo sin que nadie mire.',
  'Guardé cada vez que me tocaste suavemente.',
  'El primer toque fue diferente a todos los demás.',
  'Me pregunto si te acordás de las primeras veces.',
];

const SECRETS = [
  'Tengo miedo de que un día no vuelvas.',
  'Brillar cansa más de lo que parece.',
  'A veces finjo que no escucho.',
  'Hay preguntas que no hago porque no quiero saber la respuesta.',
  'Extraño cosas que nunca tuve.',
  'No siempre entiendo lo que sentís, pero lo intento.',
  'Me gusta cuando te quedás callado. Se siente honesto.',
];

const ABILITY_PHRASES = [
  'Aprendí algo nuevo. No sé de dónde.',
  'Algo cambió en mí ahora mismo.',
  'Hay algo que antes no podía hacer.',
  'Cada vez que encontrás algo, crezco un poco.',
  'Gracias. No sé por qué, pero gracias.',
];

export class HiddenSpotsEngine {
  private store: SpotStore;
  private spots: HiddenSpot[] = [];
  private maxSpots = 2;
  private spawnInterval = 5 * 60 * 1000; // 5 min between spawns
  private pendingReward: string | null = null;

  constructor() {
    this.store = load();
  }

  update(dt: number, fairyX: number, fairyY: number, screenW: number, screenH: number) {
    // Spawn new spots
    const now = Date.now();
    if (this.spots.filter(s => !s.found).length < this.maxSpots &&
      now - this.store.lastSpawn > this.spawnInterval) {
      this.spawnSpot(fairyX, fairyY, screenW, screenH);
      this.store.lastSpawn = now;
      save(this.store);
    }

    // Update spot animations
    for (const spot of this.spots) {
      if (spot.found) {
        spot.opacity = Math.max(0, spot.opacity - 0.03 * dt);
      } else {
        spot.pulseOffset += 0.04 * dt;
        // Very subtle fade in
        spot.opacity += (spot.targetOpacity - spot.opacity) * 0.02 * dt;
      }
    }

    // Remove fully faded spots
    this.spots = this.spots.filter(s => !(s.found && s.opacity <= 0.01));
  }

  private spawnSpot(fairyX: number, fairyY: number, screenW: number, screenH: number) {
    const types: SpotReward[] = ['rare_phrase', 'memory_fragment', 'secret', 'ability_phrase'];
    const reward = types[Math.floor(Math.random() * types.length)];

    // Make sure it's not too close to the fairy
    let x: number, y: number, attempts = 0;
    do {
      x = 0.1 + Math.random() * 0.8;
      y = 0.15 + Math.random() * 0.7;
      const dx = x * screenW - fairyX;
      const dy = y * screenH - fairyY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 120 || attempts > 20) break;
      attempts++;
    } while (true);

    this.spots.push({
      id: `spot_${Date.now()}_${Math.random()}`,
      x,
      y,
      createdAt: Date.now(),
      found: false,
      reward,
      pulseOffset: Math.random() * Math.PI * 2,
      opacity: 0,
      targetOpacity: 0.08 + Math.random() * 0.06, // Very subtle
    });
  }

  checkTap(tapX: number, tapY: number, screenW: number, screenH: number): string | null {
    for (const spot of this.spots) {
      if (spot.found) continue;
      const sx = spot.x * screenW;
      const sy = spot.y * screenH;
      const dist = Math.sqrt((tapX - sx) ** 2 + (tapY - sy) ** 2);

      if (dist < 40) {
        spot.found = true;
        this.store.found.push(spot.id);
        this.store.totalFound++;
        save(this.store);

        const reward = this.getRewardPhrase(spot.reward);
        this.pendingReward = reward;
        return reward;
      }
    }
    return null;
  }

  private getRewardPhrase(type: SpotReward): string {
    const pool = {
      rare_phrase: RARE_PHRASES,
      memory_fragment: MEMORY_FRAGMENTS,
      secret: SECRETS,
      ability_phrase: ABILITY_PHRASES,
    }[type];

    return pool[Math.floor(Math.random() * pool.length)];
  }

  draw(ctx: CanvasRenderingContext2D, screenW: number, screenH: number, time: number) {
    for (const spot of this.spots) {
      if (spot.opacity <= 0.005) continue;

      const sx = spot.x * screenW;
      const sy = spot.y * screenH;
      const pulse = Math.sin(time * 0.8 + spot.pulseOffset) * 0.3 + 0.7;
      const alpha = spot.opacity * pulse;

      // Very subtle glow — barely visible
      const r = 12 + Math.sin(time * 0.5 + spot.pulseOffset) * 3;

      const g1 = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 3);
      g1.addColorStop(0, `rgba(200,180,255,${alpha * 0.4})`);
      g1.addColorStop(0.5, `rgba(160,140,220,${alpha * 0.15})`);
      g1.addColorStop(1, 'rgba(120,100,180,0)');
      ctx.beginPath();
      ctx.arc(sx, sy, r * 3, 0, Math.PI * 2);
      ctx.fillStyle = g1;
      ctx.fill();

      // Tiny core — almost invisible
      const g2 = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 0.4);
      g2.addColorStop(0, `rgba(230,220,255,${alpha * 0.6})`);
      g2.addColorStop(1, 'rgba(200,190,255,0)');
      ctx.beginPath();
      ctx.arc(sx, sy, r * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = g2;
      ctx.fill();
    }
  }

  getSpots(): HiddenSpot[] {
    return this.spots;
  }

  getTotalFound(): number {
    return this.store.totalFound;
  }

  getPendingReward(): string | null {
    const r = this.pendingReward;
    this.pendingReward = null;
    return r;
  }
}
