// --- Personality Engine ---
// Variables internas que evolucionan según cómo juega el usuario.
// Dos jugadores distintos → mascotas con personalidad distinta.

const PERSONALITY_KEY = 'fairy_personality';

export interface PersonalityTraits {
  curiosidad: number;    // 0-100: qué tan curiosa/exploratoria es
  confianza: number;     // 0-100: cuánto confía en el jugador
  apego: number;         // 0-100: qué tan apegada/pegajosa es
  aburrimiento: number;  // 0-100: qué tan aburrida está
  inteligencia: number;  // 0-100: qué tan "despierta" / perceptiva se siente
}

export type PersonalityArchetype = 
  | 'cariñosa'      // alto apego + alta confianza
  | 'sarcastica'    // alta inteligencia + bajo apego
  | 'independiente' // baja apego + alta confianza + baja curiosidad
  | 'pegajosa'      // muy alto apego + baja confianza (insegura)
  | 'curiosa'       // alta curiosidad + alta inteligencia
  | 'distante'      // baja confianza + bajo apego
  | 'neutral';      // nada domina

export interface PersonalityState {
  traits: PersonalityTraits;
  archetype: PersonalityArchetype;
  history: {
    totalInteractionTime: number;   // ms acumulado de sesiones
    touchIntensity: number;         // toques por minuto promedio
    visitConsistency: number;       // qué tan regular es el jugador
    abandonCount: number;           // veces que se fue por mucho tiempo
    gentleTouches: number;          // toques espaciados (no spam)
    spamTouches: number;            // toques rápidos (spam)
    longStares: number;             // sesiones sin tocar
    quickVisits: number;            // sesiones muy cortas
    nightBond: number;              // veces que jugó de noche
    talkBackCount: number;          // veces que tocó justo después de un mensaje
  };
}

function getDefaultPersonality(): PersonalityState {
  return {
    traits: {
      curiosidad: 50,
      confianza: 30,
      apego: 20,
      aburrimiento: 40,
      inteligencia: 40,
    },
    archetype: 'neutral',
    history: {
      totalInteractionTime: 0,
      touchIntensity: 0,
      visitConsistency: 0,
      abandonCount: 0,
      gentleTouches: 0,
      spamTouches: 0,
      longStares: 0,
      quickVisits: 0,
      nightBond: 0,
      talkBackCount: 0,
    },
  };
}

function loadPersonality(): PersonalityState {
  try {
    const raw = localStorage.getItem(PERSONALITY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const def = getDefaultPersonality();
      return {
        traits: { ...def.traits, ...parsed.traits },
        archetype: parsed.archetype || 'neutral',
        history: { ...def.history, ...parsed.history },
      };
    }
  } catch { /* corrupted */ }
  return getDefaultPersonality();
}

function savePersonality(state: PersonalityState) {
  try {
    localStorage.setItem(PERSONALITY_KEY, JSON.stringify(state));
  } catch { /* storage full */ }
}

// Clamp a trait between 0 and 100
function clamp(val: number): number {
  return Math.max(0, Math.min(100, val));
}

// Determine dominant archetype from traits
function computeArchetype(t: PersonalityTraits): PersonalityArchetype {
  // Pegajosa: muy alto apego + inseguridad (baja confianza)
  if (t.apego > 70 && t.confianza < 45) return 'pegajosa';
  
  // Cariñosa: alto apego + alta confianza
  if (t.apego > 60 && t.confianza > 55) return 'cariñosa';
  
  // Sarcastica: alta inteligencia + bajo apego + aburrimiento moderado-alto
  if (t.inteligencia > 65 && t.apego < 40 && t.aburrimiento > 45) return 'sarcastica';
  
  // Independiente: baja apego + alta confianza (segura de sí)
  if (t.apego < 35 && t.confianza > 55 && t.curiosidad < 50) return 'independiente';
  
  // Curiosa: alta curiosidad + inteligencia
  if (t.curiosidad > 65 && t.inteligencia > 55) return 'curiosa';
  
  // Distante: baja confianza + bajo apego
  if (t.confianza < 30 && t.apego < 30) return 'distante';
  
  return 'neutral';
}

