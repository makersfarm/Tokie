import type { Phase } from '../types';

export interface StageDef {
  phase: Phase;
  name: string;
  threshold: number; // lifetimeXP required to ENTER this phase
}

export const STAGES: readonly StageDef[] = [
  { phase: 0, name: 'Egg',    threshold: 0 },
  { phase: 1, name: 'Baby',   threshold: 10_000 },
  { phase: 2, name: 'Middle', threshold: 300_000 },
  { phase: 3, name: 'Final',  threshold: 3_000_000 }
] as const;

export function phaseForXP(xp: number): Phase {
  let current: Phase = 0;
  for (const s of STAGES) if (xp >= s.threshold) current = s.phase;
  return current;
}

export function nextThreshold(phase: Phase): number | null {
  const idx = STAGES.findIndex(s => s.phase === phase);
  const next = STAGES[idx + 1];
  if (!next) return null;
  return next.threshold;
}
