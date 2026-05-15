import { describe, it, expect } from 'vitest';
import { applyDecay, applyGain, moodForCondition, MAX_DECAY_MS } from './condition';

describe('applyGain', () => {
  it('adds nutrition * 0.001', () => {
    expect(applyGain(0, 50_000)).toBe(50);
  });
  it('caps at 100', () => {
    expect(applyGain(90, 50_000)).toBe(100);
  });
  it('never below 0', () => {
    expect(applyGain(-5, 0)).toBe(0);
  });
});

describe('applyDecay', () => {
  it('1 minute → loses ~0.0694 (100/(24*60))', () => {
    expect(applyDecay(100, 60_000)).toBeCloseTo(100 - 100 / (24 * 60), 4);
  });
  it('24h → reaches 0', () => {
    expect(applyDecay(100, 24 * 60 * 60 * 1000)).toBeCloseTo(0, 4);
  });
  it('floors at 0', () => {
    expect(applyDecay(10, 48 * 60 * 60 * 1000)).toBe(0);
  });
  it('caps elapsed at MAX_DECAY_MS (24h)', () => {
    expect(applyDecay(100, 7 * 24 * 60 * 60 * 1000)).toBe(0);
    expect(MAX_DECAY_MS).toBe(24 * 60 * 60 * 1000);
  });
});

describe('moodForCondition', () => {
  it('≥70 happy', () => expect(moodForCondition(80)).toBe('happy'));
  it('30..70 normal', () => expect(moodForCondition(50)).toBe('normal'));
  it('10..30 sleepy', () => expect(moodForCondition(20)).toBe('sleepy'));
  it('<10 sad', () => expect(moodForCondition(5)).toBe('sad'));
});
