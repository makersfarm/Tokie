import { useEffect, useState } from 'react';
import type { Phase, Mood } from '@core/types';

const SPRITE: Record<Phase, string> = {
  0: 'sprites/phase0.svg',
  1: 'sprites/phase1.svg',
  2: 'sprites/phase2.svg',
  3: 'sprites/phase3.svg'
};

const MOOD_OVERLAY: Record<Mood, string> = {
  happy: '', normal: '', sleepy: '💤', sad: '😔',
  feasting: '✨', curious: '❔'
};

const SVG_CACHE: Partial<Record<Phase, string>> = {};

function usePhaseSvg(phase: Phase): string {
  const [svg, setSvg] = useState<string>(SVG_CACHE[phase] ?? '');
  useEffect(() => {
    const cached = SVG_CACHE[phase];
    if (cached) { setSvg(cached); return; }
    fetch(SPRITE[phase]).then(r => r.text()).then(text => {
      SVG_CACHE[phase] = text;
      setSvg(text);
    });
  }, [phase]);
  return svg;
}

export function Pet({ phase, mood, feasting, blinking }: {
  phase: Phase; mood: Mood; feasting: boolean;
  blinking?: boolean;
}) {
  const svg = usePhaseSvg(phase);
  const overlay = MOOD_OVERLAY[mood];
  return (
    <div className={`pet ${feasting ? 'feasting' : ''} mood-${mood} ${blinking ? 'blink' : ''}`}>
      <div className="pet-sprite" dangerouslySetInnerHTML={{ __html: svg }} />
      {overlay && <span className="pet-overlay">{overlay}</span>}
    </div>
  );
}
