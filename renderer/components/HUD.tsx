import type { PetSnapshot } from '@core/types';
import { STAGES, nextThreshold } from '@core/pet/stages';

export function HUD({ snap }: { snap: PetSnapshot }) {
  const stageName = STAGES.find(s => s.phase === snap.phase)?.name ?? '?';
  const next = nextThreshold(snap.phase);
  const pct = next ? Math.min(100, (snap.lifetimeXP / next) * 100).toFixed(1) : '100';
  return (
    <div className="hud">
      <div>{stageName} · XP {snap.lifetimeXP.toFixed(0)}{next ? ` / ${next}` : ' (max)'}</div>
      <div>cond {snap.condition.toFixed(0)} · {snap.mood}</div>
      <div>{pct}%</div>
    </div>
  );
}
