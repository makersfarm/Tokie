import fs from 'node:fs';
import path from 'node:path';
import type { PetSnapshot } from '../types';

const SCHEMA = 1;

export function makeDefaultSnapshot(now: number): PetSnapshot {
  return {
    schemaVersion: SCHEMA,
    createdAt: now,
    lifetimeXP: 0,
    phase: 0,
    condition: 50,
    mood: 'normal',
    lastTickAt: now,
    lastFedAt: null,
    lastCursors: {},
    windowPos: { x: 1500, y: 80 }
  };
}

export function loadPetState(file: string, now: () => number): PetSnapshot {
  if (!fs.existsSync(file)) return makeDefaultSnapshot(now());
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw) as Partial<PetSnapshot>;
    return { ...makeDefaultSnapshot(now()), ...parsed, schemaVersion: SCHEMA };
  } catch {
    return makeDefaultSnapshot(now());
  }
}

export function savePetStateNow(file: string, s: PetSnapshot): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(s, null, 2));
  fs.renameSync(tmp, file);
}

export function makeDebouncedSaver(file: string, delayMs = 500) {
  let timer: NodeJS.Timeout | null = null;
  let latest: PetSnapshot | null = null;
  return {
    schedule(s: PetSnapshot) {
      latest = s;
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        if (latest) savePetStateNow(file, latest);
      }, delayMs);
    },
    flush() {
      if (timer) clearTimeout(timer);
      timer = null;
      if (latest) savePetStateNow(file, latest);
      latest = null;
    }
  };
}
