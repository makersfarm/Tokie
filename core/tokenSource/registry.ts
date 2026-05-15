import type { TokenSource } from './TokenSource';
import type { TokenEvent } from '../types';

export class SourceRegistry {
  constructor(private sources: TokenSource[]) {}

  add(s: TokenSource): void {
    this.sources.push(s);
  }

  async start(emit: (e: TokenEvent) => void): Promise<void> {
    for (const s of this.sources) await s.start(emit);
  }

  async stop(): Promise<void> {
    for (const s of this.sources) await s.stop();
  }
}
