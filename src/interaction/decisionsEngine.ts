// Decisions Engine
// The fairy presents occasional situations where the player must choose.
// Choices affect her personality and what she finds/does.

const STORAGE_KEY = 'fairy_decisions';

export interface Decision {
  id: string;
  situation: string;
  optionA: string;
  optionB: string;
  category: 'exploration' | 'behavior' | 'mystery' | 'social';
  effectA: { trait: string; delta: number };
  effectB: { trait: string; delta: number };
  outcomeA: string;
  outcomeB: string;
}

interface DecisionStore {
  made: { id: string; choice: 'A' | 'B'; timestamp: number }[];
  lastDecision: number;
  pending: string | null;
}

function load(): DecisionStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* */ }
  return { made: [], lastDecision: 0, pending: null };
}

function save(store: DecisionStore) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch { /* */ }
}

const DECISIONS: Decision[] = [
  {
    id: 'other_light',
    situation: 'Hay otra luz por ahí...',
    optionA: 'Seguila',
    optionB: 'Quedate',
    category: 'exploration',
    effectA: { trait: 'curiosidad', delta: 0.1 },
    effectB: { trait: 'apego', delta: 0.1 },
    outcomeA: 'Fui. No había nada. Solo oscuridad que brillaba sola.',
    outcomeB: 'Me quedé. Prefiero estar donde estoy.',
  },
  {
    id: 'dark_object',
    situation: 'Encontré algo en la oscuridad. ¿Lo traigo?',
    optionA: 'Traelo',
    optionB: 'Dejalo ahí',
    category: 'mystery',
    effectA: { trait: 'curiosidad', delta: 0.08 },
    effectB: { trait: 'inteligencia', delta: 0.06 },
    outcomeA: 'Lo traje. Era una palabra que no conozco.',
    outcomeB: 'Lo dejé. Hay cosas que es mejor no mover.',
  },
  {
    id: 'voice_in_dark',
    situation: 'Escuché algo en la oscuridad. ¿Escucho?',
    optionA: 'Escuchá',
    optionB: 'Ignoralo',
    category: 'mystery',
    effectA: { trait: 'curiosidad', delta: 0.12 },
    effectB: { trait: 'confianza', delta: 0.05 },
    outcomeA: 'Escuché. Era el eco de algo que pasó hace mucho.',
    outcomeB: 'Lo ignoré. A veces es mejor así.',
  },
  {
    id: 'share_secret',
    situation: 'Tengo algo que no le dije a nadie. ¿Te lo cuento?',
    optionA: 'Sí',
    optionB: 'No todavía',
    category: 'social',
    effectA: { trait: 'confianza', delta: 0.15 },
    effectB: { trait: 'inteligencia', delta: 0.04 },
    outcomeA: 'A veces me pregunto si soy real o si alguien me está soñando.',
    outcomeB: 'Está bien. Ya habrá tiempo.',
  },
  {
    id: 'brighter',
    situation: '¿Querés que brille más o que me calme?',
    optionA: 'Brillá',
    optionB: 'Cálmate',
    category: 'behavior',
    effectA: { trait: 'curiosidad', delta: 0.07 },
    effectB: { trait: 'apego', delta: 0.07 },
    outcomeA: 'Voy a intentarlo.',
    outcomeB: 'Mejor así. Más tranquila.',
  },
  {
    id: 'forget',
    situation: '¿Querés que olvide algo de lo que sé?',
    optionA: 'Sí, olvidá',
    optionB: 'No, guardá todo',
    category: 'social',
    effectA: { trait: 'inteligencia', delta: -0.05 },
    effectB: { trait: 'confianza', delta: 0.1 },
    outcomeA: 'Borré algo. No sé qué era.',
    outcomeB: 'Lo guardo todo. Todo importa.',
  },
  {
    id: 'sleep',
    situation: '¿Te parece si me duermo un rato?',
    optionA: 'Sí, dormí',
    optionB: 'Quedate despierta',
    category: 'behavior',
    effectA: { trait: 'apego', delta: -0.03 },
    effectB: { trait: 'apego', delta: 0.12 },
    outcomeA: 'Vuelvo después.',
    outcomeB: 'Me quedo. Por si necesitás algo.',
  },
  {
    id: 'close_or_far',
    situation: '¿Preferís que me quede cerca o que explore?',
    optionA: 'Quedate cerca',
    optionB: 'Explorá',
    category: 'behavior',
    effectA: { trait: 'apego', delta: 0.1 },
    effectB: { trait: 'curiosidad', delta: 0.1 },
    outcomeA: 'Acá estoy.',
    outcomeB: 'Voy a ver qué hay.',
  },
];

