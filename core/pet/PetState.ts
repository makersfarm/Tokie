import type { PetSnapshot, PetEvent } from '../types';
import { phaseForXP } from './stages';
import { applyDecay, applyGain, moodForCondition } from './condition';

export interface PetClock {
  now: () => number;
}

export class PetState {
  private snap: PetSnapshot;
  private listeners = new Set<(e: PetEvent) => void>();

  constructor(initial: PetSnapshot, private clock: PetClock = { now: Date.now }) {
    // Defensive: ensure phase matches lifetimeXP
    this.snap = { ...initial, phase: phaseForXP(initial.lifetimeXP) };
  }

  get snapshot(): PetSnapshot {
    return { ...this.snap };
  }

  on(cb: (e: PetEvent) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private emit(e: PetEvent): void {
    for (const cb of this.listeners) cb(e);
  }

  feed(nutrition: number): void {
    if (nutrition <= 0) return;
    const now = this.clock.now();
    const prevPhase = this.snap.phase;
    const prevMood = this.snap.mood;

    this.snap.lifetimeXP += nutrition;
    this.snap.condition = applyGain(this.snap.condition, nutrition);
    this.snap.lastFedAt = now;
    this.snap.phase = phaseForXP(this.snap.lifetimeXP);
    this.snap.mood = moodForCondition(this.snap.condition);

    this.emit({ type: 'fed', nutrition, ts: now });
    if (this.snap.phase !== prevPhase) {
      this.emit({ type: 'evolved', from: prevPhase, to: this.snap.phase, ts: now });
    }
    if (this.snap.mood !== prevMood) {
      this.emit({ type: 'mood-changed', from: prevMood, to: this.snap.mood, ts: now });
    }
  }

  tick(): void {
    const now = this.clock.now();
    const elapsed = now - this.snap.lastTickAt;
    if (elapsed <= 0) return;
    const prevMood = this.snap.mood;
    this.snap.condition = applyDecay(this.snap.condition, elapsed);
    this.snap.lastTickAt = now;
    this.snap.mood = moodForCondition(this.snap.condition);
    if (this.snap.mood !== prevMood) {
      this.emit({ type: 'mood-changed', from: prevMood, to: this.snap.mood, ts: now });
    }
  }

  /** Replace internal snapshot wholesale (used by storage layer). */
  load(s: PetSnapshot): void {
    this.snap = { ...s, phase: phaseForXP(s.lifetimeXP) };
    this.emit({ type: 'snapshot', snapshot: this.snapshot });
  }
}
