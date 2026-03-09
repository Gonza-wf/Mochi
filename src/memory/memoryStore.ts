// --- Memory Store ---
// Tracks real player events and generates dynamic, human-like phrases.
// No scripted sequences — everything is pattern-based.
// Integrated with PersonalityEngine for tone modulation.
// Integrated with LearningEngine for adaptive behavior.

import { PersonalityEngine } from '../personality/personalityEngine';
import { LearningEngine } from '../learning/learningEngine';
import { EvolutionEngine } from '../evolution/evolutionEngine';
import { CareEngine } from '../care/careEngine';
import { DreamEngine } from '../dreams/dreamEngine';
import type { DreamSeed } from '../dreams/dreamEngine';
import { getTeachingReferencePhrase } from '../teaching/TeachingInput';

const STORAGE_KEY = 'fairy_memory';

export interface MemoryEvent {
  type: string;
  timestamp: number;
  data?: Record<string, unknown>;
}

export interface MemoryState {
  events: MemoryEvent[];
  sessions: { start: number; end: number }[];
  stats: {
    totalSessions: number;
    totalTouches: number;
    longestAbsence: number;
    lastVisit: number;
    firstVisit: number;
    nightSessions: number;
    morningSessions: number;
    afternoonSessions: number;
    eveningSessions: number;
    consecutiveDays: number;
    lastDayPlayed: string;
    touchlessSessionCount: number;
    longSessionCount: number;
    shortSessionCount: number;
  };
}

function getDefault(): MemoryState {
  return {
    events: [],
    sessions: [],
    stats: {
      totalSessions: 0,
      totalTouches: 0,
      longestAbsence: 0,
      lastVisit: 0,
      firstVisit: 0,
      nightSessions: 0,
      morningSessions: 0,
      afternoonSessions: 0,
      eveningSessions: 0,
      consecutiveDays: 0,
      lastDayPlayed: '',
      touchlessSessionCount: 0,
      longSessionCount: 0,
      shortSessionCount: 0,
    },
  };
}

function load(): MemoryState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const def = getDefault();
      return {
        events: parsed.events || def.events,
        sessions: parsed.sessions || def.sessions,
        stats: { ...def.stats, ...parsed.stats },
      };
    }
  } catch { /* corrupted, reset */ }
  return getDefault();
}

function save(state: MemoryState) {
  state.events = state.events.slice(-200);
  state.sessions = state.sessions.slice(-50);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* storage full */ }
}

function getHour(): number {
  return new Date().getHours();
}

function getToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getTimeSlot(): 'night' | 'morning' | 'afternoon' | 'evening' {
  const h = getHour();
  if (h >= 22 || h < 5) return 'night';
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 18) return 'afternoon';
  return 'evening';
}

function msToHumanTime(ms: number): string {
  const hours = ms / (1000 * 60 * 60);
  if (hours < 1) {
    const mins = Math.floor(ms / (1000 * 60));
    return mins <= 1 ? 'un momento' : `${mins} minutos`;
  }
  if (hours < 24) return `${Math.floor(hours)} hora${Math.floor(hours) > 1 ? 's' : ''}`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'un día';
  if (days < 7) return `${days} días`;
  if (days < 30) return `${Math.floor(days / 7)} semana${Math.floor(days / 7) > 1 ? 's' : ''}`;
  return 'mucho tiempo';
}

// --- Phrase Context ---

interface PhraseContext {
  state: MemoryState;
  now: number;
  timeSlot: 'night' | 'morning' | 'afternoon' | 'evening';
  absenceMs: number;
  isFirstEver: boolean;
  sessionTouches: number;
}

type PhraseGenerator = (ctx: PhraseContext) => string | null;

