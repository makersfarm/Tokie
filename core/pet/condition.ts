import type { Mood } from '../types';

export const MAX_CONDITION = 100;
export const GAIN_PER_NUTRITION = 0.001;
export const DECAY_PER_MS = MAX_CONDITION / (24 * 60 * 60 * 1000); // → 0 in 24h
export const MAX_DECAY_MS = 24 * 60 * 60 * 1000;

export function applyGain(current: number, nutrition: number): number {
  const next = Math.max(0, current) + Math.max(0, nutrition) * GAIN_PER_NUTRITION;
  return Math.min(MAX_CONDITION, next);
}

export function applyDecay(current: number, elapsedMs: number): number {
  const clamped = Math.min(Math.max(0, elapsedMs), MAX_DECAY_MS);
  return Math.max(0, current - clamped * DECAY_PER_MS);
}

export function moodForCondition(c: number): Mood {
  if (c >= 70) return 'happy';
  if (c >= 30) return 'normal';
  if (c >= 10) return 'sleepy';
  return 'sad';
}
