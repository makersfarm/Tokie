import { useEffect, useRef, useState } from 'react';
import type { PetEvent } from '@core/types';
import { BurstDetector } from '@core/feeding/burstDetector';

export interface BurstFiring {
  /** monotonic counter — increments each time a burst fires */
  nonce: number;
  /** ts of the latest fire, for ordering / debugging */
  ts: number;
}

export function useBurstDetector(lastEvent: PetEvent | null): BurstFiring {
  const detector = useRef(new BurstDetector());
  const [firing, setFiring] = useState<BurstFiring>({ nonce: 0, ts: 0 });

  useEffect(() => {
    if (!lastEvent || lastEvent.type !== 'fed') return;
    detector.current.addEvent(lastEvent.ts, lastEvent.nutrition);
    const r = detector.current.evaluate(lastEvent.ts);
    if (r.isBurst) {
      setFiring(f => ({ nonce: f.nonce + 1, ts: lastEvent.ts }));
    }
  }, [lastEvent]);

  return firing;
}
