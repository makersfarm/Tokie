import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { EventsDb } from './eventsDb';
import type { TokenEvent } from '../types';

function mkEvent(over: Partial<TokenEvent> = {}): TokenEvent {
  return {
    sourceId: 'claude-statusline',
    sessionId: 'sess-1',
    cursor: 'c1',
    ts: 1000,
    tokens: { input: 10, output: 20, cacheRead: 0, cacheCreate: 0 },
    dedupKey: { messageId: 'm1', requestId: 'r1' },
    ...over
  };
}

describe('EventsDb', () => {
  let dir: string, db: EventsDb;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'db-'));
    db = new EventsDb(path.join(dir, 'events.sqlite'));
  });
  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('insert returns true on new event', () => {
    expect(db.insert(mkEvent())).toBe(true);
  });

  it('insert returns false on duplicate (same messageId+requestId)', () => {
    db.insert(mkEvent());
    expect(db.insert(mkEvent())).toBe(false);
  });

  it('different requestId allows insert', () => {
    db.insert(mkEvent({ dedupKey: { messageId: 'm1', requestId: 'r1' } }));
    expect(db.insert(mkEvent({ dedupKey: { messageId: 'm1', requestId: 'r2' } }))).toBe(true);
  });

  it('no dedupKey → always inserts (no dedup possible)', () => {
    const e: TokenEvent = mkEvent({ dedupKey: undefined });
    expect(db.insert(e)).toBe(true);
    expect(db.insert(e)).toBe(true);
  });

  it('sumSince returns input/output totals', () => {
    db.insert(mkEvent({ dedupKey: { messageId: 'a', requestId: '1' },
      tokens: { input: 100, output: 200, cacheRead: 0, cacheCreate: 0 } }));
    db.insert(mkEvent({ dedupKey: { messageId: 'b', requestId: '1' },
      tokens: { input: 50, output: 50, cacheRead: 0, cacheCreate: 0 } }));
    const sum = db.sumSince(0);
    expect(sum.input).toBe(150);
    expect(sum.output).toBe(250);
  });
});