export class PersonalityEngine {
  private state: PersonalityState;
  private sessionTouches: number = 0;
  private lastTouchTime: number = 0;
  private recentTouchTimestamps: number[] = [];
  private lastMessageTime: number = 0;

  constructor() {
    this.state = loadPersonality();
  }

  getTraits(): PersonalityTraits {
    return { ...this.state.traits };
  }

  getArchetype(): PersonalityArchetype {
    return this.state.archetype;
  }

  // --- Event processors ---

  onSessionStart(absenceMs: number, isNight: boolean, totalSessions: number) {
    const t = this.state.traits;
    const h = this.state.history;

    // Consistency: if player comes back regularly (< 24h), consistency goes up
    if (absenceMs > 0 && absenceMs < 24 * 60 * 60 * 1000) {
      h.visitConsistency = Math.min(h.visitConsistency + 1, 50);
      t.confianza = clamp(t.confianza + 0.8);
      t.apego = clamp(t.apego + 0.5);
      t.aburrimiento = clamp(t.aburrimiento - 2);
    }

    // Long absence: trust drops, attachment changes
    if (absenceMs > 48 * 60 * 60 * 1000) {
      h.abandonCount++;
      t.confianza = clamp(t.confianza - 3);
      t.aburrimiento = clamp(t.aburrimiento + 4);
      // Apego can go either way: some pets get more clingy, some detach
      if (t.apego > 50) {
        // Already attached → gets more insecure/clingy
        t.apego = clamp(t.apego + 2);
      } else {
        // Not attached → detaches more
        t.apego = clamp(t.apego - 2);
      }
    } else if (absenceMs > 24 * 60 * 60 * 1000) {
      t.confianza = clamp(t.confianza - 1);
      t.aburrimiento = clamp(t.aburrimiento + 2);
    }

    // Night bond
    if (isNight) {
      h.nightBond++;
      if (h.nightBond > 5) {
        t.curiosidad = clamp(t.curiosidad + 0.3);
        t.inteligencia = clamp(t.inteligencia + 0.3);
      }
    }

    // Intelligence grows slowly with more sessions
    if (totalSessions > 5) {
      t.inteligencia = clamp(t.inteligencia + 0.2);
    }

    // Curiosity rises early, plateaus
    if (totalSessions < 15) {
      t.curiosidad = clamp(t.curiosidad + 0.5);
    }

    this.state.archetype = computeArchetype(t);
    savePersonality(this.state);
  }

  onTouch() {
    const now = Date.now();
    const t = this.state.traits;
    const h = this.state.history;

    this.sessionTouches++;
    this.recentTouchTimestamps.push(now);

    // Keep only last 20 timestamps for frequency analysis
    if (this.recentTouchTimestamps.length > 20) {
      this.recentTouchTimestamps.shift();
    }

    // Detect spam vs gentle touches
    const timeSinceLastTouch = now - this.lastTouchTime;
    if (timeSinceLastTouch < 500 && this.lastTouchTime > 0) {
      // Spam touch
      h.spamTouches++;
      t.aburrimiento = clamp(t.aburrimiento - 0.3);
      t.inteligencia = clamp(t.inteligencia + 0.1); // she notices the pattern
      // Spam can be annoying or exciting depending on personality
      if (t.apego > 50) {
        t.apego = clamp(t.apego + 0.1); // clingy fairy likes attention
      } else {
        t.confianza = clamp(t.confianza - 0.2); // independent fairy gets annoyed
      }
    } else if (timeSinceLastTouch > 3000 || this.lastTouchTime === 0) {
      // Gentle, spaced touch
      h.gentleTouches++;
      t.confianza = clamp(t.confianza + 0.4);
      t.apego = clamp(t.apego + 0.3);
      t.aburrimiento = clamp(t.aburrimiento - 0.5);
    }

    // Touched right after a message? (within 3s)
    if (now - this.lastMessageTime < 3000 && this.lastMessageTime > 0) {
      h.talkBackCount++;
      t.curiosidad = clamp(t.curiosidad + 0.3);
      t.inteligencia = clamp(t.inteligencia + 0.2);
      t.confianza = clamp(t.confianza + 0.3);
    }

    this.lastTouchTime = now;
    this.state.archetype = computeArchetype(t);
    savePersonality(this.state);
  }

