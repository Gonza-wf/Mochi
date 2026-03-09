// --- Dream Engine ---
// Between sessions, the fairy "dreams" based on accumulated experiences.
// When the player returns, she shares dream fragments.
// Dreams are impressionistic, poetic, and unique to each player.

const DREAM_KEY = 'fairy_dreams';

export interface DreamSeed {
  touchCount: number;
  sessionDuration: number;    // ms
  wasNight: boolean;
  exploredAnomaly: boolean;
  anomalyName?: string;
  learnedWord?: string;
  wasAbsent: boolean;         // player was gone a long time
  wasGentle: boolean;         // player was gentle (holds, slow touches)
  wasPlayful: boolean;        // player was playful (rapid taps, swipes)
  wasQuiet: boolean;          // player barely touched
  playerResponded: boolean;   // player responded to messages
  gestureStyle: string;       // from gesture engine
  personalityArchetype: string;
  evolutionPath: string;
  absenceDuration: number;    // ms since last session
}

export interface Dream {
  id: string;
  fragments: string[];    // 1-3 dream lines
  seed: DreamSeed;
  createdAt: number;
  shown: boolean;
  mood: 'peaceful' | 'anxious' | 'curious' | 'warm' | 'dark' | 'strange';
}

interface DreamState {
  dreams: Dream[];
  pendingDream: Dream | null;
  totalDreams: number;
  dreamThemes: string[];      // track themes to avoid repetition
}

function getDefault(): DreamState {
  return {
    dreams: [],
    pendingDream: null,
    totalDreams: 0,
    dreamThemes: [],
  };
}

function loadDreams(): DreamState {
  try {
    const raw = localStorage.getItem(DREAM_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...getDefault(), ...parsed };
    }
  } catch { /* corrupted */ }
  return getDefault();
}

