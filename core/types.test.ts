import { describe, it, expect } from 'vitest';
import type { TokenEvent, NutritionEvent, PetSnapshot, PetEvent } from './types';

describe('types module exports', () => {
  it('TokenEvent has expected fields at runtime via a builder', () => {
    const e: TokenEvent = {
      sourceId: 'claude-statusline',
      sessionId: 's1',
      cursor: 'c1',
      ts: 1,
      tokens: { input: 1, output: 2, cacheRead: 0, cacheCreate: 0 }
    };
    expect(e.tokens.output).toBe(2);
  });

  it('NutritionEvent carries nutrition and source ts', () => {
    const n: NutritionEvent = { ts: 1, nutrition: 5, source: 'claude-statusline' };
    expect(n.nutrition).toBe(5);
  });

  it('PetSnapshot phase is 0..3', () => {
    const s: PetSnapshot = {
      schemaVersion: 1,
      lifetimeXP: 0,
      phase: 0,
      condition: 50,
      mood: 'normal',
      lastTickAt: 0,
      lastFedAt: null,
      lastCursors: {},
      windowPos: { x: 100, y: 100 },
      createdAt: 0
    };
    expect(s.phase).toBe(0);
  });

  it('PetEvent discriminated union has fed', () => {
    const e: PetEvent = { type: 'fed', nutrition: 5, ts: 1 };
    expect(e.type).toBe('fed');
  });
});
