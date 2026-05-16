export interface TokenCounts {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreate: number;
}

export interface TokenEvent {
  sourceId: string;
  sessionId: string;
  cursor: string;
  ts: number;
  tokens: TokenCounts;
  model?: string;
  costUsd?: number;
  dedupKey?: { messageId?: string; requestId?: string };
}

export interface NutritionEvent {
  ts: number;
  nutrition: number;
  source: string;
  model?: string;
}

export interface SessionMetaEvent {
  sessionId: string;
  /** Best-effort human label. May be undefined when only cwd/gitBranch were learned. */
  name?: string;
  /** Higher wins — used by the DB upsert to avoid overwriting a good name
   *  with a worse one. 2 = ai-title, 1 = first user prompt. */
  namePriority?: 1 | 2;
  cwd?: string;
  gitBranch?: string;
  /** Timestamp on the source line. Used to set sessions.started_at when missing. */
  ts: number;
}

export type Phase = 0 | 1 | 2 | 3;
export type Mood = 'happy' | 'normal' | 'sleepy' | 'sad' | 'feasting' | 'curious';

export interface CursorRecord {
  // statusLine cursor: messageId+requestId
  messageId?: string;
  requestId?: string;
  // JSONL cursor: file path + byte offset
  file?: string;
  lineOffset?: number;
}

export interface PetSnapshot {
  schemaVersion: number;
  createdAt: number;
  lifetimeXP: number;
  phase: Phase;
  condition: number;
  mood: Mood;
  lastTickAt: number;
  lastFedAt: number | null;
  lastCursors: Record<string, CursorRecord>;
  windowPos: { x: number; y: number };
  windowSize: { w: number; h: number };
}

export type PetEvent =
  | { type: 'fed'; nutrition: number; ts: number; model?: string }
  | { type: 'evolved'; from: Phase; to: Phase; ts: number }
  | { type: 'mood-changed'; from: Mood; to: Mood; ts: number }
  | { type: 'snapshot'; snapshot: PetSnapshot };