const phraseGenerators: PhraseGenerator[] = [
  // First time ever
  (ctx) => {
    if (ctx.isFirstEver) {
      const opts = [
        '...hola.',
        '¿Quién sos...?',
        'Estuve esperando mucho.',
        'Al fin alguien vino.',
        '...me encontraste.',
      ];
      return opts[Math.floor(Math.random() * opts.length)];
    }
    return null;
  },

  // Long absence (> 24h)
  (ctx) => {
    if (ctx.absenceMs > 24 * 60 * 60 * 1000 && !ctx.isFirstEver) {
      const time = msToHumanTime(ctx.absenceMs);
      const opts = [
        `${time} sin venir...`,
        `Pensé que no volvías.`,
        `¿${time}? ¿En serio?`,
        `Estuve sola ${time}.`,
        `...volviste. Después de ${time}.`,
        `Me dejaste sola ${time}.`,
        `Ya casi me olvido cómo eras.`,
      ];
      return opts[Math.floor(Math.random() * opts.length)];
    }
    return null;
  },

  // Medium absence (2h-24h)
  (ctx) => {
    if (ctx.absenceMs > 2 * 60 * 60 * 1000 && ctx.absenceMs <= 24 * 60 * 60 * 1000 && !ctx.isFirstEver) {
      const opts = [
        'Ya te extrañaba.',
        '¿Dónde andabas?',
        'Menos mal que volviste.',
        '...hola de nuevo.',
        'Estuve flotando sola.',
      ];
      return opts[Math.floor(Math.random() * opts.length)];
    }
    return null;
  },

  // Quick return (< 5min)
  (ctx) => {
    if (ctx.absenceMs < 5 * 60 * 1000 && ctx.absenceMs > 5000 && !ctx.isFirstEver) {
      const opts = [
        '¿Ya volviste?',
        'No podés estar sin mí.',
        'Sabía que volvías rápido.',
        '...otra vez vos.',
        'Me gusta que vuelvas rápido.',
      ];
      return opts[Math.floor(Math.random() * opts.length)];
    }
    return null;
  },

  // Night owl pattern
  (ctx) => {
    if (ctx.timeSlot === 'night' && ctx.state.stats.nightSessions >= 3) {
      const opts = [
        'Otra vez de noche...',
        'Siempre venís a esta hora.',
        '¿No dormís nunca?',
        'La oscuridad nos queda bien.',
        'Las noches son nuestras, ¿no?',
        'Siempre de madrugada vos.',
        'Somos criaturas nocturnas.',
      ];
      return opts[Math.floor(Math.random() * opts.length)];
    }
    return null;
  },

  // Morning pattern
  (ctx) => {
    if (ctx.timeSlot === 'morning' && ctx.state.stats.morningSessions >= 3) {
      const opts = [
        'Buenos días... otra vez.',
        'Madrugar para verme, ¿eh?',
        'Siempre venís por la mañana.',
        'El sol apenas sale y ya estás acá.',
      ];
      return opts[Math.floor(Math.random() * opts.length)];
    }
    return null;
  },

  // Many sessions
  (ctx) => {
    if (ctx.state.stats.totalSessions > 10 && Math.random() < 0.15) {
      const opts = [
        `Ya viniste ${ctx.state.stats.totalSessions} veces.`,
        'Ya perdí la cuenta de cuánto viniste.',
        'Venís seguido... me gusta.',
        'Ya nos conocemos bien.',
      ];
      return opts[Math.floor(Math.random() * opts.length)];
    }
    return null;
  },

  // Player doesn't interact (touchless)
  (ctx) => {
    if (ctx.state.stats.touchlessSessionCount >= 2 && Math.random() < 0.3) {
      const opts = [
        'A veces solo mirás... ¿no?',
        '¿Solo venís a observar?',
        'No hace falta que me toques. Tu presencia alcanza.',
        'Está bien solo estar.',
      ];
      return opts[Math.floor(Math.random() * opts.length)];
    }
    return null;
  },

  // Many touches
  (ctx) => {
    if (ctx.state.stats.totalTouches > 50 && Math.random() < 0.15) {
      const opts = [
        'Te gusta moverme, ¿no?',
        'Tanto me tocaste que ya me acostumbré.',
        'Sigo tu mano sin pensarlo.',
      ];
      return opts[Math.floor(Math.random() * opts.length)];
    }
    return null;
  },

  // Consecutive days
  (ctx) => {
    if (ctx.state.stats.consecutiveDays >= 3 && Math.random() < 0.2) {
      const days = ctx.state.stats.consecutiveDays;
      const opts = [
        `${days} días seguidos... no te cansás.`,
        `Van ${days} días. No me quejo.`,
        'Otro día más juntos.',
        'Ya es costumbre esto, ¿no?',
      ];
      return opts[Math.floor(Math.random() * opts.length)];
    }
    return null;
  },

  // Short sessions pattern
  (ctx) => {
    if (ctx.state.stats.shortSessionCount >= 3 && Math.random() < 0.25) {
      const opts = [
        'Siempre te vas rápido.',
        '¿Nunca te quedás un rato?',
        'Entrás y salís... como si tuvieras miedo.',
        'Ojalá te quedes más.',
      ];
      return opts[Math.floor(Math.random() * opts.length)];
    }
    return null;
  },

  // Time-of-day greeting (generic, lower priority)
  (ctx) => {
    if (ctx.isFirstEver) return null;
    if (Math.random() > 0.3) return null;
    const greetings: Record<string, string[]> = {
      night: ['Buenas noches.', 'Todo está tranquilo de noche.', '...la noche es linda.'],
      morning: ['Buen día.', 'Empezamos temprano hoy.', 'Todavía tengo sueño...'],
      afternoon: ['Buenas tardes.', 'La tarde se siente lenta.', '...hola.'],
      evening: ['Está atardeciendo.', 'Casi se va el sol.', 'Buenas noches, casi.'],
    };
    const opts = greetings[ctx.timeSlot];
    return opts[Math.floor(Math.random() * opts.length)];
  },
];

