// --- Mood Engine ---
// Tracks the fairy's current emotional state and outputs visual modifiers.
// Mood changes based on real-time events (touches, idle, exploration, gestures).
// The mood affects particles, wing speed, aura, and movement.

export type MoodType = 'neutral' | 'happy' | 'curious' | 'calm' | 'excited' | 'lonely' | 'comforted' | 'playful' | 'dreamy';

export interface MoodVisuals {
  // Particle modifiers
  particleRiseSpeed: number;      // -1 to 1 (negative = fall, positive = rise)
  particleSpread: number;         // 0.5-2.0 multiplier
  particleWarmth: number;         // -30 to +30 hue shift
  particleAlpha: number;          // 0.5-1.5 multiplier
  particleSpawnRate: number;      // 0.5-2.0 multiplier

  // Wing modifiers
  wingSpeedMod: number;           // 0.5-2.0 multiplier
  wingAlphaMod: number;           // 0.7-1.3

  // Aura modifiers
  auraBreathSpeed: number;        // 0.5-2.0
  auraIntensityMod: number;       // 0.5-1.5

  // Orb modifiers
  orbPulseMod: number;            // 0.5-1.5
  orbGlowMod: number;             // 0.7-1.5

  // Movement
  movementSmoothness: number;     // 0.5-1.5 (lower = jittery, higher = smooth)
  idleDriftRange: number;         // 0.5-2.0
}

interface MoodState {
  current: MoodType;
  intensity: number;      // 0-1 how strong the mood is
  transition: number;     // 0-1 blend progress
  previous: MoodType;
  lastChange: number;
  
  // Accumulator values that influence mood
  recentTouches: number;
  recentHolds: number;
  recentRapidTaps: number;
  recentSwipes: number;
  idleTime: number;        // frames idle
  comfortTime: number;     // accumulated hold time
  explorationExcitement: number;
}

