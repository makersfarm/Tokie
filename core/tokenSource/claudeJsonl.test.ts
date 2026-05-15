import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ClaudeJsonlSource } from './claudeJsonl';
import type { TokenEvent } from '../types';

function waitMs(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

describe('ClaudeJsonlSource', () => {
  let root: string, src: ClaudeJsonlSource | null = null;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'jsonl-'));
    mkdirSync(path.join(root, 'projects', 'proj1'), { recursive: true });
  });

  afterEach(async () => {
    if (src) await src.stop();
    src = null;
    rmSync(root, { recursive: true, force: true });
  });

  it('backfills existing files on start', async () => {
    const file = path.join(root, 'projects', 'proj1', 'sess.jsonl');
    writeFileSync(file, JSON.stringify({
      type: 'assistant',
      sessionId: 'sess-1',
      requestId: 'r1',
      message: { id: 'm1', role: 'assistant',
        usage: { input_tokens: 5, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }
    }) + '\n');

    const events: TokenEvent[] = [];
    src = new ClaudeJsonlSource(root);
    await src.start(e => events.push(e));
    await waitMs(400);
    expect(events.length).toBe(1);
    expect(events[0]!.dedupKey?.messageId).toBe('m1');
  });

  it('detects appended lines after start', async () => {
    const file = path.join(root, 'projects', 'proj1', 'sess.jsonl');
    writeFileSync(file, '');
    const events: TokenEvent[] = [];
    src = new ClaudeJsonlSource(root);
    await src.start(e => events.push(e));
    await waitMs(300);

    appendFileSync(file, JSON.stringify({
      type: 'assistant',
      sessionId: 'sess-1',
      requestId: 'r2',
      message: { id: 'm2', role: 'assistant',
        usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }
    }) + '\n');
    await waitMs(500);
    expect(events.some(e => e.dedupKey?.messageId === 'm2')).toBe(true);
  });
});
