import type { PetSnapshot, PetEvent } from '@core/types';

interface TokenSum { input: number; output: number; cacheRead: number; cacheCreate: number }
interface SourceBreakdown extends TokenSum { source: string; events: number }
interface EventStats {
  events: number;
  totalCostUsd: number;
  firstTs: number | null;
  lastTs:  number | null;
  lifetime: TokenSum;
  today:    TokenSum;
  last24h:  TokenSum;
  last7d:   TokenSum;
  bySource: SourceBreakdown[];
}
interface SessionTodayRow extends TokenSum {
  sessionId: string;
  name: string | null;
  cwd: string | null;
  gitBranch: string | null;
  events: number;
  firstTs: number;
  lastTs: number;
}
interface SessionDetailRow extends TokenSum {
  ts: number;
  source: string;
  model: string | null;
}

declare global {
  interface Window {
    pet: {
      subscribe: (cb: (e: PetEvent) => void) => () => void;
      getSnapshot: () => Promise<PetSnapshot>;
      getStats: () => Promise<EventStats>;
      todayBySession: () => Promise<SessionTodayRow[]>;
      sessionDetailToday: (sessionId: string) => Promise<SessionDetailRow[]>;
      openMenu: () => Promise<void>;
      nudgeCondition: (amount: number) => Promise<void>;
    };
  }
}

export {};
