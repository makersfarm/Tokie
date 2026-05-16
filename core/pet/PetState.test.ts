import { describe, it, expect, beforeEach } from 'vitest';
import { PetState } from './PetState';
import type { PetEvent } from '../types';

const baseSnap = {
  schemaVersion: 1,
  createdAt: 0,
  lifetimeXP: 0,
  phase: 0 as const,
  condition: 50,
  mood: 'normal' as const,
  lastTickAt: 0,
  lastFedAt: null,
  lastCursors: {},
  windowPos: { x: 0, y: 0 },
  windowSize: { w: 220, h: 220 }
};

describe('PetState.feed', () => {
  let pet: PetState;
  let captured: PetEvent[];

  beforeEach(() => {
    pet = new PetState({ ...baseSnap }, { now: () => 1_000 });
    captured = [];
    pet.on(e => captured.push(e));
  });

  it('emits fed event with nutrition', () => {
    pet.feed(500);
    expect(captured.find(e => e.type === 'fed')).toMatchObject({ type: 'fed', nutrition: 500 });
  });

  it('accumulates lifetimeXP', () => {
    pet.feed(500);
    pet.feed(300);
    expect(pet.snapshot.lifetimeXP).toBe(800);
  });

  it('boosts condition by nutrition * 0.001', () => {
    pet.feed(10_000);
    expect(pet.snapshot.condition).toBeCloseTo(60, 4);
  });

  it('emits evolved when crossing phase threshold', () => {
    pet.feed(9_999);
    expect(captured.some(e => e.type === 'evolved')).toBe(false);
    pet.feed(2);
    const evo = captured.find(e => e.type === 'evolved');
    expect(evo).toMatchObject({ type: 'evolved', from: 0, to: 1 });
  });

  it('emits mood-changed when crossing threshold', () => {
    pet.feed(25_000); // condition: 50 + 25 = 75 → happy
    expect(captured.some(e => e.type === 'mood-changed' && e.to === 'happy')).toBe(true);
  });

  it('updates lastFedAt to now', () => {
    pet.feed(100);
    expect(pet.snapshot.lastFedAt).toBe(1_000);
  });
});

describe('PetState.tick', () => {
  it('decays condition since lastTickAt', () => {
    const pet = new PetState(
      { ...baseSnap, condition: 100, lastTickAt: 0 },
      { now: () => 60_000 } // 1 minute later
    );
    pet.tick();
    expect(pet.snapshot.condition).toBeCloseTo(100 - 100 / (24 * 60), 4);
    expect(pet.snapshot.lastTickAt).toBe(60_000);
  });

  it('caps decay at 24h even after long sleep', () => {
    const pet = new PetState(
      { ...baseSnap, condition: 100, lastTickAt: 0 },
      { now: () => 7 * 24 * 60 * 60 * 1000 }
    );
    pet.tick();
    expect(pet.snapshot.condition).toBe(0);
  });
});

describe('PetState construction', () => {
  it('recomputes phase from lifetimeXP on load (defensive)', () => {
    const pet = new PetState({ ...baseSnap, lifetimeXP: 500_000, phase: 0 }, { now: () => 0 });
    expect(pet.snapshot.phase).toBe(2);
  });
});

describe('PetState.feed model arg', () => {
  let pet: PetState;
  let captured: PetEvent[];

  beforeEach(() => {
    pet = new PetState({ ...baseSnap }, { now: () => 1_000 });
    captured = [];
    pet.on(e => captured.push(e));
  });

  it('forwards model in fed event when provided', () => {
    pet.feed(500, 'claude-opus-4-7');
    const fed = captured.find(e => e.type === 'fed');
    expect(fed).toMatchObject({ type: 'fed', nutrition: 500, model: 'claude-opus-4-7' });
  });

  it('omits model in fed event when not provided', () => {
    pet.feed(500);
    const fed = captured.find(e => e.type === 'fed') as { model?: string };
    expect(fed.model).toBeUndefined();
  });
});

describe('PetState.nudgeCondition', () => {
  it('caps condition at 100', () => {
    const pet = new PetState({ ...baseSnap, condition: 98 }, { now: () => 1_000 });
    pet.nudgeCondition(10);
    expect(pet.snapshot.condition).toBe(100);
  });

  it('ignores non-positive amounts', () => {
    const pet = new PetState({ ...baseSnap, condition: 50 }, { now: () => 1_000 });
    pet.nudgeCondition(0);
    pet.nudgeCondition(-5);
    expect(pet.snapshot.condition).toBe(50);
  });

  it('emits mood-changed when crossing threshold', () => {
    const pet = new PetState({ ...baseSnap, condition: 65, mood: 'normal' }, { now: () => 1_000 });
    const captured: PetEvent[] = [];
    pet.on(e => captured.push(e));
    pet.nudgeCondition(10); // 65 + 10 = 75 → happy (≥70 is happy)
    expect(captured.some(e => e.type === 'mood-changed' && e.to === 'happy')).toBe(true);
  });
});
