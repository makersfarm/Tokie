import { describe, it, expect } from 'vitest';
import { phaseForXP, STAGES, nextThreshold } from './stages';

describe('phaseForXP', () => {
  it('0 XP → Egg (phase 0)', () => expect(phaseForXP(0)).toBe(0));
  it('9_999 → still Egg', () => expect(phaseForXP(9_999)).toBe(0));
  it('10_000 → phase 1', () => expect(phaseForXP(10_000)).toBe(1));
  it('299_999 → phase 1', () => expect(phaseForXP(299_999)).toBe(1));
  it('300_000 → phase 2', () => expect(phaseForXP(300_000)).toBe(2));
  it('3_000_000 → phase 3', () => expect(phaseForXP(3_000_000)).toBe(3));
  it('10_000_000 → still phase 3 (capped)', () => expect(phaseForXP(10_000_000)).toBe(3));
});

describe('STAGES', () => {
  it('has 4 entries Egg + 3 evolutions', () => expect(STAGES).toHaveLength(4));
  it('thresholds strictly ascending', () => {
    for (let i = 1; i < STAGES.length; i++) {
      const cur = STAGES[i];
      const prev = STAGES[i - 1];
      if (!cur || !prev) throw new Error('unreachable');
      expect(cur.threshold).toBeGreaterThan(prev.threshold);
    }
  });
});

describe('nextThreshold', () => {
  it('at phase 0 next is 10_000', () => expect(nextThreshold(0)).toBe(10_000));
  it('at phase 3 returns null (final)', () => expect(nextThreshold(3)).toBeNull());
});
