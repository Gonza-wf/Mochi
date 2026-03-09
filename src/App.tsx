import { useEffect, useRef, useState, useCallback } from 'react';
import { FairyMemory } from './memory/memoryStore';
import MemoryBubble from './memory/MemoryBubble';
import { ExplorationEngine, Anomaly } from './exploration/explorationEngine';
import { GestureEngine } from './gestures/gestureEngine';
import { MoodEngine } from './mood/moodEngine';
import TeachingInput from './teaching/TeachingInput';
import { soundEngine } from './sound/soundEngine';
import { ParticleDrawing } from './drawing/particleDrawing';
import { AmbientWeather } from './ambient/ambientWeather';
import { BodyLanguage } from './body/bodyLanguage';
import { RitualsEngine } from './rituals/ritualsEngine';
import { SecretGestures } from './gestures/secretGestures';
import { CompanionEngine } from './companion/companionEngine';
import { PersonalQuestionsEngine } from './interaction/personalQuestions';
import { DecisionsEngine } from './interaction/decisionsEngine';
import { MiniGamesEngine } from './interaction/miniGames';
import { HiddenSpotsEngine } from './interaction/hiddenSpots';
import { BadDaysEngine } from './interaction/badDays';
import {
  PersonalQuestionInput,
  DecisionUI,
  FreeConvoInput,
  MiniGameUI,
} from './interaction/InteractionUI';

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  life: number; maxLife: number;
  size: number; alpha: number; hue: number;
}

interface FairyState {
  x: number; y: number;
  vx: number; vy: number;
  wingAngle: number; wingSpeed: number;
  idleTime: number;
  idlePhaseX: number; idlePhaseY: number;
  breathPhase: number;
  mode: 'idle' | 'following' | 'exploring';
}

const FAIRY_SCALE = 2.2;
const MAX_SPEED = 4;
const DAMPING = 0.88;