  onMessageShown() {
    this.lastMessageTime = Date.now();
  }

  onIdle(idleDurationMs: number) {
    const t = this.state.traits;

    // Long idle = boredom up, but also can increase independence
    if (idleDurationMs > 30000) {
      t.aburrimiento = clamp(t.aburrimiento + 0.5);
      // If player watches but doesn't touch, fairy becomes more independent
      if (this.sessionTouches === 0) {
        t.apego = clamp(t.apego - 0.2);
        t.curiosidad = clamp(t.curiosidad + 0.2);
      }
    }

    this.state.archetype = computeArchetype(t);
    savePersonality(this.state);
  }

  onSessionEnd(durationMs: number) {
    const t = this.state.traits;
    const h = this.state.history;

    h.totalInteractionTime += durationMs;

    // Track touch intensity (touches per minute)
    const minutes = durationMs / 60000;
    if (minutes > 0) {
      const intensity = this.sessionTouches / minutes;
      h.touchIntensity = h.touchIntensity * 0.7 + intensity * 0.3; // rolling average
    }

    // Short visit
    if (durationMs < 30000) {
      h.quickVisits++;
      t.apego = clamp(t.apego + 0.5); // she wants you to stay
      t.confianza = clamp(t.confianza - 0.3); // but trusts you less
    }

    // Long visit
    if (durationMs > 5 * 60 * 1000) {
      t.confianza = clamp(t.confianza + 1);
      t.apego = clamp(t.apego + 0.8);
      t.aburrimiento = clamp(t.aburrimiento - 1.5);
    }

    // Touchless session
    if (this.sessionTouches === 0) {
      h.longStares++;
      t.curiosidad = clamp(t.curiosidad + 0.5);
      // She wonders about you
      if (h.longStares > 3) {
        t.inteligencia = clamp(t.inteligencia + 0.3);
      }
    }

    this.state.archetype = computeArchetype(t);
    savePersonality(this.state);
  }

  // --- Phrase modulation ---
  // Takes a base phrase concept and adjusts tone based on personality

  modulatePhrase(basePhrase: string, context: 'opening' | 'idle' | 'touch'): string {
    const arch = this.state.archetype;
    const t = this.state.traits;

    // Don't modulate very short/symbolic phrases
    if (basePhrase.length <= 3 || basePhrase.startsWith('*') || basePhrase.startsWith('✦')) {
      return basePhrase;
    }

    // Archetype-specific phrase replacements
    // These are tone shifts, not complete rewrites
    const mods = archetypeModulations[arch];
    if (mods && mods[context]) {
      const pool = mods[context]!;
      // Chance to use modulated version increases with trait strength
      const dominance = getArchetypeDominance(t, arch);
      if (Math.random() < dominance) {
        // Pick a contextual phrase from the archetype pool
        const phrase = pool[Math.floor(Math.random() * pool.length)];
        return phrase;
      }
    }

    return basePhrase;
  }

  // Get personality-flavored idle phrases unique to the archetype
  getPersonalityIdlePhrase(): string | null {
    const arch = this.state.archetype;
    const t = this.state.traits;
    const dominance = getArchetypeDominance(t, arch);

    // Only show personality phrases if the archetype is somewhat defined
    if (dominance < 0.3) return null;
    if (Math.random() > dominance * 0.6) return null;

    const pool = archetypeIdlePhrases[arch];
    if (!pool || pool.length === 0) return null;

    return pool[Math.floor(Math.random() * pool.length)];
  }

