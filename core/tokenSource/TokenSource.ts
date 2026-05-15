import type { TokenEvent } from '../types';

export interface InstallReport {
  ok: boolean;
  message: string;
}

export interface TokenSource {
  readonly id: string;
  start(emit: (e: TokenEvent) => void): Promise<void>;
  stop(): Promise<void>;
  install?(): Promise<InstallReport>;
}
