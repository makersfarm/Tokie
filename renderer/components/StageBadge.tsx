import type { Phase } from '@core/types';
import { STAGES } from '@core/pet/stages';

const ICON: Record<Phase, string> = { 0: '🥚', 1: '🐣', 2: '🐤', 3: '🐔' };

export function StageBadge({ phase, compact }: { phase: Phase; compact: boolean }) {
  const name = STAGES.find(s => s.phase === phase)?.name ?? '?';
  return (
    <div className="badge" aria-label={`Stage ${name}`}>
      <span className="badge-icon">{ICON[phase]}</span>
      {!compact && <span className="badge-name">{name}</span>}
    </div>
  );
}
