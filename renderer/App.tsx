import { useEffect, useState } from 'react';
import { usePetState } from './hooks/usePetState';
import { Pet } from './components/Pet';
import { HUD } from './components/HUD';
import { EatingBurst } from './components/EatingBurst';
import { EvolveCutscene } from './components/EvolveCutscene';
import { StatsView } from './components/StatsView';
import type { Phase } from '@core/types';

export function App() {
  if (new URLSearchParams(window.location.search).get('view') === 'stats') {
    return <StatsView />;
  }
  return <PetView />;
}

function PetView() {
  const { snap, lastEvent } = usePetState();
  const [bursts, setBursts]   = useState<{ id: number; amount: number }[]>([]);
  const [evo, setEvo]         = useState<{ from: Phase; to: Phase } | null>(null);
  const [feasting, setFeasting] = useState(false);

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

  // Self-clearing cutscene — runs independently of incoming events so other
  // events (snapshot from cursor save / reset, fed, mood-changed) can't cancel
  // the timer mid-show.
  useEffect(() => {
    if (!evo) return;
    const t = setTimeout(() => setEvo(null), 4000);
    return () => clearTimeout(t);
  }, [evo]);

  if (!snap) return null;

  const handleContext = (e: React.MouseEvent) => {
    e.preventDefault();
    (window as any).pet?.openMenu?.();
  };

  return (
    <div className="root" onContextMenu={handleContext}>
      <Pet phase={snap.phase} mood={snap.mood} feasting={feasting} />
      {bursts.map(b => <EatingBurst key={b.id} amount={b.amount} />)}
      <HUD snap={snap} />
      {evo && <EvolveCutscene from={evo.from} to={evo.to} />}
    </div>
  );
}
