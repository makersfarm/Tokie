import { useEffect, useState } from 'react';
import type { PetSnapshot, PetEvent } from '@core/types';

export function usePetState() {
  const [snap, setSnap] = useState<PetSnapshot | null>(null);
  const [lastEvent, setLastEvent] = useState<PetEvent | null>(null);

  useEffect(() => {
    window.pet.getSnapshot().then(setSnap);
    return window.pet.subscribe(e => {
      setLastEvent(e);
      if (e.type === 'snapshot') setSnap(e.snapshot);
      else {
        window.pet.getSnapshot().then(setSnap);
      }
    });
  }, []);

  return { snap, lastEvent };
}
