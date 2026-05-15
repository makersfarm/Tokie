import type { Phase, Mood } from '@core/types';
import { nextThreshold } from '@core/pet/stages';

export function PetProgressBar({ phase, xp, mood }: { phase: Phase; xp: number; mood: Mood }) {
  const next = nextThreshold(phase);
  const pct = next === null ? 100 : Math.min(100, (xp / next) * 100);
  return (
    <div className={`progress mood-${mood}`} role="progressbar"
         aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
      <div className="progress-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}
