// Bad Days Engine
// Some days the fairy just doesn't want to talk.
// She moves slower, particles fall, she barely responds.
// The player can't force her. They can only accompany her.
// She recovers on her own the next day.

const STORAGE_KEY = 'fairy_bad_days';

interface BadDayStore {
  lastBadDay: string; // date string
  badDayCount: number;
  currentlyBad: boolean;
  currentBadStart: number;
  recoveredToday: boolean;
}

function load(): BadDayStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* */ }
  return {
    lastBadDay: '',
    badDayCount: 0,
    currentlyBad: false,
    currentBadStart: 0,
    recoveredToday: false,
  };
}

function save(store: BadDayStore) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch { /* */ }
}

function getToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const BAD_DAY_PHRASES = [
  'Hoy no tengo muchas ganas.',
  'Estoy cansada.',
  '...hoy no.',
  'No preguntes. Solo estate.',
  'Prefiero el silencio hoy.',
  'Hay días así.',
  '.',
  '...',
];

const RECOVERY_PHRASES = [
  'Ayer fue difícil. Hoy está mejor.',
  'Ya pasó. Gracias por quedarte.',
  'Me ayudó que te quedaras.',
  'Estoy mejor. Fue un día nada más.',
  'Volvió la energía. Un poco.',
];

const COMFORT_RESPONSES = [
  // When player tries to comfort during bad day — sometimes works, sometimes not
  { works: false, message: 'No es nada. Solo dejame estar.' },
  { works: false, message: '...gracias. Pero hoy no.' },
  { works: false, message: 'Aprecio que intentes.' },
  { works: true, message: 'Eso ayudó un poco.' },
  { works: true, message: '...mejor. Un poco.' },
  { works: false, message: 'Sigo igual. Pero gracias.' },
];

export class BadDaysEngine {
  private store: BadDayStore;
  private checkedToday = false;
  private comfortAttempts = 0;

  constructor() {
    this.store = load();
    this.checkDayTransition();
  }

  private checkDayTransition() {
    const today = getToday();

    // Recovery: if it was a bad day yesterday but not today
    if (this.store.currentlyBad && this.store.lastBadDay !== today) {
      this.store.currentlyBad = false;
      this.store.recoveredToday = true;
      save(this.store);
    }

    // Reset recovered flag after a while
    if (this.store.recoveredToday && this.store.lastBadDay !== today) {
      this.store.recoveredToday = false;
      save(this.store);
    }
  }

  checkForBadDay(sessionCount: number): boolean {
    if (this.checkedToday) return this.store.currentlyBad;
    this.checkedToday = true;

    // Already a bad day today
    if (this.store.currentlyBad && this.store.lastBadDay === getToday()) return true;
    // Don't trigger bad days too early
    if (sessionCount < 5) return false;
    // ~15% chance on any given session start (after enough history)
    // Less likely if we just had one
    const daysSinceLastBad = this.store.lastBadDay
      ? Math.floor((Date.now() - new Date(this.store.lastBadDay).getTime()) / (1000 * 60 * 60 * 24))
      : 999;

    if (daysSinceLastBad < 3) return false; // No back-to-back bad days

    const prob = Math.min(0.12 + this.store.badDayCount * 0.01, 0.2);
    if (Math.random() < prob) {
      this.store.currentlyBad = true;
      this.store.lastBadDay = getToday();
      this.store.badDayCount++;
      this.store.currentBadStart = Date.now();
      this.comfortAttempts = 0;
      save(this.store);
      return true;
    }

    return false;
  }

  isBadDay(): boolean {
    return this.store.currentlyBad && this.store.lastBadDay === getToday();
  }

  isRecoveredToday(): boolean {
    return this.store.recoveredToday;
  }

  getBadDayOpeningPhrase(): string | null {
    if (!this.isBadDay()) return null;
    return BAD_DAY_PHRASES[Math.floor(Math.random() * BAD_DAY_PHRASES.length)];
  }

  getRecoveryPhrase(): string | null {
    if (!this.isRecoveredToday()) return null;
    return RECOVERY_PHRASES[Math.floor(Math.random() * RECOVERY_PHRASES.length)];
  }

  onComfortAttempt(): { works: boolean; message: string } {
    this.comfortAttempts++;
    // First few attempts rarely work, later ones more likely
    const workChance = Math.min(this.comfortAttempts * 0.08, 0.35);
    const response = COMFORT_RESPONSES[Math.floor(Math.random() * COMFORT_RESPONSES.length)];

    // Override with random chance
    const actuallyWorks = Math.random() < workChance;
    if (actuallyWorks) {
      // Slightly reduce bad day intensity (doesn't end it, just eases)
      return { works: true, message: response.works ? response.message : 'Un poco mejor. Solo un poco.' };
    }
    return { works: false, message: response.works ? BAD_DAY_PHRASES[Math.floor(Math.random() * BAD_DAY_PHRASES.length)] : response.message };
  }

  getBadDayIdlePhrase(): string | null {
    if (!this.isBadDay()) return null;
    if (Math.random() > 0.6) return null;
    return BAD_DAY_PHRASES[Math.floor(Math.random() * BAD_DAY_PHRASES.length)];
  }

  getBadDayMoodModifiers(): {
    wingSpeedMod: number;
    particleSpeedMod: number;
    particleDirectionDown: boolean;
    auraDimMod: number;
  } {
    if (!this.isBadDay()) return {
      wingSpeedMod: 1,
      particleSpeedMod: 1,
      particleDirectionDown: false,
      auraDimMod: 1,
    };
    return {
      wingSpeedMod: 0.55,      // Slower wing flap
      particleSpeedMod: 0.4,   // Slower particles
      particleDirectionDown: true, // Particles fall down
      auraDimMod: 0.45,        // Dimmer aura
    };
  }

  getBadDayCount(): number {
    return this.store.badDayCount;
  }
}
