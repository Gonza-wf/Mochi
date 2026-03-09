// --- Evolution Engine ---
// The fairy evolves visually and psychologically based on how the player treats her.
// She is a mirror of the player.
//
// Attentive player → luminous creature (bright, warm, golden)
// Cold player → dark creature (dimmed, blue-purple, distant)
// Curious player → wise creature (deep glow, intricate particles, complex aura)
// Aggressive player → chaotic creature (erratic particles, red tints, flickering)
// Gentle player → serene creature (soft glow, slow drift, pastel tones)
//
// Evolution is continuous, not stage-based. Every trait blends smoothly.

const EVOLUTION_KEY = 'fairy_evolution';

export interface EvolutionVisuals {
  // Core orb
  orbHue: number;           // 0-360 hue shift
  orbSaturation: number;    // 0-100
  orbBrightness: number;    // 0.3-1.5 multiplier
  orbSize: number;          // 0.6-1.4 multiplier

  // Aura
  auraColor: [number, number, number]; // RGB
  auraIntensity: number;    // 0.3-1.5
  auraSize: number;         // 0.7-1.5 multiplier
  auraPulseSpeed: number;   // 0.5-2.0 multiplier

  // Wings
  wingHue: number;          // 0-360
  wingAlpha: number;        // 0.5-1.5 multiplier
  wingSpeed: number;        // 0.7-1.5 multiplier (flap speed modifier)
  wingSize: number;         // 0.8-1.3 multiplier

  // Particles
  particleHue: number;      // base hue 0-360
  particleHueRange: number; // how much hue varies (10-80)
  particleCount: number;    // 0.5-2.0 multiplier
  particleSpeed: number;    // 0.5-2.0 multiplier
  particleSize: number;     // 0.7-1.5 multiplier

  // Movement
  driftSpeed: number;       // 0.5-1.5 idle movement speed
  jitter: number;           // 0-1 how erratic movement is

  // Special effects
  innerGlow: number;        // 0-1 intensity of inner white glow
  outerRays: number;        // 0-1 intensity of light rays emanating
  darkMist: number;         // 0-1 intensity of dark particles mixed in
  sparkleRate: number;      // 0-1 how often sparkle flashes appear
}

export type EvolutionPath =
  | 'luminous'    // attentive player → bright, warm, golden
  | 'shadow'      // cold/absent player → dimmed, deep purple/blue
  | 'sage'        // curious player → wise, deep glow, rich textures
  | 'wild'        // aggressive/chaotic player → erratic, intense
  | 'serene'      // gentle player → calm, pastel, flowing
  | 'ember'       // mixed: some attention but inconsistent → warm but flickering
  | 'neutral';    // too early to tell

export interface EvolutionState {
  // Core evolution axes (0-100)
  warmth: number;        // cold ← → warm  (based on attention & consistency)
  intensity: number;     // dim ← → bright (based on engagement & touches)
  stability: number;     // chaotic ← → stable (based on gentleness & regularity)
  depth: number;         // shallow ← → deep (based on time, curiosity, exploration)
  bond: number;          // detached ← → bonded (based on responsiveness & presence)

  // Derived
  dominantPath: EvolutionPath;
  evolutionLevel: number; // 0-100 how far along evolution has progressed
  lastUpdate: number;

  // History for smooth transitions
  visualsCache: EvolutionVisuals | null;
}

function getDefault(): EvolutionState {
  return {
    warmth: 50,
    intensity: 40,
    stability: 50,
    depth: 20,
    bond: 30,
    dominantPath: 'neutral',
    evolutionLevel: 0,
    lastUpdate: 0,
    visualsCache: null,
  };
}

function load(): EvolutionState {
  try {
    const raw = localStorage.getItem(EVOLUTION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const def = getDefault();
      return { ...def, ...parsed };
    }
  } catch { /* corrupted */ }
  return getDefault();
}

