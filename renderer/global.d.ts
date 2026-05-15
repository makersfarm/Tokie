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

declare global {
  interface Window {
    pet: {
      subscribe: (cb: (e: PetEvent) => void) => () => void;
      getSnapshot: () => Promise<PetSnapshot>;
      getStats: () => Promise<EventStats>;
      openMenu: () => Promise<void>;
    };
  }
}

export {};
