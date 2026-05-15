export const WINDOW_MS   = 5 * 60_000;
export const THRESHOLD   = 50_000;
export const COOLDOWN_MS = 2 * 60_000;

interface Sample { ts: number; nutrition: number }

export interface BurstResult {
  isBurst: boolean;
  sum: number;
}

export class BurstDetector {
  private samples: Sample[] = [];
  private lastFiredAt: number | null = null;

  addEvent(ts: number, nutrition: number): void {
    if (nutrition <= 0) return;
    this.samples.push({ ts, nutrition });
  }

  evaluate(now: number): BurstResult {
    const cutoff = now - WINDOW_MS;
    while (this.samples.length && this.samples[0]!.ts < cutoff) {
      this.samples.shift();
    }
    const sum = this.samples.reduce((a, s) => a + s.nutrition, 0);

    if (this.lastFiredAt !== null && now - this.lastFiredAt < COOLDOWN_MS) {
      return { isBurst: false, sum };
    }
    if (sum >= THRESHOLD) {
      this.lastFiredAt = now;
      return { isBurst: true, sum };
    }
    return { isBurst: false, sum };
  }
}
