import type { TokenEvent, SessionMetaEvent } from '../types';

interface RawLine {
  type?: string;
  sessionId?: string;
  requestId?: string;
  timestamp?: string;
  cwd?: string;
  gitBranch?: string;
  aiTitle?: string;
  message?: {
    id?: string;
    role?: string;
    model?: string;
    content?: unknown;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
  };
}

const FIRST_PROMPT_MAX = 40;

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

/** Extract user-visible text from a Claude Code user-message content field.
 *  Content is either a plain string or an array of {type:'text', text:string}. */
function extractUserText(content: unknown): string | undefined {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    for (const part of content) {
      if (part && typeof part === 'object' && (part as { type?: string }).type === 'text') {
        const t = (part as { text?: unknown }).text;
        if (typeof t === 'string') return t;
      }
    }
  }
  return undefined;
}

function truncate(s: string, max: number): string {
  const trimmed = s.replace(/\s+/g, ' ').trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max - 1) + '…';
}

/** Emit a SessionMetaEvent when a JSONL line carries identifying info about the
 *  session (ai-title line, first user prompt, or any line with cwd/gitBranch).
 *  Returns null for lines that contribute nothing — the upsert priority in the
 *  DB keeps the best name we've seen so far. */
export function parseSessionMetaLine(line: string): SessionMetaEvent | null {
  let raw: RawLine;
  try {
    raw = JSON.parse(line);
  } catch {
    return null;
  }
  const sessionId = raw.sessionId;
  if (!sessionId) return null;
  const ts = raw.timestamp ? Date.parse(raw.timestamp) : NaN;
  const tsSafe = Number.isFinite(ts) ? ts : Date.now();

  let name: string | undefined;
  let namePriority: 1 | 2 | undefined;
  if (raw.type === 'ai-title' && typeof raw.aiTitle === 'string') {
    const cleaned = raw.aiTitle.trim();
    if (cleaned) { name = cleaned; namePriority = 2; }
  } else if (raw.type === 'user') {
    const text = extractUserText(raw.message?.content);
    if (text) { name = truncate(text, FIRST_PROMPT_MAX); namePriority = 1; }
  }

  if (!name && !raw.cwd && !raw.gitBranch) return null;
  return {
    sessionId,
    name,
    namePriority,
    cwd: raw.cwd,
    gitBranch: raw.gitBranch,
    ts: tsSafe
  };
}
