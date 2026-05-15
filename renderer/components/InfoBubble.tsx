import type { PetSnapshot } from '@core/types';
import { nextThreshold } from '@core/pet/stages';

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return n.toFixed(0);
}

export function InfoBubble(
  { snap, tokens24h, compact }: { snap: PetSnapshot; tokens24h: number; compact: boolean }
) {
  const next = nextThreshold(snap.phase);
  if (compact) {
    return (
      <div className="info-bubble compact">
        {fmt(snap.lifetimeXP)}{next ? ` / ${fmt(next)}` : ''} · {snap.condition.toFixed(0)} · {fmt(tokens24h)}
      </div>
    );
  }
  return (
    <div className="info-bubble">
      <div>XP   {fmt(snap.lifetimeXP)}{next ? ` / ${fmt(next)}` : ' (max)'}</div>
      <div>cond {snap.condition.toFixed(0)} · {snap.mood}</div>
      <div>24h  {fmt(tokens24h)}</div>
    </div>
  );
}
