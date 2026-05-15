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

  it('stats aggregates lifetime, windows, and per-source breakdown', () => {
    const NOW = 10_000_000_000;
    const day = 24 * 60 * 60 * 1000;
    db.insert(mkEvent({ ts: NOW - 1000, sourceId: 'claude-statusline',
      dedupKey: { messageId: 'a', requestId: '1' },
      tokens: { input: 100, output: 200, cacheRead: 10, cacheCreate: 5 },
      costUsd: 0.01 }));
    db.insert(mkEvent({ ts: NOW - 2 * day, sourceId: 'claude-jsonl-files',
      dedupKey: { messageId: 'b', requestId: '1' },
      tokens: { input: 50, output: 50, cacheRead: 0, cacheCreate: 0 },
      costUsd: 0.02 }));
    db.insert(mkEvent({ ts: NOW - 10 * day, sourceId: 'claude-jsonl-files',
      dedupKey: { messageId: 'c', requestId: '1' },
      tokens: { input: 1, output: 1, cacheRead: 0, cacheCreate: 0 },
      costUsd: 0.03 }));

    const s = db.stats(NOW);
    expect(s.events).toBe(3);
    expect(s.totalCostUsd).toBeCloseTo(0.06);
    expect(s.firstTs).toBe(NOW - 10 * day);
    expect(s.lastTs).toBe(NOW - 1000);

    expect(s.lifetime.input).toBe(151);
    expect(s.lifetime.output).toBe(251);
    expect(s.last24h.input).toBe(100);
    expect(s.last24h.output).toBe(200);
    expect(s.last7d.input).toBe(150);
    expect(s.last7d.output).toBe(250);

    expect(s.bySource.length).toBe(2);
    const jsonl = s.bySource.find(b => b.source === 'claude-jsonl-files')!;
    expect(jsonl.events).toBe(2);
    expect(jsonl.input).toBe(51);
  });

  it('stats.today counts only events on or after local midnight of NOW', () => {
    // Build NOW at noon local so midnight is unambiguously earlier the same day.
    const noon = new Date(2026, 4, 15, 12, 0, 0, 0).getTime();
    const midnight = new Date(2026, 4, 15, 0, 0, 0, 0).getTime();
    db.insert(mkEvent({ ts: midnight + 1000, sourceId: 's1',
      dedupKey: { messageId: 'm1', requestId: 'r1' },
      tokens: { input: 100, output: 200, cacheRead: 0, cacheCreate: 0 } }));
    db.insert(mkEvent({ ts: midnight - 1000, sourceId: 's1',
      dedupKey: { messageId: 'm2', requestId: 'r2' },
      tokens: { input: 999, output: 999, cacheRead: 0, cacheCreate: 0 } }));
    const s = db.stats(noon);
    expect(s.today.input).toBe(100);
    expect(s.today.output).toBe(200);
  });

  it('stats on empty db returns zeros', () => {
    const s = db.stats(1_000_000);
    expect(s.events).toBe(0);
    expect(s.totalCostUsd).toBe(0);
    expect(s.firstTs).toBeNull();
    expect(s.lastTs).toBeNull();
    expect(s.lifetime.input).toBe(0);
    expect(s.bySource.length).toBe(0);
  });
});
