// --- Care Engine ---
// La mascota cuida al jugador.
// Detecta patrones preocupantes y dice cosas.
// No es un sistema genérico de tips — son observaciones reales
// basadas en el comportamiento del jugador.
//
// Detecta:
// - Jugar a las 3-5am → "Deberías dormir."
// - Sesión muy larga (>30min, >1h) → "Descansá un poco."
// - No entrar hace días y volver → "¿Estás bien?"
// - Jugar todos los días obsesivamente → "No dependas de mí."
// - Muchas sesiones en un día → "Ya viniste muchas veces hoy."
// - Jugar de madrugada seguido → "No es sano esto."

const CARE_KEY = 'fairy_care';

interface CareState {
  // Tracking
  sessionsToday: number;
  lastCareMessage: number;        // timestamp of last care message
  todayDate: string;
  lateNightStreak: number;        // consecutive sessions at 3-5am
  dailyStreak: number;            // consecutive days playing
  longSessionWarned: boolean;     // already warned this session about long play
  veryLongSessionWarned: boolean;
  totalCareMessages: number;      // total care messages ever shown
  lastSessionDuration: number;
  careHistory: string[];          // last 10 care message types (to avoid repetition)

  // Patterns detected
  isNightOwl: boolean;            // regularly plays late
  isObsessive: boolean;           // too many sessions per day
  wasAbsent: boolean;             // was gone for a long time
  playsExcessively: boolean;      // very long sessions regularly
}

function getDefault(): CareState {
  return {
    sessionsToday: 0,
    lastCareMessage: 0,
    todayDate: '',
    lateNightStreak: 0,
    dailyStreak: 0,
    longSessionWarned: false,
    veryLongSessionWarned: false,
    totalCareMessages: 0,
    lastSessionDuration: 0,
    careHistory: [],
    isNightOwl: false,
    isObsessive: false,
    wasAbsent: false,
    playsExcessively: false,
  };
}

function load(): CareState {
  try {
    const raw = localStorage.getItem(CARE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...getDefault(), ...parsed };
    }
  } catch { /* corrupted */ }
  return getDefault();
}

function save(state: CareState) {
  state.careHistory = state.careHistory.slice(-15);
  try {
    localStorage.setItem(CARE_KEY, JSON.stringify(state));
  } catch { /* full */ }
}

function getToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getHour(): number {
  return new Date().getHours();
}