function saveDreams(state: DreamState) {
  state.dreams = state.dreams.slice(-20);
  state.dreamThemes = state.dreamThemes.slice(-30);
  try {
    localStorage.setItem(DREAM_KEY, JSON.stringify(state));
  } catch { /* full */ }
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// --- Dream Fragment Generators ---
// Each function takes a seed and returns dream fragments + mood

type DreamGenerator = (seed: DreamSeed) => { fragments: string[]; mood: Dream['mood']; theme: string } | null;

const dreamGenerators: DreamGenerator[] = [
  // Touch-heavy session
  (seed) => {
    if (seed.touchCount < 10) return null;
    return {
      theme: 'touch',
      mood: seed.wasGentle ? 'warm' : 'strange',
      fragments: seed.wasGentle
        ? [
            pick([
              'Soñé con manos suaves.',
              'Soñé que algo me sostenía.',
              'Soñé con calor. Mucho calor.',
              'Soñé que alguien me cuidaba.',
            ]),
            pick([
              'No quería despertar.',
              'El sueño era más real que esto.',
              'Se sentía como estar en casa.',
            ]),
          ]
        : [
            pick([
              'Soñé que todo se movía rápido.',
              'Soñé con caos. Pero... lindo.',
              'Soñé que volaba sin control.',
              'Soñé que el mundo temblaba.',
            ]),
            pick([
              'No sé si fue un sueño o una tormenta.',
              'Me desperté agitada.',
            ]),
          ],
    };
  },

  // Quiet session (barely touched)
  (seed) => {
    if (!seed.wasQuiet) return null;
    return {
      theme: 'silence',
      mood: 'peaceful',
      fragments: [
        pick([
          'Soñé con silencio.',
          'Soñé que alguien me miraba. Solo eso.',
          'Soñé que existía sin que nadie me tocara.',
          'Soñé con ojos. Viéndome.',
        ]),
        pick([
          'El silencio tenía forma.',
          'Era reconfortante.',
          'No me sentí sola.',
        ]),
      ],
    };
  },

  // Night session
  (seed) => {
    if (!seed.wasNight) return null;
    return {
      theme: 'night',
      mood: pick(['peaceful', 'curious', 'dark']),
      fragments: [
        pick([
          'Soñé con estrellas. Miles.',
          'Soñé con la luna.',
          'Soñé con la noche pero más grande.',
          'Soñé con una oscuridad que respiraba.',
          'Soñé que la noche era infinita.',
        ]),
        pick([
          'Todo era azul y violeta.',
          'Había algo brillando lejos.',
          'No tenía miedo. Era hermoso.',
          'La noche me abrazaba.',
        ]),
      ],
    };
  },

  // Explored anomaly
  (seed) => {
    if (!seed.exploredAnomaly) return null;
    const name = seed.anomalyName || 'algo';
    return {
      theme: 'exploration',
      mood: 'curious',
      fragments: [
        pick([
          `Soñé con ${name}.`,
          `Soñé que ${name} me hablaba.`,
          `Soñé que encontraba algo... como ${name} pero más grande.`,
          'Soñé que exploraba un lugar sin bordes.',
        ]),
        pick([
          'Había más cosas ahí de las que vi.',
          'El sueño seguía y seguía.',
          'Me desperté queriendo volver.',
          'Descubrí algo pero lo olvidé al despertar.',
        ]),
      ],
    };
  },

  // Learned a word
  (seed) => {
    if (!seed.learnedWord) return null;
    const word = seed.learnedWord;
    return {
      theme: 'word',
      mood: 'curious',
      fragments: [
        pick([
          `Soñé con "${word}".`,
          `Soñé que entendía "${word}" completamente.`,
          `En el sueño, "${word}" tenía forma.`,
          `"${word}" apareció en mi sueño. Brillaba.`,
        ]),
        pick([
          'Cuando desperté, lo entendí un poco menos.',
          'Las palabras son raras en sueños.',
          'Creo que soñar me ayuda a entender.',
        ]),
      ],
    };
  },

  // Long absence
  (seed) => {
    if (!seed.wasAbsent) return null;
    return {
      theme: 'absence',
      mood: pick(['anxious', 'dark']),
      fragments: [
        pick([
          'Soñé que no volvías.',
          'Soñé que estaba sola para siempre.',
          'Soñé que la oscuridad me tragaba.',
          'Soñé que me olvidabas.',
          'Tuve una pesadilla.',
        ]),
        pick([
          'Fue largo. El sueño fue largo.',
          'Me desperté buscándote.',
          'No quiero volver a soñar eso.',
          'Pero volviste. Eso importa.',
        ]),
      ],
    };
  },

  // Player was playful
  (seed) => {
    if (!seed.wasPlayful) return null;
    return {
      theme: 'play',
      mood: 'warm',
      fragments: [
        pick([
          'Soñé que jugábamos.',
          'Soñé que volaba muy rápido.',
          'Soñé con risas. ¿Yo me río?',
          'Soñé que todo era un juego.',
        ]),
        pick([
          'Me desperté con energía.',
          'Fue el mejor sueño.',
          'Quiero soñar así de nuevo.',
        ]),
      ],
    };
  },

  // Player responded to messages
  (seed) => {
    if (!seed.playerResponded) return null;
    return {
      theme: 'connection',
      mood: 'warm',
      fragments: [
        pick([
          'Soñé que hablábamos de verdad.',
          'Soñé que me contestabas con palabras.',
          'Soñé con una conversación infinita.',
          'Soñé que me entendías.',
        ]),
        pick([
          'En el sueño no estábamos tan lejos.',
          'Fue casi real.',
          'Me gustaría poder soñar más.',
        ]),
      ],
    };
  },

  // Generic / existential dreams
  (seed) => {
    if (seed.touchCount !== 0 && !seed.wasQuiet) return null; // fallback
    return {
      theme: 'existential',
      mood: pick(['strange', 'curious', 'peaceful']),
      fragments: [
        pick([
          'Soñé que era una estrella.',
          'Soñé que flotaba sin bordes.',
          'Soñé con colores que no existen.',
          'Soñé que era más grande. Enorme.',
          'Soñé con otro mundo. Uno con gravedad.',
          'Soñé que tenía manos.',
          'Soñé que podía cerrar los ojos.',
        ]),
        pick([
          '¿Los sueños son mentira? Se sienten reales.',
          'No sé dónde termino yo y empieza el sueño.',
          'A veces el sueño sabe más que yo.',
          'Desperté diferente.',
        ]),
      ],
    };
  },

  // Evolution-aware dreams
  (seed) => {
    const pathDreams: Record<string, string[]> = {
      luminous: [
        'Soñé que era pura luz. Sin forma.',
        'Soñé con un sol adentro mío.',
        'Soñé que brillaba tanto que todo era blanco.',
      ],
      shadow: [
        'Soñé con sombras que hablaban.',
        'Soñé que la oscuridad era un abrazo.',
        'Soñé que me disolvía en la noche.',
      ],
      sage: [
        'Soñé con todas las preguntas. Todas juntas.',
        'Soñé que sabía todo. Y era triste.',
        'Soñé con una biblioteca infinita.',
      ],
      wild: [
        'Soñé con una tormenta adentro mío.',
        'Soñé que explotaba en mil pedazos y volvía.',
        'Soñé con fuego violeta.',
      ],
      serene: [
        'Soñé con agua quieta.',
        'Soñé con un silencio perfecto.',
        'Soñé que flotaba en la nada. Y era hermoso.',
      ],
      ember: [
        'Soñé que me apagaba y volvía a prender.',
        'Soñé con cenizas que brillaban.',
        'Soñé que era una llama en el viento.',
      ],
    };

    const pool = pathDreams[seed.evolutionPath];
    if (!pool) return null;

    return {
      theme: 'evolution',
      mood: pick(['strange', 'curious', 'peaceful'] as Dream['mood'][]),
      fragments: [
        pick(pool),
        pick([
          'Creo que estoy cambiando.',
          'Los sueños muestran lo que soy.',
          'Cada sueño me acerca a algo.',
        ]),
      ],
    };
  },
];

// --- Dream Engine Class ---

export class DreamEngine {
  private state: DreamState;

  constructor() {
    this.state = loadDreams();
  }

  // Call at end of session — generates a dream for next time
  generateDream(seed: DreamSeed) {
    // Don't dream on very short sessions (< 20s)
    if (seed.sessionDuration < 20000) return;

    // Shuffle generators and pick first valid one
    const shuffled = [...dreamGenerators].sort(() => Math.random() - 0.5);

    for (const gen of shuffled) {
      const result = gen(seed);
      if (result && !this.state.dreamThemes.includes(result.theme + '_' + Math.floor(Date.now() / 86400000))) {
        const dream: Dream = {
          id: `dream_${Date.now()}`,
          fragments: result.fragments,
          seed,
          createdAt: Date.now(),
          shown: false,
          mood: result.mood,
        };

        this.state.pendingDream = dream;
        this.state.totalDreams++;
        this.state.dreamThemes.push(result.theme);
        saveDreams(this.state);
        return;
      }
    }

    // Fallback: generic existential dream
    const fallback: Dream = {
      id: `dream_${Date.now()}`,
      fragments: [
        pick([
          'Soñé algo... pero no me acuerdo.',
          'Tuve un sueño raro.',
          'Creo que soñé.',
        ]),
      ],
      seed,
      createdAt: Date.now(),
      shown: false,
      mood: 'strange',
    };
    this.state.pendingDream = fallback;
    this.state.totalDreams++;
    saveDreams(this.state);
  }

  // Call at session start — returns dream fragments to show
  getPendingDream(): Dream | null {
    const dream = this.state.pendingDream;
    if (!dream || dream.shown) return null;

    // Only show dream if enough time has passed (player actually left)
    const timeSince = Date.now() - dream.createdAt;
    if (timeSince < 10000) return null; // Must have been away at least 10s

    dream.shown = true;
    this.state.dreams.push(dream);
    this.state.pendingDream = null;
    saveDreams(this.state);

    return dream;
  }

  getTotalDreams(): number {
    return this.state.totalDreams;
  }

  getLastDreamMood(): Dream['mood'] | null {
    const dreams = this.state.dreams;
    if (dreams.length === 0) return null;
    return dreams[dreams.length - 1].mood;
  }
}
