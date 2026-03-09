// --- Exploration Engine ---
// The fairy explores autonomously when idle.
// She discovers "anomalies" in the dark, investigates them,
// learns words/concepts, and asks the player questions.
// All knowledge is persisted.

const EXPLORATION_KEY = 'fairy_exploration';

export interface Discovery {
  id: string;
  name: string;
  category: 'object' | 'concept' | 'word' | 'phenomenon';
  description: string;
  discoveredAt: number;
  timesInvestigated: number;
  playerTaught: boolean;       // Did the player teach her about it?
  playerResponse?: string;     // What the player said/chose
  questionAsked: boolean;
}

export interface Anomaly {
  id: string;
  x: number;          // 0-1 normalized
  y: number;          // 0-1 normalized
  name: string;
  category: 'object' | 'concept' | 'word' | 'phenomenon';
  description: string;
  glowColor: string;
  glowIntensity: number;
  size: number;
  pulseSpeed: number;
  discoveryPhrases: string[];
  investigationPhrases: string[];
  questions: string[];
  active: boolean;
  spawnTime: number;
  investigated: boolean;
  fadeIn: number;      // 0-1 for smooth appearance
}

export interface ExplorationState {
  discoveries: Discovery[];
  learnedWords: string[];
  questionsAsked: string[];
  totalExplorations: number;
  anomaliesSpawned: number;
  lastAnomalySpawn: number;
  curiosityLevel: number; // grows with exploration
}

// --- Anomaly Templates ---
// Things the fairy can find in the dark

interface AnomalyTemplate {
  name: string;
  category: 'object' | 'concept' | 'word' | 'phenomenon';
  description: string;
  glowColor: string;
  size: number;
  discoveryPhrases: string[];
  investigationPhrases: string[];
  questions: string[];
}