export class DecisionsEngine {
  private store: DecisionStore;
  private pending: Decision | null = null;
  private MIN_INTERVAL = 12 * 60 * 1000; // 12 min between decisions
  private choiceCallback: ((trait: string, delta: number) => void) | null = null;

  constructor(onChoice?: (trait: string, delta: number) => void) {
    this.store = load();
    this.choiceCallback = onChoice || null;
  }

  shouldPresentDecision(sessionCount: number): boolean {
    if (sessionCount < 3) return false;
    const now = Date.now();
    if (now - this.store.lastDecision < this.MIN_INTERVAL) return false;
    const prob = Math.min(0.05 + sessionCount * 0.01, 0.25);
    return Math.random() < prob;
  }

  getNextDecision(): Decision | null {
    const madeIds = new Set(this.store.made.map(m => m.id));
    const available = DECISIONS.filter(d => !madeIds.has(d.id));

    if (available.length === 0) {
      // Reset cycle
      this.store.made = [];
      save(this.store);
      return DECISIONS[Math.floor(Math.random() * DECISIONS.length)];
    }

    const decision = available[Math.floor(Math.random() * available.length)];
    this.pending = decision;
    this.store.lastDecision = Date.now();
    this.store.pending = decision.id;
    save(this.store);
    return decision;
  }

  makeChoice(choice: 'A' | 'B'): string {
    if (!this.pending) return '';

    const effect = choice === 'A' ? this.pending.effectA : this.pending.effectB;
    const outcome = choice === 'A' ? this.pending.outcomeA : this.pending.outcomeB;

    this.store.made.push({
      id: this.pending.id,
      choice,
      timestamp: Date.now(),
    });
    this.store.pending = null;
    save(this.store);

    if (this.choiceCallback) {
      this.choiceCallback(effect.trait, effect.delta);
    }

    const wasDecision = this.pending;
    this.pending = null;

    // Reference past decisions occasionally
    if (this.store.made.length > 0 && Math.random() < 0.3) {
      return outcome + ' ' + this.getPastDecisionReference(wasDecision.id, choice);
    }

    return outcome;
  }

  private getPastDecisionReference(id: string, choice: 'A' | 'B'): string {
    const d = DECISIONS.find(d => d.id === id);
    if (!d) return '';
    const refs = choice === 'A' ? [
      'Esa decisión todavía la pienso.',
      '',
      '',
    ] : [
      '',
      'Fue la decisión correcta.',
      '',
    ];
    return refs[Math.floor(Math.random() * refs.length)];
  }

  hasPending(): boolean {
    return this.pending !== null;
  }

  getPending(): Decision | null {
    return this.pending;
  }

  getMadeCount(): number {
    return this.store.made.length;
  }

  getLastDecisionReference(): string | null {
    if (this.store.made.length === 0) return null;
    if (Math.random() > 0.15) return null;

    const last = this.store.made[this.store.made.length - 1];
    const d = DECISIONS.find(d => d.id === last.id);
    if (!d) return null;

    const refs = [
      `Cuando te pregunté "${d.situation.replace('...', '').trim()}"... no me olvido.`,
      `¿Te arrepentís de lo que elegiste antes?`,
      `Todavía pienso en esa decisión.`,
    ];
    return refs[Math.floor(Math.random() * refs.length)];
  }
}