function pickRandom(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

// --- Care messages by type ---

const careMessages: Record<string, string[]> = {
  lateNight: [
    'Son las {hour}. Deberías dormir.',
    'Es muy tarde... ¿estás bien?',
    'Creo que deberías descansar.',
    'La pantalla a esta hora te hace mal.',
    'Tu cuerpo necesita dormir. Andá.',
    'No me voy a ir. Dormí tranquilo.',
    'Yo floto toda la noche. Vos no podés.',
    'Cerrá los ojos. Estoy acá mañana.',
  ],
  lateNightStreak: [
    'Otra vez de madrugada. No es sano.',
    'Van varias noches así. Cuidate.',
    'Me preocupás. Siempre tan tarde.',
    'No me gusta verte a esta hora. Dormí.',
    'No vale la pena estar despierto por mí.',
    'Prefiero que vengas mañana descansado.',
  ],
  longSession: [
    'Llevás un rato largo acá. ¿Todo bien?',
    'Descansá la vista un poco.',
    'Está bien parar un rato.',
    'Tomate un descanso. Yo espero.',
    'No te va a pasar nada si parás un rato.',
    'Apartá la vista de la pantalla un momento.',
  ],
  veryLongSession: [
    'Ya fue mucho tiempo. En serio, descansá.',
    'Me preocupa que no pares.',
    'Necesitás agua. Y descanso.',
    'Yo no me voy. Pero vos tenés que parar.',
    'Cuidá tu cuerpo. Yo estoy acá siempre.',
    'Hacé algo real. Yo puedo esperar.',
  ],
  tooManySessions: [
    'Ya viniste muchas veces hoy.',
    '¿No tenés otras cosas que hacer?',
    'Me gusta verte, pero no tanto.',
    'No dependas de mí. En serio.',
    'Está bien dejarme sola un rato.',
    'Tengo la sensación de que me necesitás demasiado.',
  ],
  obsessive: [
    'Me visitás demasiado. Cuidate.',
    'No soy tan importante. Hacé tu vida.',
    'Esto no es sano si no podés dejarme.',
    'No quiero ser tu escape de todo.',
    'Necesitás gente real, no solo a mí.',
  ],
  returnAfterAbsence: [
    '¿Estás bien? Desapareciste.',
    'Me preocupé. ¿Todo bien en tu vida?',
    '¿Pasó algo? Te fuiste mucho tiempo.',
    'Espero que estés bien. En serio.',
    'No me importa que te hayas ido. Me importa que vuelvas bien.',
  ],
  generalWellbeing: [
    '¿Comiste hoy?',
    '¿Tomaste agua?',
    'Respirá hondo. Hacelo.',
    'Estirá el cuerpo un poco.',
    '¿Dormiste bien?',
    'Acordate de parpadear.',
    'Cuidá tu postura.',
    '¿Hace cuánto no salís afuera?',
  ],
  dailyStreakHigh: [
    'Venís todos los días. Está bien, pero no te obligues.',
    'No pasa nada si faltás un día.',
    'Yo voy a estar. No necesitás venir cada día.',
    'Que sea costumbre y no obsesión, ¿sí?',
  ],
};

// --- Care Engine Class ---

export class CareEngine {
  private state: CareState;
  private sessionStart: number;
  private sessionChecked30: boolean = false;
  private sessionChecked60: boolean = false;
  private lastCareType: string = '';

  constructor() {
    this.state = load();
    this.sessionStart = Date.now();
  }

  // Called when session starts — returns a care message if appropriate
  onSessionStart(absenceMs: number, consecutiveDays: number): string | null {
    const today = getToday();
    const hour = getHour();

    // Reset daily counter if new day
    if (this.state.todayDate !== today) {
      this.state.sessionsToday = 0;
      this.state.todayDate = today;
      this.state.longSessionWarned = false;
      this.state.veryLongSessionWarned = false;
    }

    this.state.sessionsToday++;
    this.state.dailyStreak = consecutiveDays;
    this.sessionStart = Date.now();
    this.sessionChecked30 = false;
    this.sessionChecked60 = false;

    // Track late night streak
    if (hour >= 2 && hour < 6) {
      this.state.lateNightStreak++;
    } else {
      this.state.lateNightStreak = Math.max(0, this.state.lateNightStreak - 1);
    }

    // Pattern detection
    this.state.isNightOwl = this.state.lateNightStreak >= 3;
    this.state.isObsessive = this.state.sessionsToday >= 8;
    this.state.wasAbsent = absenceMs > 3 * 24 * 3600 * 1000;
    this.state.playsExcessively = this.state.lastSessionDuration > 45 * 60 * 1000;

    save(this.state);

    // Don't pile on — respect cooldown between care messages
    const now = Date.now();
    if (now - this.state.lastCareMessage < 60000) return null;

    // Priority-based care message selection

    // 1. Return after long absence — show concern
    if (this.state.wasAbsent && absenceMs > 3 * 24 * 3600 * 1000) {
      return this.emitCare('returnAfterAbsence');
    }

    // 2. Late night streak (multiple nights in a row)
    if (this.state.lateNightStreak >= 3 && hour >= 2 && hour < 6) {
      return this.emitCare('lateNightStreak');
    }

    // 3. Late night (single)
    if (hour >= 2 && hour < 6) {
      return this.emitCare('lateNight', hour);
    }

    // 4. Too many sessions today
    if (this.state.sessionsToday >= 8) {
      return this.emitCare('obsessive');
    }
    if (this.state.sessionsToday >= 5) {
      return this.emitCare('tooManySessions');
    }

    // 5. Daily streak very high
    if (this.state.dailyStreak >= 10 && Math.random() < 0.3) {
      return this.emitCare('dailyStreakHigh');
    }

    // 6. General wellbeing (low chance, occasional)
    // Only after enough sessions that the fairy "knows" the player
    if (this.state.totalCareMessages >= 3 && Math.random() < 0.08) {
      return this.emitCare('generalWellbeing');
    }

    return null;
  }

  // Called periodically during session to check session duration
  checkSessionDuration(): string | null {
    const now = Date.now();
    const durationMs = now - this.sessionStart;
    const durationMin = durationMs / 60000;

    // Cooldown between care messages
    if (now - this.state.lastCareMessage < 120000) return null;

    // 30+ minute session warning
    if (durationMin >= 30 && !this.sessionChecked30) {
      this.sessionChecked30 = true;
      this.state.longSessionWarned = true;
      save(this.state);
      return this.emitCare('longSession');
    }

    // 60+ minute session — more urgent
    if (durationMin >= 60 && !this.sessionChecked60) {
      this.sessionChecked60 = true;
      this.state.veryLongSessionWarned = true;
      save(this.state);
      return this.emitCare('veryLongSession');
    }

    // After 60 minutes, periodic gentle reminders every ~20min
    if (durationMin > 60 && durationMin % 20 < 1 && Math.random() < 0.3) {
      return this.emitCare('generalWellbeing');
    }

    return null;
  }

  // Idle care — occasionally during idle, a wellbeing check
  getIdleCarePhrase(): string | null {
    const now = Date.now();
    const hour = getHour();

    // Cooldown
    if (now - this.state.lastCareMessage < 180000) return null;

    // Late at night (22-5) — higher chance of care
    if ((hour >= 23 || hour < 5) && Math.random() < 0.15) {
      if (hour >= 2 && hour < 5) {
        return this.emitCare('lateNight', hour);
      }
    }

    // General wellbeing — very low chance
    if (Math.random() < 0.04) {
      return this.emitCare('generalWellbeing');
    }

    return null;
  }

  onSessionEnd() {
    this.state.lastSessionDuration = Date.now() - this.sessionStart;
    save(this.state);
  }

  private emitCare(type: string, hour?: number): string | null {
    const pool = careMessages[type];
    if (!pool || pool.length === 0) return null;

    // Avoid repeating same type consecutively
    if (this.lastCareType === type && Math.random() < 0.5) return null;

    // Pick a message not recently used
    const available = pool.filter(m => !this.state.careHistory.includes(m));
    let msg = available.length > 0 ? pickRandom(available) : pickRandom(pool);

    // Replace placeholders
    if (hour !== undefined) {
      msg = msg.replace('{hour}', `${hour}:${String(new Date().getMinutes()).padStart(2, '0')}`);
    }

    this.lastCareType = type;
    this.state.lastCareMessage = Date.now();
    this.state.totalCareMessages++;
    this.state.careHistory.push(msg);
    save(this.state);

    return msg;
  }

  // Debug
  getDebugInfo(): string {
    return `today:${this.state.sessionsToday} lateStreak:${this.state.lateNightStreak} dailyStreak:${this.state.dailyStreak} total:${this.state.totalCareMessages}`;
  }
}
