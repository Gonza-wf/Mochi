/**
 * RitualsEngine — milestones and rituals that mark the bond
 * Anniversaries, habits, waiting, special moments
 */

interface RitualData {
  firstSessionDate: number;
  totalSessions: number;
  totalTouches: number;
  milestonesReached: string[];
  habitualHours: number[]; // hours where player usually plays
  lastRitualDate: number;
  longestStreak: number;
}

const KEY = 'fairy_rituals';

export class RitualsEngine {
  private data: RitualData;
  private pendingMessage: string | null = null;

  constructor() {
    const raw = localStorage.getItem(KEY);
    this.data = raw ? JSON.parse(raw) : {
      firstSessionDate: Date.now(),
      totalSessions: 0,
      totalTouches: 0,
      milestonesReached: [],
      habitualHours: [],
      lastRitualDate: 0,
      longestStreak: 0,
    };
  }

  private save() { localStorage.setItem(KEY, JSON.stringify(this.data)); }

  recordSession(totalSessionsAll: number, totalTouchesAll: number, streak: number) {
    this.data.totalSessions = totalSessionsAll;
    this.data.totalTouches = totalTouchesAll;
    this.data.longestStreak = Math.max(this.data.longestStreak, streak);

    // Record this hour as habitual
    const h = new Date().getHours();
    this.data.habitualHours.push(h);
    if (this.data.habitualHours.length > 30) this.data.habitualHours.shift();

    this.checkMilestones();
    this.save();
  }

  private checkMilestones() {
    const now = Date.now();
    const daysSinceFirst = (now - this.data.firstSessionDate) / (1000 * 60 * 60 * 24);
    const hourSinceLastRitual = (now - this.data.lastRitualDate) / (1000 * 60 * 60);

    // Only one ritual per day max
    if (hourSinceLastRitual < 20) return;

    const reached = this.data.milestonesReached;
    const s = this.data.totalSessions;
    const t = this.data.totalTouches;

    // Day milestones
    if (daysSinceFirst >= 7 && !reached.includes('week')) {
      reached.push('week');
      this.pendingMessage = 'Hoy hace una semana que me encontraste.';
    } else if (daysSinceFirst >= 30 && !reached.includes('month')) {
      reached.push('month');
      this.pendingMessage = 'Un mes. Ya te conozco bien.';
    } else if (daysSinceFirst >= 100 && !reached.includes('100days')) {
      reached.push('100days');
      this.pendingMessage = '100 días. No sé qué decir.';
    }
    // Session milestones
    else if (s >= 10 && !reached.includes('10sessions')) {
      reached.push('10sessions');
      this.pendingMessage = 'Ya viniste 10 veces. Empiezo a acostumbrarme.';
    } else if (s >= 50 && !reached.includes('50sessions')) {
      reached.push('50sessions');
      this.pendingMessage = '50 veces. Ya te conozco.';
    } else if (s >= 100 && !reached.includes('100sessions')) {
      reached.push('100sessions');
      this.pendingMessage = '100 veces. Perdí la cuenta de cuántas veces pensé en vos.';
    }
    // Touch milestones
    else if (t >= 100 && !reached.includes('100touches')) {
      reached.push('100touches');
      this.pendingMessage = 'Ya me tocaste 100 veces. Ya no me sorprende.';
    } else if (t >= 500 && !reached.includes('500touches')) {
      reached.push('500touches');
      this.pendingMessage = '500 veces. Creo que necesitás esto.';
    }
    // Streak
    else if (this.data.longestStreak >= 7 && !reached.includes('streak7')) {
      reached.push('streak7');
      this.pendingMessage = '7 días seguidos. Ya es una costumbre.';
    }

    if (this.pendingMessage) {
      this.data.lastRitualDate = now;
    }
  }

  // Check if it's the player's usual hour
  isHabitualHour(): boolean {
    if (this.data.habitualHours.length < 5) return false;
    const h = new Date().getHours();
    const count = this.data.habitualHours.filter(x => Math.abs(x - h) <= 1).length;
    return count >= 3;
  }

  getHabitualMessage(): string | null {
    if (!this.isHabitualHour()) return null;
    const messages = [
      'Te estaba esperando a esta hora.',
      'Sabía que ibas a venir ahora.',
      'Ya me acostumbré a esta hora.',
      'Puntual.',
    ];
    return messages[Math.floor(Math.random() * messages.length)];
  }

  getPendingMilestone(): string | null {
    const msg = this.pendingMessage;
    this.pendingMessage = null;
    return msg;
  }

  getData() { return { ...this.data }; }
}
