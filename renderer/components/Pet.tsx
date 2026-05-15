import type { Phase, Mood } from '@core/types';

const SPRITE: Record<Phase, string> = {
  0: '🥚',
  1: '🐣',
  2: '🐥',
  3: '🐔'
};

const MOOD_OVERLAY: Record<Mood, string> = {
  happy: '', normal: '', sleepy: '💤', sad: '😔',
  feasting: '✨', curious: '❔'
};

export function Pet({ phase, mood, feasting }: { phase: Phase; mood: Mood; feasting: boolean }) {
  return (
    <div className={`pet ${feasting ? 'feasting' : ''}`}>
      <span>{SPRITE[phase]}</span>
      {MOOD_OVERLAY[mood] && <sup style={{ fontSize: 24 }}>{MOOD_OVERLAY[mood]}</sup>}
    </div>
  );
}
