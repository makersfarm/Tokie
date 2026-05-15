function fmtK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return n.toFixed(0);
}

export function EatingBurst({ amount, xPct, yPct }: { amount: number; xPct: number; yPct: number }) {
  return (
    <div className="burst" style={{ left: `${xPct}%`, top: `${yPct}%` }}>
      +{fmtK(amount)}
    </div>
  );
}
