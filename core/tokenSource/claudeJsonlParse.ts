import type { TokenEvent } from '../types';

interface RawLine {
  type?: string;
  sessionId?: string;
  requestId?: string;
  message?: {
    id?: string;
    role?: string;
    model?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
  };
}

export function parseClaudeJsonlLine(line: string, file: string): TokenEvent | null {
  let raw: RawLine;
  try {
    raw = JSON.parse(line);
  } catch {
    return null;
  }
  if (raw.type !== 'assistant') return null;
  const u = raw.message?.usage;
  if (!u) return null;
  return {
    sourceId: 'claude-jsonl',
    sessionId: raw.sessionId ?? 'unknown',
    cursor: `${file}#${raw.message?.id ?? ''}`,
    ts: Date.now(),
    tokens: {
      input: u.input_tokens ?? 0,
      output: u.output_tokens ?? 0,
      cacheRead: u.cache_read_input_tokens ?? 0,
      cacheCreate: u.cache_creation_input_tokens ?? 0
    },
    model: raw.message?.model,
    dedupKey: {
      messageId: raw.message?.id,
      requestId: raw.requestId
    }
  };
}
