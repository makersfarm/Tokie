import { useEffect, useState } from 'react';
import type { PetEvent } from '@core/types';

export function useStats24h(lastEvent: PetEvent | null): number {
  const [tokens24h, setTokens24h] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      window.pet.getStats().then(s => {
        if (cancelled) return;
        const t = s.last24h;
        setTokens24h(t.input + t.output + t.cacheRead + t.cacheCreate);
      });
    };
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  useEffect(() => {
    if (!lastEvent || lastEvent.type === 'snapshot') return;
    window.pet.getStats().then(s => {
      const t = s.last24h;
      setTokens24h(t.input + t.output + t.cacheRead + t.cacheCreate);
    });
  }, [lastEvent]);

  return tokens24h;
}