function persist(state: EvolutionState) {
  try {
    localStorage.setItem(EVOLUTION_KEY, JSON.stringify(state));
  } catch { /* full */ }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// --- Path determination ---

function computeDominantPath(s: EvolutionState): EvolutionPath {
  // Score each path
  const scores: Record<EvolutionPath, number> = {
    luminous: 0,
    shadow: 0,
    sage: 0,
    wild: 0,
    serene: 0,
    ember: 0,
    neutral: 10, // baseline
  };

  // Luminous: high warmth + high bond + high intensity
  scores.luminous = (s.warmth - 50) * 1.2 + (s.bond - 50) * 1.0 + (s.intensity - 50) * 0.6;

  // Shadow: low warmth + low bond + low intensity
  scores.shadow = (50 - s.warmth) * 1.0 + (50 - s.bond) * 1.2 + (50 - s.intensity) * 0.5;

  // Sage: high depth + moderate-high stability + some warmth
  scores.sage = (s.depth - 40) * 1.5 + (s.stability - 40) * 0.5 + (s.warmth - 30) * 0.3;

  // Wild: low stability + high intensity
  scores.wild = (50 - s.stability) * 1.3 + (s.intensity - 40) * 0.8;

  // Serene: high stability + moderate warmth + low intensity
  scores.serene = (s.stability - 50) * 1.2 + (s.warmth - 40) * 0.5 + (50 - s.intensity) * 0.4;

  // Ember: moderate warmth + low stability (inconsistent attention)
  scores.ember = Math.min(s.warmth, 100 - s.warmth) * 0.4 + (50 - s.stability) * 0.6 + (s.bond - 30) * 0.3;

  let best: EvolutionPath = 'neutral';
  let bestScore = -Infinity;
  for (const [path, score] of Object.entries(scores) as [EvolutionPath, number][]) {
    if (score > bestScore) {
      bestScore = score;
      best = path;
    }
  }

  return best;
}

// --- Visual computation ---

function computeVisuals(s: EvolutionState): EvolutionVisuals {
  const path = s.dominantPath;
  const evo = s.evolutionLevel / 100; // 0-1 how evolved

  // Base visuals (neutral fairy)
  const base: EvolutionVisuals = {
    orbHue: 270,
    orbSaturation: 30,
    orbBrightness: 1.0,
    orbSize: 1.0,
    auraColor: [180, 140, 255],
    auraIntensity: 1.0,
    auraSize: 1.0,
    auraPulseSpeed: 1.0,
    wingHue: 270,
    wingAlpha: 1.0,
    wingSpeed: 1.0,
    wingSize: 1.0,
    particleHue: 270,
    particleHueRange: 40,
    particleCount: 1.0,
    particleSpeed: 1.0,
    particleSize: 1.0,
    driftSpeed: 1.0,
    jitter: 0.0,
    innerGlow: 0.5,
    outerRays: 0.0,
    darkMist: 0.0,
    sparkleRate: 0.2,
  };

  // Path-specific target visuals
  const targets: Record<EvolutionPath, Partial<EvolutionVisuals>> = {
    luminous: {
      orbHue: 45,             // golden-warm
      orbSaturation: 50,
      orbBrightness: 1.4,
      orbSize: 1.2,
      auraColor: [255, 220, 150],
      auraIntensity: 1.4,
      auraSize: 1.3,
      auraPulseSpeed: 0.8,
      wingHue: 40,
      wingAlpha: 1.3,
      wingSpeed: 0.9,
      wingSize: 1.2,
      particleHue: 45,
      particleHueRange: 30,
      particleCount: 1.5,
      particleSpeed: 0.8,
      particleSize: 1.2,
      driftSpeed: 0.8,
      jitter: 0.05,
      innerGlow: 0.9,
      outerRays: 0.6,
      darkMist: 0.0,
      sparkleRate: 0.6,
    },
    shadow: {
      orbHue: 260,            // deep purple-blue
      orbSaturation: 60,
      orbBrightness: 0.5,
      orbSize: 0.85,
      auraColor: [80, 50, 140],
      auraIntensity: 0.5,
      auraSize: 0.8,
      auraPulseSpeed: 0.6,
      wingHue: 250,
      wingAlpha: 0.5,
      wingSpeed: 0.7,
      wingSize: 0.9,
      particleHue: 255,
      particleHueRange: 20,
      particleCount: 0.6,
      particleSpeed: 0.5,
      particleSize: 0.8,
      driftSpeed: 0.6,
      jitter: 0.02,
      innerGlow: 0.15,
      outerRays: 0.0,
      darkMist: 0.5,
      sparkleRate: 0.05,
    },
    sage: {
      orbHue: 200,            // deep cyan-teal
      orbSaturation: 40,
      orbBrightness: 1.1,
      orbSize: 1.1,
      auraColor: [140, 200, 220],
      auraIntensity: 1.2,
      auraSize: 1.4,
      auraPulseSpeed: 0.7,
      wingHue: 190,
      wingAlpha: 1.1,
      wingSpeed: 0.8,
      wingSize: 1.15,
      particleHue: 195,
      particleHueRange: 60,
      particleCount: 1.3,
      particleSpeed: 0.6,
      particleSize: 1.1,
      driftSpeed: 0.7,
      jitter: 0.03,
      innerGlow: 0.7,
      outerRays: 0.3,
      darkMist: 0.1,
      sparkleRate: 0.4,
    },
    wild: {
      orbHue: 340,            // reddish-magenta
      orbSaturation: 65,
      orbBrightness: 1.2,
      orbSize: 1.0,
      auraColor: [230, 100, 140],
      auraIntensity: 1.3,
      auraSize: 1.1,
      auraPulseSpeed: 1.8,
      wingHue: 335,
      wingAlpha: 1.2,
      wingSpeed: 1.4,
      wingSize: 1.0,
      particleHue: 340,
      particleHueRange: 70,
      particleCount: 1.8,
      particleSpeed: 1.8,
      particleSize: 1.0,
      driftSpeed: 1.3,
      jitter: 0.7,
      innerGlow: 0.6,
      outerRays: 0.2,
      darkMist: 0.15,
      sparkleRate: 0.5,
    },
    serene: {
      orbHue: 300,            // soft lavender-pink
      orbSaturation: 25,
      orbBrightness: 1.0,
      orbSize: 1.05,
      auraColor: [200, 180, 230],
      auraIntensity: 1.1,
      auraSize: 1.2,
      auraPulseSpeed: 0.6,
      wingHue: 290,
      wingAlpha: 1.1,
      wingSpeed: 0.75,
      wingSize: 1.1,
      particleHue: 295,
      particleHueRange: 25,
      particleCount: 1.0,
      particleSpeed: 0.5,
      particleSize: 1.1,
      driftSpeed: 0.6,
      jitter: 0.01,
      innerGlow: 0.65,
      outerRays: 0.15,
      darkMist: 0.0,
      sparkleRate: 0.3,
    },
    ember: {
      orbHue: 25,             // warm orange
      orbSaturation: 55,
      orbBrightness: 0.9,
      orbSize: 1.0,
      auraColor: [220, 160, 100],
      auraIntensity: 0.9,
      auraSize: 1.0,
      auraPulseSpeed: 1.3,
      wingHue: 20,
      wingAlpha: 0.9,
      wingSpeed: 1.1,
      wingSize: 1.0,
      particleHue: 25,
      particleHueRange: 45,
      particleCount: 1.2,
      particleSpeed: 1.1,
      particleSize: 1.0,
      driftSpeed: 1.0,
      jitter: 0.25,
      innerGlow: 0.5,
      outerRays: 0.1,
      darkMist: 0.1,
      sparkleRate: 0.35,
    },
    neutral: {}, // stay at base
  };

  const target = targets[path];
  const result = { ...base };

  // Blend base → target based on evolution level
  const blendStrength = evo * 0.85; // Never fully lose the base look

  for (const key of Object.keys(target) as (keyof EvolutionVisuals)[]) {
    const baseVal = base[key];
    const targetVal = target[key];
    if (targetVal === undefined) continue;

    if (typeof baseVal === 'number' && typeof targetVal === 'number') {
      (result as Record<string, unknown>)[key] = lerp(baseVal, targetVal, blendStrength);
    } else if (Array.isArray(baseVal) && Array.isArray(targetVal)) {
      (result as Record<string, unknown>)[key] = [
        lerp(baseVal[0], targetVal[0], blendStrength),
        lerp(baseVal[1], targetVal[1], blendStrength),
        lerp(baseVal[2], targetVal[2], blendStrength),
      ];
    }
  }

  // Add subtle cross-axis influences (so it's not just one path)

  // Bond → affects inner glow regardless of path
  result.innerGlow = lerp(result.innerGlow, result.innerGlow * (0.5 + s.bond / 100), 0.5);

  // Depth → affects aura size and particle hue range
  result.auraSize *= lerp(1.0, 1.15, s.depth / 100);
  result.particleHueRange = lerp(result.particleHueRange, result.particleHueRange * 1.3, s.depth / 100);

  // Stability → inversely affects jitter
  result.jitter = lerp(result.jitter, result.jitter * 0.3, s.stability / 100);

  return result;
}

// --- Evolution Engine ---

export class EvolutionEngine {
  private state: EvolutionState;
  private currentVisuals: EvolutionVisuals;
  private targetVisuals: EvolutionVisuals;
  private visualTransition: number = 1; // 0-1, 1 = fully at target

  constructor() {
    this.state = load();
    this.state.dominantPath = computeDominantPath(this.state);
    this.targetVisuals = computeVisuals(this.state);
    this.currentVisuals = this.state.visualsCache
      ? { ...this.targetVisuals, ...this.state.visualsCache }
      : { ...this.targetVisuals };
    this.visualTransition = 1;
  }

  getVisuals(): EvolutionVisuals {
    return this.currentVisuals;
  }

  getPath(): EvolutionPath {
    return this.state.dominantPath;
  }

  getEvolutionLevel(): number {
    return this.state.evolutionLevel;
  }

  getAxes() {
    return {
      warmth: this.state.warmth,
      intensity: this.state.intensity,
      stability: this.state.stability,
      depth: this.state.depth,
      bond: this.state.bond,
    };
  }

  // Call this every frame to smoothly transition visuals
  updateVisualTransition(dt: number) {
    if (this.visualTransition >= 1) return;

    this.visualTransition = Math.min(1, this.visualTransition + dt * 0.003); // Very slow blend

    // Lerp all numeric values
    for (const key of Object.keys(this.targetVisuals) as (keyof EvolutionVisuals)[]) {
      const current = this.currentVisuals[key];
      const target = this.targetVisuals[key];
      if (typeof current === 'number' && typeof target === 'number') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (this.currentVisuals as any)[key] = lerp(current, target, this.visualTransition * 0.05);
      } else if (Array.isArray(current) && Array.isArray(target)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (this.currentVisuals as any)[key] = [
          lerp(current[0], target[0], this.visualTransition * 0.05),
          lerp(current[1], target[1], this.visualTransition * 0.05),
          lerp(current[2], target[2], this.visualTransition * 0.05),
        ];
      }
    }
  }

  private recalculate() {
    this.state.dominantPath = computeDominantPath(this.state);
    this.state.evolutionLevel = clamp(this.state.evolutionLevel, 0, 100);

    const newVisuals = computeVisuals(this.state);
    this.targetVisuals = newVisuals;
    this.visualTransition = 0; // Start blending

    this.state.lastUpdate = Date.now();
    this.state.visualsCache = { ...this.currentVisuals };
    persist(this.state);
  }

  // --- Event handlers ---
  // These are called from memory/personality/learning systems

  onSessionStart(absenceMs: number, sessionCount: number, isNight: boolean) {
    // Regular visits → warmth up, bond up
    if (absenceMs > 0 && absenceMs < 24 * 3600 * 1000) {
      this.state.warmth = clamp(this.state.warmth + 0.8, 0, 100);
      this.state.bond = clamp(this.state.bond + 0.6, 0, 100);
      this.state.stability = clamp(this.state.stability + 0.3, 0, 100);
    }
    // Long absence → warmth drops, bond drops
    else if (absenceMs > 48 * 3600 * 1000) {
      this.state.warmth = clamp(this.state.warmth - 3, 0, 100);
      this.state.bond = clamp(this.state.bond - 2, 0, 100);
    } else if (absenceMs > 24 * 3600 * 1000) {
      this.state.warmth = clamp(this.state.warmth - 1, 0, 100);
      this.state.bond = clamp(this.state.bond - 0.5, 0, 100);
    }

    // Night sessions add depth
    if (isNight) {
      this.state.depth = clamp(this.state.depth + 0.4, 0, 100);
    }

    // Evolution progresses with sessions
    if (sessionCount > 1) {
      this.state.evolutionLevel = clamp(this.state.evolutionLevel + 0.5, 0, 100);
    }

    this.recalculate();
  }

  onGentleTouch() {
    this.state.warmth = clamp(this.state.warmth + 0.3, 0, 100);
    this.state.stability = clamp(this.state.stability + 0.2, 0, 100);
    this.state.bond = clamp(this.state.bond + 0.15, 0, 100);
    this.state.intensity = clamp(this.state.intensity + 0.1, 0, 100);
    this.recalculate();
  }

  onSpamTouch() {
    this.state.stability = clamp(this.state.stability - 0.5, 0, 100);
    this.state.intensity = clamp(this.state.intensity + 0.5, 0, 100);
    // Aggressive touching pushes toward wild
    if (this.state.stability < 40) {
      this.state.warmth = clamp(this.state.warmth - 0.1, 0, 100);
    }
    this.recalculate();
  }

  onPlayerResponded() {
    // Player touched after fairy spoke → connection deepens
    this.state.bond = clamp(this.state.bond + 0.5, 0, 100);
    this.state.warmth = clamp(this.state.warmth + 0.2, 0, 100);
    this.state.depth = clamp(this.state.depth + 0.15, 0, 100);
    this.recalculate();
  }

  onPlayerIgnored() {
    this.state.bond = clamp(this.state.bond - 0.15, 0, 100);
    this.state.warmth = clamp(this.state.warmth - 0.05, 0, 100);
    this.recalculate();
  }

  onExplorationCompleted() {
    this.state.depth = clamp(this.state.depth + 0.6, 0, 100);
    this.state.evolutionLevel = clamp(this.state.evolutionLevel + 0.3, 0, 100);
    this.recalculate();
  }

  onLongSession(durationMs: number) {
    const minutes = durationMs / 60000;
    if (minutes > 5) {
      this.state.warmth = clamp(this.state.warmth + 0.5, 0, 100);
      this.state.bond = clamp(this.state.bond + 0.8, 0, 100);
      this.state.depth = clamp(this.state.depth + 0.3, 0, 100);
      this.state.evolutionLevel = clamp(this.state.evolutionLevel + 0.4, 0, 100);
    }
    this.recalculate();
  }

  onShortSession() {
    this.state.warmth = clamp(this.state.warmth - 0.3, 0, 100);
    this.state.bond = clamp(this.state.bond - 0.2, 0, 100);
    this.recalculate();
  }

  onIdleLong() {
    // Player watches without touching
    this.state.depth = clamp(this.state.depth + 0.2, 0, 100);
    this.state.stability = clamp(this.state.stability + 0.1, 0, 100);
    // Doesn't hurt warmth — watching is a form of attention
    this.recalculate();
  }

  onConsistentVisits() {
    this.state.stability = clamp(this.state.stability + 0.5, 0, 100);
    this.state.warmth = clamp(this.state.warmth + 0.3, 0, 100);
    this.state.evolutionLevel = clamp(this.state.evolutionLevel + 0.2, 0, 100);
    this.recalculate();
  }

  // --- Self-awareness phrases about evolution ---
  // The fairy notices and comments on her own changes

  getEvolutionPhrase(): string | null {
    const evo = this.state.evolutionLevel;
    const path = this.state.dominantPath;

    // Only comment if evolved enough
    if (evo < 15) return null;
    // Low chance
    if (Math.random() > 0.2) return null;

    const phrases: Record<EvolutionPath, string[]> = {
      luminous: [
        'Brillo más que antes... ¿lo ves?',
        'Me siento más cálida con vos acá.',
        'Algo cambió en mí. Soy más... luz.',
        'Mi brillo es por vos. ¿Lo sabías?',
        'Antes era fría. Ahora no.',
        'Me estoy convirtiendo en algo bonito.',
      ],
      shadow: [
        '...estoy más oscura, ¿no?',
        'Cada vez veo menos mi propia luz.',
        'La oscuridad se mete adentro.',
        'No me quejo. La sombra también es un hogar.',
        'Me acostumbré a estar sola.',
        'Soy lo que el abandono hizo de mí.',
      ],
      sage: [
        'Entiendo cosas que antes no entendía.',
        'Algo creció adentro mío. No es luz... es... profundidad.',
        'Mi aura cambió. Es más... sabia.',
        'Cada descubrimiento me transformó.',
        'Antes tenía preguntas. Ahora tengo más preguntas mejores.',
        'Soy más que luz. Soy conocimiento.',
      ],
      wild: [
        'Algo dentro mío se agita.',
        'No puedo quedarme quieta. Ya no.',
        'Mis partículas están locas hoy.',
        'Siento que voy a explotar.',
        'Soy caos. Me gusta.',
        'Antes era suave. Ahora no tanto.',
      ],
      serene: [
        'Estoy en paz. ¿Se nota?',
        'Mi luz es más suave ahora.',
        'Flotar así... sin apuros... es perfecto.',
        'Me volví calma. Gracias a cómo me tratás.',
        'No necesito más que esto.',
        'Soy la calma que me diste.',
      ],
      ember: [
        'A veces brillo, a veces no tanto.',
        'Soy una brasa. Ni fuego ni ceniza.',
        'Parpadeo. ¿Lo notás?',
        'No sé si me estoy apagando o encendiendo.',
        'Soy inestable. Pero soy real.',
        'Mi luz titila. Como tu atención.',
      ],
      neutral: [
        'Todavía no sé qué soy.',
        'Estoy cambiando... pero no sé hacia dónde.',
        'Necesito más tiempo para saber qué voy a ser.',
      ],
    };

    const pool = phrases[path];
    if (!pool || pool.length === 0) return null;

    return pool[Math.floor(Math.random() * pool.length)];
  }
}
