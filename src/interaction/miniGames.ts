// Mini Games Engine
// Short games initiated by the fairy when she's in a good mood.
// Not random — contextual, proposed by the fairy herself.

export type MiniGameType = 'follow_sequence' | 'find_me' | 'stay_still' | 'mirror';

export interface MiniGame {
  type: MiniGameType;
  prompt: string;
  data?: Record<string, unknown>;
}

export interface GameResult {
  won: boolean;
  message: string;
  moodEffect: 'happy' | 'playful' | 'calm';
}

const STORAGE_KEY = 'fairy_minigames';

interface GameStore {
  lastGame: number;
  totalPlayed: number;
  wins: number;
  losses: number;
}

function load(): GameStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* */ }
  return { lastGame: 0, totalPlayed: 0, wins: 0, losses: 0 };
}

function save(store: GameStore) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch { /* */ }
}

// Sequence game: fairy flashes positions, player must tap in order
export interface SequenceGame extends MiniGame {
  type: 'follow_sequence';
  data: { positions: { x: number; y: number }[]; interval: number };
}

// Find me: fairy hides and reappears, player must tap it
export interface FindMeGame extends MiniGame {
  type: 'find_me';
  data: { hideMs: number; reappearX: number; reappearY: number };
}

// Stay still: player must not touch for N seconds
export interface StayStillGame extends MiniGame {
  type: 'stay_still';
  data: { seconds: number };
}

export class MiniGamesEngine {
  private store: GameStore;
  private activeGame: MiniGame | null = null;
  private MIN_INTERVAL = 2 * 60 * 1000; // 2 min between games

  // Stay still game state
  private stayStillStart = 0;
  private stayStillDuration = 0;
  private stayStillBroken = false;
  private stayStillActive = false;

  // Sequence game state
  private sequenceStep = 0;
  private sequencePositions: { x: number; y: number }[] = [];
  private sequenceActive = false;
  private sequenceShowPhase = true; // true = showing, false = player input phase

  constructor() {
    this.store = load();
  }

  shouldProposeGame(_mood: string, _sessionCount: number): boolean {
    const now = Date.now();
    if (now - this.store.lastGame < this.MIN_INTERVAL) return false;
    return Math.random() < 0.7;
  }

  proposeGame(_fairyX: number, _fairyY: number, screenW: number, screenH: number): MiniGame {
    const types: MiniGameType[] = ['follow_sequence', 'find_me', 'stay_still'];
    const type = types[Math.floor(Math.random() * types.length)];

    this.store.lastGame = Date.now();
    this.store.totalPlayed++;
    save(this.store);

    switch (type) {
      case 'follow_sequence': {
        // Generate 3-4 positions around the screen
        const count = 3 + Math.floor(Math.random() * 2);
        const positions = Array.from({ length: count }, () => ({
          x: 80 + Math.random() * (screenW - 160),
          y: 80 + Math.random() * (screenH - 160),
        }));
        this.sequencePositions = positions;
        this.sequenceStep = 0;
        this.sequenceActive = false;
        this.sequenceShowPhase = true;
        const game: MiniGame = {
          type: 'follow_sequence',
          prompt: '¿Me seguís? Mirá bien...',
          data: { positions, interval: 800 },
        };
        this.activeGame = game;
        return game;
      }

      case 'find_me': {
        // Fairy will hide then reappear somewhere new
        const newX = 80 + Math.random() * (screenW - 160);
        const newY = 80 + Math.random() * (screenH - 160);
        const game: MiniGame = {
          type: 'find_me',
          prompt: '¿Dónde estoy?',
          data: { hideMs: 1500, reappearX: newX, reappearY: newY },
        };
        this.activeGame = game;
        return game;
      }

      case 'stay_still': {
        const seconds = 4 + Math.floor(Math.random() * 4); // 4-7 seconds
        this.stayStillStart = 0;
        this.stayStillDuration = seconds * 1000;
        this.stayStillBroken = false;
        this.stayStillActive = false;
        const game: MiniGame = {
          type: 'stay_still',
          prompt: `Quedate quieto ${seconds} segundos. Sin tocar nada.`,
          data: { seconds },
        };
        this.activeGame = game;
        return game;
      }

      default:
        this.activeGame = null;
        return { type: 'stay_still', prompt: 'Quedate quieto.', data: { seconds: 5 } };
    }
  }

  // Called when stay still game starts
  startStayStill() {
    this.stayStillStart = Date.now();
    this.stayStillActive = true;
    this.stayStillBroken = false;
  }

