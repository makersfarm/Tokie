import type { TokenCounts } from '../types';

const WEIGHTS = { input: 1.0, output: 3.0, cacheCreate: 1.5, cacheRead: 0.1 } as const;

export function tokensToNutrition(t: TokenCounts): number {
  const clamp = (n: number) => (n > 0 ? n : 0);
  return (
    clamp(t.input) * WEIGHTS.input +
    clamp(t.output) * WEIGHTS.output +
    clamp(t.cacheCreate) * WEIGHTS.cacheCreate +
    clamp(t.cacheRead) * WEIGHTS.cacheRead
  );
}

export const NUTRITION_WEIGHTS = WEIGHTS;
