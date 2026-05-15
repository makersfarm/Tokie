import { describe, it, expect } from 'vitest';
import { BurstDetector } from './burstDetector';

describe('BurstDetector', () => {
  it('does not fire below threshold', () => {
    const d = new BurstDetector();
    d.addEvent(1000, 10_000);
    d.addEvent(2000, 20_000);
    expect(d.evaluate(3000)).toEqual({ isBurst: false, sum: 30_000 });
  });

  it('fires when window sum >= threshold', () => {
    const d = new BurstDetector();
    d.addEvent(1000, 30_000);
    d.addEvent(2000, 25_000);
    const r = d.evaluate(3000);
    expect(r.isBurst).toBe(true);
  });

  it('drops events older than WINDOW_MS', () => {
    const d = new BurstDetector();
    d.addEvent(0, 60_000);
    const t = 1000 + 5 * 60_000;
    d.addEvent(t, 1_000);
    expect(d.evaluate(t).isBurst).toBe(false);
  });

  it('does not refire during cooldown', () => {
    const d = new BurstDetector();
    d.addEvent(1000, 60_000);
    expect(d.evaluate(2000).isBurst).toBe(true);
    d.addEvent(3000, 60_000);
    expect(d.evaluate(4000).isBurst).toBe(false);
  });

  it('can fire again after cooldown ends AND window drops below threshold then re-crosses', () => {
    const d = new BurstDetector();
    d.addEvent(0, 60_000);
    expect(d.evaluate(1).isBurst).toBe(true);
    const later = 10 * 60_000;
    d.addEvent(later, 60_000);
    expect(d.evaluate(later + 1).isBurst).toBe(true);
  });

  it('reports window sum for callers that want to display intensity', () => {
    const d = new BurstDetector();
    d.addEvent(1000, 30_000);
    d.addEvent(2000, 20_000);
    expect(d.evaluate(3000).sum).toBe(50_000);
  });

  it('rejects NaN / negative / zero nutrition silently', () => {
    const d = new BurstDetector();
    d.addEvent(1000, NaN);
    d.addEvent(2000, -100);
    d.addEvent(3000, 0);
    expect(d.evaluate(4000)).toEqual({ isBurst: false, sum: 0 });
  });
});
