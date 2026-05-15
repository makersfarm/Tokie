import type { CursorRecord } from '../types';

export function mergeCursor(prev: CursorRecord, next: Partial<CursorRecord>): CursorRecord {
  return { ...prev, ...next };
}
