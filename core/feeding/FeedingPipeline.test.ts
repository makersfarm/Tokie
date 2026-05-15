import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { FeedingPipeline } from './FeedingPipeline';
import { EventsDb } from '../storage/eventsDb';
import { PetState } from '../pet/PetState';
import { makeDefaultSnapshot } from '../storage/petState';
import type { TokenEvent, PetEvent } from '../types';

function mkEvent(over: Partial<TokenEvent> = {}): TokenEvent {
  return {
    sourceId: 'claude-statusline',
    sessionId: 's',
    cursor: 'c',
    ts: 100,
    tokens: { input: 100, output: 100, cacheRead: 0, cacheCreate: 0 },
    dedupKey: { messageId: 'm1', requestId: 'r1' },
    ...over
  };
}

describe('FeedingPipeline', () => {
  let dir: string, db: EventsDb, pet: PetState, pipe: FeedingPipeline, events: PetEvent[];

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'fp-'));
    db = new EventsDb(path.join(dir, 'events.sqlite'));
    pet = new PetState(makeDefaultSnapshot(0), { now: () => 1000 });
    events = [];
    pet.on(e => events.push(e));
    pipe = new FeedingPipeline(db, pet);
  });

  it('first event feeds the pet', () => {
    pipe.handle(mkEvent());
    expect(events.some(e => e.type === 'fed')).toBe(true);
    expect(pet.snapshot.lifetimeXP).toBe(100 * 1 + 100 * 3);
  });

  it('duplicate (messageId+requestId) does NOT double-feed', () => {
    pipe.handle(mkEvent());
    const xpAfter1 = pet.snapshot.lifetimeXP;
    pipe.handle(mkEvent());
    expect(pet.snapshot.lifetimeXP).toBe(xpAfter1);
  });

  it('different requestId feeds again', () => {
    pipe.handle(mkEvent({ dedupKey: { messageId: 'm1', requestId: 'r1' } }));
    pipe.handle(mkEvent({ dedupKey: { messageId: 'm1', requestId: 'r2' } }));
    expect(pet.snapshot.lifetimeXP).toBe(2 * (100 + 300));
  });

  it('zero-nutrition event does not emit fed', () => {
    events.length = 0;
    pipe.handle(mkEvent({
      tokens: { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 },
      dedupKey: { messageId: 'm2', requestId: 'r2' }
    }));
    expect(events.find(e => e.type === 'fed')).toBeUndefined();
  });
});