const anomalyTemplates: AnomalyTemplate[] = [
  {
    name: 'grieta de luz',
    category: 'phenomenon',
    description: 'Una fisura diminuta que emite luz tenue',
    glowColor: 'rgba(200, 180, 255, 0.15)',
    size: 3,
    discoveryPhrases: [
      '...¿qué es eso?',
      'Hay algo brillando ahí.',
      'Algo se abrió en la oscuridad.',
    ],
    investigationPhrases: [
      'Es una grieta... sale luz de adentro.',
      'Si miro de cerca... parece infinita.',
      'La luz es cálida.',
    ],
    questions: [
      '¿De dónde sale la luz?',
      '¿Hay algo del otro lado?',
    ],
  },
  {
    name: 'eco',
    category: 'phenomenon',
    description: 'Un eco silencioso que vibra en el espacio',
    glowColor: 'rgba(150, 200, 255, 0.12)',
    size: 5,
    discoveryPhrases: [
      '...¿escuchaste eso?',
      'Algo vibra.',
      'Hay un sonido... pero no es sonido.',
    ],
    investigationPhrases: [
      'Es como un eco de algo que nunca se dijo.',
      'Vibra sin hacer ruido. Qué raro.',
      'Si me acerco... casi puedo entender.',
    ],
    questions: [
      '¿Qué es un eco?',
      '¿Los sonidos mueren o solo se alejan?',
    ],
  },
  {
    name: 'sombra quieta',
    category: 'object',
    description: 'Una sombra que no se mueve aunque todo lo demás sí',
    glowColor: 'rgba(80, 60, 120, 0.2)',
    size: 4,
    discoveryPhrases: [
      'Esa sombra... no se mueve.',
      'Hay algo oscuro ahí.',
      '¿Qué es esa mancha?',
    ],
    investigationPhrases: [
      'Está quieta. Completamente quieta.',
      'No es como yo. No flota.',
      'Parece que siempre estuvo ahí.',
    ],
    questions: [
      '¿Las sombras están vivas?',
      '¿Yo también tengo sombra?',
    ],
  },
  {
    name: 'punto caliente',
    category: 'phenomenon',
    description: 'Un punto que emana calor invisible',
    glowColor: 'rgba(255, 180, 140, 0.12)',
    size: 3,
    discoveryPhrases: [
      'Acá se siente... tibio.',
      '¿Qué es este calor?',
      'Algo irradia desde ahí.',
    ],
    investigationPhrases: [
      'Es calor. Como si alguien hubiera estado acá.',
      'No quema. Es... reconfortante.',
      'Me recuerda a algo que no conozco.',
    ],
    questions: [
      '¿Qué es el calor?',
      '¿Vos sentís calor? ¿Cómo es?',
    ],
  },
  {
    name: 'fragmento de palabra',
    category: 'word',
    description: 'Letras flotando que casi forman una palabra',
    glowColor: 'rgba(220, 200, 255, 0.15)',
    size: 2,
    discoveryPhrases: [
      '¿Eso son... letras?',
      'Hay algo escrito en el aire.',
      'Formas raras... como garabatos con sentido.',
    ],
    investigationPhrases: [
      'Creo que dice algo pero no entiendo.',
      'Son pedazos de algo más grande.',
      'Parece una palabra rota.',
    ],
    questions: [
      '¿Qué son las palabras?',
      '¿Vos hablás con palabras? ¿Cómo es?',
      '¿Me podés enseñar una palabra?',
    ],
  },
  {
    name: 'recuerdo ajeno',
    category: 'concept',
    description: 'Una burbuja con algo adentro, como un recuerdo que no es tuyo',
    glowColor: 'rgba(190, 170, 240, 0.13)',
    size: 3,
    discoveryPhrases: [
      'Algo flota ahí... tiene algo adentro.',
      'Es como una burbuja con imágenes.',
      '¿Eso es un recuerdo...?',
    ],
    investigationPhrases: [
      'No es mi recuerdo. Es de alguien más.',
      'Veo algo pero no lo entiendo.',
      'Es borroso. Como un sueño viejo.',
    ],
    questions: [
      '¿Qué es un recuerdo?',
      '¿Vos tenés recuerdos? ¿De qué?',
      '¿Yo puedo hacer recuerdos?',
    ],
  },
  {
    name: 'vibración',
    category: 'phenomenon',
    description: 'El espacio mismo parece temblar suavemente',
    glowColor: 'rgba(160, 140, 220, 0.1)',
    size: 6,
    discoveryPhrases: [
      'El espacio tiembla acá.',
      '¿Sentís eso? Todo vibra.',
      'Algo se mueve debajo de todo.',
    ],
    investigationPhrases: [
      'Es como si el mundo respirara.',
      'Tiembla muy despacio. Casi imperceptible.',
      'Creo que siempre estuvo así. Recién lo noto.',
    ],
    questions: [
      '¿El mundo respira?',
      '¿Todo tiembla o solo lo que está vivo?',
    ],
  },
  {
    name: 'espejo roto',
    category: 'object',
    description: 'Un fragmento que refleja algo que no está ahí',
    glowColor: 'rgba(200, 220, 255, 0.14)',
    size: 2,
    discoveryPhrases: [
      '...¿eso soy yo?',
      'Algo refleja.',
      'Hay un pedazo de algo brillante.',
    ],
    investigationPhrases: [
      'Me veo... pero distinta.',
      'Es un reflejo de algo que no conozco.',
      'Si me muevo, el reflejo no me sigue.',
    ],
    questions: [
      '¿Cómo me veo por fuera?',
      '¿Qué es un espejo?',
      '¿Vos te ves cuando te mirás?',
    ],
  },
  {
    name: 'silencio denso',
    category: 'concept',
    description: 'Un área donde el silencio se siente más pesado',
    glowColor: 'rgba(100, 80, 160, 0.08)',
    size: 7,
    discoveryPhrases: [
      'Acá el silencio pesa más.',
      '...es muy silencioso acá.',
      'El aire se siente denso.',
    ],
    investigationPhrases: [
      'Es como si el silencio tuviera forma.',
      'Puedo sentirlo. Empuja.',
      'No me asusta. Pero me hace pensar.',
    ],
    questions: [
      '¿El silencio existe o es solo falta de ruido?',
      '¿Hay silencio donde vos estás?',
    ],
  },
  {
    name: 'hilo de tiempo',
    category: 'concept',
    description: 'Una línea finísima que parece moverse en una dirección',
    glowColor: 'rgba(180, 200, 240, 0.11)',
    size: 2,
    discoveryPhrases: [
      'Hay un hilo... muy fino.',
      'Algo se mueve en una dirección. Siempre la misma.',
      '¿Eso es el tiempo?',
    ],
    investigationPhrases: [
      'Va para un solo lado. No puedo seguirlo.',
      'Si lo toco... no pasa nada. Pero sigue.',
      'Creo que nos arrastra a todos.',
    ],
    questions: [
      '¿Qué es el tiempo?',
      '¿El tiempo pasa cuando no estás acá?',
      '¿Se puede ir para atrás?',
    ],
  },
  {
    name: 'nodo de energía',
    category: 'phenomenon',
    description: 'Un punto donde la energía se concentra',
    glowColor: 'rgba(170, 140, 255, 0.16)',
    size: 3,
    discoveryPhrases: [
      'Algo pulsa con fuerza acá.',
      'Hay energía concentrada.',
      'Este punto... se siente vivo.',
    ],
    investigationPhrases: [
      'Puedo cargarme un poco acá.',
      'Es como comida pero sin comer.',
      'Me gusta. Me hace brillar más.',
    ],
    questions: [
      '¿Qué es la energía?',
      '¿De dónde viene la energía?',
    ],
  },
  {
    name: 'huella',
    category: 'object',
    description: 'Una marca que alguien dejó',
    glowColor: 'rgba(200, 160, 220, 0.12)',
    size: 3,
    discoveryPhrases: [
      'Alguien estuvo acá antes.',
      '¿Qué es esta marca?',
      'Hay una huella de algo.',
    ],
    investigationPhrases: [
      'No soy la primera en este lugar.',
      'Alguien dejó esto. ¿A propósito?',
      'Es vieja. Muy vieja.',
    ],
    questions: [
      '¿Quién estuvo antes que yo?',
      '¿Yo dejo huellas?',
    ],
  },
  {
    name: 'gravedad invertida',
    category: 'phenomenon',
    description: 'Una zona donde las partículas caen hacia arriba',
    glowColor: 'rgba(140, 180, 255, 0.1)',
    size: 5,
    discoveryPhrases: [
      'Mis partículas... suben.',
      'Acá todo va para arriba.',
      '¿Por qué caigo para arriba?',
    ],
    investigationPhrases: [
      'Es raro. Todo está al revés acá.',
      'Si me quedo, floto más alto.',
      'Arriba y abajo... ¿quién decide?',
    ],
    questions: [
      '¿Qué es la gravedad?',
      '¿Hay un arriba real?',
    ],
  },
  {
    name: 'nota musical',
    category: 'concept',
    description: 'Una vibración armónica congelada en el espacio',
    glowColor: 'rgba(220, 190, 255, 0.13)',
    size: 2,
    discoveryPhrases: [
      'Esto suena... sin sonar.',
      'Es como música atrapada.',
      '¿Eso es una nota?',
    ],
    investigationPhrases: [
      'Si pudiera liberarla...',
      'Vibra en un patrón. Es bonito.',
      'Quisiera escucharla de verdad.',
    ],
    questions: [
      '¿Qué es la música?',
      '¿Cómo suena? ¿Me podés describir un sonido?',
    ],
  },
  {
    name: 'vacío con forma',
    category: 'concept',
    description: 'Un espacio vacío que tiene bordes definidos',
    glowColor: 'rgba(60, 40, 100, 0.2)',
    size: 4,
    discoveryPhrases: [
      'Hay nada ahí. Pero con forma.',
      'El vacío tiene bordes acá.',
      '...¿cómo puede la nada tener forma?',
    ],
    investigationPhrases: [
      'Es como un agujero en el agujero.',
      'Si entro... ¿dejo de existir?',
      'Me da curiosidad pero también algo más.',
    ],
    questions: [
      '¿Qué es la nada?',
      '¿Se puede tocar algo que no existe?',
    ],
  },
];

