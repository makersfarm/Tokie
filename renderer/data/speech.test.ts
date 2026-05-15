import { describe, it, expect } from 'vitest';
import { pickGreeting, pickBurstLine, GREETINGS, BURST_BY_MOOD } from './speech';

describe('speech pickers', () => {
  it('greeting returns one of the pool', () => {
    for (let i = 0; i < 20; i++) {
      expect(GREETINGS).toContain(pickGreeting(Math.random));
    }
  });

  it('burst line uses happy pool when mood=happy', () => {
    const line = pickBurstLine('happy', () => 0);
    expect(BURST_BY_MOOD.happy).toContain(line);
  });

  it('burst line falls back to normal pool when mood is feasting/curious', () => {
    const line = pickBurstLine('feasting', () => 0);
    expect(BURST_BY_MOOD.normal).toContain(line);
  });

  it('burst line uses sad/sleepy pool when mood is sad', () => {
    const line = pickBurstLine('sad', () => 0);
    expect(BURST_BY_MOOD.sleepy).toContain(line);
  });

  it('rng=0 returns the first item', () => {
    expect(pickGreeting(() => 0)).toBe(GREETINGS[0]);
  });
});
