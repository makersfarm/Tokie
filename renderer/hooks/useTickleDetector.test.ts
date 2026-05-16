import { describe, it, expect } from 'vitest';
import { TickleTracker } from './useTickleDetector';

describe('TickleTracker', () => {
  it('fires when ≥3 direction reversals within 1s and ≥40px total movement', () => {
    const t = new TickleTracker();
    const fires: number[] = [];
    t.onFire(now => fires.push(now));
    t.move(0,  0, 1000);
    t.move(20, 0, 1100); // right
    t.move(0,  0, 1200); // left  (reversal 1)
    t.move(20, 0, 1300); // right (reversal 2)
    t.move(0,  0, 1400); // left  (reversal 3) — total movement 80px > 40
    expect(fires.length).toBe(1);
  });

  it('does not fire if reversals span > 1s window', () => {
    const t = new TickleTracker();
    const fires: number[] = [];
    t.onFire(now => fires.push(now));
    t.move(0,  0, 1000);
    t.move(20, 0, 1300);
    t.move(0,  0, 1700);
    t.move(20, 0, 2100);
    t.move(0,  0, 2200);
    expect(fires.length).toBe(0);
  });

  it('respects cooldown after firing (60s)', () => {
    const t = new TickleTracker();
    const fires: number[] = [];
    t.onFire(now => fires.push(now));
    const burst = (base: number) => {
      t.move(0,  0, base);
      t.move(20, 0, base + 100);
      t.move(0,  0, base + 200);
      t.move(20, 0, base + 300);
      t.move(0,  0, base + 400);
    };
    burst(1_000);
    burst(2_000); // within cooldown — should not fire
    burst(70_000); // after cooldown
    expect(fires.length).toBe(2);
  });

  it('does not fire if total movement < 40px even with reversals', () => {
    const t = new TickleTracker();
    const fires: number[] = [];
    t.onFire(now => fires.push(now));
    t.move(0, 0, 1000);
    t.move(5, 0, 1100);
    t.move(0, 0, 1200);
    t.move(5, 0, 1300);
    t.move(0, 0, 1400);
    expect(fires.length).toBe(0);
  });
});