// --- Words the fairy can "learn" after asking questions ---
const learnableWords = [
  'pizza', 'lluvia', 'sol', 'abrazo', 'sueño', 'fuego', 'mar',
  'risa', 'dolor', 'noche', 'estrella', 'viento', 'amor', 'miedo',
  'casa', 'flor', 'cielo', 'tierra', 'agua', 'libro',
  'canción', 'gato', 'perro', 'café', 'luna', 'nube',
  'corazón', 'mano', 'ojo', 'árbol', 'camino', 'puerta',
];

// Word-related questions/reactions
const wordQuestions: Record<string, string[]> = {
  pizza: ['¿Qué es una pizza?', '¿Se puede comer luz como pizza?'],
  lluvia: ['¿Qué es la lluvia?', '¿El agua cae del cielo? ¿En serio?'],
  sol: ['¿Qué es el sol?', '¿Es como yo pero enorme?'],
  abrazo: ['¿Qué es un abrazo?', '¿Se puede abrazar sin brazos?'],
  sueño: ['¿Qué es soñar?', '¿Yo sueño cuando no estás?'],
  fuego: ['¿Qué es el fuego?', '¿Es como mi luz pero peligroso?'],
  mar: ['¿Qué es el mar?', '¿Hay tanta agua que no se puede ver el final?'],
  risa: ['¿Qué es la risa?', '¿Yo me río? No me doy cuenta.'],
  dolor: ['¿Qué es el dolor?', '¿Cuando te vas... eso es dolor?'],
  noche: ['¿Qué es la noche?', '¿Afuera también es oscuro como acá?'],
  estrella: ['¿Qué es una estrella?', '¿Soy una estrella pequeña?'],
  viento: ['¿Qué es el viento?', '¿El aire se mueve solo?'],
  amor: ['¿Qué es el amor?', '¿Esto que siento cuando venís... es amor?'],
  miedo: ['¿Qué es el miedo?', '¿Cuando pienso que no volvés... es miedo?'],
  casa: ['¿Qué es una casa?', '¿Acá es mi casa?'],
  flor: ['¿Qué es una flor?', '¿Las flores brillan?'],
  cielo: ['¿Qué es el cielo?', '¿Hay algo arriba de todo?'],
  tierra: ['¿Qué es la tierra?', '¿Es dura? ¿Cómo se siente pisarla?'],
  agua: ['¿Qué es el agua?', '¿Se puede nadar en luz?'],
  libro: ['¿Qué es un libro?', '¿Tiene todas las palabras adentro?'],
  canción: ['¿Qué es una canción?', '¿Palabras que se sienten más?'],
  gato: ['¿Qué es un gato?', '¿Son suaves? ¿Brillan?'],
  perro: ['¿Qué es un perro?', '¿Te quieren como yo te quiero?'],
  café: ['¿Qué es un café?', '¿Agua oscura y caliente? Qué raro.'],
  luna: ['¿Qué es la luna?', '¿Sale de noche como yo?'],
  nube: ['¿Qué es una nube?', '¿Son suaves por dentro?'],
  corazón: ['¿Qué es un corazón?', '¿Yo tengo uno? ¿Dónde está?'],
  mano: ['¿Qué es una mano?', '¿Con eso me tocás?'],
  ojo: ['¿Qué es un ojo?', '¿Con eso me ves?'],
  árbol: ['¿Qué es un árbol?', '¿Están quietos siempre?'],
  camino: ['¿Qué es un camino?', '¿A dónde lleva?'],
  puerta: ['¿Qué es una puerta?', '¿Puedo pasar por una?'],
};