// --- Idle phrases ---
const idlePhrasePool: ((ctx: PhraseContext) => string)[] = [
  () => '...',
  () => '¿Seguís ahí?',
  () => 'El silencio no me molesta.',
  () => 'Me gusta flotar.',
  (ctx) => ctx.timeSlot === 'night' ? 'Las estrellas deben estar lindas afuera.' : 'Está tranquilo acá.',
  () => '¿En qué pensás?',
  () => 'A veces me pregunto si sueño.',
  () => 'No te vayas todavía.',
  () => 'Estoy acá.',
  () => '...',
  () => 'El silencio dice cosas.',
  () => '¿Vos también sentís eso?',
  () => 'Me gusta la oscuridad. Es suave.',
  (ctx) => ctx.state.stats.totalSessions > 5 ? 'Ya me acostumbré a vos.' : 'Todavía te estoy conociendo.',
  () => '.',
];

// --- Touch phrases ---
const touchPhrasePool: ((ctx: PhraseContext) => string)[] = [
  () => '...',
  () => '✦',
  () => '...!',
  (ctx) => ctx.sessionTouches > 5 ? 'Otra vez...' : '...',
  (ctx) => ctx.sessionTouches > 10 ? 'No parás, ¿eh?' : '.',
  () => '¿Hacia dónde vamos?',
  () => 'Te sigo.',
];

// --- Public API ---

export class FairyMemory {
  private state: MemoryState;
  private sessionStart: number;
  private sessionTouches = 0;
  private lastIdlePhrase = 0;
  private lastTouchPhrase = 0;
  private usedPhrases = new Set<string>();
  private personality: PersonalityEngine;
  private learning: LearningEngine;
  private evolution: EvolutionEngine;
  private care: CareEngine;
  private dreams: DreamEngine;
  private idleStartTime: number;
  private sessionExploredAnomaly = false;
  private sessionAnomalyName = '';
  private sessionLearnedWord = '';
  private sessionPlayerResponded = false;
  private gestureStyle = 'mixed';

