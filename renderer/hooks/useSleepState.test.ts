import { describe, it, expect } from 'vitest';
import { computeSleep } from './useSleepState';

describe('computeSleep', () => {
  it('asleep when last fed > 60min ago (any hour)', () => {
    const now = new Date('2026-05-16T14:00:00').getTime(); // 14:00
    expect(computeSleep({ now, lastFedAt: now - 61 * 60_000, wokenInBucket: null })).toEqual({
      asleep: true, reason: 'idle'
    });
  });

  it('asleep at 23:30 by clock', () => {
    const now = new Date('2026-05-16T23:30:00').getTime();
    expect(computeSleep({ now, lastFedAt: now - 5_000, wokenInBucket: null })).toEqual({
      asleep: true, reason: 'night'
    });
  });

  it('awake at 14:00 when recently fed', () => {
    const now = new Date('2026-05-16T14:00:00').getTime();
    expect(computeSleep({ now, lastFedAt: now - 5_000, wokenInBucket: null }))
      .toEqual({ asleep: false, reason: null });
  });

  it('night sleep suppressed once woken in same night bucket', () => {
    const now = new Date('2026-05-16T23:30:00').getTime();
    expect(computeSleep({ now, lastFedAt: now - 5_000, wokenInBucket: 'night-2026-05-16' }))
      .toEqual({ asleep: false, reason: null });
  });

  it('idle reason still wins even after night suppression', () => {
    const now = new Date('2026-05-16T23:30:00').getTime();
    expect(computeSleep({ now, lastFedAt: now - 65 * 60_000, wokenInBucket: 'night-2026-05-16' }))
      .toEqual({ asleep: true, reason: 'idle' });
  });
});