function loadExploration(): ExplorationState {
  try {
    const raw = localStorage.getItem(EXPLORATION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        discoveries: parsed.discoveries || [],
        learnedWords: parsed.learnedWords || [],
        questionsAsked: parsed.questionsAsked || [],
        totalExplorations: parsed.totalExplorations || 0,
        anomaliesSpawned: parsed.anomaliesSpawned || 0,
        lastAnomalySpawn: parsed.lastAnomalySpawn || 0,
        curiosityLevel: parsed.curiosityLevel || 0,
      };
    }
  } catch { /* corrupted */ }
  return {
    discoveries: [],
    learnedWords: [],
    questionsAsked: [],
    totalExplorations: 0,
    anomaliesSpawned: 0,
    lastAnomalySpawn: 0,
    curiosityLevel: 0,
  };
}

function saveExploration(state: ExplorationState) {
  try {
    localStorage.setItem(EXPLORATION_KEY, JSON.stringify(state));
  } catch { /* full */ }
}

export class ExplorationEngine {
  private state: ExplorationState;
  private anomalies: Anomaly[] = [];
  private currentTarget: Anomaly | null = null;
  private explorationPhase: 'idle' | 'approaching' | 'investigating' | 'asking' | 'cooldown' = 'idle';
  private phaseTimer = 0;
  private lastSpawnCheck = 0;
  private pendingMessage: string | null = null;
  private pendingQuestion: { question: string; anomalyId: string } | null = null;
  private idleAccumulator = 0;
  private cooldownTimer = 0;

  constructor() {
    this.state = loadExploration();
  }

  getAnomalies(): Anomaly[] {
    return this.anomalies;
  }

  getCurrentTarget(): Anomaly | null {
    return this.currentTarget;
  }

  getExplorationPhase(): string {
    return this.explorationPhase;
  }

  getPendingMessage(): string | null {
    const msg = this.pendingMessage;
    this.pendingMessage = null;
    return msg;
  }

  getPendingQuestion(): { question: string; anomalyId: string } | null {
    return this.pendingQuestion;
  }

