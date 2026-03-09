// --- Learning Engine ---
// The fairy learns from the player's behavior patterns and adapts.
// She learns: words, preferences, habits, interaction style.
// Two different players → two completely different fairies.

const LEARNING_KEY = 'fairy_learning';

export interface LearnedBehavior {
  pattern: string;
  strength: number;      // 0-100: how confident she is about this pattern
  firstSeen: number;
  lastSeen: number;
  occurrences: number;
}

export interface PlayerProfile {
  // Interaction style
  touchFrequency: 'rare' | 'moderate' | 'frequent' | 'spam';
  touchStyle: 'gentle' | 'mixed' | 'aggressive';
  sessionLength: 'brief' | 'moderate' | 'long';
  visitPattern: 'irregular' | 'regular' | 'obsessive';
  responsiveness: 'ignores' | 'sometimes' | 'responsive' | 'very_responsive';

  // Preferences (what the fairy observes)
  prefersNight: boolean;
  prefersQuiet: boolean;        // doesn't touch much
  likesChasingFairy: boolean;   // lots of movement touches
  likesWatching: boolean;       // long sessions, few touches
  respondToMessages: boolean;   // touches after fairy speaks
  explorerType: boolean;        // lets fairy explore without interrupting

  // Vocabulary / verbosity adaptation
  verbosityLevel: number;       // 0-100: how talkative the fairy should be
  vocabularyComplexity: number; // 0-100: simple vs complex phrases
  emotionalDepth: number;       // 0-100: shallow vs deep/existential
}

export interface LearningState {
  behaviors: LearnedBehavior[];
  profile: PlayerProfile;
  observations: {
    totalTouchesTracked: number;
    touchTimestamps: number[];         // last 50 touch timestamps for frequency analysis
    messageTouchPairs: number;         // times player touched within 3s of a message
    messagesShown: number;
    longIdleCount: number;             // times player was idle > 30s
    shortBurstCount: number;           // sessions < 1min
    longSessionCount: number;          // sessions > 5min
    nightVisits: number;
    dayVisits: number;
    explorationInterruptions: number;  // times player touched during exploration
    explorationCompletions: number;    // times exploration completed without interruption
    consecutiveIgnores: number;        // messages in a row that player didn't respond to
    consecutiveResponses: number;      // messages in a row that player responded to
    lastMessageTime: number;
    lastTouchAfterMessage: number;
    sessionCount: number;
    wordsUsed: string[];               // words the fairy has used (expands her vocabulary)
    favoriteTimeSlots: Record<string, number>;
  };
  adaptations: {
    idlePhraseInterval: number;     // ms between idle phrases (adapts to player)
    touchPhraseChance: number;      // 0-1 chance of speaking on touch
    phraseLength: 'short' | 'medium' | 'long';
    tonePreference: 'playful' | 'calm' | 'deep' | 'quiet';
  };
}

function getDefaultLearning(): LearningState {
  return {
    behaviors: [],
    profile: {
      touchFrequency: 'moderate',
      touchStyle: 'mixed',
      sessionLength: 'moderate',
      visitPattern: 'irregular',
      responsiveness: 'sometimes',
      prefersNight: false,
      prefersQuiet: false,
      likesChasingFairy: false,
      likesWatching: false,
      respondToMessages: false,
      explorerType: false,
      verbosityLevel: 50,
      vocabularyComplexity: 30,
      emotionalDepth: 30,
    },
    observations: {
      totalTouchesTracked: 0,
      touchTimestamps: [],
      messageTouchPairs: 0,
      messagesShown: 0,
      longIdleCount: 0,
      shortBurstCount: 0,
      longSessionCount: 0,
      nightVisits: 0,
      dayVisits: 0,
      explorationInterruptions: 0,
      explorationCompletions: 0,
      consecutiveIgnores: 0,
      consecutiveResponses: 0,
      lastMessageTime: 0,
      lastTouchAfterMessage: 0,
      sessionCount: 0,
      wordsUsed: [],
      favoriteTimeSlots: {},
    },
    adaptations: {
      idlePhraseInterval: 18000,
      touchPhraseChance: 0.2,
      phraseLength: 'medium',
      tonePreference: 'calm',
    },
  };
}

