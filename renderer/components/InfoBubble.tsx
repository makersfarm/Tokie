import type { PetSnapshot } from '@core/types';
import { nextThreshold } from '@core/pet/stages';
import { fmtK as fmt } from '../data/fmt';

export function InfoBubble(
  { snap, tokensToday, compact }: { snap: PetSnapshot; tokensToday: number; compact: boolean }
) {
  const next = nextThreshold(snap.phase);
  if (compact) {
    return (
      <div className="info-bubble compact">
        {fmt(snap.lifetimeXP)}{next ? ` / ${fmt(next)}` : ''} · {snap.condition.toFixed(0)} · {fmt(tokensToday)}
      </div>
    );
  }
  return (
    <div className="info-bubble">
      <div>XP    {fmt(snap.lifetimeXP)}{next ? ` / ${fmt(next)}` : ' (max)'}</div>
      <div>cond  {snap.condition.toFixed(0)} · {snap.mood}</div>
      <div>today {fmt(tokensToday)}</div>
    </div>
  );
}