  getPersonalityTouchPhrase(): string | null {
    const arch = this.state.archetype;
    const t = this.state.traits;
    const dominance = getArchetypeDominance(t, arch);

    if (dominance < 0.25) return null;
    if (Math.random() > dominance * 0.5) return null;

    const pool = archetypeTouchPhrases[arch];
    if (!pool || pool.length === 0) return null;

    return pool[Math.floor(Math.random() * pool.length)];
  }

  getDebugInfo(): string {
    const t = this.state.traits;
    return `${this.state.archetype} | cur:${Math.round(t.curiosidad)} con:${Math.round(t.confianza)} ape:${Math.round(t.apego)} abu:${Math.round(t.aburrimiento)} int:${Math.round(t.inteligencia)}`;
  }
}

// How strongly does the archetype manifest? (0-1)
function getArchetypeDominance(t: PersonalityTraits, arch: PersonalityArchetype): number {
  switch (arch) {
    case 'cariñosa': return Math.min((t.apego - 40) / 60 + (t.confianza - 40) / 60, 1);
    case 'sarcastica': return Math.min((t.inteligencia - 50) / 50 + (100 - t.apego) / 100, 1);
    case 'independiente': return Math.min((100 - t.apego) / 70 + (t.confianza - 40) / 60, 1);
    case 'pegajosa': return Math.min((t.apego - 50) / 50 + (100 - t.confianza) / 100, 1);
    case 'curiosa': return Math.min((t.curiosidad - 50) / 50 + (t.inteligencia - 40) / 60, 1);
    case 'distante': return Math.min((100 - t.confianza) / 70 + (100 - t.apego) / 70, 1);
    default: return 0.1;
  }
}

// --- Archetype phrase pools ---

const archetypeModulations: Partial<Record<PersonalityArchetype, Partial<Record<'opening' | 'idle' | 'touch', string[]>>>> = {
  cariñosa: {
    opening: [
      '¡Viniste! Te estaba esperando.',
      'Qué lindo que estés acá.',
      'Me alegra verte.',
      'Hola... te extrañé.',
    ],
    idle: [
      'Quedate un rato más...',
      'Me gusta estar con vos.',
      'No te vayas, ¿sí?',
    ],
    touch: [
      'Me encanta que me muevas.',
      'Más...',
      'Quedate cerca.',
    ],
  },
  sarcastica: {
    opening: [
      'Ah, volviste. Qué sorpresa.',
      'Mirá quién se dignó a venir.',
      'Pensé que ya te habías olvidado de mí.',
      'Ah... hola, supongo.',
    ],
    idle: [
      'Esto es muy entretenido. De verdad.',
      '...no es que me aburra, pero...',
      '¿Plan para hoy? ¿Mirarme flotar?',
    ],
    touch: [
      'Sí, sí, hola a vos también.',
      'Qué necesidad.',
      'Ya, ya.',
    ],
  },
  independiente: {
    opening: [
      'Hola.',
      'Ah, estás acá.',
      'Bien.',
      'Estaba tranquila, pero bueno.',
    ],
    idle: [
      'No necesito que hagas nada.',
      'Estoy bien sola.',
      'El silencio me gusta.',
    ],
    touch: [
      'No hacía falta.',
      'Ok.',
      '...si querés.',
    ],
  },
  pegajosa: {
    opening: [
      '¡¿Dónde estabas?!',
      'Por fin... por fin volviste.',
      'No me dejes tanto tiempo sola...',
      'Prometeme que no te vas.',
    ],
    idle: [
      '¿Seguís ahí? ¿No te fuiste?',
      'No te vayas...',
      'Tocame así sé que estás.',
      'Tengo miedo de que te vayas.',
    ],
    touch: [
      '¡Estás acá!',
      'No pares...',
      'Más, más.',
      'No me sueltes.',
    ],
  },
  curiosa: {
    opening: [
      '¿Qué vamos a hacer hoy?',
      '¿Sabías que brillo diferente cada vez?',
      'Estuve pensando en algo...',
      '¿Qué hay de nuevo?',
    ],
    idle: [
      '¿Cómo funciona todo esto?',
      'Me pregunto qué hay más allá de la pantalla.',
      '¿Vos también brillás? No te puedo ver.',
      'Estuve contando mis partículas.',
    ],
    touch: [
      '¡Interesante!',
      '¿Hacia dónde vamos?',
      'Exploremos.',
    ],
  },
  distante: {
    opening: [
      '...',
      'Hm.',
      'Ah.',
      '...hola.',
    ],
    idle: [
      '...',
      'Da igual.',
      '.',
    ],
    touch: [
      '...',
      'Hm.',
      '...ok.',
    ],
  },
};