const moodVisualTargets: Record<MoodType, MoodVisuals> = {
  neutral: {
    particleRiseSpeed: 0.0,
    particleSpread: 1.0,
    particleWarmth: 0,
    particleAlpha: 1.0,
    particleSpawnRate: 1.0,
    wingSpeedMod: 1.0,
    wingAlphaMod: 1.0,
    auraBreathSpeed: 1.0,
    auraIntensityMod: 1.0,
    orbPulseMod: 1.0,
    orbGlowMod: 1.0,
    movementSmoothness: 1.0,
    idleDriftRange: 1.0,
  },
  happy: {
    particleRiseSpeed: 0.5,
    particleSpread: 1.4,
    particleWarmth: 15,
    particleAlpha: 1.3,
    particleSpawnRate: 1.5,
    wingSpeedMod: 1.3,
    wingAlphaMod: 1.2,
    auraBreathSpeed: 1.2,
    auraIntensityMod: 1.3,
    orbPulseMod: 1.2,
    orbGlowMod: 1.3,
    movementSmoothness: 1.2,
    idleDriftRange: 1.3,
  },
  curious: {
    particleRiseSpeed: 0.2,
    particleSpread: 1.6,
    particleWarmth: -5,
    particleAlpha: 1.1,
    particleSpawnRate: 1.3,
    wingSpeedMod: 1.4,
    wingAlphaMod: 1.1,
    auraBreathSpeed: 1.4,
    auraIntensityMod: 1.1,
    orbPulseMod: 1.3,
    orbGlowMod: 1.1,
    movementSmoothness: 0.8,
    idleDriftRange: 1.8,
  },
  calm: {
    particleRiseSpeed: 0.1,
    particleSpread: 0.8,
    particleWarmth: 5,
    particleAlpha: 0.9,
    particleSpawnRate: 0.7,
    wingSpeedMod: 0.7,
    wingAlphaMod: 1.0,
    auraBreathSpeed: 0.6,
    auraIntensityMod: 1.1,
    orbPulseMod: 0.7,
    orbGlowMod: 1.1,
    movementSmoothness: 1.5,
    idleDriftRange: 0.6,
  },
  excited: {
    particleRiseSpeed: 0.7,
    particleSpread: 1.8,
    particleWarmth: 20,
    particleAlpha: 1.4,
    particleSpawnRate: 2.0,
    wingSpeedMod: 1.6,
    wingAlphaMod: 1.3,
    auraBreathSpeed: 1.8,
    auraIntensityMod: 1.4,
    orbPulseMod: 1.5,
    orbGlowMod: 1.4,
    movementSmoothness: 0.7,
    idleDriftRange: 1.5,
  },
  lonely: {
    particleRiseSpeed: -0.3,
    particleSpread: 0.6,
    particleWarmth: -15,
    particleAlpha: 0.6,
    particleSpawnRate: 0.5,
    wingSpeedMod: 0.6,
    wingAlphaMod: 0.7,
    auraBreathSpeed: 0.5,
    auraIntensityMod: 0.6,
    orbPulseMod: 0.6,
    orbGlowMod: 0.7,
    movementSmoothness: 1.3,
    idleDriftRange: 0.4,
  },
  comforted: {
    particleRiseSpeed: 0.3,
    particleSpread: 1.0,
    particleWarmth: 25,
    particleAlpha: 1.2,
    particleSpawnRate: 1.2,
    wingSpeedMod: 0.8,
    wingAlphaMod: 1.2,
    auraBreathSpeed: 0.7,
    auraIntensityMod: 1.3,
    orbPulseMod: 0.8,
    orbGlowMod: 1.4,
    movementSmoothness: 1.4,
    idleDriftRange: 0.5,
  },
  playful: {
    particleRiseSpeed: 0.4,
    particleSpread: 1.5,
    particleWarmth: 10,
    particleAlpha: 1.2,
    particleSpawnRate: 1.6,
    wingSpeedMod: 1.5,
    wingAlphaMod: 1.2,
    auraBreathSpeed: 1.5,
    auraIntensityMod: 1.2,
    orbPulseMod: 1.3,
    orbGlowMod: 1.2,
    movementSmoothness: 0.8,
    idleDriftRange: 1.6,
  },
  dreamy: {
    particleRiseSpeed: 0.2,
    particleSpread: 1.3,
    particleWarmth: -10,
    particleAlpha: 0.8,
    particleSpawnRate: 0.8,
    wingSpeedMod: 0.75,
    wingAlphaMod: 0.9,
    auraBreathSpeed: 0.5,
    auraIntensityMod: 1.2,
    orbPulseMod: 0.6,
    orbGlowMod: 1.2,
    movementSmoothness: 1.4,
    idleDriftRange: 1.0,
  },
};

function lerpVisuals(a: MoodVisuals, b: MoodVisuals, t: number): MoodVisuals {
  const result = {} as MoodVisuals;
  for (const key of Object.keys(a) as (keyof MoodVisuals)[]) {
    result[key] = a[key] + (b[key] - a[key]) * t;
  }
  return result;
}

export class MoodEngine {
  private moodState: MoodState;
  private currentVisuals: MoodVisuals;
  private targetVisuals: MoodVisuals;

  constructor() {
    this.moodState = {
      current: 'neutral',
      intensity: 0.5,
      transition: 1,
      previous: 'neutral',
      lastChange: Date.now(),
      recentTouches: 0,
      recentHolds: 0,
      recentRapidTaps: 0,
      recentSwipes: 0,
      idleTime: 0,
      comfortTime: 0,
      explorationExcitement: 0,
    };
    this.currentVisuals = { ...moodVisualTargets.neutral };
    this.targetVisuals = { ...moodVisualTargets.neutral };
  }

  getCurrentMood(): MoodType {
    return this.moodState.current;
  }

  getVisuals(): MoodVisuals {
    return this.currentVisuals;
  }

