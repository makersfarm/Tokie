import { useEffect, useRef, useState } from 'react';

export type SleepReason = 'idle' | 'night';

export interface SleepInput {
  now: number;
  lastFedAt: number | null;
  /** Bucket id of the night the user was last woken in. Used to avoid re-sleeping
   *  the same night after wake. Format: 'night-YYYY-MM-DD'. */
  wokenInBucket: string | null;
}

const IDLE_THRESHOLD_MS = 60 * 60_000;

export function nightBucket(d: Date): string {
  // The night bucket extends from one calendar day at 23:00 until next day 06:00.
  // Use the date on which 23:00 falls.
  const h = d.getHours();
  const ref = new Date(d);
  if (h < 6) ref.setDate(ref.getDate() - 1);
  const y = ref.getFullYear();
  const m = String(ref.getMonth() + 1).padStart(2, '0');
  const day = String(ref.getDate()).padStart(2, '0');
  return `night-${y}-${m}-${day}`;
}

export function isNightHour(d: Date): boolean {
  const h = d.getHours();
  return h >= 23 || h < 6;
}

export function computeSleep(input: SleepInput): { asleep: boolean; reason: SleepReason | null } {
  const { now, lastFedAt, wokenInBucket } = input;
  const idle = lastFedAt == null ? false : (now - lastFedAt) > IDLE_THRESHOLD_MS;
  if (idle) return { asleep: true, reason: 'idle' };
  const d = new Date(now);
  if (isNightHour(d)) {
    const bucket = nightBucket(d);
    if (wokenInBucket === bucket) return { asleep: false, reason: null };
    return { asleep: true, reason: 'night' };
  }
  return { asleep: false, reason: null };
}

export function useSleepState(lastFedAt: number | null, wakeNonce: number): {
  asleep: boolean; reason: SleepReason | null;
} {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  const wokenBucketRef = useRef<string | null>(null);
  const lastWakeRef = useRef<number>(0);
  if (wakeNonce !== lastWakeRef.current) {
    lastWakeRef.current = wakeNonce;
    const now = new Date(Date.now());
    if (isNightHour(now)) wokenBucketRef.current = nightBucket(now);
  }
  const now = Date.now();
  return computeSleep({ now, lastFedAt, wokenInBucket: wokenBucketRef.current });
}
