import { describe, it, expect, vi } from 'vitest';
import { SourceRegistry } from './registry';
import type { TokenSource } from './TokenSource';
import type { TokenEvent } from '../types';

function fakeSource(id: string): TokenSource & { fire: (e: TokenEvent) => void } {
  let emit: ((e: TokenEvent) => void) | null = null;
  return {
    id,
    start: async (cb) => { emit = cb; },
    stop: async () => { emit = null; },
    fire: (e) => emit?.(e)
  };
}

describe('SourceRegistry', () => {
  it('starts all sources and forwards events to listener', async () => {
    const a = fakeSource('a'), b = fakeSource('b');
    const reg = new SourceRegistry([a, b]);
    const seen: TokenEvent[] = [];
    await reg.start(e => seen.push(e));
    a.fire({ sourceId: 'a', sessionId: 's', cursor: '1', ts: 1,
             tokens: { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 } });
    b.fire({ sourceId: 'b', sessionId: 's', cursor: '1', ts: 2,
             tokens: { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 } });
    expect(seen.map(e => e.sourceId)).toEqual(['a', 'b']);
  });

  it('stop calls stop on all sources', async () => {
    const a = fakeSource('a');
    a.stop = vi.fn(async () => {});
    const reg = new SourceRegistry([a]);
    await reg.start(() => {});
    await reg.stop();
    expect(a.stop).toHaveBeenCalled();
  });
});