// Free conversation response engine (no AI — personality-based)
function generateConvoResponse(text: string, archetype: string, badDay: boolean): string {
  const lower = text.toLowerCase();

  if (badDay) {
    const bdResponses = [
      'Hoy no tengo muchas palabras.',
      'Te escucho. Pero hoy es difícil.',
      '...sí.',
      'Gracias por decirme.',
      'Estoy acá aunque no hable mucho.',
    ];
    return bdResponses[Math.floor(Math.random() * bdResponses.length)];
  }

  // Emotional keywords
  if (lower.includes('te quiero') || lower.includes('te amo') || lower.includes('te adoro')) {
    const responses: Record<string, string[]> = {
      cariñosa: ['Yo también... creo.', 'Eso me calienta.', 'Me alegra que me digas eso.'],
      sarcástica: ['¿En serio?', 'Ajá.', 'Qué inesperado.'],
      independiente: ['No necesitaba saberlo. Pero gracias.', 'Interesante.'],
      pegajosa: ['¡Yo también! ¡Yo también!', 'Eso es todo lo que necesitaba.'],
      curiosa: ['¿Qué significa eso exactamente?', '¿Y cómo se siente eso?'],
      distante: ['...', 'Está bien.'],
    };
    const pool = responses[archetype] || responses['curiosa'];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  if (lower.includes('estoy bien') || lower.includes('todo bien')) {
    return ['Bien.', 'Me alegra.', 'Qué bueno.', 'Seguimos entonces.'][Math.floor(Math.random() * 4)];
  }

  if (lower.includes('estoy mal') || lower.includes('triste') || lower.includes('cansado') || lower.includes('mal')) {
    const sad = ['Acá estoy.', 'Lo sentí.', 'Ya va a pasar.', '...ya sé.', 'Quedate.'];
    return sad[Math.floor(Math.random() * sad.length)];
  }

  if (lower.includes('hola') || lower.includes('buenas') || lower.includes('hey')) {
    return ['Hola.', 'Acá estoy.', '...hola.', 'Ya sé que estás.'][Math.floor(Math.random() * 4)];
  }

  if (lower.includes('?')) {
    const qResponses: Record<string, string[]> = {
      cariñosa: ['No sé... pero me gusta que preguntes.', 'Qué pregunta interesante.'],
      sarcástica: ['¿Y yo cómo sé?', 'Buena pregunta. No tengo idea.', 'Preguntame otra cosa.'],
      independiente: ['No tengo respuesta para eso.', 'Eso lo tenés que resolver vos.'],
      pegajosa: ['¡No sé! Pero me contás si averiguás.', '¿Qué pensás vos?'],
      curiosa: ['Eso mismo me pregunto yo.', 'No sé. ¿Buscamos juntos?', '¿Por qué lo preguntás?'],
      distante: ['...', 'No sé.'],
    };
    const pool = qResponses[archetype] || qResponses['curiosa'];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // Generic responses by archetype
  const generic: Record<string, string[]> = {
    cariñosa: ['Gracias por decirme.', 'Me gusta cuando hablás.', 'Te escucho.', 'Sigo acá.'],
    sarcástica: ['Ajá.', 'Interesante.', 'Si vos lo decís.', 'Ya sé.', '¿Y?'],
    independiente: ['Okay.', 'Entendido.', 'Está bien.', 'Bien.'],
    pegajosa: ['¡Contame más!', '¿Y después qué pasó?', '¡Seguí!', '¿En serio?'],
    curiosa: ['Qué curioso.', '¿Y cómo llegaste a eso?', 'Interesante.', '¿Tiene sentido para vos?'],
    distante: ['...', '.', 'Sí.', 'Okay.'],
  };
  const pool = generic[archetype] || generic['curiosa'];
  return pool[Math.floor(Math.random() * pool.length)];
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const memoryRef = useRef<FairyMemory | null>(null);
  const explorationRef = useRef<ExplorationEngine | null>(null);
  const gestureRef = useRef<GestureEngine | null>(null);
  const moodRef = useRef<MoodEngine | null>(null);
  const drawingRef = useRef<ParticleDrawing | null>(null);
  const weatherRef = useRef<AmbientWeather | null>(null);
  const bodyRef = useRef<BodyLanguage | null>(null);
  const ritualsRef = useRef<RitualsEngine | null>(null);
  const secretRef = useRef<SecretGestures | null>(null);
  const companionRef = useRef<CompanionEngine | null>(null);
  const personalQRef = useRef<PersonalQuestionsEngine | null>(null);
  const decisionsRef = useRef<DecisionsEngine | null>(null);
  const miniGamesRef = useRef<MiniGamesEngine | null>(null);
  const hiddenSpotsRef = useRef<HiddenSpotsEngine | null>(null);
  const badDaysRef = useRef<BadDaysEngine | null>(null);

  const fairyPosRef = useRef({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const isTalkingRef = useRef(false);
  const dragTargetRef = useRef({ x: 0, y: 0 });
  const ambientTimeRef = useRef(0);

  const [currentMessage, setCurrentMessage] = useState<string | null>(null);
  const [fairyScreenPos, setFairyScreenPos] = useState({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const [teachingQuestion, setTeachingQuestion] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);

  // New interaction states
  const [personalQuestion, setPersonalQuestion] = useState<{ id: string; question: string } | null>(null);
  const [activeDecision, setActiveDecision] = useState<import('./interaction/decisionsEngine').Decision | null>(null);
  const [showFreeConvo, setShowFreeConvo] = useState(false);
  const [activeMiniGame, setActiveMiniGame] = useState<import('./interaction/miniGames').MiniGame | null>(null);
  const [miniGameProgress, setMiniGameProgress] = useState(0);
  const [miniGameInputPhase, setMiniGameInputPhase] = useState(false);
  const [miniGameStep, setMiniGameStep] = useState(0);
  const [fairyHidden, setFairyHidden] = useState(false);

  const messageKeyRef = useRef(0);
  const isWaitingAnswerRef = useRef(false);
  const companionShownRef = useRef(false);
  const archetype = useRef('curiosa');

  useEffect(() => { setIsMuted(soundEngine.isMuted()); }, []);

  const handleTalkingChange = useCallback((talking: boolean) => {
    isTalkingRef.current = talking;
  }, []);

  const toggleMute = useCallback(() => {
    const next = !soundEngine.isMuted();
    soundEngine.setMuted(next);
    setIsMuted(next);
  }, []);

  const showMessage = useCallback((msg: string | null) => {
    if (!msg) return;
    messageKeyRef.current++;
    setCurrentMessage(msg + '##' + messageKeyRef.current);

    if (msg.includes('¿Qué es ') || msg.includes('¿Qué son ')) {
      soundEngine.play('teaching');
      isWaitingAnswerRef.current = true;
      setTimeout(() => setTeachingQuestion(msg), 500);
    } else if (
      msg.includes('dormir') || msg.includes('descansá') ||
      msg.includes('agua') || msg.includes('Comiste') ||
      msg.includes('postura') || msg.includes('tarde') || msg.includes('noche')
    ) {
      soundEngine.play('care');
    }
  }, []);

  const handleTeachingAnswer = useCallback((word: string, answer: string) => {
    if (memoryRef.current) memoryRef.current.setSessionLearnedWord(word);
    isWaitingAnswerRef.current = false;
    setTimeout(() => {
      const responses = [
        `"${answer}"... lo voy a recordar.`,
        `${answer}. Interesante.`,
        `Entonces "${word}" es "${answer}"... gracias.`,
        `"${answer}"... nunca lo hubiera imaginado.`,
      ];
      showMessage(responses[Math.floor(Math.random() * responses.length)]);
    }, 2000);
    setTeachingQuestion(null);
  }, [showMessage]);

  const handleTeachingDismiss = useCallback(() => {
    isWaitingAnswerRef.current = false;
    setTeachingQuestion(null);
  }, []);

  // Personal question handlers
  const handlePersonalAnswer = useCallback((qId: string, question: string, answer: string) => {
    personalQRef.current?.recordAnswer(qId, question, answer);
    const followUp = personalQRef.current?.getFollowUpResponse(qId, answer);
    personalQRef.current?.clearPending();
    setPersonalQuestion(null);
    isWaitingAnswerRef.current = false;
    if (followUp) setTimeout(() => showMessage(followUp), 1500);
  }, [showMessage]);

  const handlePersonalDismiss = useCallback(() => {
    personalQRef.current?.clearPending();
    setPersonalQuestion(null);
    isWaitingAnswerRef.current = false;
  }, []);

  // Decision handlers
  const handleDecisionChoice = useCallback((choice: 'A' | 'B') => {
    const outcome = decisionsRef.current?.makeChoice(choice);
    setActiveDecision(null);
    isWaitingAnswerRef.current = false;
    if (outcome) setTimeout(() => showMessage(outcome), 800);
  }, [showMessage]);

  // Free convo handlers
  const handleFreeConvoSend = useCallback((text: string) => {
    setShowFreeConvo(false);
    isWaitingAnswerRef.current = false;
    const badDay = badDaysRef.current?.isBadDay() ?? false;
    const arc = archetype.current;
    const response = generateConvoResponse(text, arc, badDay);
    setTimeout(() => showMessage(response), 1000);
  }, [showMessage]);

  const handleFreeConvoClose = useCallback(() => {
    setShowFreeConvo(false);
    isWaitingAnswerRef.current = false;
  }, []);

  // Mini game handlers
  const handleMiniGameReady = useCallback(() => {
    const game = miniGamesRef.current?.getActiveGame();
    if (!game) return;
    if (game.type === 'stay_still') {
      miniGamesRef.current?.startStayStill();
    } else if (game.type === 'follow_sequence') {
      // Show sequence first, then player input
      const positions = miniGamesRef.current?.getSequencePositions() ?? [];
      let step = 0;
      const showNext = () => {
        if (step >= positions.length) {
          miniGamesRef.current?.startSequenceInput();
          setMiniGameInputPhase(true);
          setMiniGameStep(0);
          return;
        }
        // Move fairy to each position in sequence
        const pos = positions[step];
        fairyPosRef.current = { x: pos.x, y: pos.y };
        step++;
        setTimeout(showNext, 900);
      };
      showNext();
    }
  }, []);

  // Init all systems
  useEffect(() => {
    const memory = new FairyMemory();
    memoryRef.current = memory;
    explorationRef.current = new ExplorationEngine();
    moodRef.current = new MoodEngine();
    drawingRef.current = new ParticleDrawing();
    weatherRef.current = new AmbientWeather();
    bodyRef.current = new BodyLanguage();
    ritualsRef.current = new RitualsEngine();
    secretRef.current = new SecretGestures();
    companionRef.current = new CompanionEngine();
    personalQRef.current = new PersonalQuestionsEngine();
    decisionsRef.current = new DecisionsEngine();
    miniGamesRef.current = new MiniGamesEngine();
    hiddenSpotsRef.current = new HiddenSpotsEngine();
    badDaysRef.current = new BadDaysEngine();

    archetype.current = memory.getPersonalityType();

    weatherRef.current.updateDayNight();
    setInterval(() => weatherRef.current?.updateDayNight(), 60000);

    const totalSessions = memory.getTotalSessions();

    // Check bad day
    const isBadDay = badDaysRef.current.checkForBadDay(totalSessions);
    const isRecovered = badDaysRef.current.isRecoveredToday();

    // Opening phrase
    const dreamPhrase = memory.getDreamPhrase();

    const doOpening = () => {
      // Recovery phrase takes priority
      if (isRecovered) {
        const recovPhrase = badDaysRef.current?.getRecoveryPhrase();
        if (recovPhrase) {
          soundEngine.play('appear');
          showMessage(recovPhrase);
          bodyRef.current?.trigger('bounce');
          return;
        }
      }

      // Bad day — minimal opening
      if (isBadDay) {
        const bdPhrase = badDaysRef.current?.getBadDayOpeningPhrase();
        showMessage(bdPhrase || '...');
        return;
      }

      soundEngine.play('appear');
      bodyRef.current?.trigger('bounce');
      showMessage(memory.getOpeningPhrase());

      setTimeout(() => {
        const milestone = ritualsRef.current?.getPendingMilestone();
        if (milestone) {
          soundEngine.play('ritual');
          showMessage(milestone);
        } else {
          const habitualMsg = ritualsRef.current?.getHabitualMessage();
          if (habitualMsg) {
            soundEngine.play('ritual');
            showMessage(habitualMsg);
          }
        }
      }, 4000);
    };

    if (dreamPhrase) {
      moodRef.current.setDreamy();
      setTimeout(() => {
        soundEngine.play('dreamy');
        showMessage(dreamPhrase);
        setTimeout(doOpening, Math.max(3000, dreamPhrase.length * 110 + 1500));
      }, 1000);
    } else {
      setTimeout(doOpening, 1500);
    }

    // Idle check — also tries personal questions and decisions
    let idleCheckHandle: ReturnType<typeof setTimeout> | null = null;
    const scheduleIdleCheck = () => {
      const learning = memory.getLearning();
      const base = learning ? learning.getIdleInterval() : 18000;
      const interval = base * (0.7 + Math.random() * 0.6);
      idleCheckHandle = setTimeout(() => {
        const exploration = explorationRef.current;
        if (exploration && exploration.getExplorationPhase() !== 'idle') {
          scheduleIdleCheck(); return;
        }

        // Bad day — use bad day phrases instead
        if (badDaysRef.current?.isBadDay()) {
          const bdIdle = badDaysRef.current.getBadDayIdlePhrase();
          if (bdIdle) showMessage(bdIdle);
          scheduleIdleCheck(); return;
        }

        // Try personal question
        if (personalQRef.current?.shouldAskQuestion(totalSessions) && !personalQuestion) {
          const q = personalQRef.current.getNextQuestion();
          if (q) {
            soundEngine.play('teaching');
            showMessage(q.question);
            isWaitingAnswerRef.current = true;
            setTimeout(() => {
              setPersonalQuestion({ id: q.id, question: q.question });
            }, 500);
            scheduleIdleCheck(); return;
          }
        }

        // Try decision
        if (decisionsRef.current?.shouldPresentDecision(totalSessions) && !activeDecision) {
          const decision = decisionsRef.current.getNextDecision();
          if (decision) {
            showMessage(decision.situation);
            isWaitingAnswerRef.current = true;
            setTimeout(() => setActiveDecision(decision), 2000);
            scheduleIdleCheck(); return;
          }
        }

        // Try personal question reference
        if (Math.random() < 0.2) {
          const ref = personalQRef.current?.getReferencePhrase();
          if (ref) { showMessage(ref); scheduleIdleCheck(); return; }
        }

        // Try decision reference
        if (Math.random() < 0.15) {
          const ref = decisionsRef.current?.getLastDecisionReference();
          if (ref) { showMessage(ref); scheduleIdleCheck(); return; }
        }

        if (Math.random() < 0.35) soundEngine.play('idle');
        showMessage(memory.getIdlePhrase());
        scheduleIdleCheck();
      }, interval);
    };
    scheduleIdleCheck();

    const handleUnload = () => {
      const gesture = gestureRef.current;
      const style = gesture ? gesture.getInteractionStyle() : 'mixed';
      const stats = gesture ? gesture.getSessionStats() : null;
      memory.setGestureStyle(style);
      memory.endSessionWithDream(
        style === 'gentle' || style === 'patient',
        style === 'playful',
        stats ? stats.taps + stats.holds + stats.rapidTaps < 3 : true
      );
    };
    window.addEventListener('beforeunload', handleUnload);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') handleUnload();
    });

    return () => {
      clearTimeout(idleCheckHandle!);
      window.removeEventListener('beforeunload', handleUnload);
      memory.endSession();
    };
  }, [showMessage]); // eslint-disable-line react-hooks/exhaustive-deps

  // Canvas loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false })!;
    let animId: number;
    let dpr = window.devicePixelRatio || 1;

    const resize = () => {
      dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const W = () => window.innerWidth;
    const H = () => window.innerHeight;

    const fairy: FairyState = {
      x: W() / 2, y: H() / 2,
      vx: 0, vy: 0,
      wingAngle: 0, wingSpeed: 11,
      idleTime: 0,
      idlePhaseX: Math.random() * Math.PI * 2,
      idlePhaseY: Math.random() * Math.PI * 2,
      breathPhase: 0,
      mode: 'idle',
    };

    const particles: Particle[] = [];
    const MAX_PARTICLES = 110;

    const spawnParticle = (fx: number, fy: number, burst = false, downward = false) => {
      if (particles.length >= MAX_PARTICLES) return;
      const mv = moodRef.current?.getVisuals() ?? null;
      const angle = Math.random() * Math.PI * 2;
      const speed = burst ? (0.4 + Math.random() * 1.0) : (0.1 + Math.random() * 0.4);
      const spread = mv ? mv.particleSpread : 1;
      const dist = burst
        ? (Math.random() * 35 * FAIRY_SCALE)
        : (Math.random() * 20 * FAIRY_SCALE * spread);
      const hueShift = mv ? mv.particleWarmth : 0;
      const badMod = badDaysRef.current?.getBadDayMoodModifiers();
      const speedMod = badMod ? badMod.particleSpeedMod : 1;
      const vyDir = (downward || (badMod?.particleDirectionDown)) ? 0.15 : -0.15;

      particles.push({
        x: fx + Math.cos(angle) * dist,
        y: fy + Math.sin(angle) * dist,
        vx: Math.cos(angle) * speed * (burst ? 1.2 : 0.5) * speedMod,
        vy: Math.sin(angle) * speed * (burst ? 1.2 : 0.5) * speedMod - (0.1 + Math.random() * 0.25) * speedMod + (downward ? 0.3 : 0),
        life: 0,
        maxLife: 60 + Math.random() * 90,
        size: (0.8 + Math.random() * 1.8) * FAIRY_SCALE * 0.65,
        alpha: (0.35 + Math.random() * 0.45) * (mv ? mv.particleAlpha : 1),
        hue: 260 + Math.random() * 40 + hueShift,
      });
      void vyDir;
    };

    let driftTargetX = fairy.x;
    let driftTargetY = fairy.y;
    let driftTimer = 0;
    const pickDriftTarget = () => {
      const margin = 100;
      driftTargetX = margin + Math.random() * (W() - margin * 2);
      driftTargetY = margin + Math.random() * (H() - margin * 2);
      driftTimer = 200 + Math.random() * 300;
    };
    pickDriftTarget();

    // Sequence show timer for mini games
    let sequenceShowTimer = 0;
    let sequenceShowIdx = 0;
    let sequenceFlashTarget: { x: number; y: number } | null = null;
    let sequenceFlashTime = 0;

    // Find me hidden timer
    let findMeHideTimer = 0;
    let findMeReappearPos: { x: number; y: number } | null = null;
    let fairyVisibleOverride = true;

    const gestureEngine = new GestureEngine({
      onTap: (x: number, y: number) => {
        soundEngine.unlock();

        // Check hidden spot tap
        const spotReward = hiddenSpotsRef.current?.checkTap(x, y, W(), H());
        if (spotReward) {
          soundEngine.play('secret');
          setTimeout(() => showMessage(spotReward), 300);
          return;
        }

        // Mini game tap handling
        const game = miniGamesRef.current?.getActiveGame();
        if (game) {
          if (game.type === 'follow_sequence' && miniGamesRef.current?.isSequenceActive()) {
            const result = miniGamesRef.current.onSequenceTap(x, y);
            if (result.correct) {
              setMiniGameStep(miniGamesRef.current.getCurrentSequenceStep());
              soundEngine.play('tap');
            }
            if (result.done && result.result) {
              soundEngine.play(result.result.won ? 'happy' : 'lonely');
              setTimeout(() => showMessage(result.result!.message), 300);
              setActiveMiniGame(null);
              setMiniGameInputPhase(false);
              if (result.result.won) moodRef.current?.setMood('happy');
            }
            return;
          }
          if (game.type === 'find_me' && !fairyVisibleOverride) {
            // Tapping while fairy is hidden — always miss
            const result = miniGamesRef.current!.onFindMeTap(x, y, fairy.x, fairy.y);
            if (result) {
              soundEngine.play(result.won ? 'happy' : 'lonely');
              setTimeout(() => showMessage(result.message), 300);
              setActiveMiniGame(null);
              fairyVisibleOverride = true;
            }
            return;
          }
          if (game.type === 'stay_still') {
            miniGamesRef.current?.onTouchDuringStayStill();
          }
        }

        soundEngine.play('tap');
        moodRef.current?.onTap();
        bodyRef.current?.trigger('bounce', 0.6);
        secretRef.current?.onTap(fairy.x, fairy.y);

        if (memoryRef.current) {
          memoryRef.current.registerTouch();
          const phrase = memoryRef.current.getTouchPhrase();
          if (phrase) showMessage(phrase);
        }

        // Comfort during bad day
        if (badDaysRef.current?.isBadDay()) {
          const comfort = badDaysRef.current.onComfortAttempt();
          if (Math.random() < 0.3) showMessage(comfort.message);
          if (comfort.works) moodRef.current?.setMood('calm');
        }

        const secret = secretRef.current?.getPendingSecret();
        if (secret) {
          soundEngine.play('secret');
          setTimeout(() => showMessage(secret), 600);
        }
      },
      onHold: (durationMs: number) => {
        moodRef.current?.onHold(durationMs);
        if (durationMs > 600 && durationMs < 900) {
          soundEngine.play('hold');
          bodyRef.current?.trigger('pulse');
          secretRef.current?.onHoldStart();
        }
        if (durationMs > 2000 && durationMs < 2500 && Math.random() < 0.3) {
          soundEngine.play('comforted');
          bodyRef.current?.trigger('hug');
          const holdPhrases = [
            'Eso se siente bien.', '...quedate así.', 'Cálido.',
            'Me gusta esto.', 'No te sueltes.', '...gracias.',
          ];
          showMessage(holdPhrases[Math.floor(Math.random() * holdPhrases.length)]);
        }
        spawnParticle(fairy.x, fairy.y, false);
      },
      onRapidTap: (count: number) => {
        soundEngine.play('rapidTap');
        moodRef.current?.onRapidTap(count);
        memoryRef.current?.registerTouch();

        if (count >= 3) {
          soundEngine.play('playful');
          bodyRef.current?.trigger('spin');
          const rapidPhrases = ['¡Hey!', '¡Para para!', '¡Estoy acá!', '¡Ya te vi!', 'Rápido rápido...'];
          showMessage(rapidPhrases[Math.floor(Math.random() * rapidPhrases.length)]);
        } else if (count === 2) {
          soundEngine.play('doubleTap');
        }

        // Propose mini game on rapid tap if mood is right
        const mood = moodRef.current?.getCurrentMood() ?? 'calm';
        const totalSessions = memoryRef.current?.getTotalSessions() ?? 0;
        if (!activeMiniGame && miniGamesRef.current?.shouldProposeGame(mood, totalSessions)) {
          const game = miniGamesRef.current.proposeGame(fairy.x, fairy.y, W(), H());
          if (game) {
            showMessage(game.prompt);
            setTimeout(() => setActiveMiniGame(game), 2000);
          }
        }

        for (let i = 0; i < Math.min(count * 2, 10); i++) spawnParticle(fairy.x, fairy.y, true);
      },
      onSwipe: (direction: string) => {
        soundEngine.play('swipe');
        moodRef.current?.onSwipe();
        memoryRef.current?.registerTouch();
        bodyRef.current?.trigger('bounce', 0.8);
        const impulse = 2.5;
        if (direction === 'up') fairy.vy = Math.max(fairy.vy - impulse, -MAX_SPEED);
        if (direction === 'down') fairy.vy = Math.min(fairy.vy + impulse, MAX_SPEED);
        if (direction === 'left') fairy.vx = Math.max(fairy.vx - impulse, -MAX_SPEED);
        if (direction === 'right') fairy.vx = Math.min(fairy.vx + impulse, MAX_SPEED);
        for (let i = 0; i < 6; i++) spawnParticle(fairy.x, fairy.y, true);
      },
      onDragStart: () => {
        soundEngine.unlock();
        drawingRef.current?.interrupt();
        fairy.mode = 'following';
        isDraggingRef.current = true;
        // Open free convo on long hold in empty space — handled by hold gesture
      },
      onDragMove: (x: number, y: number) => {
        dragTargetRef.current = { x, y };
        moodRef.current?.onDrag();
        secretRef.current?.onDragMove(x, y);
      },
      onDragEnd: () => {
        isDraggingRef.current = false;
        secretRef.current?.onDragEnd();
        const secret = secretRef.current?.getPendingSecret();
        if (secret) {
          soundEngine.play('secret');
          setTimeout(() => showMessage(secret), 400);
        }
        fairy.mode = 'idle';
        fairy.idleTime = 0;
        fairy.idlePhaseX = Math.random() * Math.PI * 2;
        fairy.idlePhaseY = Math.random() * Math.PI * 2;
        pickDriftTarget();
      },
    });
    gestureRef.current = gestureEngine;

    // Long hold in empty space → open free convo
    let holdInEmptyTimer: ReturnType<typeof setTimeout> | null = null;

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      const t = e.touches[0];
      gestureEngine.onTouchStart(t.clientX, t.clientY);
      // Check if near fairy for free convo (long hold in open space)
      const nearFairy = gestureEngine.isNearFairy(t.clientX, t.clientY);
      if (!nearFairy) {
        holdInEmptyTimer = setTimeout(() => {
          if (!isDraggingRef.current && !isTalkingRef.current) {
            setShowFreeConvo(true);
            isWaitingAnswerRef.current = true;
          }
        }, 1200);
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const t = e.touches[0];
      gestureEngine.onTouchMove(t.clientX, t.clientY);
      if (holdInEmptyTimer) { clearTimeout(holdInEmptyTimer); holdInEmptyTimer = null; }
    };
    const onTouchEnd = () => {
      gestureEngine.onTouchEnd();
      if (holdInEmptyTimer) { clearTimeout(holdInEmptyTimer); holdInEmptyTimer = null; }
    };
    const onMouseDown = (e: MouseEvent) => {
      gestureEngine.onTouchStart(e.clientX, e.clientY);
      const nearFairy = gestureEngine.isNearFairy(e.clientX, e.clientY);
      if (!nearFairy) {
        holdInEmptyTimer = setTimeout(() => {
          if (!isDraggingRef.current && !isTalkingRef.current) {
            setShowFreeConvo(true);
            isWaitingAnswerRef.current = true;
          }
        }, 1200);
      }
    };
    const onMouseMove = (e: MouseEvent) => {
      gestureEngine.onTouchMove(e.clientX, e.clientY);
      if (holdInEmptyTimer) { clearTimeout(holdInEmptyTimer); holdInEmptyTimer = null; }
    };
    const onMouseUp = () => {
      gestureEngine.onTouchEnd();
      if (holdInEmptyTimer) { clearTimeout(holdInEmptyTimer); holdInEmptyTimer = null; }
    };

    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd);
    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    let explorationMsgTimer = 0;
    let anomalyPhase = 0;
    let posUpdateCounter = 0;
    let particleSpawnAcc = 0;
    let lastTime = performance.now();
    let wasFrozen = false;

    const clamp = (v: number, mn: number, mx: number) => Math.max(mn, Math.min(mx, v));

    const drawAura = (x: number, y: number, breath: number, glowBonus: number) => {
      const mv = moodRef.current?.getVisuals() ?? null;
      const badMod = badDaysRef.current?.getBadDayMoodModifiers();
      const auraDim = badMod ? badMod.auraDimMod : 1;
      const intensityMod = Math.min((mv ? mv.auraIntensityMod : 1) + glowBonus, 1.8) * auraDim;
      const baseR = (36 + breath * 5) * FAIRY_SCALE;
      for (let i = 3; i >= 0; i--) {
        const r = baseR + i * 20 * FAIRY_SCALE;
        const alpha = (0.03 + (3 - i) * 0.013) * intensityMod;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(180,140,255,${alpha * 1.2})`);
        g.addColorStop(0.4, `rgba(140,100,220,${alpha})`);
        g.addColorStop(0.7, `rgba(100,60,180,${alpha * 0.5})`);
        g.addColorStop(1, 'rgba(60,20,120,0)');
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = g; ctx.fill();
      }
    };

    const drawWing = (x: number, y: number, side: number, isUpper: boolean, flapAngle: number, scaleMod: number, alphaMod: number) => {
      ctx.save();
      ctx.translate(x, y);
      const flapOffset = isUpper ? 0 : Math.PI * 0.3;
      const flap = Math.sin(flapAngle + flapOffset);
      const scaleX = 0.3 + Math.abs(flap) * 0.7;
      ctx.scale(side * scaleX * FAIRY_SCALE * scaleMod, FAIRY_SCALE * scaleMod);
      const wingLen = isUpper ? 28 : 20;
      const wingWidth = isUpper ? 16 : 12;
      ctx.rotate(isUpper ? -0.6 : 0.3);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      if (isUpper) {
        ctx.bezierCurveTo(wingLen * 0.3, -wingWidth * 0.8, wingLen * 0.8, -wingWidth * 1.1, wingLen, -wingWidth * 0.3);
        ctx.bezierCurveTo(wingLen * 0.9, wingWidth * 0.15, wingLen * 0.4, wingWidth * 0.2, 0, 0);
      } else {
        ctx.bezierCurveTo(wingLen * 0.3, wingWidth * 0.3, wingLen * 0.8, wingWidth * 1.0, wingLen, wingWidth * 0.5);
        ctx.bezierCurveTo(wingLen * 0.85, -wingWidth * 0.1, wingLen * 0.35, -wingWidth * 0.1, 0, 0);
      }
      ctx.closePath();
      const aBase = (0.12 + Math.abs(flap) * 0.1) * alphaMod;
      const g = ctx.createLinearGradient(0, 0, wingLen, 0);
      g.addColorStop(0, `rgba(220,210,255,${aBase + 0.08})`);
      g.addColorStop(0.5, `rgba(200,180,255,${aBase})`);
      g.addColorStop(1, `rgba(170,150,240,${aBase * 0.4})`);
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = `rgba(200,190,255,${(0.1 + Math.abs(flap) * 0.08) * alphaMod})`;
      ctx.lineWidth = 0.5; ctx.stroke();
      ctx.restore();
    };

    const drawOrb = (x: number, y: number, breath: number, scaleMod: number, dimAlpha: number) => {
      const mv = moodRef.current?.getVisuals() ?? null;
      const glowMod = Math.min((mv ? mv.orbGlowMod : 1) * (1 - dimAlpha * 0.5), 1.6);
      const pulseMod = mv ? Math.min(mv.orbPulseMod, 1.4) : 1;
      const orbR = (8 + breath * 1.5 * pulseMod) * FAIRY_SCALE * scaleMod;

      const glow3 = ctx.createRadialGradient(x, y, 0, x, y, orbR * 3);
      glow3.addColorStop(0, `rgba(230,220,255,${0.15 * glowMod})`);
      glow3.addColorStop(1, 'rgba(180,150,255,0)');
      ctx.beginPath(); ctx.arc(x, y, orbR * 3, 0, Math.PI * 2);
      ctx.fillStyle = glow3; ctx.fill();

      const glow2 = ctx.createRadialGradient(x, y, 0, x, y, orbR * 1.8);
      glow2.addColorStop(0, `rgba(240,235,255,${0.35 * glowMod})`);
      glow2.addColorStop(0.6, `rgba(210,195,255,${0.12 * glowMod})`);
      glow2.addColorStop(1, 'rgba(180,160,240,0)');
      ctx.beginPath(); ctx.arc(x, y, orbR * 1.8, 0, Math.PI * 2);
      ctx.fillStyle = glow2; ctx.fill();

      const orbGrad = ctx.createRadialGradient(x - orbR * 0.2, y - orbR * 0.2, 0, x, y, orbR);
      orbGrad.addColorStop(0, 'rgba(255,255,255,0.95)');
      orbGrad.addColorStop(0.3, 'rgba(245,240,255,0.85)');
      orbGrad.addColorStop(0.7, 'rgba(220,205,255,0.6)');
      orbGrad.addColorStop(1, 'rgba(190,170,240,0.2)');
      ctx.beginPath(); ctx.arc(x, y, orbR, 0, Math.PI * 2);
      ctx.fillStyle = orbGrad; ctx.fill();

      const center = ctx.createRadialGradient(x, y, 0, x, y, orbR * 0.4);
      center.addColorStop(0, `rgba(255,255,255,${1 - dimAlpha * 0.6})`);
      center.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.beginPath(); ctx.arc(x, y, orbR * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = center; ctx.fill();
    };

    const drawParticles = () => {
      for (const p of particles) {
        const ratio = p.life / p.maxLife;
        const fadeIn = Math.min(ratio * 5, 1);
        const fadeOut = ratio > 0.7 ? 1 - (ratio - 0.7) / 0.3 : 1;
        const alpha = p.alpha * fadeIn * fadeOut;
        if (alpha <= 0) continue;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 2.5);
        g.addColorStop(0, `hsla(${p.hue},60%,80%,${alpha})`);
        g.addColorStop(0.5, `hsla(${p.hue},50%,70%,${alpha * 0.4})`);
        g.addColorStop(1, `hsla(${p.hue},40%,60%,0)`);
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 2.5, 0, Math.PI * 2);
        ctx.fillStyle = g; ctx.fill();
      }
    };

    const drawDrawingTrail = () => {
      const drawing = drawingRef.current;
      if (!drawing) return;
      const trail = drawing.getTrail();
      if (!trail.length) return;
      for (const tp of trail) {
        if (tp.alpha <= 0.01) continue;
        const r1 = tp.size * (tp.glowing ? 5.5 : 4);
        const g1 = ctx.createRadialGradient(tp.x, tp.y, 0, tp.x, tp.y, r1);
        g1.addColorStop(0, `hsla(${tp.hue},70%,80%,${tp.alpha * 0.35})`);
        g1.addColorStop(1, `hsla(${tp.hue},60%,70%,0)`);
        ctx.beginPath(); ctx.arc(tp.x, tp.y, r1, 0, Math.PI * 2);
        ctx.fillStyle = g1; ctx.fill();
        const r2 = tp.size * (tp.glowing ? 2 : 1.4);
        const g2 = ctx.createRadialGradient(tp.x, tp.y, 0, tp.x, tp.y, r2);
        g2.addColorStop(0, `hsla(${tp.hue},80%,92%,${tp.alpha})`);
        g2.addColorStop(0.5, `hsla(${tp.hue},65%,78%,${tp.alpha * 0.6})`);
        g2.addColorStop(1, `hsla(${tp.hue},55%,70%,0)`);
        ctx.beginPath(); ctx.arc(tp.x, tp.y, r2, 0, Math.PI * 2);
        ctx.fillStyle = g2; ctx.fill();
      }
    };

    const drawAnomaly = (a: Anomaly, sw: number, sh: number) => {
      if (a.fadeIn <= 0) return;
      const ax = a.x * sw; const ay = a.y * sh;
      const pulse = Math.sin(anomalyPhase * a.pulseSpeed) * 0.3 + 0.7;
      const baseAlpha = a.fadeIn * a.glowIntensity * pulse;
      const radius = a.size * 6;

      const g1 = ctx.createRadialGradient(ax, ay, 0, ax, ay, radius * 3);
      g1.addColorStop(0, `rgba(160,140,220,${baseAlpha * 0.08})`);
      g1.addColorStop(1, 'rgba(100,80,160,0)');
      ctx.beginPath(); ctx.arc(ax, ay, radius * 3, 0, Math.PI * 2);
      ctx.fillStyle = g1; ctx.fill();

      const g2 = ctx.createRadialGradient(ax, ay, 0, ax, ay, radius);
      g2.addColorStop(0, `rgba(200,180,255,${baseAlpha * 0.2})`);
      g2.addColorStop(1, 'rgba(140,120,220,0)');
      ctx.beginPath(); ctx.arc(ax, ay, radius, 0, Math.PI * 2);
      ctx.fillStyle = g2; ctx.fill();

      const g3 = ctx.createRadialGradient(ax, ay, 0, ax, ay, radius * 0.3);
      g3.addColorStop(0, `rgba(220,210,255,${baseAlpha * 0.35})`);
      g3.addColorStop(1, 'rgba(200,190,255,0)');
      ctx.beginPath(); ctx.arc(ax, ay, radius * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = g3; ctx.fill();

      if (a.active && a.fadeIn > 0.5) {
        const orbitAngle = anomalyPhase * 0.8;
        const px = ax + Math.cos(orbitAngle) * radius * 1.5;
        const py = ay + Math.sin(orbitAngle) * radius * 1.5;
        const pg = ctx.createRadialGradient(px, py, 0, px, py, 2);
        pg.addColorStop(0, `rgba(200,180,255,${baseAlpha * 0.4})`);
        pg.addColorStop(1, 'rgba(180,160,240,0)');
        ctx.beginPath(); ctx.arc(px, py, 2, 0, Math.PI * 2);
        ctx.fillStyle = pg; ctx.fill();
      }
    };

    const drawCompanion = (cx: number, cy: number, hue: number, bond: number, bobPhase: number) => {
      const scale = 0.38 + bond * 0.12;
      const r = 9 * FAIRY_SCALE * scale;
      const bob = Math.sin(bobPhase) * 4;
      const y = cy + bob;

      const aura = ctx.createRadialGradient(cx, y, 0, cx, y, r * 3);
      aura.addColorStop(0, `hsla(${hue},60%,70%,0.06)`);
      aura.addColorStop(1, `hsla(${hue},50%,60%,0)`);
      ctx.beginPath(); ctx.arc(cx, y, r * 3, 0, Math.PI * 2);
      ctx.fillStyle = aura; ctx.fill();

      const orb = ctx.createRadialGradient(cx - r * 0.2, y - r * 0.2, 0, cx, y, r);
      orb.addColorStop(0, `hsla(${hue},80%,92%,0.9)`);
      orb.addColorStop(0.5, `hsla(${hue},70%,80%,0.6)`);
      orb.addColorStop(1, `hsla(${hue},60%,70%,0.1)`);
      ctx.beginPath(); ctx.arc(cx, y, r, 0, Math.PI * 2);
      ctx.fillStyle = orb; ctx.fill();

      const center = ctx.createRadialGradient(cx, y, 0, cx, y, r * 0.4);
      center.addColorStop(0, 'rgba(255,255,255,0.85)');
      center.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.beginPath(); ctx.arc(cx, y, r * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = center; ctx.fill();
    };

    // Draw sequence flash indicator
    const drawSequenceFlash = () => {
      if (!sequenceFlashTarget || sequenceFlashTime <= 0) return;
      const alpha = Math.min(sequenceFlashTime / 0.3, 1) * 0.8;
      const { x, y } = sequenceFlashTarget;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 50);
      g.addColorStop(0, `rgba(200,180,255,${alpha})`);
      g.addColorStop(1, 'rgba(180,150,255,0)');
      ctx.beginPath(); ctx.arc(x, y, 50, 0, Math.PI * 2);
      ctx.fillStyle = g; ctx.fill();
    };

    const loop = (now: number) => {
      const rawDt = (now - lastTime) / 16.667;
      const dt = clamp(rawDt, 0.1, 2.0);
      lastTime = now;
      ambientTimeRef.current += dt * 0.016;

      const w = W(); const h = H();

      if (gestureRef.current) gestureRef.current.setFairyPosition(fairy.x, fairy.y);

      // Update mood
      const mood = moodRef.current;
      if (mood) {
        mood.update(dt);
        if (!isDraggingRef.current) mood.onIdle(dt);
      }
      const moodName = mood?.getCurrentMood() ?? 'calm';

      // Update weather
      const weather = weatherRef.current;
      if (weather) weather.update(dt, w, h, moodName);

      // Update body language
      const body = bodyRef.current;
      const bodyState = body ? body.update(dt) : {
        offsetX: 0, offsetY: 0, scaleBonus: 1, glowBonus: 0, angle: 0, dimAlpha: 0,
      };

      if (body?.getCurrent() === 'spin') soundEngine.play('spin');

      // Update exploration
      anomalyPhase += 0.02 * dt;
      const exploration = explorationRef.current;
      let exploreTarget: { x: number; y: number } | null = null;

      if (exploration) {
        exploration.update(dt, fairy.x, fairy.y, w, h, isDraggingRef.current);
        explorationMsgTimer += dt;
        if (explorationMsgTimer > 10) {
          explorationMsgTimer = 0;
          const msg = exploration.getPendingMessage();
          if (msg) {
            const phase = exploration.getExplorationPhase();
            soundEngine.play(phase === 'approaching' ? 'discovery' : 'curious');
            showMessage(msg);
            mood?.onExploration();
            const target = exploration.getCurrentTarget();
            if (target) memoryRef.current?.setSessionExplored(target.name);
          }
        }
        const rawTarget = exploration.getTargetPosition();
        if (rawTarget) exploreTarget = { x: rawTarget.x * w, y: rawTarget.y * h };
      }

      // Update particle drawing
      const drawing = drawingRef.current;
      const personalityType = memoryRef.current?.getPersonalityType?.() ?? 'curious';
      if (drawing) {
        drawing.update(dt, fairy.x, fairy.y, isDraggingRef.current, isTalkingRef.current, personalityType);
        if (drawing.wasInterrupted()) {
          drawing.resetInterrupted();
          body?.trigger('shrink');
        }
      }

      // Update companion
      const companion = companionRef.current;
      if (companion) {
        companion.update(dt, fairy.x, fairy.y, w, h);
        if (!companionShownRef.current && companion.isFound() && companion.isVisible()) {
          companionShownRef.current = true;
          soundEngine.play('companion');
          setTimeout(() => showMessage(companion.getFoundMessage()), 1500);
        }
        const mem = memoryRef.current;
        if (mem && !companion.isFound()) {
          const gesture = gestureRef.current;
          const style = gesture ? gesture.getInteractionStyle() : 'mixed';
          companion.checkForAppearance(
            mem.getTotalSessions ? mem.getTotalSessions() : 0,
            personalityType,
            style
          );
        }
      }

      // Update hidden spots
      const hiddenSpots = hiddenSpotsRef.current;
      if (hiddenSpots) hiddenSpots.update(dt, fairy.x, fairy.y, w, h);

      // Update mini game stay still
      const mgEngine = miniGamesRef.current;
      const activeGame = mgEngine?.getActiveGame();
      if (activeGame?.type === 'stay_still') {
        const result = mgEngine!.updateStayStill();
        const prog = mgEngine!.getStayStillProgress();
        setMiniGameProgress(prog);
        if (result) {
          soundEngine.play(result.won ? 'happy' : 'lonely');
          setTimeout(() => showMessage(result.message), 300);
          setActiveMiniGame(null);
          if (result.won) moodRef.current?.setMood('calm');
        }
      }

      // Update sequence flash
      if (sequenceFlashTime > 0) {
        sequenceFlashTime -= dt * 0.05;
        if (sequenceFlashTime < 0) {
          sequenceFlashTime = 0;
          sequenceFlashTarget = null;
          // Next in show sequence
          sequenceShowIdx++;
          const positions = mgEngine?.getSequencePositions() ?? [];
          if (sequenceShowIdx < positions.length) {
            sequenceFlashTarget = positions[sequenceShowIdx];
            sequenceFlashTime = 0.5;
            sequenceShowTimer = 0.8;
          }
        }
      }
      if (sequenceShowTimer > 0) sequenceShowTimer -= dt * 0.05;

      // Find me game timer
      if (findMeHideTimer > 0) {
        findMeHideTimer -= dt * 0.016;
        if (findMeHideTimer <= 0) {
          // Reappear at new position
          if (findMeReappearPos) {
            fairy.x = findMeReappearPos.x;
            fairy.y = findMeReappearPos.y;
            fairy.vx = 0; fairy.vy = 0;
            findMeReappearPos = null;
          }
          fairyVisibleOverride = true;
          setFairyHidden(false);
        }
      }

      // Bad day modifiers
      const badMod = badDaysRef.current?.getBadDayMoodModifiers();

      // Fairy movement
      fairy.breathPhase += 0.025 * dt;
      const breath = Math.sin(fairy.breathPhase) * 0.5 + 0.5;
      const wingSpeedMod = badMod ? badMod.wingSpeedMod : 1;
      fairy.wingAngle += fairy.wingSpeed * 0.06 * dt * wingSpeedMod;

      const isFrozen = isTalkingRef.current || isWaitingAnswerRef.current;

      if (isFrozen) {
        // Gently brake to a stop — tiny breath micro-movement only
        fairy.vx *= Math.pow(0.75, dt);
        fairy.vy *= Math.pow(0.75, dt);
        fairy.vx += Math.sin(fairy.breathPhase * 0.5) * 0.008 * dt;
        fairy.vy += Math.cos(fairy.breathPhase * 0.4) * 0.006 * dt;
        fairy.wingSpeed += (9 - fairy.wingSpeed) * 0.05 * dt;
        wasFrozen = true;
      } else {
        // Just unfrozen — kick the drift so hada doesn't stay stuck
        if (wasFrozen) {
          wasFrozen = false;
          driftTimer = 0; // Force a new drift target immediately
          fairy.idleTime = 0;
          fairy.idlePhaseX = Math.random() * Math.PI * 2;
          fairy.idlePhaseY = Math.random() * Math.PI * 2;
          pickDriftTarget();
          // Give a tiny impulse so it starts moving
          fairy.vx += (Math.random() - 0.5) * 0.4;
          fairy.vy += (Math.random() - 0.5) * 0.4;
        }
      }

      if (!isFrozen) {
        if (isDraggingRef.current) {
          fairy.mode = 'following';
          const dx = dragTargetRef.current.x - fairy.x;
          const dy = dragTargetRef.current.y - fairy.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > 2) {
            const force = Math.min(dist * 0.06, 1.5);
            fairy.vx += (dx / dist) * force * dt;
            fairy.vy += (dy / dist) * force * dt;
          }
          fairy.wingSpeed += (14 - fairy.wingSpeed) * 0.08 * dt;
        } else if (exploreTarget) {
          fairy.mode = 'exploring';
          const dx = exploreTarget.x - fairy.x;
          const dy = exploreTarget.y - fairy.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > 8) {
            const force = Math.min(dist * 0.015, 0.6);
            fairy.vx += (dx / dist) * force * dt;
            fairy.vy += (dy / dist) * force * dt;
          } else {
            fairy.vx += Math.sin(fairy.idleTime * 0.05 + fairy.idlePhaseX) * 0.04 * dt;
            fairy.vy += Math.cos(fairy.idleTime * 0.04 + fairy.idlePhaseY) * 0.04 * dt;
            fairy.idleTime += dt;
          }
          fairy.wingSpeed += (13 - fairy.wingSpeed) * 0.05 * dt;
          if (!exploration?.getTargetPosition()) {
            memoryRef.current?.onExplorationCompleted();
            fairy.mode = 'idle';
            fairy.idleTime = 0;
            pickDriftTarget();
          }
        } else {
          fairy.mode = 'idle';
          fairy.idleTime += dt;
          driftTimer -= dt;
          if (driftTimer <= 0) pickDriftTarget();

          const dx = driftTargetX - fairy.x;
          const dy = driftTargetY - fairy.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > 8) {
            const force = Math.min(dist * 0.008, 0.3);
            fairy.vx += (dx / dist) * force * dt;
            fairy.vy += (dy / dist) * force * dt;
          }
          fairy.vx += Math.sin(fairy.idleTime * 0.03 + fairy.idlePhaseX) * 0.05 * dt;
          fairy.vy += Math.cos(fairy.idleTime * 0.025 + fairy.idlePhaseY) * 0.04 * dt;
          fairy.wingSpeed += (10 - fairy.wingSpeed) * 0.04 * dt;
        }
      }

      fairy.vx *= Math.pow(DAMPING, dt);
      fairy.vy *= Math.pow(DAMPING, dt);
      const speed = Math.sqrt(fairy.vx * fairy.vx + fairy.vy * fairy.vy);
      if (speed > MAX_SPEED) { fairy.vx = (fairy.vx / speed) * MAX_SPEED; fairy.vy = (fairy.vy / speed) * MAX_SPEED; }

      fairy.x += (fairy.vx + bodyState.offsetX * 0.1) * dt;
      fairy.y += (fairy.vy + bodyState.offsetY * 0.1) * dt;

      const margin = 60;
      if (fairy.x < margin) { fairy.x = margin; fairy.vx = Math.abs(fairy.vx) * 0.2; }
      if (fairy.x > w - margin) { fairy.x = w - margin; fairy.vx = -Math.abs(fairy.vx) * 0.2; }
      if (fairy.y < margin) { fairy.y = margin; fairy.vy = Math.abs(fairy.vy) * 0.2; }
      if (fairy.y > h - margin) { fairy.y = h - margin; fairy.vy = -Math.abs(fairy.vy) * 0.2; }

      fairyPosRef.current = { x: fairy.x, y: fairy.y };
      posUpdateCounter++;
      if (posUpdateCounter % 6 === 0) setFairyScreenPos({ x: fairy.x, y: fairy.y });

      // Spawn particles
      const mv = mood?.getVisuals() ?? null;
      const spawnRate = mv ? (fairy.mode === 'following' ? 0.6 : 1.8) / Math.min(mv.particleSpawnRate, 3) : (fairy.mode === 'following' ? 0.6 : 1.8);
      particleSpawnAcc += dt;
      const isDownward = badMod?.particleDirectionDown ?? false;
      while (particleSpawnAcc >= spawnRate) {
        spawnParticle(fairy.x, fairy.y, fairy.mode === 'following', isDownward);
        particleSpawnAcc -= spawnRate;
      }
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life += dt;
        if (p.life >= p.maxLife) { particles.splice(i, 1); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vx *= Math.pow(0.985, dt); p.vy *= Math.pow(0.985, dt);
        p.vy -= 0.002 * dt;
      }

      // Draw
      ctx.fillStyle = weather ? weather.getBgColor() : '#000';
      ctx.fillRect(0, 0, w, h);

      if (weather) weather.draw(ctx, w, h);

      // Hidden spots
      if (hiddenSpots) hiddenSpots.draw(ctx, w, h, ambientTimeRef.current);

      if (exploration) {
        for (const a of exploration.getAnomalies()) drawAnomaly(a, w, h);
      }

      drawDrawingTrail();

      // Draw sequence flash
      drawSequenceFlash();

      // Fairy
      const fx = fairy.x + bodyState.offsetX;
      const fy = fairy.y + bodyState.offsetY;
      const scale = bodyState.scaleBonus;

      if (fairyVisibleOverride && !fairyHidden) {
        ctx.save();
        if (bodyState.angle !== 0) {
          ctx.translate(fx, fy);
          ctx.rotate(bodyState.angle);
          ctx.translate(-fx, -fy);
        }

        drawAura(fx, fy, breath, bodyState.glowBonus);
        drawParticles();
        drawWing(fx, fy, -1, true, fairy.wingAngle, scale, mv ? Math.min(mv.wingAlphaMod, 1.5) : 1);
        drawWing(fx, fy, 1, true, fairy.wingAngle, scale, mv ? Math.min(mv.wingAlphaMod, 1.5) : 1);
        drawWing(fx, fy, -1, false, fairy.wingAngle, scale, mv ? Math.min(mv.wingAlphaMod, 1.5) : 1);
        drawWing(fx, fy, 1, false, fairy.wingAngle, scale, mv ? Math.min(mv.wingAlphaMod, 1.5) : 1);
        drawOrb(fx, fy, breath, scale, bodyState.dimAlpha);
        ctx.restore();
      }

      if (companion && companion.isVisible()) {
        const cPos = companion.getPosition(w, h);
        drawCompanion(cPos.x, cPos.y, companion.getHue(), companion.getBondLevel(), companion.getBobPhase());
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);

    // Expose findMe trigger
    (window as any).__fairyFindMe = (reappearX: number, reappearY: number, hideMs: number) => {
      fairyVisibleOverride = false;
      setFairyHidden(true);
      findMeReappearPos = { x: reappearX, y: reappearY };
      findMeHideTimer = hideMs / 1000;
    };

    return () => {
      cancelAnimationFrame(animId);
      gestureEngine.destroy();
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      if (holdInEmptyTimer) clearTimeout(holdInEmptyTimer);
    };
  }, [showMessage]); // eslint-disable-line react-hooks/exhaustive-deps

  // Trigger find_me hide when game activates
  useEffect(() => {
    if (activeMiniGame?.type === 'find_me' && activeMiniGame.data) {
      const data = activeMiniGame.data as { hideMs: number; reappearX: number; reappearY: number };
      setTimeout(() => {
        (window as any).__fairyFindMe?.(data.reappearX, data.reappearY, data.hideMs);
      }, 500);
    }
  }, [activeMiniGame]);

  const displayMessage = currentMessage ? currentMessage.replace(/##\d+$/, '') : null;
  const hasActiveUI = !!personalQuestion || !!activeDecision || showFreeConvo || !!activeMiniGame || !!teachingQuestion;

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%', background: '#000', touchAction: 'none' }}
      />
      <MemoryBubble
        key={currentMessage || ''}
        message={displayMessage}
        fairyX={fairyScreenPos.x}
        fairyY={fairyScreenPos.y}
        onTalkingChange={handleTalkingChange}
      />

      {/* Teaching Input (word questions) */}
      {teachingQuestion && !hasActiveUI && (
        <TeachingInput
          question={teachingQuestion}
          onAnswer={handleTeachingAnswer}
          onDismiss={handleTeachingDismiss}
          fairyX={fairyScreenPos.x}
          fairyY={fairyScreenPos.y}
        />
      )}

      {/* Personal Question Input */}
      {personalQuestion && !teachingQuestion && (
        <PersonalQuestionInput
          questionId={personalQuestion.id}
          question={personalQuestion.question}
          onAnswer={handlePersonalAnswer}
          onDismiss={handlePersonalDismiss}
          fairyX={fairyScreenPos.x}
          fairyY={fairyScreenPos.y}
        />
      )}

      {/* Decision UI */}
      {activeDecision && !personalQuestion && !teachingQuestion && (
        <DecisionUI
          decision={activeDecision}
          onChoose={handleDecisionChoice}
          fairyX={fairyScreenPos.x}
          fairyY={fairyScreenPos.y}
        />
      )}

      {/* Free Conversation */}
      {showFreeConvo && !activeDecision && !personalQuestion && !teachingQuestion && (
        <FreeConvoInput
          onSend={handleFreeConvoSend}
          onClose={handleFreeConvoClose}
          fairyX={fairyScreenPos.x}
          fairyY={fairyScreenPos.y}
        />
      )}

      {/* Mini Game UI */}
      {activeMiniGame && (
        <MiniGameUI
          game={activeMiniGame}
          onReady={handleMiniGameReady}
          progress={miniGameProgress}
          sequencePositions={miniGamesRef.current?.getSequencePositions()}
          currentStep={miniGameStep}
          isInputPhase={miniGameInputPhase}
        />
      )}

      {/* Mute button */}
      <button
        onClick={toggleMute}
        style={{
          position: 'fixed', bottom: '24px', right: '24px',
          background: 'transparent', border: 'none', cursor: 'pointer',
          opacity: 0.25, transition: 'opacity 0.3s', padding: '8px', zIndex: 100,
        }}
        onMouseEnter={e => (e.currentTarget.style.opacity = '0.7')}
        onMouseLeave={e => (e.currentTarget.style.opacity = '0.25')}
        onTouchStart={e => { e.stopPropagation(); e.currentTarget.style.opacity = '0.7'; }}
        onTouchEnd={e => { e.stopPropagation(); e.currentTarget.style.opacity = '0.25'; }}
        aria-label={isMuted ? 'Activar sonido' : 'Silenciar'}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          {isMuted ? (
            <>
              <path d="M11 5L6 9H2v6h4l5 4V5z" fill="rgba(180,160,255,0.7)" />
              <line x1="23" y1="9" x2="17" y2="15" stroke="rgba(180,160,255,0.7)" strokeWidth="2" strokeLinecap="round"/>
              <line x1="17" y1="9" x2="23" y2="15" stroke="rgba(180,160,255,0.7)" strokeWidth="2" strokeLinecap="round"/>
            </>
          ) : (
            <>
              <path d="M11 5L6 9H2v6h4l5 4V5z" fill="rgba(180,160,255,0.7)" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" stroke="rgba(180,160,255,0.7)" strokeWidth="2" strokeLinecap="round"/>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" stroke="rgba(180,160,255,0.5)" strokeWidth="2" strokeLinecap="round"/>
            </>
          )}
        </svg>
      </button>
    </>
  );
}
