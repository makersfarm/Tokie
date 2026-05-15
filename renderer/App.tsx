import { useEffect, useRef, useState } from 'react';
import { usePetState } from './hooks/usePetState';
import { useHover } from './hooks/useHover';
import { useStats24h } from './hooks/useStats24h';
import { useBurstDetector } from './hooks/useBurstDetector';
import { Pet } from './components/Pet';
import { StageBadge } from './components/StageBadge';
import { PetProgressBar } from './components/PetProgressBar';
import { InfoBubble } from './components/InfoBubble';
import { SpeechBubble } from './components/SpeechBubble';
import { EatingBurst } from './components/EatingBurst';
import { EvolveCutscene } from './components/EvolveCutscene';
import { StatsView } from './components/StatsView';
import { pickGreeting, pickBurstLine } from './data/speech';
import type { Phase } from '@core/types';

const COMPACT_W = 160;
const BADGE_COMPACT_W = 140;
const CLICK_THRESHOLD_PX = 5;
const GREETING_COOLDOWN_MS = 300;
const GREETING_TTL_MS = 800;
const BURST_TTL_MS = 2500;

export function App() {
  if (new URLSearchParams(window.location.search).get('view') === 'stats') {
    return <StatsView />;
  }
  return <PetView />;
}

function useWindowWidth(): number {
  const [w, setW] = useState(window.innerWidth);
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return w;
}

function PetView() {
  const { snap, lastEvent } = usePetState();
  const tokens24h = useStats24h(lastEvent);
  const burst = useBurstDetector(lastEvent);
  const winW = useWindowWidth();
  const compactInfo = winW <= COMPACT_W;
  const compactBadge = winW <= BADGE_COMPACT_W;

  const hover = useHover();

  const [bursts, setBursts]   = useState<{ id: number; amount: number }[]>([]);
  const [evo, setEvo]         = useState<{ from: Phase; to: Phase } | null>(null);
  const [feasting, setFeasting] = useState(false);
  const [greeting, setGreeting] = useState<string | null>(null);
  const [burstLine, setBurstLine] = useState<string | null>(null);
  const lastClickAt = useRef(0);
  const downRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!lastEvent) return;
    if (lastEvent.type === 'fed') {
      const id = Math.random();
      const amount = lastEvent.nutrition;
      setBursts(b => [...b, { id, amount }]);
      setFeasting(true);
      setTimeout(() => setBursts(b => b.filter(x => x.id !== id)), 1000);
      setTimeout(() => setFeasting(false), 400);
    } else if (lastEvent.type === 'evolved') {
      setEvo({ from: lastEvent.from, to: lastEvent.to });
    }
  }, [lastEvent]);

  useEffect(() => {
    if (!evo) return;
    const t = setTimeout(() => setEvo(null), 4000);
    return () => clearTimeout(t);
  }, [evo]);

  // proactive burst speech
  useEffect(() => {
    if (burst.nonce === 0 || !snap) return;
    setBurstLine(pickBurstLine(snap.mood));
    const t = setTimeout(() => setBurstLine(null), BURST_TTL_MS);
    return () => clearTimeout(t);
  }, [burst.nonce]);

  // click → greeting (with drag-vs-click threshold)
  const onPointerDown = (e: React.PointerEvent) => {
    downRef.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = downRef.current;
    downRef.current = null;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.hypot(dx, dy) >= CLICK_THRESHOLD_PX) return; // was a drag
    const now = Date.now();
    if (now - lastClickAt.current < GREETING_COOLDOWN_MS) return;
    lastClickAt.current = now;
    setGreeting(pickGreeting());
    setFeasting(true);
    setTimeout(() => setFeasting(false), 400);
    setTimeout(() => setGreeting(null), GREETING_TTL_MS);
  };

  if (!snap) return null;

  const handleContext = (e: React.MouseEvent) => {
    e.preventDefault();
    window.pet?.openMenu?.();
  };

  return (
    <div className="root" onContextMenu={handleContext}>
      <StageBadge phase={snap.phase} compact={compactBadge} />
      <div {...hover.bind} onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
        <Pet phase={snap.phase} mood={snap.mood} feasting={feasting} />
      </div>
      <PetProgressBar phase={snap.phase} xp={snap.lifetimeXP} mood={snap.mood} />

      {bursts.map(b => <EatingBurst key={b.id} amount={b.amount} />)}
      {hover.hovered && <InfoBubble snap={snap} tokens24h={tokens24h} compact={compactInfo} />}
      {greeting   && <SpeechBubble text={greeting}   variant="greeting"  />}
      {burstLine  && <SpeechBubble text={burstLine}  variant="proactive" />}
      {evo && <EvolveCutscene from={evo.from} to={evo.to} />}
    </div>
  );
}