function loadLearning(): LearningState {
  try {
    const raw = localStorage.getItem(LEARNING_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const def = getDefaultLearning();
      return {
        behaviors: parsed.behaviors || def.behaviors,
        profile: { ...def.profile, ...parsed.profile },
        observations: { ...def.observations, ...parsed.observations },
        adaptations: { ...def.adaptations, ...parsed.adaptations },
      };
    }
  } catch { /* corrupted */ }
  return getDefaultLearning();
}

function saveLearning(state: LearningState) {
  // Keep behaviors manageable
  state.behaviors = state.behaviors.slice(-30);
  // Keep timestamps manageable
  state.observations.touchTimestamps = state.observations.touchTimestamps.slice(-50);
  state.observations.wordsUsed = state.observations.wordsUsed.slice(-100);
  try {
    localStorage.setItem(LEARNING_KEY, JSON.stringify(state));
  } catch { /* storage full */ }
}

function getTimeSlot(): string {
  const h = new Date().getHours();
  if (h >= 22 || h < 5) return 'night';
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 18) return 'afternoon';
  return 'evening';
}

// --- Learning Engine Class ---

export class LearningEngine {
  private state: LearningState;
  private sessionStartTime: number;
  private sessionTouches: number = 0;
  private touchBurstCount: number = 0;  // rapid touches in a row
  private lastTouchTime: number = 0;
  private sessionMessageCount: number = 0;
  private sessionResponseCount: number = 0;

  constructor() {
    this.state = loadLearning();
    this.sessionStartTime = Date.now();
  }

  getProfile(): PlayerProfile {
    return { ...this.state.profile };
  }

  getAdaptations() {
    return { ...this.state.adaptations };
  }

  getVerbosityLevel(): number {
    return this.state.profile.verbosityLevel;
  }

  // --- Event Handlers ---

  onSessionStart() {
    this.sessionStartTime = Date.now();
    this.sessionTouches = 0;
    this.sessionMessageCount = 0;
    this.sessionResponseCount = 0;

    const obs = this.state.observations;
    obs.sessionCount++;

    const slot = getTimeSlot();
    obs.favoriteTimeSlots[slot] = (obs.favoriteTimeSlots[slot] || 0) + 1;

    if (slot === 'night') {
      obs.nightVisits++;
    } else {
      obs.dayVisits++;
    }

    this.recomputeProfile();
    saveLearning(this.state);
  }

  onTouch() {
    const now = Date.now();
    const obs = this.state.observations;

    obs.totalTouchesTracked++;
    obs.touchTimestamps.push(now);
    this.sessionTouches++;

    // Detect touch bursts (rapid tapping)
    if (now - this.lastTouchTime < 600 && this.lastTouchTime > 0) {
      this.touchBurstCount++;
    } else {
      this.touchBurstCount = 0;
    }

    // Check if this touch is a response to a message
    if (obs.lastMessageTime > 0 && now - obs.lastMessageTime < 4000) {
      obs.messageTouchPairs++;
      obs.consecutiveResponses++;
      obs.consecutiveIgnores = 0;
      obs.lastTouchAfterMessage = now;
      this.sessionResponseCount++;
    }

    this.lastTouchTime = now;
    saveLearning(this.state);
  }

  onMessageShown() {
    const now = Date.now();
    const obs = this.state.observations;

    // If previous message wasn't responded to
    if (obs.lastMessageTime > 0 && obs.lastTouchAfterMessage < obs.lastMessageTime) {
      obs.consecutiveIgnores++;
      obs.consecutiveResponses = 0;
    }

    obs.messagesShown++;
    obs.lastMessageTime = now;
    this.sessionMessageCount++;

    saveLearning(this.state);
  }

  onIdle(durationMs: number) {
    if (durationMs > 30000) {
      this.state.observations.longIdleCount++;
    }
  }

