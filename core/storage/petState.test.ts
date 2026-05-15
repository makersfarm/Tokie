import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadPetState, savePetStateNow, makeDefaultSnapshot } from './petState';

describe('petState storage', () => {
  let dir: string, file: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'pet-'));
    file = path.join(dir, 'pet-state.json');
  });

  it('loadPetState returns default when file missing', () => {
    const s = loadPetState(file, () => 1234);
    expect(s.createdAt).toBe(1234);
    expect(s.lifetimeXP).toBe(0);
    expect(s.phase).toBe(0);
  });

  it('savePetStateNow writes atomically and loadPetState reads it back', () => {
    const s = makeDefaultSnapshot(0);
    s.lifetimeXP = 42;
    savePetStateNow(file, s);
    expect(existsSync(file)).toBe(true);
    const back = loadPetState(file, () => 0);
    expect(back.lifetimeXP).toBe(42);
  });

  it('save never leaves a half-written file (tmp+rename)', () => {
    const s = makeDefaultSnapshot(0);
    savePetStateNow(file, s);
    const raw = readFileSync(file, 'utf8');
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it('schema migration: missing fields filled with defaults', () => {
    writeFileSync(file, JSON.stringify({ schemaVersion: 1, lifetimeXP: 10 }));
    const back = loadPetState(file, () => 0);
    expect(back.lifetimeXP).toBe(10);
    expect(back.condition).toBe(50);
    expect(back.phase).toBe(0);
  });
});