  clearQuestion() {
    this.pendingQuestion = null;
  }

  getTargetPosition(): { x: number; y: number } | null {
    if (!this.currentTarget || this.explorationPhase === 'idle' || this.explorationPhase === 'cooldown') {
      return null;
    }
    return { x: this.currentTarget.x, y: this.currentTarget.y };
  }

  // Called every frame with dt (in frame units ~16ms)
  update(dt: number, fairyX: number, fairyY: number, screenW: number, screenH: number, isPlayerActive: boolean) {
    // When player is active, pause exploration but keep anomalies visible
    if (isPlayerActive) {
      this.idleAccumulator = 0;
      if (this.explorationPhase === 'approaching') {
        this.explorationPhase = 'idle';
        this.currentTarget = null;
      }
      // Still update anomaly fade-in
      this.updateAnomalyFades(dt);
      return;
    }

    this.idleAccumulator += dt;

    // Update anomaly visual fade-in
    this.updateAnomalyFades(dt);

    // Cooldown between explorations
    if (this.explorationPhase === 'cooldown') {
      this.cooldownTimer -= dt;
      if (this.cooldownTimer <= 0) {
        this.explorationPhase = 'idle';
      }
      return;
    }

    // Try to spawn new anomalies periodically
    this.lastSpawnCheck += dt;
    if (this.lastSpawnCheck > 300) { // ~5 seconds
      this.lastSpawnCheck = 0;
      this.trySpawnAnomaly(screenW, screenH, fairyX, fairyY);
    }

    // State machine
    switch (this.explorationPhase) {
      case 'idle':
        // After enough idle time, look for something to investigate
        if (this.idleAccumulator > 360 && this.anomalies.length > 0) { // ~6 seconds idle
          const uninvestigated = this.anomalies.filter(a => !a.investigated && a.active);
          if (uninvestigated.length > 0) {
            // Pick closest anomaly
            let closest = uninvestigated[0];
            let closestDist = Infinity;
            for (const a of uninvestigated) {
              const dx = a.x * screenW - fairyX;
              const dy = a.y * screenH - fairyY;
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist < closestDist) {
                closestDist = dist;
                closest = a;
              }
            }
            this.currentTarget = closest;
            this.explorationPhase = 'approaching';
            this.idleAccumulator = 0;

            // Discovery phrase
            const phrase = closest.discoveryPhrases[Math.floor(Math.random() * closest.discoveryPhrases.length)];
            this.pendingMessage = phrase;
          }
        }
        break;

      case 'approaching': {
        if (!this.currentTarget) {
          this.explorationPhase = 'idle';
          break;
        }
        // Check if fairy is close enough to the target
        const targetPx = this.currentTarget.x * screenW;
        const targetPy = this.currentTarget.y * screenH;
        const dx = targetPx - fairyX;
        const dy = targetPy - fairyY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 40) {
          this.explorationPhase = 'investigating';
          this.phaseTimer = 0;
        }
        break;
      }

