import { useEffect, useRef } from 'react';
import type React from 'react';

const WINDOW_MS = 1_000;
const MIN_REVERSALS = 3;
const MIN_TOTAL_MOVEMENT_PX = 40;
const COOLDOWN_MS = 60_000;

type Sample = { x: number; t: number; dir: 1 | -1 | 0 };

export class TickleTracker {
  private samples: Sample[] = [];
  private lastFireAt = -Infinity;
  private fireCb: (now: number) => void = () => {};

  onFire(cb: (now: number) => void): void { this.fireCb = cb; }

  move(x: number, _y: number, now: number): void {
    const prev = this.samples[this.samples.length - 1];
    const dir: 1 | -1 | 0 = prev ? (x > prev.x ? 1 : x < prev.x ? -1 : 0) : 0;
    this.samples.push({ x, t: now, dir });
    while (this.samples.length && this.samples[0]!.t < now - WINDOW_MS) {
      this.samples.shift();
    }
    if (now - this.lastFireAt < COOLDOWN_MS) return;

    let reversals = 0;
    let totalMovement = 0;
    let prevDir: 1 | -1 | 0 = 0;
    for (let i = 1; i < this.samples.length; i++) {
      const cur = this.samples[i]!;
      const last = this.samples[i - 1]!;
      totalMovement += Math.abs(cur.x - last.x);
      if (cur.dir !== 0 && prevDir !== 0 && cur.dir !== prevDir) reversals++;
      if (cur.dir !== 0) prevDir = cur.dir;
    }
    if (reversals >= MIN_REVERSALS && totalMovement >= MIN_TOTAL_MOVEMENT_PX) {
      this.lastFireAt = now;
      this.samples = [];
      this.fireCb(now);
    }
  }
}

export function useTickleDetector(onTickle: () => void) {
  const trackerRef = useRef<TickleTracker | null>(null);
  if (!trackerRef.current) trackerRef.current = new TickleTracker();
  useEffect(() => {
    trackerRef.current!.onFire(() => onTickle());
  }, [onTickle]);
  return {
    onPointerMove: (e: React.PointerEvent) => {
      trackerRef.current!.move(e.clientX, e.clientY, Date.now());
    }
  };
}