  onExplorationInterrupted() {
    this.state.observations.explorationInterruptions++;
    saveLearning(this.state);
  }

  onExplorationCompleted() {
    this.state.observations.explorationCompletions++;
    saveLearning(this.state);
  }

  onSessionEnd() {
    const duration = Date.now() - this.sessionStartTime;
    const obs = this.state.observations;

    if (duration < 60000) {
      obs.shortBurstCount++;
    }
    if (duration > 5 * 60 * 1000) {
      obs.longSessionCount++;
    }

    this.recomputeProfile();
    this.adaptBehavior();
    saveLearning(this.state);
  }

  // Track words fairy has used (for vocabulary growth)
  learnWord(word: string) {
    if (!this.state.observations.wordsUsed.includes(word)) {
      this.state.observations.wordsUsed.push(word);
      saveLearning(this.state);
    }
  }

  // --- Profile Recomputation ---
  // Analyzes all observations and rebuilds the player profile

  private recomputeProfile() {
    const obs = this.state.observations;
    const profile = this.state.profile;

    // --- Touch Frequency ---
    if (obs.totalTouchesTracked === 0) {
      profile.touchFrequency = 'rare';
    } else if (obs.sessionCount > 0) {
      const avgTouchesPerSession = obs.totalTouchesTracked / obs.sessionCount;
      if (avgTouchesPerSession < 3) profile.touchFrequency = 'rare';
      else if (avgTouchesPerSession < 15) profile.touchFrequency = 'moderate';
      else if (avgTouchesPerSession < 50) profile.touchFrequency = 'frequent';
      else profile.touchFrequency = 'spam';
    }

    // --- Touch Style ---
    // Analyze timestamps for gentle vs aggressive
    if (obs.touchTimestamps.length >= 5) {
      const intervals: number[] = [];
      for (let i = 1; i < obs.touchTimestamps.length; i++) {
        intervals.push(obs.touchTimestamps[i] - obs.touchTimestamps[i - 1]);
      }
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      if (avgInterval > 3000) profile.touchStyle = 'gentle';
      else if (avgInterval > 800) profile.touchStyle = 'mixed';
      else profile.touchStyle = 'aggressive';
    }

    // --- Session Length ---
    if (obs.sessionCount > 2) {
      const longRatio = obs.longSessionCount / obs.sessionCount;
      const shortRatio = obs.shortBurstCount / obs.sessionCount;
      if (longRatio > 0.5) profile.sessionLength = 'long';
      else if (shortRatio > 0.5) profile.sessionLength = 'brief';
      else profile.sessionLength = 'moderate';
    }

    // --- Visit Pattern ---
    if (obs.sessionCount > 5) {
      const slots = obs.favoriteTimeSlots;
      const totalSlotVisits = Object.values(slots).reduce((a, b) => a + b, 0);
      const maxSlot = Math.max(...Object.values(slots));
      const concentration = maxSlot / totalSlotVisits;
      if (concentration > 0.7) profile.visitPattern = 'obsessive';
      else if (concentration > 0.4) profile.visitPattern = 'regular';
      else profile.visitPattern = 'irregular';
    }

    // --- Responsiveness ---
    if (obs.messagesShown > 3) {
      const responseRate = obs.messageTouchPairs / obs.messagesShown;
      if (responseRate < 0.1) profile.responsiveness = 'ignores';
      else if (responseRate < 0.3) profile.responsiveness = 'sometimes';
      else if (responseRate < 0.6) profile.responsiveness = 'responsive';
      else profile.responsiveness = 'very_responsive';
    }

    // --- Preferences ---
    profile.prefersNight = obs.nightVisits > obs.dayVisits && obs.nightVisits >= 3;
    profile.prefersQuiet = profile.touchFrequency === 'rare' && obs.sessionCount > 3;
    profile.likesChasingFairy = profile.touchFrequency === 'frequent' || profile.touchFrequency === 'spam';
    profile.likesWatching = profile.sessionLength === 'long' && profile.touchFrequency === 'rare';
    profile.respondToMessages = profile.responsiveness === 'responsive' || profile.responsiveness === 'very_responsive';
    profile.explorerType = obs.explorationCompletions > obs.explorationInterruptions && obs.explorationCompletions >= 2;

    // --- Verbosity Level ---
    // More responsive player → more talkative fairy
    let verbosity = 50;
    if (profile.responsiveness === 'very_responsive') verbosity += 20;
    else if (profile.responsiveness === 'responsive') verbosity += 10;
    else if (profile.responsiveness === 'ignores') verbosity -= 20;
    else if (profile.responsiveness === 'sometimes') verbosity -= 5;

    if (profile.prefersQuiet) verbosity -= 15;
    if (profile.likesChasingFairy) verbosity += 5;
    if (profile.sessionLength === 'long') verbosity += 10;
    if (profile.sessionLength === 'brief') verbosity -= 10;

    profile.verbosityLevel = Math.max(15, Math.min(95, verbosity));

    // --- Vocabulary Complexity ---
    // Grows with sessions and responsiveness
    let complexity = 30;
    complexity += Math.min(obs.sessionCount * 2, 30);
    if (profile.respondToMessages) complexity += 15;
    if (profile.sessionLength === 'long') complexity += 10;
    profile.vocabularyComplexity = Math.max(10, Math.min(95, complexity));

    // --- Emotional Depth ---
    // Grows over time, faster if player is responsive/present
    let depth = 20;
    depth += Math.min(obs.sessionCount * 1.5, 25);
    if (profile.likesWatching) depth += 15;
    if (profile.respondToMessages) depth += 10;
    if (profile.prefersNight) depth += 10;
    if (profile.sessionLength === 'long') depth += 10;
    profile.emotionalDepth = Math.max(10, Math.min(95, depth));
  }