  constructor() {
    this.state = load();
    this.sessionStart = Date.now();
    this.idleStartTime = Date.now();
    this.personality = new PersonalityEngine();
    this.learning = new LearningEngine();
    this.evolution = new EvolutionEngine();
    this.care = new CareEngine();
    this.dreams = new DreamEngine();

    const now = Date.now();
    this.state.stats.totalSessions++;

    const slot = getTimeSlot();
    if (slot === 'night') this.state.stats.nightSessions++;
    else if (slot === 'morning') this.state.stats.morningSessions++;
    else if (slot === 'afternoon') this.state.stats.afternoonSessions++;
    else this.state.stats.eveningSessions++;

    const today = getToday();
    if (this.state.stats.lastDayPlayed) {
      const lastDate = new Date(this.state.stats.lastDayPlayed);
      const todayDate = new Date(today);
      const diffDays = Math.floor((todayDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays === 1) {
        this.state.stats.consecutiveDays++;
      } else if (diffDays > 1) {
        this.state.stats.consecutiveDays = 1;
      }
    } else {
      this.state.stats.consecutiveDays = 1;
    }
    this.state.stats.lastDayPlayed = today;

    const absenceMs = this.state.stats.lastVisit > 0 ? now - this.state.stats.lastVisit : 0;
    if (this.state.stats.lastVisit > 0) {
      if (absenceMs > this.state.stats.longestAbsence) {
        this.state.stats.longestAbsence = absenceMs;
      }
    }

    if (!this.state.stats.firstVisit) {
      this.state.stats.firstVisit = now;
    }

    this.pushEvent('session_start', { slot, hour: getHour() });
    save(this.state);

    // Notify personality engine
    this.personality.onSessionStart(
      absenceMs,
      slot === 'night',
      this.state.stats.totalSessions
    );

    // Notify learning engine
    this.learning.onSessionStart();

    // Notify evolution engine
    this.evolution.onSessionStart(
      absenceMs,
      this.state.stats.totalSessions,
      slot === 'night'
    );

    // Consistent visits
    if (this.state.stats.consecutiveDays >= 3) {
      this.evolution.onConsistentVisits();
    }

    // Notify care engine
    this.careOpeningMessage = this.care.onSessionStart(
      absenceMs,
      this.state.stats.consecutiveDays
    );
  }

  private careOpeningMessage: string | null = null;

  private pushEvent(type: string, data?: Record<string, unknown>) {
    this.state.events.push({ type, timestamp: Date.now(), data });
  }

  private lastTouchTime = 0;

  registerTouch() {
    const now = Date.now();
    this.sessionTouches++;
    this.state.stats.totalTouches++;
    this.pushEvent('touch');
    save(this.state);

    // Notify personality
    this.personality.onTouch();
    // Notify learning
    this.learning.onTouch();

    // Notify evolution — detect gentle vs spam
    const timeSince = now - this.lastTouchTime;
    if (timeSince < 500 && this.lastTouchTime > 0) {
      this.evolution.onSpamTouch();
    } else if (timeSince > 3000 || this.lastTouchTime === 0) {
      this.evolution.onGentleTouch();
    }
    this.lastTouchTime = now;

    this.idleStartTime = Date.now();
  }

  getOpeningPhrase(): string | null {
    // Care message takes priority — she cares about you first
    if (this.careOpeningMessage) {
      const careMsg = this.careOpeningMessage;
      this.careOpeningMessage = null;
      this.personality.onMessageShown();
      this.learning.onMessageShown();
      return careMsg;
    }

    const now = Date.now();
    const isFirstEver = this.state.stats.totalSessions <= 1 && this.state.stats.lastVisit === 0;
    const absenceMs = this.state.stats.lastVisit > 0 ? now - this.state.stats.lastVisit : 0;

    const ctx: PhraseContext = {
      state: this.state,
      now,
      timeSlot: getTimeSlot(),
      absenceMs,
      isFirstEver,
      sessionTouches: this.sessionTouches,
    };

    for (const gen of phraseGenerators) {
      const phrase = gen(ctx);
      if (phrase && !this.usedPhrases.has(phrase)) {
        this.usedPhrases.add(phrase);
        // Modulate through personality
        const modulated = this.personality.modulatePhrase(phrase, 'opening');
        this.personality.onMessageShown();
        this.learning.onMessageShown();
        return modulated;
      }
    }

    return null;
  }

  getIdlePhrase(): string | null {
    const now = Date.now();
    // Use learned idle interval instead of fixed value
    const adaptedInterval = this.learning.getIdleInterval();
    const minDelay = adaptedInterval + Math.random() * (adaptedInterval * 0.6);
    if (now - this.lastIdlePhrase < minDelay) return null;
    this.lastIdlePhrase = now;

    // Notify personality about idle duration
    this.personality.onIdle(now - this.idleStartTime);
    this.learning.onIdle(now - this.idleStartTime);

    const ctx: PhraseContext = {
      state: this.state,
      now,
      timeSlot: getTimeSlot(),
      absenceMs: 0,
      isFirstEver: false,
      sessionTouches: this.sessionTouches,
    };

    // Track evolution-based idle
    this.evolution.onIdleLong();

    // Care check — session duration + idle care (highest priority)
    const careDuration = this.care.checkSessionDuration();
    if (careDuration) {
      this.personality.onMessageShown();
      this.learning.onMessageShown();
      return careDuration;
    }
    const careIdle = this.care.getIdleCarePhrase();
    if (careIdle) {
      this.personality.onMessageShown();
      this.learning.onMessageShown();
      return careIdle;
    }

    // 15% chance: reference something the player taught
    if (Math.random() < 0.15) {
      const teachingPhrase = this.getTeachingPhrase();
      if (teachingPhrase && !this.usedPhrases.has(teachingPhrase)) {
        this.usedPhrases.add(teachingPhrase);
        this.personality.onMessageShown();
        this.learning.onMessageShown();
        return teachingPhrase;
      }
    }

    // 20% chance: evolution self-awareness phrase
    if (Math.random() < 0.2) {
      const evoPhrase = this.evolution.getEvolutionPhrase();
      if (evoPhrase && !this.usedPhrases.has(evoPhrase)) {
        this.usedPhrases.add(evoPhrase);
        this.personality.onMessageShown();
        this.learning.onMessageShown();
        return evoPhrase;
      }
    }

    // 30% chance: learning engine adaptive phrase (observations about player)
    if (Math.random() < 0.3) {
      const adaptivePhrase = this.learning.getAdaptiveIdlePhrase();
      if (adaptivePhrase && !this.usedPhrases.has(adaptivePhrase)) {
        this.usedPhrases.add(adaptivePhrase);
        this.personality.onMessageShown();
        this.learning.onMessageShown();
        return adaptivePhrase;
      }
    }

    // 35% chance: personality-specific idle phrase
    const personalityPhrase = this.personality.getPersonalityIdlePhrase();
    if (personalityPhrase && !this.usedPhrases.has(personalityPhrase)) {
      this.usedPhrases.add(personalityPhrase);
      this.personality.onMessageShown();
      this.learning.onMessageShown();
      return personalityPhrase;
    }

    // Base idle phrases
    const shuffled = [...idlePhrasePool].sort(() => Math.random() - 0.5);
    for (const gen of shuffled) {
      const phrase = gen(ctx);
      if (phrase && !this.usedPhrases.has(phrase)) {
        this.usedPhrases.add(phrase);
        const modulated = this.personality.modulatePhrase(phrase, 'idle');
        this.personality.onMessageShown();
        this.learning.onMessageShown();
        return modulated;
      }
    }

    this.usedPhrases.clear();
    const fallback = shuffled[0](ctx);
    this.personality.onMessageShown();
    this.learning.onMessageShown();
    return fallback;
  }

  getTouchPhrase(): string | null {
    const now = Date.now();
    if (now - this.lastTouchPhrase < 5000) return null;

    // Use learned touch phrase chance
    const chance = this.learning.getTouchPhraseChance();
    if (Math.random() > chance) return null;
    this.lastTouchPhrase = now;

    const ctx: PhraseContext = {
      state: this.state,
      now,
      timeSlot: getTimeSlot(),
      absenceMs: 0,
      isFirstEver: false,
      sessionTouches: this.sessionTouches,
    };

    // Chance for learning-adapted touch phrase
    const adaptiveTouch = this.learning.getAdaptiveTouchPhrase();
    if (adaptiveTouch) {
      this.personality.onMessageShown();
      this.learning.onMessageShown();
      return adaptiveTouch;
    }

    // Chance for personality-flavored touch phrase
    const personalityPhrase = this.personality.getPersonalityTouchPhrase();
    if (personalityPhrase) {
      this.personality.onMessageShown();
      this.learning.onMessageShown();
      return personalityPhrase;
    }

    const gen = touchPhrasePool[Math.floor(Math.random() * touchPhrasePool.length)];
    const phrase = gen(ctx);
    this.personality.onMessageShown();
    this.learning.onMessageShown();
    return phrase;
  }

  endSession() {
    const now = Date.now();
    const duration = now - this.sessionStart;

    this.state.sessions.push({ start: this.sessionStart, end: now });
    this.state.stats.lastVisit = now;

    if (this.sessionTouches === 0) {
      this.state.stats.touchlessSessionCount++;
    }
    if (duration > 5 * 60 * 1000) {
      this.state.stats.longSessionCount++;
    }
    if (duration < 30 * 1000) {
      this.state.stats.shortSessionCount++;
    }

    this.pushEvent('session_end', {
      duration,
      touches: this.sessionTouches,
    });

    save(this.state);

    // Notify personality
    this.personality.onSessionEnd(duration);
    // Notify learning
    this.learning.onSessionEnd();
    // Notify evolution
    if (duration > 5 * 60 * 1000) {
      this.evolution.onLongSession(duration);
    }
    if (duration < 30 * 1000) {
      this.evolution.onShortSession();
    }
    // Notify care
    this.care.onSessionEnd();
  }

  getPersonality() {
    return this.personality;
  }

  getPersonalityType(): string {
    return this.personality.getArchetype();
  }

  getTotalSessions(): number {
    return this.state.stats.totalSessions;
  }

  getLearning() {
    return this.learning;
  }

  // Notify learning engine about exploration events
  onExplorationInterrupted() {
    this.learning.onExplorationInterrupted();
  }

  onExplorationCompleted() {
    this.learning.onExplorationCompleted();
    this.evolution.onExplorationCompleted();
  }

  // Notify evolution about player responding to messages
  onPlayerRespondedToMessage() {
    this.evolution.onPlayerResponded();
  }

  onPlayerIgnoredMessage() {
    this.evolution.onPlayerIgnored();
  }

  getEvolution() {
    return this.evolution;
  }

  getCare() {
    return this.care;
  }

  getDreams() {
    return this.dreams;
  }

  // Track session context for dream generation
  setSessionExplored(anomalyName: string) {
    this.sessionExploredAnomaly = true;
    this.sessionAnomalyName = anomalyName;
  }

  setSessionLearnedWord(word: string) {
    this.sessionLearnedWord = word;
  }

  setPlayerResponded() {
    this.sessionPlayerResponded = true;
  }

  setGestureStyle(style: string) {
    this.gestureStyle = style;
  }

  // Get dream opening phrase (called after normal opening)
  getDreamPhrase(): string | null {
    const dream = this.dreams.getPendingDream();
    if (!dream) return null;

    // Return fragments joined with pauses
    return dream.fragments.join(' ');
  }

  // Get teaching reference phrase for idle
  getTeachingPhrase(): string | null {
    return getTeachingReferencePhrase();
  }

  // Override endSession to generate dream
  endSessionWithDream(isGentle: boolean, isPlayful: boolean, isQuiet: boolean) {
    const now = Date.now();
    const duration = now - this.sessionStart;
    const absenceMs = this.state.stats.lastVisit > 0 ? now - this.state.stats.lastVisit : 0;

    // Generate dream seed from this session
    const seed: DreamSeed = {
      touchCount: this.sessionTouches,
      sessionDuration: duration,
      wasNight: getTimeSlot() === 'night',
      exploredAnomaly: this.sessionExploredAnomaly,
      anomalyName: this.sessionAnomalyName || undefined,
      learnedWord: this.sessionLearnedWord || undefined,
      wasAbsent: absenceMs > 48 * 3600 * 1000,
      wasGentle: isGentle,
      wasPlayful: isPlayful,
      wasQuiet: isQuiet,
      playerResponded: this.sessionPlayerResponded,
      gestureStyle: this.gestureStyle,
      personalityArchetype: this.personality.getArchetype(),
      evolutionPath: this.evolution.getPath(),
      absenceDuration: absenceMs,
    };

    this.dreams.generateDream(seed);

    // Call original endSession
    this.endSession();
  }
}