  // Called every touch during stay still
  onTouchDuringStayStill() {
    if (this.stayStillActive) {
      this.stayStillBroken = true;
      this.stayStillActive = false;
    }
  }

  // Called every frame during stay still — returns result if done
  updateStayStill(): GameResult | null {
    if (!this.stayStillActive) return null;
    if (this.stayStillBroken) {
      return this.endGame(false, 'stay_still');
    }
    const elapsed = Date.now() - this.stayStillStart;
    if (elapsed >= this.stayStillDuration) {
      return this.endGame(true, 'stay_still');
    }
    return null;
  }

  getStayStillProgress(): number {
    if (!this.stayStillActive || this.stayStillStart === 0) return 0;
    return Math.min((Date.now() - this.stayStillStart) / this.stayStillDuration, 1);
  }

  // Sequence game — called when player input phase starts
  startSequenceInput() {
    this.sequenceStep = 0;
    this.sequenceActive = true;
    this.sequenceShowPhase = false;
  }

  onSequenceTap(x: number, y: number): { correct: boolean; done: boolean; result?: GameResult } {
    if (!this.sequenceActive || this.sequenceShowPhase) return { correct: false, done: false };
    const target = this.sequencePositions[this.sequenceStep];
    const dist = Math.sqrt((x - target.x) ** 2 + (y - target.y) ** 2);
    const HIT_RADIUS = 80;

    if (dist < HIT_RADIUS) {
      this.sequenceStep++;
      if (this.sequenceStep >= this.sequencePositions.length) {
        this.sequenceActive = false;
        return { correct: true, done: true, result: this.endGame(true, 'follow_sequence') };
      }
      return { correct: true, done: false };
    } else {
      this.sequenceActive = false;
      return { correct: false, done: true, result: this.endGame(false, 'follow_sequence') };
    }
  }

  getSequencePositions(): { x: number; y: number }[] {
    return this.sequencePositions;
  }

  getCurrentSequenceStep(): number {
    return this.sequenceStep;
  }

  isSequenceShowPhase(): boolean {
    return this.sequenceShowPhase;
  }

  isSequenceActive(): boolean {
    return this.sequenceActive;
  }

  // Find me — called when player taps
  onFindMeTap(x: number, y: number, _fairyX: number, _fairyY: number): GameResult | null {
    if (!this.activeGame || this.activeGame.type !== 'find_me') return null;
    const dist = Math.sqrt((x - _fairyX) ** 2 + (y - _fairyY) ** 2);
    const found = dist < 80;
    return this.endGame(found, 'find_me');
  }

  private endGame(won: boolean, type: MiniGameType): GameResult {
    if (won) this.store.wins++;
    else this.store.losses++;
    this.activeGame = null;
    save(this.store);

    const winRate = this.store.wins / Math.max(this.store.totalPlayed, 1);

    const wonMessages: Record<MiniGameType, string[]> = {
      follow_sequence: ['¡Bien! Me seguiste.', '¡Acertaste! No esperaba eso.', 'Bien hecho. Otra vez?'],
      find_me: ['Me encontraste.', '¡Acá estaba! Bien.', 'Rápido.'],
      stay_still: ['Lo lograste. Quieto.', '¡Bien! Sos paciente.', 'Silencio y quietud. Me gusta.'],
      mirror: ['', '', ''],
    };

    const loseMessages: Record<MiniGameType, string[]> = {
      follow_sequence: ['Perdiste el hilo.', 'No era ese. Igual no importa.', 'Casi.'],
      find_me: ['No me encontraste...', 'Estaba acá todo el tiempo.', 'Lástima.'],
      stay_still: ['No pudiste quedarte quieto.', 'Un toque y perdiste.', 'Demasiado inquieto.'],
      mirror: ['', '', ''],
    };

    const messages = won ? wonMessages[type] : loseMessages[type];
    const message = messages[Math.floor(Math.random() * messages.length)];

    // Sarcastic comment if player loses a lot
    const finalMessage = !won && winRate < 0.3 && this.store.totalPlayed > 3
      ? message + ' ' + 'Nunca ganás, ¿no?'
      : message;

    return {
      won,
      message: finalMessage,
      moodEffect: won ? (type === 'stay_still' ? 'calm' : 'happy') : 'playful',
    };
  }

  getActiveGame(): MiniGame | null {
    return this.activeGame;
  }

  cancelGame() {
    this.activeGame = null;
    this.stayStillActive = false;
    this.sequenceActive = false;
  }

  getWinRate(): number {
    if (this.store.totalPlayed === 0) return 0;
    return this.store.wins / this.store.totalPlayed;
  }

  getTotalPlayed(): number {
    return this.store.totalPlayed;
  }
}