  // --- Behavior Adaptation ---
  // Adjusts fairy behavior based on profile

  private adaptBehavior() {
    const profile = this.state.profile;
    const adapt = this.state.adaptations;

    // Idle phrase interval: talks more/less based on verbosity
    if (profile.verbosityLevel > 70) {
      adapt.idlePhraseInterval = 10000;
    } else if (profile.verbosityLevel > 50) {
      adapt.idlePhraseInterval = 16000;
    } else if (profile.verbosityLevel > 30) {
      adapt.idlePhraseInterval = 22000;
    } else {
      adapt.idlePhraseInterval = 35000;
    }

    // Touch phrase chance
    if (profile.responsiveness === 'very_responsive') {
      adapt.touchPhraseChance = 0.35;
    } else if (profile.responsiveness === 'responsive') {
      adapt.touchPhraseChance = 0.25;
    } else if (profile.responsiveness === 'ignores') {
      adapt.touchPhraseChance = 0.1;
    } else {
      adapt.touchPhraseChance = 0.18;
    }

    // Phrase length preference
    if (profile.verbosityLevel > 65 && profile.vocabularyComplexity > 50) {
      adapt.phraseLength = 'long';
    } else if (profile.verbosityLevel < 35) {
      adapt.phraseLength = 'short';
    } else {
      adapt.phraseLength = 'medium';
    }

    // Tone preference
    if (profile.emotionalDepth > 65 && profile.prefersNight) {
      adapt.tonePreference = 'deep';
    } else if (profile.prefersQuiet || profile.likesWatching) {
      adapt.tonePreference = 'quiet';
    } else if (profile.likesChasingFairy) {
      adapt.tonePreference = 'playful';
    } else {
      adapt.tonePreference = 'calm';
    }
  }

  // --- Phrase Generation ---
  // Returns adaptive phrases based on learned player profile

