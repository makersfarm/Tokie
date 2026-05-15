import type { Phase } from '@core/types';
import { STAGES } from '@core/pet/stages';

export function EvolveCutscene({ from, to }: { from: Phase; to: Phase }) {
  const fromName = STAGES.find(s => s.phase === from)?.name ?? '?';
  const toName   = STAGES.find(s => s.phase === to)?.name   ?? '?';
  return (
    <div className="cutscene">
      <div>
        <div>✨ EVOLVED ✨</div>
        <div>{fromName} → {toName}</div>
      </div>
    </div>
  );
}
