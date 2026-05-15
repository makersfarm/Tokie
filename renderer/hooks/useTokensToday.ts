import { useEffect, useState } from 'react';
import type { PetEvent } from '@core/types';

export function useTokensToday(lastEvent: PetEvent | null): number {
  const [tokens, setTokens] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      window.pet.getStats().then(s => {
        if (cancelled) return;
        const t = s.today;
        setTokens(t.input + t.output + t.cacheRead + t.cacheCreate);
      });
    };
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  useEffect(() => {
    if (!lastEvent || lastEvent.type === 'snapshot') return;
    window.pet.getStats().then(s => {
      const t = s.today;
      setTokens(t.input + t.output + t.cacheRead + t.cacheCreate);
    });
  }, [lastEvent]);

  return tokens;
}
