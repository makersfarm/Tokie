import { describe, it, expect } from 'vitest';
import { tokensToNutrition } from './nutrition';

describe('tokensToNutrition', () => {
  it('weights output 3x and input 1x', () => {
    expect(tokensToNutrition({ input: 100, output: 100, cacheRead: 0, cacheCreate: 0 }))
      .toBe(100 * 1 + 100 * 3);
  });
  it('cacheCreate weighted 1.5, cacheRead weighted 0.1', () => {
    expect(tokensToNutrition({ input: 0, output: 0, cacheRead: 1000, cacheCreate: 200 }))
      .toBeCloseTo(1000 * 0.1 + 200 * 1.5);
  });
  it('returns 0 for empty', () => {
    expect(tokensToNutrition({ input: 0, output: 0, cacheRead: 0, cacheCreate: 0 })).toBe(0);
  });
  it('floors negative tokens at 0 (defensive)', () => {
    expect(tokensToNutrition({ input: -5, output: 10, cacheRead: 0, cacheCreate: 0 })).toBe(30);
  });
});
