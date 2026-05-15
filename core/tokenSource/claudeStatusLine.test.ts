import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ClaudeStatusLineSource } from './claudeStatusLine';
import type { TokenEvent } from '../types';

describe('ClaudeStatusLineSource', () => {
  let src: ClaudeStatusLineSource;

  beforeEach(() => {
    src = new ClaudeStatusLineSource('test-token');
  });
  afterEach(async () => { await src.stop(); });

  it('starts and exposes port + token', async () => {
    await src.start(() => {});
    expect(src.port).toBeGreaterThan(0);
    expect(src.token).toBe('test-token');
  });

  it('accepts POST with valid token and emits TokenEvent', async () => {
    const events: TokenEvent[] = [];
    await src.start(e => events.push(e));
    const body = {
      session_id: 'sess-X',
      transcript_path: '/tmp/transcript.jsonl',
      current_usage: {
        input_tokens: 11,
        output_tokens: 22,
        cache_read_input_tokens: 3,
        cache_creation_input_tokens: 4
      },
      message_id: 'mX',
      request_id: 'rX',
      model: { id: 'claude-opus-4-7' },
      cost: { total_cost_usd: 0.0042 }
    };
    const res = await fetch(`http://127.0.0.1:${src.port}/event`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-pet-token': 'test-token' },
      body: JSON.stringify(body)
    });
    expect(res.status).toBe(204);
    expect(events.length).toBe(1);
    expect(events[0]!.tokens.output).toBe(22);
    expect(events[0]!.dedupKey?.messageId).toBe('mX');
    expect(events[0]!.costUsd).toBeCloseTo(0.0042);
  });

  it('rejects POST with wrong token', async () => {
    await src.start(() => {});
    const res = await fetch(`http://127.0.0.1:${src.port}/event`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-pet-token': 'bad' },
      body: '{}'
    });
    expect(res.status).toBe(401);
  });
});
