import { fmtK } from '../data/fmt';

export function EatingBurst({ amount, xPct, yPct }: { amount: number; xPct: number; yPct: number }) {
  return (
    <div className="burst" style={{ left: `${xPct}%`, top: `${yPct}%` }}>
      +{fmtK(amount)}
    </div>
  );
}
