import { useEffect, useState } from 'react';
import { usePetState } from './hooks/usePetState';
import { Pet } from './components/Pet';
import { HUD } from './components/HUD';
import { EatingBurst } from './components/EatingBurst';
import { EvolveCutscene } from './components/EvolveCutscene';
import type { Phase } from '@core/types';

export function App() {
  const { snap, lastEvent } = usePetState();
  const [bursts, setBursts]   = useState<{ id: number; amount: number }[]>([]);
  const [evo, setEvo]         = useState<{ from: Phase; to: Phase } | null>(null);
  const [feasting, setFeasting] = useState(false);

  useEffect(() => {
    if (!lastEvent) return;
    if (lastEvent.type === 'fed') {
      const id = Math.random();
      setBursts(b => [...b, { id, amount: lastEvent.nutrition }]);
      setFeasting(true);
      const t1 = setTimeout(() => setBursts(b => b.filter(x => x.id !== id)), 1000);
      const t2 = setTimeout(() => setFeasting(false), 400);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
    if (lastEvent.type === 'evolved') {
      setEvo({ from: lastEvent.from, to: lastEvent.to });
      const t = setTimeout(() => setEvo(null), 4000);
      return () => clearTimeout(t);
    }
  }, [lastEvent]);

  if (!snap) return null;

  return (
    <>
      <Pet phase={snap.phase} mood={snap.mood} feasting={feasting} />
      {bursts.map(b => <EatingBurst key={b.id} amount={b.amount} />)}
      <HUD snap={snap} />
      {evo && <EvolveCutscene from={evo.from} to={evo.to} />}
    </>
  );
}
