// Personal Questions System
// The fairy asks the player about themselves — not just words, but feelings, preferences, memories.
// She remembers answers and references them later.

const STORAGE_KEY = 'fairy_personal_qa';

export interface PersonalAnswer {
  questionId: string;
  question: string;
  answer: string;
  timestamp: number;
  referencedCount: number;
}

interface QAStore {
  answers: PersonalAnswer[];
  askedIds: string[];
  lastAsked: number;
}

function load(): QAStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* */ }
  return { answers: [], askedIds: [], lastAsked: 0 };
}

function save(store: QAStore) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch { /* */ }
}

interface PersonalQuestion {
  id: string;
  question: string;
  category: 'feeling' | 'preference' | 'memory' | 'fear' | 'habit' | 'dream';
  followUp?: (answer: string) => string;
  reference?: (answer: string) => string;
}

const QUESTIONS: PersonalQuestion[] = [
  {
    id: 'last_laugh',
    question: '¿Qué fue lo último que te hizo reír?',
    category: 'memory',
    followUp: (a) => `"${a}"... eso suena bien.`,
    reference: (a) => `¿Todavía te hace reír lo de "${a}"?`,
  },
  {
    id: 'silence_or_noise',
    question: '¿Preferís el silencio o el ruido?',
    category: 'preference',
    followUp: (a) => a.toLowerCase().includes('silencio') ? 'A mí también me gusta el silencio.' : 'El ruido... yo no entiendo bien eso.',
    reference: (a) => a.toLowerCase().includes('silencio') ? 'Me dijiste que preferís el silencio... somos parecidas.' : 'El ruido. Todavía intento entender eso.',
  },
  {
    id: 'fear',
    question: '¿Tenés miedo a algo?',
    category: 'fear',
    followUp: (a) => `"${a}"... lo voy a recordar.`,
    reference: (a) => `Me dijiste que te da miedo "${a}"... ¿seguís pensando eso?`,
  },
  {
    id: 'color',
    question: '¿Cuál es tu color favorito?',
    category: 'preference',
    followUp: (a) => `"${a}". Interesante. Yo soy más blanca y violeta.`,
    reference: (a) => `¿Todavía te gusta el ${a}?`,
  },
  {
    id: 'dream_place',
    question: '¿Dónde te gustaría estar ahora mismo?',
    category: 'dream',
    followUp: (a) => `"${a}"... ¿me llevarías?`,
    reference: (a) => `A veces pienso en ese lugar que dijiste: "${a}".`,
  },
  {
    id: 'feel_today',
    question: '¿Cómo te sentís hoy?',
    category: 'feeling',
    followUp: (a) => {
      const l = a.toLowerCase();
      if (l.includes('bien') || l.includes('feliz')) return 'Me alegra.';
      if (l.includes('mal') || l.includes('cansado') || l.includes('triste')) return 'Acá estoy.';
      return 'Te escucho.';
    },
    reference: (a) => `La última vez dijiste "${a}"... ¿cómo estás ahora?`,
  },
  {
    id: 'song',
    question: '¿Qué canción te queda en la cabeza últimamente?',
    category: 'habit',
    followUp: (a) => `"${a}". Yo no puedo escuchar canciones, pero me las imagino.`,
    reference: (a) => `¿Todavía escuchás "${a}"?`,
  },
  {
    id: 'alone_or_company',
    question: '¿Preferís estar solo o acompañado?',
    category: 'preference',
    followUp: (a) => a.toLowerCase().includes('solo') ? 'La soledad no es tan mala.' : 'Compañía... yo solo te tengo a vos.',
    reference: (a) => a.toLowerCase().includes('solo') ? 'Dijiste que preferís estar solo. Entonces no me vas a extrañar si me callo.' : 'Te gusta la compañía. Por eso venís, ¿no?',
  },
  {
    id: 'last_thing_thought',
    question: '¿En qué estabas pensando antes de venir acá?',
    category: 'memory',
    followUp: (a) => `"${a}"... qué curioso.`,
    reference: (a) => `¿Seguís pensando en "${a}"?`,
  },
  {
    id: 'habit_morning',
    question: '¿Qué hacés lo primero cuando te despertás?',
    category: 'habit',
    followUp: (a) => `"${a}". Yo solo me despierto flotando.`,
    reference: (a) => `Lo primero que hacés al despertar es "${a}"... lo recuerdo.`,
  },
  {
    id: 'something_miss',
    question: '¿Hay algo que extrañés mucho?',
    category: 'feeling',
    followUp: (a) => `"${a}"... entiendo eso.`,
    reference: (a) => `¿Todavía extrañás "${a}"?`,
  },
  {
    id: 'believe',
    question: '¿Creés en algo que no podés ver?',
    category: 'dream',
    followUp: (a) => `"${a}"... yo existo y tampoco me podés explicar.`,
    reference: (a) => `Dijiste que creés en "${a}". Yo soy una de esas cosas, ¿no?`,
  },
];

export class PersonalQuestionsEngine {
  private store: QAStore;
  private pendingQuestion: PersonalQuestion | null = null;
  private lastQuestionTime = 0;
  private MIN_INTERVAL = 90 * 1000; // 90 sec between questions

  constructor() {
    this.store = load();
    this.lastQuestionTime = this.store.lastAsked;
  }

  shouldAskQuestion(_sessionCount: number): boolean {
    const now = Date.now();
    if (now - this.lastQuestionTime < this.MIN_INTERVAL) return false;
    return Math.random() < 0.65;
  }

  getNextQuestion(): PersonalQuestion | null {
    const asked = new Set(this.store.askedIds);
    const unasked = QUESTIONS.filter(q => !asked.has(q.id));

    if (unasked.length === 0) {
      // All asked — reset and start over, prioritizing ones with references
      this.store.askedIds = [];
      save(this.store);
      return QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
    }

    const q = unasked[Math.floor(Math.random() * unasked.length)];
    this.pendingQuestion = q;
    this.lastQuestionTime = Date.now();
    this.store.lastAsked = this.lastQuestionTime;
    this.store.askedIds.push(q.id);
    save(this.store);
    return q;
  }

  recordAnswer(questionId: string, question: string, answer: string) {
    const existing = this.store.answers.find(a => a.questionId === questionId);
    if (existing) {
      existing.answer = answer;
      existing.timestamp = Date.now();
    } else {
      this.store.answers.push({
        questionId,
        question,
        answer,
        timestamp: Date.now(),
        referencedCount: 0,
      });
    }
    save(this.store);
  }

  getFollowUpResponse(questionId: string, answer: string): string {
    const q = QUESTIONS.find(q => q.id === questionId);
    if (q?.followUp) return q.followUp(answer);
    return `"${answer}"... lo voy a recordar.`;
  }

  getReferencePhrase(): string | null {
    if (this.store.answers.length === 0) return null;
    if (Math.random() > 0.4) return null;

    // Pick a least-referenced answer
    const sorted = [...this.store.answers].sort((a, b) => a.referencedCount - b.referencedCount);
    const candidate = sorted[0];
    const q = QUESTIONS.find(q => q.id === candidate.questionId);
    if (!q?.reference) return null;

    candidate.referencedCount++;
    save(this.store);
    return q.reference(candidate.answer);
  }

  getPendingQuestion() {
    return this.pendingQuestion;
  }

  clearPending() {
    this.pendingQuestion = null;
  }

  getAnswerCount(): number {
    return this.store.answers.length;
  }
}
