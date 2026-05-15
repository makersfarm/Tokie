import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import type { TokenEvent } from '../types';

export interface TokenSum {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreate: number;
}

export interface SourceBreakdown extends TokenSum {
  source: string;
  events: number;
}

export interface EventStats {
  events: number;
  totalCostUsd: number;
  firstTs: number | null;
  lastTs: number | null;
  lifetime: TokenSum;
  today:    TokenSum;  // since local midnight
  last24h: TokenSum;
  last7d:  TokenSum;
  bySource: SourceBreakdown[];
}

function startOfLocalDay(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

const DAY_MS = 24 * 60 * 60 * 1000;

export class EventsDb {
  private db: Database.Database;
  private insertStmt: Database.Statement;
  private sumStmt: Database.Statement;

  constructor(file: string) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    this.db = new Database(file);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        source TEXT NOT NULL,
        session_id TEXT NOT NULL,
        message_id TEXT,
        request_id TEXT,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        cache_read INTEGER NOT NULL DEFAULT 0,
        cache_create INTEGER NOT NULL DEFAULT 0,
        cost_usd REAL,
        model TEXT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_dedup
        ON events(message_id, request_id)
        WHERE message_id IS NOT NULL AND request_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_ts ON events(ts);
    `);
    this.insertStmt = this.db.prepare(`
      INSERT INTO events
        (ts, source, session_id, message_id, request_id,
         input_tokens, output_tokens, cache_read, cache_create, cost_usd, model)
      VALUES (@ts, @source, @session_id, @message_id, @request_id,
              @input_tokens, @output_tokens, @cache_read, @cache_create, @cost_usd, @model)
    `);
    this.sumStmt = this.db.prepare(`
      SELECT
        COALESCE(SUM(input_tokens),0)  AS input,
        COALESCE(SUM(output_tokens),0) AS output,
        COALESCE(SUM(cache_read),0)    AS cacheRead,
        COALESCE(SUM(cache_create),0)  AS cacheCreate
      FROM events WHERE ts >= ?
    `);
  }

  insert(e: TokenEvent): boolean {
    try {
      this.insertStmt.run({
        ts: e.ts,
        source: e.sourceId,
        session_id: e.sessionId,
        message_id: e.dedupKey?.messageId ?? null,
        request_id: e.dedupKey?.requestId ?? null,
        input_tokens: e.tokens.input,
        output_tokens: e.tokens.output,
        cache_read: e.tokens.cacheRead,
        cache_create: e.tokens.cacheCreate,
        cost_usd: e.costUsd ?? null,
        model: e.model ?? null
      });
      return true;
    } catch (err: any) {
      if (String(err.code) === 'SQLITE_CONSTRAINT_UNIQUE') return false;
      throw err;
    }
  }

  sumSince(ts: number): TokenSum {
    return this.sumStmt.get(ts) as TokenSum;
  }

  stats(now: number): EventStats {
    const meta = this.db.prepare(`
      SELECT
        COUNT(*) AS events,
        COALESCE(SUM(cost_usd),0) AS totalCostUsd,
        MIN(ts) AS firstTs,
        MAX(ts) AS lastTs
      FROM events
    `).get() as { events: number; totalCostUsd: number; firstTs: number | null; lastTs: number | null };

    const lifetime = this.sumSince(0);
    const today    = this.sumSince(startOfLocalDay(now));
    const last24h  = this.sumSince(now - DAY_MS);
    const last7d   = this.sumSince(now - 7 * DAY_MS);

    const bySource = this.db.prepare(`
      SELECT
        source,
        COUNT(*) AS events,
        COALESCE(SUM(input_tokens),0)  AS input,
        COALESCE(SUM(output_tokens),0) AS output,
        COALESCE(SUM(cache_read),0)    AS cacheRead,
        COALESCE(SUM(cache_create),0)  AS cacheCreate
      FROM events
      GROUP BY source
      ORDER BY events DESC
    `).all() as SourceBreakdown[];

    return { ...meta, lifetime, today, last24h, last7d, bySource };
  }

  close(): void {
    this.db.close();
  }
}
