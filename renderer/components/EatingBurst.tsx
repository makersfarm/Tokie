import { fmtK } from '../data/fmt';

function variantOf(model?: string): 'opus' | 'haiku' | 'default' {
  if (!model) return 'default';
  const m = model.toLowerCase();
  if (m.includes('opus'))  return 'opus';
  if (m.includes('haiku')) return 'haiku';
  return 'default';
}

const PREFIX: Record<'opus' | 'haiku' | 'default', string> = {
  opus:    '✨',
  haiku:   '🍿',
  default: ''
};

export function EatingBurst({ amount, xPct, yPct, model }: {
  amount: number; xPct: number; yPct: number; model?: string;
}) {
  const v = variantOf(model);
  return (
    <div className={`burst burst-${v}`} style={{ left: `${xPct}%`, top: `${yPct}%` }}>
      {PREFIX[v]}+{fmtK(amount)}
    </div>
  );
}
