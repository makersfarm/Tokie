import type { Phase, Mood } from '@core/types';
import { nextThreshold } from '@core/pet/stages';

export function PetProgressBar({ phase, xp, mood, almost }: { phase: Phase; xp: number; mood: Mood; almost?: boolean }) {
  const next = nextThreshold(phase);
  const pct = next === null ? 100 : Math.min(100, (xp / next) * 100);
  return (
    <div className={`progress mood-${mood}`} role="progressbar"
         aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
      <div className={`progress-fill${almost ? ' almost-there' : ''}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