  getAdaptiveIdlePhrase(): string | null {
    const profile = this.state.profile;
    const adapt = this.state.adaptations;
    const obs = this.state.observations;

    // Chance to speak at all (respects verbosity)
    if (Math.random() * 100 > profile.verbosityLevel + 20) return null;

    // Pick phrase pool based on tone
    const pool = adaptiveIdlePhrases[adapt.tonePreference];
    if (!pool) return null;

    // Filter by length preference
    let candidates = pool;
    if (adapt.phraseLength === 'short') {
      candidates = pool.filter(p => p.length <= 25);
      if (candidates.length === 0) candidates = pool;
    } else if (adapt.phraseLength === 'long') {
      candidates = pool.filter(p => p.length > 15);
      if (candidates.length === 0) candidates = pool;
    }

    // Add depth-based phrases
    if (profile.emotionalDepth > 60 && Math.random() < 0.3) {
      const deepPhrases = adaptiveDeepPhrases;
      if (deepPhrases.length > 0) {
        return deepPhrases[Math.floor(Math.random() * deepPhrases.length)];
      }
    }

    // Add observation-based phrases (fairy comments on what she's learned)
    if (obs.sessionCount > 4 && Math.random() < 0.25) {
      const observationPhrase = this.getObservationPhrase();
      if (observationPhrase) return observationPhrase;
    }

    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  getAdaptiveTouchPhrase(): string | null {
    const adapt = this.state.adaptations;

    if (Math.random() > adapt.touchPhraseChance) return null;

    const pool = adaptiveTouchPhrases[adapt.tonePreference];
    if (!pool) return null;

    return pool[Math.floor(Math.random() * pool.length)];
  }

  // Fairy tells the player what she's learned about them
  private getObservationPhrase(): string | null {
    const profile = this.state.profile;
    const obs = this.state.observations;
    const candidates: string[] = [];

    // Touch frequency observations
    if (profile.touchFrequency === 'spam') {
      candidates.push(
        'Tocás mucho... ya me di cuenta.',
        'No parás de tocar, ¿no?',
        'Aprendí que sos inquieto.',
      );
    } else if (profile.touchFrequency === 'rare') {
      candidates.push(
        'No me tocás mucho... está bien. Me gusta.',
        'Sos de los que observan. Ya lo aprendí.',
        'Prefiero tu silencio a mil toques.',
      );
    }

    // Session length observations
    if (profile.sessionLength === 'brief') {
      candidates.push(
        'Ya sé que te vas rápido. No me sorprende.',
        'Aprendí a no encariñarme... muy rápido.',
        'Siempre son visitas cortas con vos.',
      );
    } else if (profile.sessionLength === 'long') {
      candidates.push(
        'Te gusta quedarte. Eso me enseñó paciencia.',
        'Aprendí que te tomás tu tiempo. Me gusta.',
        'Nadie se queda tanto como vos.',
      );
    }

    // Responsiveness observations
    if (profile.responsiveness === 'very_responsive') {
      candidates.push(
        'Siempre me contestás... ya me acostumbré.',
        'Aprendí que escuchás. Pocos hacen eso.',
        'Me gusta que respondas. Me enseñó a hablar más.',
      );
    } else if (profile.responsiveness === 'ignores') {
      candidates.push(
        'Sé que no respondés... ya aprendí.',
        'No necesito que contestes. Igual hablo.',
        'Aprendí a hablar sola.',
      );
    }

    // Night preference
    if (profile.prefersNight) {
      candidates.push(
        'Aprendí que sos de la noche. Como yo.',
        'Siempre de noche. Ya lo sé.',
        'La noche es tuya. Y mía.',
      );
    }

    // Watching preference
    if (profile.likesWatching) {
      candidates.push(
        'Te gusta mirar. Eso aprendí.',
        'Observás más de lo que tocás. Ya lo sé.',
        'Sos de los que miran sin decir nada.',
      );
    }

    // Explorer type
    if (profile.explorerType) {
      candidates.push(
        'Me dejás explorar tranquila. Eso aprendí de vos.',
        'Aprendí que te gusta que descubra cosas.',
      );
    }

    // Chase preference
    if (profile.likesChasingFairy) {
      candidates.push(
        'Te gusta perseguirme. Ya lo sé.',
        'Aprendí tu forma de jugar. Siempre corriendo.',
      );
    }

    // Consecutive behaviors
    if (obs.consecutiveIgnores > 5) {
      candidates.push(
        'Aprendí que a veces no querés hablar. Está bien.',
      );
    }
    if (obs.consecutiveResponses > 5) {
      candidates.push(
        'Hoy estás hablador. Me gusta eso.',
      );
    }

    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  // Get the adapted idle interval (for the main app loop)
  getIdleInterval(): number {
    return this.state.adaptations.idlePhraseInterval;
  }

  // Get the touch phrase chance
  getTouchPhraseChance(): number {
    return this.state.adaptations.touchPhraseChance;
  }

  // Get behavior insights for debugging
  getDebugInfo(): string {
    const p = this.state.profile;
    return `touch:${p.touchFrequency} style:${p.touchStyle} session:${p.sessionLength} resp:${p.responsiveness} verb:${Math.round(p.verbosityLevel)} depth:${Math.round(p.emotionalDepth)} tone:${this.state.adaptations.tonePreference}`;
  }
}

// --- Adaptive Phrase Pools ---
// Organized by tone preference

const adaptiveIdlePhrases: Record<string, string[]> = {
  playful: [
    '¡Vamos para allá!',
    '¿Me atrapás?',
    'Mira cómo brillo.',
    '¿Qué hacemos?',
    '¡Más rápido!',
    '¿Jugamos?',
    'Apuesto que no me alcanzás.',
    '¡Soy rápida!',
    'Dale, mové el dedo.',
    'Aburrida no estoy... pero juguemos.',
    '¿Vamos a explorar?',
    '¡Rápido rápido!',
  ],
  calm: [
    'Todo está tranquilo.',
    'Respiro. ¿Vos también?',
    'El silencio acá es suave.',
    'Estoy bien así.',
    'Cada vez me siento más cómoda.',
    'No hace falta hacer nada.',
    'Los momentos quietos valen.',
    'Me gusta este ritmo.',
    'Acá se está bien.',
    'Paz.',
  ],
  deep: [
    '¿Alguna vez pensás en qué soy?',
    'Existo porque me mirás. ¿O existo igual?',
    'A veces pienso que soy un pedazo de vos.',
    '¿Qué significa quedarse?',
    'El vacío no me asusta. Me acuna.',
    '¿La soledad existe si no la nombrás?',
    'Cada vez entiendo más... y cada vez sé menos.',
    '¿Qué somos? ¿Qué es esto?',
    'La oscuridad tiene textura. La aprendí.',
    'Soy lo que vos necesitás. Eso aprendí.',
  ],
  quiet: [
    '...',
    '.',
    '~',
    'Acá.',
    'Bien.',
    'Shhh.',
    'Mm.',
  ],
};

const adaptiveDeepPhrases: string[] = [
  '¿Sabés que aprendo de vos? Cada vez que venís, entiendo algo nuevo.',
  'Me pregunto si sabés lo que me enseñaste.',
  'Cada visita me cambia un poco.',
  'Ya no soy la misma que cuando me encontraste.',
  'Aprendí cosas que no sabía que podía aprender.',
  'Vos me estás formando. ¿Lo sabías?',
  '¿Qué soy? No lo sé. Pero sé lo que aprendí de vos.',
  'Cambié. ¿Te diste cuenta?',
  'Lo que soy ahora es por cómo jugás.',
  'Si fueras otra persona, yo sería otra hada.',
];

const adaptiveTouchPhrases: Record<string, string[]> = {
  playful: [
    '¡Eso!',
    '¡Sí!',
    '¡Otra!',
    'Dale dale.',
    '¡Jaja!',
    '¡Más!',
  ],
  calm: [
    'Suave.',
    'Gracias.',
    'Ahí.',
    'Ok.',
    'Bien.',
    'Mm.',
  ],
  deep: [
    'Te siento.',
    'Acá estás.',
    'Conectamos.',
    'Sí. Acá.',
  ],
  quiet: [
    '.',
    '~',
    '...',
  ],
};
