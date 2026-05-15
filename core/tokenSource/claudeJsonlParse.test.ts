import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseClaudeJsonlLine } from './claudeJsonlParse';

const fixture = readFileSync(
  path.join(__dirname, '__tests__/fixtures/sample.jsonl'),
  'utf8'
).split('\n').filter(Boolean);

describe('parseClaudeJsonlLine', () => {
  it('returns null for user-role line', () => {
    expect(parseClaudeJsonlLine(fixture[0], '/tmp/sample.jsonl')).toBeNull();
  });

  it('parses assistant usage into TokenEvent', () => {
    const ev = parseClaudeJsonlLine(fixture[1], '/tmp/sample.jsonl');
    expect(ev).not.toBeNull();
    expect(ev!.sessionId).toBe('sess-A');
    expect(ev!.tokens).toEqual({ input: 12, output: 7, cacheRead: 0, cacheCreate: 0 });
    expect(ev!.dedupKey).toEqual({ messageId: 'm1', requestId: 'r1' });
    expect(ev!.model).toBe('claude-opus-4-7');
  });

  it('parses cache fields', () => {
    const ev = parseClaudeJsonlLine(fixture[2], '/tmp/sample.jsonl')!;
    expect(ev.tokens.cacheRead).toBe(10);
  });

  it('returns null for broken JSON', () => {
    expect(parseClaudeJsonlLine(fixture[3], '/tmp/sample.jsonl')).toBeNull();
  });

  it('still returns event for zero-token assistant line (FeedingPipeline filters)', () => {
    const ev = parseClaudeJsonlLine(fixture[4], '/tmp/sample.jsonl');
    expect(ev).not.toBeNull();
    expect(ev!.tokens.output).toBe(0);
  });
});