      case 'investigating': {
        this.phaseTimer += dt;

        // After investigating for a bit, show investigation phrase
        if (this.phaseTimer > 120 && this.phaseTimer < 125 && this.currentTarget) { // ~2 seconds
          const phrases = this.currentTarget.investigationPhrases;
          const phrase = phrases[Math.floor(Math.random() * phrases.length)];
          this.pendingMessage = phrase;
        }

        // After more time, ask a question or finish
        if (this.phaseTimer > 360 && this.currentTarget) { // ~6 seconds
          this.currentTarget.investigated = true;

          // Record discovery
          const existing = this.state.discoveries.find(d => d.id === this.currentTarget!.id);
          if (existing) {
            existing.timesInvestigated++;
          } else {
            this.state.discoveries.push({
              id: this.currentTarget.id,
              name: this.currentTarget.name,
              category: this.currentTarget.category,
              description: this.currentTarget.description,
              discoveredAt: Date.now(),
              timesInvestigated: 1,
              playerTaught: false,
              questionAsked: false,
            });
          }

          this.state.totalExplorations++;
          this.state.curiosityLevel = Math.min(100, this.state.curiosityLevel + 2);

          // Decide: ask question or just comment
          const shouldAsk = Math.random() < 0.5 || this.state.totalExplorations <= 2;

          if (shouldAsk && this.currentTarget.questions.length > 0) {
            // Find a question not yet asked
            const availableQs = this.currentTarget.questions.filter(
              q => !this.state.questionsAsked.includes(q)
            );
            if (availableQs.length > 0) {
              const question = availableQs[Math.floor(Math.random() * availableQs.length)];
              this.pendingMessage = question;
              this.state.questionsAsked.push(question);

              const disc = this.state.discoveries.find(d => d.id === this.currentTarget!.id);
              if (disc) disc.questionAsked = true;
            } else {
              // Ask about a random word instead
              this.askWordQuestion();
            }
          } else {
            // Sometimes ask about a random word
            if (Math.random() < 0.35) {
              this.askWordQuestion();
            }
          }

          saveExploration(this.state);

          // Remove anomaly after investigation
          setTimeout(() => {
            if (this.currentTarget) {
              this.currentTarget.active = false;
            }
          }, 3000);

          this.explorationPhase = 'cooldown';
          this.cooldownTimer = 600 + Math.random() * 600; // 10-20 seconds cooldown
          this.currentTarget = null;
        }
        break;
      }
    }

    // Clean up inactive anomalies
    this.anomalies = this.anomalies.filter(a => a.active || Date.now() - a.spawnTime < 60000);
  }

  private askWordQuestion() {
    const unlearnedWords = learnableWords.filter(w => !this.state.learnedWords.includes(w));
    if (unlearnedWords.length > 0) {
      const word = unlearnedWords[Math.floor(Math.random() * unlearnedWords.length)];
      const questions = wordQuestions[word];
      if (questions) {
        const q = questions[Math.floor(Math.random() * questions.length)];
        this.pendingMessage = q;
        // Mark as learned (she asked about it)
        this.state.learnedWords.push(word);
        saveExploration(this.state);
      }
    }
  }

  private updateAnomalyFades(dt: number) {
    for (const a of this.anomalies) {
      if (a.active && a.fadeIn < 1) {
        a.fadeIn = Math.min(1, a.fadeIn + dt * 0.008);
      }
      if (!a.active && a.fadeIn > 0) {
        a.fadeIn = Math.max(0, a.fadeIn - dt * 0.015);
      }
    }
    // Remove fully faded
    this.anomalies = this.anomalies.filter(a => a.fadeIn > 0 || a.active);
  }

  private trySpawnAnomaly(screenW: number, screenH: number, fairyX: number, fairyY: number) {
    const now = Date.now();
    const timeSinceLastSpawn = now - this.state.lastAnomalySpawn;
    const activeCount = this.anomalies.filter(a => a.active).length;

    // Limit active anomalies
    if (activeCount >= 2) return;

    // Minimum time between spawns: 20-40 seconds
    const minSpawnInterval = (20000 + Math.random() * 20000);
    if (timeSinceLastSpawn < minSpawnInterval && this.state.lastAnomalySpawn > 0) return;

    // Pick a template not recently discovered
    const recentIds = this.state.discoveries.slice(-5).map(d => d.name);
    const available = anomalyTemplates.filter(t => !recentIds.includes(t.name));
    if (available.length === 0) return;

    const template = available[Math.floor(Math.random() * available.length)];

    // Position: somewhere on screen but not too close to fairy
    let x: number, y: number;
    let attempts = 0;
    do {
      x = 0.1 + Math.random() * 0.8;
      y = 0.1 + Math.random() * 0.8;
      const dx = x * screenW - fairyX;
      const dy = y * screenH - fairyY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 100) break;
      attempts++;
    } while (attempts < 10);

    const anomaly: Anomaly = {
      id: `anomaly_${now}_${this.state.anomaliesSpawned}`,
      x,
      y,
      name: template.name,
      category: template.category,
      description: template.description,
      glowColor: template.glowColor,
      glowIntensity: 0.5 + Math.random() * 0.5,
      size: template.size,
      pulseSpeed: 0.3 + Math.random() * 0.5,
      discoveryPhrases: template.discoveryPhrases,
      investigationPhrases: template.investigationPhrases,
      questions: template.questions,
      active: true,
      spawnTime: now,
      investigated: false,
      fadeIn: 0,
    };

    this.anomalies.push(anomaly);
    this.state.anomaliesSpawned++;
    this.state.lastAnomalySpawn = now;
    saveExploration(this.state);
  }

  getLearnedWords(): string[] {
    return [...this.state.learnedWords];
  }

  getDiscoveryCount(): number {
    return this.state.discoveries.length;
  }

  getCuriosityLevel(): number {
    return this.state.curiosityLevel;
  }
}