  // Called every frame
  update(dt: number) {
    const s = this.moodState;

    // Decay accumulators
    s.recentTouches *= Math.pow(0.995, dt);
    s.recentHolds *= Math.pow(0.998, dt);
    s.recentRapidTaps *= Math.pow(0.993, dt);
    s.recentSwipes *= Math.pow(0.994, dt);
    s.comfortTime *= Math.pow(0.999, dt);
    s.explorationExcitement *= Math.pow(0.997, dt);

    // Determine mood from accumulators
    const newMood = this.determineMood();
    if (newMood !== s.current) {
      s.previous = s.current;
      s.current = newMood;
      s.transition = 0;
      s.lastChange = Date.now();
      this.targetVisuals = { ...moodVisualTargets[newMood] };
    }

    // Smooth transition between moods
    if (s.transition < 1) {
      s.transition = Math.min(1, s.transition + dt * 0.015); // ~1 second transition
    }

    // Lerp visuals
    const prevVisuals = moodVisualTargets[s.previous];
    this.currentVisuals = lerpVisuals(prevVisuals, this.targetVisuals, this.easeInOut(s.transition));
  }

  private easeInOut(t: number): number {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  private determineMood(): MoodType {
    const s = this.moodState;

    // Comforted: holding
    if (s.comfortTime > 5) return 'comforted';

    // Excited: lots of rapid taps
    if (s.recentRapidTaps > 3) return 'excited';

    // Playful: swipes + some touches
    if (s.recentSwipes > 2 || (s.recentRapidTaps > 1 && s.recentTouches > 3)) return 'playful';

    // Happy: moderate touches
    if (s.recentTouches > 2 && s.recentTouches < 8) return 'happy';

    // Curious: exploring
    if (s.explorationExcitement > 3) return 'curious';

    // Lonely: very long idle
    if (s.idleTime > 1800) return 'lonely'; // ~30 seconds

    // Calm: moderate idle
    if (s.idleTime > 600) return 'calm'; // ~10 seconds

    // Dreamy: just came from a dream or low activity
    if (s.idleTime > 300 && s.recentTouches < 1) return 'dreamy';

    return 'neutral';
  }

  // --- Event handlers ---

  onTap() {
    this.moodState.recentTouches += 1;
    this.moodState.idleTime = 0;
  }

  onHold(durationMs: number) {
    this.moodState.comfortTime += durationMs / 1000;
    this.moodState.recentHolds += 1;
    this.moodState.idleTime = 0;
  }

  onRapidTap(count: number) {
    this.moodState.recentRapidTaps += count;
    this.moodState.recentTouches += count;
    this.moodState.idleTime = 0;
  }

  onSwipe() {
    this.moodState.recentSwipes += 1;
    this.moodState.idleTime = 0;
  }

  onDrag() {
    this.moodState.recentTouches += 0.3;
    this.moodState.idleTime = 0;
  }

  onIdle(dt: number) {
    this.moodState.idleTime += dt;
  }

  onExploration() {
    this.moodState.explorationExcitement += 1;
  }

  setDreamy() {
    this.moodState.current = 'dreamy';
    this.moodState.transition = 0;
    this.targetVisuals = { ...moodVisualTargets.dreamy };
    this.moodState.lastChange = Date.now();
  }

  setMood(mood: MoodType) {
    this.moodState.previous = this.moodState.current;
    this.moodState.current = mood;
    this.moodState.transition = 0;
    this.targetVisuals = { ...moodVisualTargets[mood] };
    this.moodState.lastChange = Date.now();
  }

  // Set initial mood based on return context
  setInitialMood(wasAbsent: boolean, wasNight: boolean) {
    if (wasAbsent) {
      this.moodState.current = 'lonely';
      this.moodState.idleTime = 2000;
    } else if (wasNight) {
      this.moodState.current = 'dreamy';
    }
    this.targetVisuals = { ...moodVisualTargets[this.moodState.current] };
    this.currentVisuals = { ...this.targetVisuals };
  }
}
