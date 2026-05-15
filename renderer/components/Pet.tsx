import type { Phase, Mood } from '@core/types';

const SPRITE: Record<Phase, string> = {
  0: '/sprites/phase0.svg',
  1: '/sprites/phase1.svg',
  2: '/sprites/phase2.svg',
  3: '/sprites/phase3.svg'
};

const MOOD_OVERLAY: Record<Mood, string> = {
  happy: '', normal: '', sleepy: '💤', sad: '😔',
  feasting: '✨', curious: '❔'
};

export function Pet({ phase, mood, feasting }: { phase: Phase; mood: Mood; feasting: boolean }) {
  return (
    <div className={`pet ${feasting ? 'feasting' : ''} mood-${mood}`}>
      <img className="pet-sprite" src={SPRITE[phase]} alt={`phase ${phase}`} draggable={false} />
      {MOOD_OVERLAY[mood] && <span className="pet-overlay">{MOOD_OVERLAY[mood]}</span>}
    </div>
  );
}