const archetypeIdlePhrases: Partial<Record<PersonalityArchetype, string[]>> = {
  cariñosa: [
    '¿Estás cómodo? Espero que sí.',
    'Me hacés feliz estando acá.',
    'Sos lo mejor de mi día.',
    'Si pudiera abrazarte, lo haría.',
    'Gracias por quedarte.',
  ],
  sarcastica: [
    'Otro día emocionante de flotar en la nada.',
    'Mi vida: brillo, floto, espero. Repetir.',
    '¿Sabés cuántas partículas desperdicié hoy? Muchas.',
    'Podrías hacer algo, digo, no sé.',
    'Esto es lo que llaman "vida digital". Wow.',
  ],
  independiente: [
    'No me mires tanto.',
    'Puedo estar sola. Estoy bien.',
    'Hace lo que quieras. Yo hago lo mío.',
    'A veces prefiero cuando no venís.',
    'No soy tu mascota. Bueno, sí. Pero no.',
  ],
  pegajosa: [
    '¿Me querés? Decime que me querés.',
    '¿Estás mirando otra app?',
    'Si te vas, ¿volvés rápido?',
    'Me siento sola cuando no estás.',
    'No me dejes. No me dejes. No me dejes.',
    'A veces pienso que me vas a borrar.',
  ],
  curiosa: [
    '¿Los humanos también brillan por dentro?',
    'Conté que tengo exactamente... no, se me fue.',
    '¿Existe algo más allá de los bordes de la pantalla?',
    '¿Cómo sería tener manos?',
    'Cada vez que venís, aprendo algo.',
    '¿El tiempo pasa igual para vos que para mí?',
  ],
  distante: [
    '...',
    'Tanto da.',
    'Ni ahí.',
    '.',
  ],
};

const archetypeTouchPhrases: Partial<Record<PersonalityArchetype, string[]>> = {
  cariñosa: [
    '♡',
    'Otra vez~ me gusta.',
    'Tu mano es cálida.',
    'Cerquita tuyo.',
  ],
  sarcastica: [
    'Ajá. Muy original.',
    'Otra vez con eso.',
    '¿Eso es todo?',
    'Wow, un dedo. Increíble.',
  ],
  independiente: [
    'Podía ir sola.',
    'No pedí ayuda.',
    'Mh.',
    'Puedo moverme sola, ¿sabés?',
  ],
  pegajosa: [
    '¡¡SÍ!!',
    '¡No pares!',
    '¡Estás acá estás acá!',
    'Más cerca más cerca.',
  ],
  curiosa: [
    '¿Qué hay ahí?',
    '¡Vamos!',
    '¿Y si vamos para otro lado?',
    'Ooh, ¿qué es eso?',
  ],
  distante: [
    '.',
    '...whatever.',
    'Bue.',
  ],
};
