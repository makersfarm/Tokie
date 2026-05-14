# Token Eater Pet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a desktop pet (Electron + TS) that eats Claude Code token usage and grows through Pokémon-style 3-phase evolution, with a `TokenSource` interface ready for Codex/others later.

**Architecture:** Monolithic Electron process. Main runs a `TokenSource` registry (Claude statusLine HTTP + Claude JSONL watcher), feeds events into `FeedingPipeline` → `PetState` FSM, persists to `pet-state.json` (hot) + `events.sqlite` (cold). Renderer is a transparent always-on-top React window subscribing via IPC.

**Tech Stack:** Electron 33, TypeScript 5, React 18, Vite (renderer bundler), better-sqlite3, chokidar, Vitest, Node 20+.

**Spec:** `docs/superpowers/specs/2026-05-14-token-eater-pet-design.md`

**File layout (final state):**
```
electron/{main.ts, window.ts, ipc.ts, tray.ts, preload.ts}
core/
  types.ts
  tokenSource/{TokenSource.ts, registry.ts, claudeStatusLine.ts, claudeJsonl.ts}
  feeding/{nutrition.ts, FeedingPipeline.ts}
  pet/{stages.ts, condition.ts, PetState.ts}
  storage/{paths.ts, petState.ts, eventsDb.ts, cursor.ts}
installers/statusLine.ts
scripts/statusline-shim.cjs
renderer/{index.html, main.tsx, App.tsx, styles.css,
          components/{Pet.tsx, HUD.tsx, EatingBurst.tsx, EvolveCutscene.tsx},
          hooks/usePetState.ts}
```

---

## Task 1: Project scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `vitest.config.ts`, `.gitignore`, `electron/preload.ts`

- [ ] **Step 1: Initialize npm**

Run:
```bash
npm init -y
```

- [ ] **Step 2: Install runtime deps**

```bash
npm i better-sqlite3 chokidar
npm i react react-dom
```

- [ ] **Step 3: Install dev deps**

```bash
npm i -D typescript @types/node @types/react @types/react-dom @types/better-sqlite3 \
  electron vite @vitejs/plugin-react vite-plugin-electron vite-plugin-electron-renderer \
  vitest @vitest/ui @electron/rebuild
```

- [ ] **Step 3b: Add postinstall to rebuild native modules against electron's ABI**

Add to `package.json` (after `scripts.test`):
```json
"postinstall": "electron-rebuild -f -w better-sqlite3"
```
Then run it once:
```bash
npm run postinstall
```
> better-sqlite3 ships node-ABI binaries; Electron uses a different ABI, so the module must be rebuilt. If this fails, see `@electron/rebuild` docs.

- [ ] **Step 4: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "noUncheckedIndexedAccess": true,
    "baseUrl": ".",
    "paths": { "@core/*": ["core/*"], "@renderer/*": ["renderer/*"] }
  },
  "include": ["core", "electron", "renderer", "installers", "scripts"]
}
```

- [ ] **Step 5: Write `vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';
import path from 'node:path';

export default defineConfig({
  root: 'renderer',
  resolve: { alias: { '@core': path.resolve(__dirname, 'core') } },
  plugins: [
    react(),
    electron({
      main: { entry: 'electron/main.ts' },
      preload: { input: 'electron/preload.ts' },
      renderer: {}
    })
  ]
});
```

- [ ] **Step 6: Write `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@core': path.resolve(__dirname, 'core') } },
  test: { environment: 'node', include: ['core/**/*.test.ts'] }
});
```

- [ ] **Step 7: Update `package.json` scripts and `main`**

Edit `package.json` so it has:
```json
{
  "main": "dist-electron/main.js",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 8: Write `.gitignore`**

```
node_modules
dist
dist-electron
.DS_Store
*.log
```

- [ ] **Step 9: Write `electron/preload.ts` (stub for now)**

```ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('pet', {
  subscribe: (cb: (e: unknown) => void) => {
    const listener = (_: unknown, payload: unknown) => cb(payload);
    ipcRenderer.on('pet:event', listener);
    return () => ipcRenderer.off('pet:event', listener);
  },
  getSnapshot: () => ipcRenderer.invoke('pet:getSnapshot')
});
```

- [ ] **Step 10: Verify build tooling parses**

```bash
npx tsc --noEmit
npx vitest run --reporter=verbose
```
Expected: tsc has no errors (no source yet). vitest reports "No test files found" — that's fine.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "chore: scaffold electron+vite+vitest project"
```

---

## Task 2: Shared types

**Files:**
- Create: `core/types.ts`, `core/types.test.ts`

- [ ] **Step 1: Write `core/types.test.ts` (compile-time shape check)**

```ts
import { describe, it, expect } from 'vitest';
import type { TokenEvent, NutritionEvent, PetSnapshot, PetEvent } from './types';

describe('types module exports', () => {
  it('TokenEvent has expected fields at runtime via a builder', () => {
    const e: TokenEvent = {
      sourceId: 'claude-statusline',
      sessionId: 's1',
      cursor: 'c1',
      ts: 1,
      tokens: { input: 1, output: 2, cacheRead: 0, cacheCreate: 0 }
    };
    expect(e.tokens.output).toBe(2);
  });

  it('NutritionEvent carries nutrition and source ts', () => {
    const n: NutritionEvent = { ts: 1, nutrition: 5, source: 'claude-statusline' };
    expect(n.nutrition).toBe(5);
  });

  it('PetSnapshot phase is 0..3', () => {
    const s: PetSnapshot = {
      schemaVersion: 1,
      lifetimeXP: 0,
      phase: 0,
      condition: 50,
      mood: 'normal',
      lastTickAt: 0,
      lastFedAt: null,
      lastCursors: {},
      windowPos: { x: 100, y: 100 },
      createdAt: 0
    };
    expect(s.phase).toBe(0);
  });

  it('PetEvent discriminated union has fed', () => {
    const e: PetEvent = { type: 'fed', nutrition: 5, ts: 1 };
    expect(e.type).toBe('fed');
  });
});
```

- [ ] **Step 2: Run — expect FAIL (types not defined)**

```bash
npx vitest run core/types.test.ts
```
Expected: FAIL with "Cannot find module './types'".

- [ ] **Step 3: Write `core/types.ts`**

```ts
export interface TokenCounts {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreate: number;
}

export interface TokenEvent {
  sourceId: string;
  sessionId: string;
  cursor: string;
  ts: number;
  tokens: TokenCounts;
  model?: string;
  costUsd?: number;
  dedupKey?: { messageId?: string; requestId?: string };
}

export interface NutritionEvent {
  ts: number;
  nutrition: number;
  source: string;
}

export type Phase = 0 | 1 | 2 | 3;
export type Mood = 'happy' | 'normal' | 'sleepy' | 'sad' | 'feasting' | 'curious';

export interface CursorRecord {
  // statusLine cursor: messageId+requestId
  messageId?: string;
  requestId?: string;
  // JSONL cursor: file path + byte offset
  file?: string;
  lineOffset?: number;
}

export interface PetSnapshot {
  schemaVersion: number;
  createdAt: number;
  lifetimeXP: number;
  phase: Phase;
  condition: number;
  mood: Mood;
  lastTickAt: number;
  lastFedAt: number | null;
  lastCursors: Record<string, CursorRecord>;
  windowPos: { x: number; y: number };
}

export type PetEvent =
  | { type: 'fed'; nutrition: number; ts: number }
  | { type: 'evolved'; from: Phase; to: Phase; ts: number }
  | { type: 'mood-changed'; from: Mood; to: Mood; ts: number }
  | { type: 'snapshot'; snapshot: PetSnapshot };
```

- [ ] **Step 4: Run — expect PASS**

```bash
npx vitest run core/types.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add core/types.ts core/types.test.ts
git commit -m "feat(core): add shared types"
```

---

## Task 3: Nutrition formula

**Files:**
- Create: `core/feeding/nutrition.ts`, `core/feeding/nutrition.test.ts`

- [ ] **Step 1: Write `core/feeding/nutrition.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { tokensToNutrition } from './nutrition';

describe('tokensToNutrition', () => {
  it('weights output 3x and input 1x', () => {
    expect(tokensToNutrition({ input: 100, output: 100, cacheRead: 0, cacheCreate: 0 }))
      .toBe(100 * 1 + 100 * 3);
  });
  it('cacheCreate weighted 1.5, cacheRead weighted 0.1', () => {
    expect(tokensToNutrition({ input: 0, output: 0, cacheRead: 1000, cacheCreate: 200 }))
      .toBeCloseTo(1000 * 0.1 + 200 * 1.5);
  });
  it('returns 0 for empty', () => {
    expect(tokensToNutrition({ input: 0, output: 0, cacheRead: 0, cacheCreate: 0 })).toBe(0);
  });
  it('floors negative tokens at 0 (defensive)', () => {
    expect(tokensToNutrition({ input: -5, output: 10, cacheRead: 0, cacheCreate: 0 })).toBe(30);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run core/feeding/nutrition.test.ts
```

- [ ] **Step 3: Implement `core/feeding/nutrition.ts`**

```ts
import type { TokenCounts } from '../types';

const WEIGHTS = { input: 1.0, output: 3.0, cacheCreate: 1.5, cacheRead: 0.1 } as const;

export function tokensToNutrition(t: TokenCounts): number {
  const clamp = (n: number) => (n > 0 ? n : 0);
  return (
    clamp(t.input) * WEIGHTS.input +
    clamp(t.output) * WEIGHTS.output +
    clamp(t.cacheCreate) * WEIGHTS.cacheCreate +
    clamp(t.cacheRead) * WEIGHTS.cacheRead
  );
}

export const NUTRITION_WEIGHTS = WEIGHTS;
```

- [ ] **Step 4: Run — expect PASS**

```bash
npx vitest run core/feeding/nutrition.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add core/feeding/
git commit -m "feat(feeding): tokens→nutrition formula"
```

---

## Task 4: Phase / stages table

**Files:**
- Create: `core/pet/stages.ts`, `core/pet/stages.test.ts`

- [ ] **Step 1: Write `core/pet/stages.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { phaseForXP, STAGES, nextThreshold } from './stages';

describe('phaseForXP', () => {
  it('0 XP → Egg (phase 0)', () => expect(phaseForXP(0)).toBe(0));
  it('9_999 → still Egg', () => expect(phaseForXP(9_999)).toBe(0));
  it('10_000 → phase 1', () => expect(phaseForXP(10_000)).toBe(1));
  it('299_999 → phase 1', () => expect(phaseForXP(299_999)).toBe(1));
  it('300_000 → phase 2', () => expect(phaseForXP(300_000)).toBe(2));
  it('3_000_000 → phase 3', () => expect(phaseForXP(3_000_000)).toBe(3));
  it('10_000_000 → still phase 3 (capped)', () => expect(phaseForXP(10_000_000)).toBe(3));
});

describe('STAGES', () => {
  it('has 4 entries Egg + 3 evolutions', () => expect(STAGES).toHaveLength(4));
  it('thresholds strictly ascending', () => {
    for (let i = 1; i < STAGES.length; i++) {
      expect(STAGES[i].threshold).toBeGreaterThan(STAGES[i - 1].threshold);
    }
  });
});

describe('nextThreshold', () => {
  it('at phase 0 next is 10_000', () => expect(nextThreshold(0)).toBe(10_000));
  it('at phase 3 returns null (final)', () => expect(nextThreshold(3)).toBeNull());
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run core/pet/stages.test.ts
```

- [ ] **Step 3: Implement `core/pet/stages.ts`**

```ts
import type { Phase } from '../types';

export interface StageDef {
  phase: Phase;
  name: string;
  threshold: number; // lifetimeXP required to ENTER this phase
}

export const STAGES: readonly StageDef[] = [
  { phase: 0, name: 'Egg',       threshold: 0 },
  { phase: 1, name: 'Baby',      threshold: 10_000 },
  { phase: 2, name: 'Middle',    threshold: 300_000 },
  { phase: 3, name: 'Final',     threshold: 3_000_000 }
] as const;

export function phaseForXP(xp: number): Phase {
  let current: Phase = 0;
  for (const s of STAGES) if (xp >= s.threshold) current = s.phase;
  return current;
}

export function nextThreshold(phase: Phase): number | null {
  const idx = STAGES.findIndex(s => s.phase === phase);
  const next = STAGES[idx + 1];
  return next ? next.threshold : null;
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
npx vitest run core/pet/stages.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add core/pet/
git commit -m "feat(pet): phase/stage table (3-phase + egg)"
```

---

## Task 5: Condition decay/gain math

**Files:**
- Create: `core/pet/condition.ts`, `core/pet/condition.test.ts`

- [ ] **Step 1: Write `core/pet/condition.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { applyDecay, applyGain, moodForCondition, MAX_DECAY_MS } from './condition';

describe('applyGain', () => {
  it('adds nutrition * 0.001', () => {
    expect(applyGain(0, 50_000)).toBe(50);
  });
  it('caps at 100', () => {
    expect(applyGain(90, 50_000)).toBe(100);
  });
  it('never below 0', () => {
    expect(applyGain(-5, 0)).toBe(0);
  });
});

describe('applyDecay', () => {
  it('1 minute → loses ~0.0694 (100/(24*60))', () => {
    expect(applyDecay(100, 60_000)).toBeCloseTo(100 - 100 / (24 * 60), 4);
  });
  it('24h → reaches 0', () => {
    expect(applyDecay(100, 24 * 60 * 60 * 1000)).toBeCloseTo(0, 4);
  });
  it('floors at 0', () => {
    expect(applyDecay(10, 48 * 60 * 60 * 1000)).toBe(0);
  });
  it('caps elapsed at MAX_DECAY_MS (24h)', () => {
    // 7-day sleep should not over-decay
    expect(applyDecay(100, 7 * 24 * 60 * 60 * 1000)).toBe(0);
    expect(MAX_DECAY_MS).toBe(24 * 60 * 60 * 1000);
  });
});

describe('moodForCondition', () => {
  it('≥70 happy', () => expect(moodForCondition(80)).toBe('happy'));
  it('30..70 normal', () => expect(moodForCondition(50)).toBe('normal'));
  it('10..30 sleepy', () => expect(moodForCondition(20)).toBe('sleepy'));
  it('<10 sad', () => expect(moodForCondition(5)).toBe('sad'));
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run core/pet/condition.test.ts
```

- [ ] **Step 3: Implement `core/pet/condition.ts`**

```ts
import type { Mood } from '../types';

export const MAX_CONDITION = 100;
export const GAIN_PER_NUTRITION = 0.001;
export const DECAY_PER_MS = MAX_CONDITION / (24 * 60 * 60 * 1000); // → 0 in 24h
export const MAX_DECAY_MS = 24 * 60 * 60 * 1000;

export function applyGain(current: number, nutrition: number): number {
  const next = Math.max(0, current) + Math.max(0, nutrition) * GAIN_PER_NUTRITION;
  return Math.min(MAX_CONDITION, next);
}

export function applyDecay(current: number, elapsedMs: number): number {
  const clamped = Math.min(Math.max(0, elapsedMs), MAX_DECAY_MS);
  return Math.max(0, current - clamped * DECAY_PER_MS);
}

export function moodForCondition(c: number): Mood {
  if (c >= 70) return 'happy';
  if (c >= 30) return 'normal';
  if (c >= 10) return 'sleepy';
  return 'sad';
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
npx vitest run core/pet/condition.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add core/pet/condition.ts core/pet/condition.test.ts
git commit -m "feat(pet): condition decay/gain math"
```

---

## Task 6: PetState FSM

**Files:**
- Create: `core/pet/PetState.ts`, `core/pet/PetState.test.ts`

- [ ] **Step 1: Write `core/pet/PetState.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { PetState } from './PetState';
import type { PetEvent } from '../types';

const baseSnap = {
  schemaVersion: 1,
  createdAt: 0,
  lifetimeXP: 0,
  phase: 0 as const,
  condition: 50,
  mood: 'normal' as const,
  lastTickAt: 0,
  lastFedAt: null,
  lastCursors: {},
  windowPos: { x: 0, y: 0 }
};

describe('PetState.feed', () => {
  let pet: PetState;
  let captured: PetEvent[];

  beforeEach(() => {
    pet = new PetState({ ...baseSnap }, { now: () => 1_000 });
    captured = [];
    pet.on(e => captured.push(e));
  });

  it('emits fed event with nutrition', () => {
    pet.feed(500);
    expect(captured.find(e => e.type === 'fed')).toMatchObject({ type: 'fed', nutrition: 500 });
  });

  it('accumulates lifetimeXP', () => {
    pet.feed(500);
    pet.feed(300);
    expect(pet.snapshot.lifetimeXP).toBe(800);
  });

  it('boosts condition by nutrition * 0.001', () => {
    pet.feed(10_000);
    expect(pet.snapshot.condition).toBeCloseTo(60, 4);
  });

  it('emits evolved when crossing phase threshold', () => {
    pet.feed(9_999);
    expect(captured.some(e => e.type === 'evolved')).toBe(false);
    pet.feed(2);
    const evo = captured.find(e => e.type === 'evolved');
    expect(evo).toMatchObject({ type: 'evolved', from: 0, to: 1 });
  });

  it('emits mood-changed when crossing threshold', () => {
    pet.feed(25_000); // condition: 50 + 25 = 75 → happy
    expect(captured.some(e => e.type === 'mood-changed' && e.to === 'happy')).toBe(true);
  });

  it('updates lastFedAt to now', () => {
    pet.feed(100);
    expect(pet.snapshot.lastFedAt).toBe(1_000);
  });
});

describe('PetState.tick', () => {
  it('decays condition since lastTickAt', () => {
    const pet = new PetState(
      { ...baseSnap, condition: 100, lastTickAt: 0 },
      { now: () => 60_000 } // 1 minute later
    );
    pet.tick();
    expect(pet.snapshot.condition).toBeCloseTo(100 - 100 / (24 * 60), 4);
    expect(pet.snapshot.lastTickAt).toBe(60_000);
  });

  it('caps decay at 24h even after long sleep', () => {
    const pet = new PetState(
      { ...baseSnap, condition: 100, lastTickAt: 0 },
      { now: () => 7 * 24 * 60 * 60 * 1000 }
    );
    pet.tick();
    expect(pet.snapshot.condition).toBe(0);
  });
});

describe('PetState construction', () => {
  it('recomputes phase from lifetimeXP on load (defensive)', () => {
    const pet = new PetState({ ...baseSnap, lifetimeXP: 500_000, phase: 0 }, { now: () => 0 });
    expect(pet.snapshot.phase).toBe(2);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run core/pet/PetState.test.ts
```

- [ ] **Step 3: Implement `core/pet/PetState.ts`**

```ts
import type { PetSnapshot, PetEvent, Mood, Phase } from '../types';
import { phaseForXP } from './stages';
import { applyDecay, applyGain, moodForCondition } from './condition';

export interface PetClock {
  now: () => number;
}

export class PetState {
  private snap: PetSnapshot;
  private listeners = new Set<(e: PetEvent) => void>();

  constructor(initial: PetSnapshot, private clock: PetClock = { now: Date.now }) {
    // Defensive: ensure phase matches lifetimeXP
    this.snap = { ...initial, phase: phaseForXP(initial.lifetimeXP) };
  }

  get snapshot(): PetSnapshot {
    return { ...this.snap };
  }

  on(cb: (e: PetEvent) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(e: PetEvent): void {
    for (const cb of this.listeners) cb(e);
  }

  feed(nutrition: number): void {
    if (nutrition <= 0) return;
    const now = this.clock.now();
    const prevPhase = this.snap.phase;
    const prevMood = this.snap.mood;

    this.snap.lifetimeXP += nutrition;
    this.snap.condition = applyGain(this.snap.condition, nutrition);
    this.snap.lastFedAt = now;
    this.snap.phase = phaseForXP(this.snap.lifetimeXP);
    this.snap.mood = moodForCondition(this.snap.condition);

    this.emit({ type: 'fed', nutrition, ts: now });
    if (this.snap.phase !== prevPhase) {
      this.emit({ type: 'evolved', from: prevPhase, to: this.snap.phase, ts: now });
    }
    if (this.snap.mood !== prevMood) {
      this.emit({ type: 'mood-changed', from: prevMood, to: this.snap.mood, ts: now });
    }
  }

  tick(): void {
    const now = this.clock.now();
    const elapsed = now - this.snap.lastTickAt;
    if (elapsed <= 0) return;
    const prevMood = this.snap.mood;
    this.snap.condition = applyDecay(this.snap.condition, elapsed);
    this.snap.lastTickAt = now;
    this.snap.mood = moodForCondition(this.snap.condition);
    if (this.snap.mood !== prevMood) {
      this.emit({ type: 'mood-changed', from: prevMood, to: this.snap.mood, ts: now });
    }
  }

  /** Replace internal snapshot wholesale (used by storage layer). */
  load(s: PetSnapshot): void {
    this.snap = { ...s, phase: phaseForXP(s.lifetimeXP) };
    this.emit({ type: 'snapshot', snapshot: this.snapshot });
  }
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
npx vitest run core/pet/PetState.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add core/pet/PetState.ts core/pet/PetState.test.ts
git commit -m "feat(pet): PetState FSM with fed/evolved/mood events"
```

---

## Task 7: TokenSource interface + registry

**Files:**
- Create: `core/tokenSource/TokenSource.ts`, `core/tokenSource/registry.ts`, `core/tokenSource/registry.test.ts`

- [ ] **Step 1: Write `core/tokenSource/registry.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest';
import { SourceRegistry } from './registry';
import type { TokenSource } from './TokenSource';
import type { TokenEvent } from '../types';

function fakeSource(id: string): TokenSource & { fire: (e: TokenEvent) => void } {
  let emit: ((e: TokenEvent) => void) | null = null;
  return {
    id,
    start: async (cb) => { emit = cb; },
    stop: async () => { emit = null; },
    fire: (e) => emit?.(e)
  };
}

describe('SourceRegistry', () => {
  it('starts all sources and forwards events to listener', async () => {
    const a = fakeSource('a'), b = fakeSource('b');
    const reg = new SourceRegistry([a, b]);
    const seen: TokenEvent[] = [];
    await reg.start(e => seen.push(e));
    a.fire({ sourceId: 'a', sessionId: 's', cursor: '1', ts: 1,
             tokens: { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 } });
    b.fire({ sourceId: 'b', sessionId: 's', cursor: '1', ts: 2,
             tokens: { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 } });
    expect(seen.map(e => e.sourceId)).toEqual(['a', 'b']);
  });

  it('stop calls stop on all sources', async () => {
    const a = fakeSource('a');
    a.stop = vi.fn(async () => {});
    const reg = new SourceRegistry([a]);
    await reg.start(() => {});
    await reg.stop();
    expect(a.stop).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run core/tokenSource/registry.test.ts
```

- [ ] **Step 3: Implement `core/tokenSource/TokenSource.ts`**

```ts
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
```

- [ ] **Step 4: Implement `core/tokenSource/registry.ts`**

```ts
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
```

- [ ] **Step 5: Run — expect PASS**

```bash
npx vitest run core/tokenSource/registry.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add core/tokenSource/TokenSource.ts core/tokenSource/registry.ts core/tokenSource/registry.test.ts
git commit -m "feat(tokenSource): interface and registry"
```

---

## Task 8: Storage paths helper

**Files:**
- Create: `core/storage/paths.ts`, `core/storage/paths.test.ts`

- [ ] **Step 1: Write `core/storage/paths.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { resolveStoragePaths } from './paths';

describe('resolveStoragePaths', () => {
  it('returns petStateFile and eventsDbFile under given dir', () => {
    const p = resolveStoragePaths('/tmp/pet');
    expect(p.petStateFile).toBe('/tmp/pet/pet-state.json');
    expect(p.eventsDbFile).toBe('/tmp/pet/events.sqlite');
    expect(p.runtimeDir).toBe('/tmp/pet');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run core/storage/paths.test.ts
```

- [ ] **Step 3: Implement `core/storage/paths.ts`**

```ts
import path from 'node:path';

export interface StoragePaths {
  runtimeDir: string;
  petStateFile: string;
  eventsDbFile: string;
}

export function resolveStoragePaths(userDataDir: string): StoragePaths {
  return {
    runtimeDir: userDataDir,
    petStateFile: path.join(userDataDir, 'pet-state.json'),
    eventsDbFile: path.join(userDataDir, 'events.sqlite')
  };
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
npx vitest run core/storage/paths.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add core/storage/paths.ts core/storage/paths.test.ts
git commit -m "feat(storage): paths helper"
```

---

## Task 9: pet-state.json persistence (atomic write + debounce)

**Files:**
- Create: `core/storage/petState.ts`, `core/storage/petState.test.ts`

- [ ] **Step 1: Write `core/storage/petState.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
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
    require('node:fs').writeFileSync(file, JSON.stringify({ schemaVersion: 1, lifetimeXP: 10 }));
    const back = loadPetState(file, () => 0);
    expect(back.lifetimeXP).toBe(10);
    expect(back.condition).toBe(50);
    expect(back.phase).toBe(0);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run core/storage/petState.test.ts
```

- [ ] **Step 3: Implement `core/storage/petState.ts`**

```ts
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
```

- [ ] **Step 4: Run — expect PASS**

```bash
npx vitest run core/storage/petState.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add core/storage/petState.ts core/storage/petState.test.ts
git commit -m "feat(storage): pet-state.json atomic + debounced save"
```

---

## Task 10: events.sqlite + dedup

**Files:**
- Create: `core/storage/eventsDb.ts`, `core/storage/eventsDb.test.ts`

- [ ] **Step 1: Write `core/storage/eventsDb.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { EventsDb } from './eventsDb';
import type { TokenEvent } from '../types';

function mkEvent(over: Partial<TokenEvent> = {}): TokenEvent {
  return {
    sourceId: 'claude-statusline',
    sessionId: 'sess-1',
    cursor: 'c1',
    ts: 1000,
    tokens: { input: 10, output: 20, cacheRead: 0, cacheCreate: 0 },
    dedupKey: { messageId: 'm1', requestId: 'r1' },
    ...over
  };
}

describe('EventsDb', () => {
  let dir: string, db: EventsDb;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'db-'));
    db = new EventsDb(path.join(dir, 'events.sqlite'));
  });
  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('insert returns true on new event', () => {
    expect(db.insert(mkEvent())).toBe(true);
  });

  it('insert returns false on duplicate (same messageId+requestId)', () => {
    db.insert(mkEvent());
    expect(db.insert(mkEvent())).toBe(false);
  });

  it('different requestId allows insert', () => {
    db.insert(mkEvent({ dedupKey: { messageId: 'm1', requestId: 'r1' } }));
    expect(db.insert(mkEvent({ dedupKey: { messageId: 'm1', requestId: 'r2' } }))).toBe(true);
  });

  it('no dedupKey → always inserts (no dedup possible)', () => {
    const e: TokenEvent = mkEvent({ dedupKey: undefined });
    expect(db.insert(e)).toBe(true);
    expect(db.insert(e)).toBe(true);
  });

  it('sumSince returns input/output totals', () => {
    db.insert(mkEvent({ dedupKey: { messageId: 'a', requestId: '1' },
      tokens: { input: 100, output: 200, cacheRead: 0, cacheCreate: 0 } }));
    db.insert(mkEvent({ dedupKey: { messageId: 'b', requestId: '1' },
      tokens: { input: 50, output: 50, cacheRead: 0, cacheCreate: 0 } }));
    const sum = db.sumSince(0);
    expect(sum.input).toBe(150);
    expect(sum.output).toBe(250);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run core/storage/eventsDb.test.ts
```

- [ ] **Step 3: Implement `core/storage/eventsDb.ts`**

```ts
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import type { TokenEvent } from '../types';

export interface TokenSum {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreate: number;
}

export class EventsDb {
  private db: Database.Database;
  private insertStmt: Database.Statement;
  private sumStmt: Database.Statement;

  constructor(file: string) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    this.db = new Database(file);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        source TEXT NOT NULL,
        session_id TEXT NOT NULL,
        message_id TEXT,
        request_id TEXT,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        cache_read INTEGER NOT NULL DEFAULT 0,
        cache_create INTEGER NOT NULL DEFAULT 0,
        cost_usd REAL,
        model TEXT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_dedup
        ON events(message_id, request_id)
        WHERE message_id IS NOT NULL AND request_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_ts ON events(ts);
    `);
    this.insertStmt = this.db.prepare(`
      INSERT INTO events
        (ts, source, session_id, message_id, request_id,
         input_tokens, output_tokens, cache_read, cache_create, cost_usd, model)
      VALUES (@ts, @source, @session_id, @message_id, @request_id,
              @input_tokens, @output_tokens, @cache_read, @cache_create, @cost_usd, @model)
    `);
    this.sumStmt = this.db.prepare(`
      SELECT
        COALESCE(SUM(input_tokens),0)  AS input,
        COALESCE(SUM(output_tokens),0) AS output,
        COALESCE(SUM(cache_read),0)    AS cacheRead,
        COALESCE(SUM(cache_create),0)  AS cacheCreate
      FROM events WHERE ts >= ?
    `);
  }

  insert(e: TokenEvent): boolean {
    try {
      this.insertStmt.run({
        ts: e.ts,
        source: e.sourceId,
        session_id: e.sessionId,
        message_id: e.dedupKey?.messageId ?? null,
        request_id: e.dedupKey?.requestId ?? null,
        input_tokens: e.tokens.input,
        output_tokens: e.tokens.output,
        cache_read: e.tokens.cacheRead,
        cache_create: e.tokens.cacheCreate,
        cost_usd: e.costUsd ?? null,
        model: e.model ?? null
      });
      return true;
    } catch (err: any) {
      if (String(err.code) === 'SQLITE_CONSTRAINT_UNIQUE') return false;
      throw err;
    }
  }

  sumSince(ts: number): TokenSum {
    return this.sumStmt.get(ts) as TokenSum;
  }

  close(): void {
    this.db.close();
  }
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
npx vitest run core/storage/eventsDb.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add core/storage/eventsDb.ts core/storage/eventsDb.test.ts
git commit -m "feat(storage): events.sqlite with dedup index"
```

---

## Task 11: FeedingPipeline (dedup + nutrition + feed)

**Files:**
- Create: `core/feeding/FeedingPipeline.ts`, `core/feeding/FeedingPipeline.test.ts`

- [ ] **Step 1: Write `core/feeding/FeedingPipeline.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { FeedingPipeline } from './FeedingPipeline';
import { EventsDb } from '../storage/eventsDb';
import { PetState } from '../pet/PetState';
import { makeDefaultSnapshot } from '../storage/petState';
import type { TokenEvent, PetEvent } from '../types';

function mkEvent(over: Partial<TokenEvent> = {}): TokenEvent {
  return {
    sourceId: 'claude-statusline',
    sessionId: 's',
    cursor: 'c',
    ts: 100,
    tokens: { input: 100, output: 100, cacheRead: 0, cacheCreate: 0 },
    dedupKey: { messageId: 'm1', requestId: 'r1' },
    ...over
  };
}

describe('FeedingPipeline', () => {
  let dir: string, db: EventsDb, pet: PetState, pipe: FeedingPipeline, events: PetEvent[];

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'fp-'));
    db = new EventsDb(path.join(dir, 'events.sqlite'));
    pet = new PetState(makeDefaultSnapshot(0), { now: () => 1000 });
    events = [];
    pet.on(e => events.push(e));
    pipe = new FeedingPipeline(db, pet);
  });

  it('first event feeds the pet', () => {
    pipe.handle(mkEvent());
    expect(events.some(e => e.type === 'fed')).toBe(true);
    expect(pet.snapshot.lifetimeXP).toBe(100 * 1 + 100 * 3);
  });

  it('duplicate (messageId+requestId) does NOT double-feed', () => {
    pipe.handle(mkEvent());
    const xpAfter1 = pet.snapshot.lifetimeXP;
    pipe.handle(mkEvent());
    expect(pet.snapshot.lifetimeXP).toBe(xpAfter1);
  });

  it('different requestId feeds again', () => {
    pipe.handle(mkEvent({ dedupKey: { messageId: 'm1', requestId: 'r1' } }));
    pipe.handle(mkEvent({ dedupKey: { messageId: 'm1', requestId: 'r2' } }));
    expect(pet.snapshot.lifetimeXP).toBe(2 * (100 + 300));
  });

  it('zero-nutrition event does not emit fed', () => {
    events.length = 0;
    pipe.handle(mkEvent({
      tokens: { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 },
      dedupKey: { messageId: 'm2', requestId: 'r2' }
    }));
    expect(events.find(e => e.type === 'fed')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run core/feeding/FeedingPipeline.test.ts
```

- [ ] **Step 3: Implement `core/feeding/FeedingPipeline.ts`**

```ts
import type { TokenEvent } from '../types';
import { tokensToNutrition } from './nutrition';
import type { EventsDb } from '../storage/eventsDb';
import type { PetState } from '../pet/PetState';

export class FeedingPipeline {
  constructor(private db: EventsDb, private pet: PetState) {}

  handle(e: TokenEvent): void {
    const inserted = this.db.insert(e);
    if (!inserted) return;
    const nutrition = tokensToNutrition(e.tokens);
    if (nutrition > 0) this.pet.feed(nutrition);
  }
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
npx vitest run core/feeding/FeedingPipeline.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add core/feeding/FeedingPipeline.ts core/feeding/FeedingPipeline.test.ts
git commit -m "feat(feeding): pipeline with dedup→nutrition→pet"
```

---

## Task 12: Cursor tracking

**Files:**
- Create: `core/storage/cursor.ts`, `core/storage/cursor.test.ts`

- [ ] **Step 1: Write `core/storage/cursor.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { mergeCursor } from './cursor';
import type { CursorRecord } from '../types';

describe('mergeCursor', () => {
  it('merges new fields into existing', () => {
    const prev: CursorRecord = { messageId: 'm1' };
    const next = mergeCursor(prev, { requestId: 'r1' });
    expect(next).toEqual({ messageId: 'm1', requestId: 'r1' });
  });
  it('overwrites file/offset when both present', () => {
    const prev: CursorRecord = { file: '/a.jsonl', lineOffset: 10 };
    const next = mergeCursor(prev, { file: '/b.jsonl', lineOffset: 0 });
    expect(next).toEqual({ file: '/b.jsonl', lineOffset: 0 });
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run core/storage/cursor.test.ts
```

- [ ] **Step 3: Implement `core/storage/cursor.ts`**

```ts
import type { CursorRecord } from '../types';

export function mergeCursor(prev: CursorRecord, next: Partial<CursorRecord>): CursorRecord {
  return { ...prev, ...next };
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
npx vitest run core/storage/cursor.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add core/storage/cursor.ts core/storage/cursor.test.ts
git commit -m "feat(storage): cursor merge helper"
```

---

## Task 13: Claude JSONL parser (pure)

**Files:**
- Create: `core/tokenSource/claudeJsonlParse.ts`, `core/tokenSource/claudeJsonlParse.test.ts`, `core/tokenSource/__tests__/fixtures/sample.jsonl`

- [ ] **Step 1: Create fixture `core/tokenSource/__tests__/fixtures/sample.jsonl`**

```
{"type":"user","sessionId":"sess-A","message":{"id":"u1","role":"user","content":"hi"}}
{"type":"assistant","sessionId":"sess-A","message":{"id":"m1","role":"assistant","content":"hello","usage":{"input_tokens":12,"output_tokens":7,"cache_read_input_tokens":0,"cache_creation_input_tokens":0},"model":"claude-opus-4-7"},"requestId":"r1"}
{"type":"assistant","sessionId":"sess-A","message":{"id":"m2","role":"assistant","usage":{"input_tokens":3,"output_tokens":5,"cache_read_input_tokens":10,"cache_creation_input_tokens":0},"model":"claude-opus-4-7"},"requestId":"r2"}
not-json-this-line-is-broken
{"type":"assistant","sessionId":"sess-A","message":{"id":"m3","role":"assistant","usage":{"input_tokens":0,"output_tokens":0,"cache_read_input_tokens":0,"cache_creation_input_tokens":0},"model":"claude-opus-4-7"},"requestId":"r3"}
```

- [ ] **Step 2: Write `core/tokenSource/claudeJsonlParse.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseClaudeJsonlLine } from './claudeJsonlParse';

const fixture = readFileSync(
  path.join(__dirname, '__tests__/fixtures/sample.jsonl'),
  'utf8'
).split('\n').filter(Boolean);

describe('parseClaudeJsonlLine', () => {
  it('returns null for user-role line', () => {
    expect(parseClaudeJsonlLine(fixture[0], '/tmp/sample.jsonl')).toBeNull();
  });

  it('parses assistant usage into TokenEvent', () => {
    const ev = parseClaudeJsonlLine(fixture[1], '/tmp/sample.jsonl');
    expect(ev).not.toBeNull();
    expect(ev!.sessionId).toBe('sess-A');
    expect(ev!.tokens).toEqual({ input: 12, output: 7, cacheRead: 0, cacheCreate: 0 });
    expect(ev!.dedupKey).toEqual({ messageId: 'm1', requestId: 'r1' });
    expect(ev!.model).toBe('claude-opus-4-7');
  });

  it('parses cache fields', () => {
    const ev = parseClaudeJsonlLine(fixture[2], '/tmp/sample.jsonl')!;
    expect(ev.tokens.cacheRead).toBe(10);
  });

  it('returns null for broken JSON', () => {
    expect(parseClaudeJsonlLine(fixture[3], '/tmp/sample.jsonl')).toBeNull();
  });

  it('still returns event for zero-token assistant line (FeedingPipeline filters)', () => {
    const ev = parseClaudeJsonlLine(fixture[4], '/tmp/sample.jsonl');
    expect(ev).not.toBeNull();
    expect(ev!.tokens.output).toBe(0);
  });
});
```

- [ ] **Step 3: Run — expect FAIL**

```bash
npx vitest run core/tokenSource/claudeJsonlParse.test.ts
```

- [ ] **Step 4: Implement `core/tokenSource/claudeJsonlParse.ts`**

```ts
import type { TokenEvent } from '../types';

interface RawLine {
  type?: string;
  sessionId?: string;
  requestId?: string;
  message?: {
    id?: string;
    role?: string;
    model?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
  };
}

export function parseClaudeJsonlLine(line: string, file: string): TokenEvent | null {
  let raw: RawLine;
  try {
    raw = JSON.parse(line);
  } catch {
    return null;
  }
  if (raw.type !== 'assistant') return null;
  const u = raw.message?.usage;
  if (!u) return null;
  return {
    sourceId: 'claude-jsonl',
    sessionId: raw.sessionId ?? 'unknown',
    cursor: `${file}#${raw.message?.id ?? ''}`,
    ts: Date.now(),
    tokens: {
      input: u.input_tokens ?? 0,
      output: u.output_tokens ?? 0,
      cacheRead: u.cache_read_input_tokens ?? 0,
      cacheCreate: u.cache_creation_input_tokens ?? 0
    },
    model: raw.message?.model,
    dedupKey: {
      messageId: raw.message?.id,
      requestId: raw.requestId
    }
  };
}
```

- [ ] **Step 5: Run — expect PASS**

```bash
npx vitest run core/tokenSource/claudeJsonlParse.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add core/tokenSource/claudeJsonlParse.ts core/tokenSource/claudeJsonlParse.test.ts core/tokenSource/__tests__
git commit -m "feat(claude-jsonl): pure line parser"
```

---

## Task 14: ClaudeJsonlSource (file watcher)

**Files:**
- Create: `core/tokenSource/claudeJsonl.ts`, `core/tokenSource/claudeJsonl.test.ts`

- [ ] **Step 1: Write `core/tokenSource/claudeJsonl.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ClaudeJsonlSource } from './claudeJsonl';
import type { TokenEvent } from '../types';

function waitMs(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

describe('ClaudeJsonlSource', () => {
  let root: string, src: ClaudeJsonlSource | null = null;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'jsonl-'));
    mkdirSync(path.join(root, 'projects', 'proj1'), { recursive: true });
  });

  afterEach(async () => {
    if (src) await src.stop();
    src = null;
    rmSync(root, { recursive: true, force: true });
  });

  it('backfills existing files on start', async () => {
    const file = path.join(root, 'projects', 'proj1', 'sess.jsonl');
    writeFileSync(file, JSON.stringify({
      type: 'assistant',
      sessionId: 'sess-1',
      requestId: 'r1',
      message: { id: 'm1', role: 'assistant',
        usage: { input_tokens: 5, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }
    }) + '\n');

    const events: TokenEvent[] = [];
    src = new ClaudeJsonlSource(root);
    await src.start(e => events.push(e));
    await waitMs(200);
    expect(events.length).toBe(1);
    expect(events[0].dedupKey?.messageId).toBe('m1');
  });

  it('detects appended lines after start', async () => {
    const file = path.join(root, 'projects', 'proj1', 'sess.jsonl');
    writeFileSync(file, '');
    const events: TokenEvent[] = [];
    src = new ClaudeJsonlSource(root);
    await src.start(e => events.push(e));
    await waitMs(150);

    appendFileSync(file, JSON.stringify({
      type: 'assistant',
      sessionId: 'sess-1',
      requestId: 'r2',
      message: { id: 'm2', role: 'assistant',
        usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }
    }) + '\n');
    await waitMs(300);
    expect(events.some(e => e.dedupKey?.messageId === 'm2')).toBe(true);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run core/tokenSource/claudeJsonl.test.ts
```

- [ ] **Step 3: Implement `core/tokenSource/claudeJsonl.ts`**

```ts
import fs from 'node:fs';
import path from 'node:path';
import chokidar, { FSWatcher } from 'chokidar';
import type { TokenSource } from './TokenSource';
import type { TokenEvent } from '../types';
import { parseClaudeJsonlLine } from './claudeJsonlParse';

/** Per-file read state (offset into the file in bytes). */
interface FileState {
  offset: number;
}

export class ClaudeJsonlSource implements TokenSource {
  readonly id = 'claude-jsonl';
  private watcher: FSWatcher | null = null;
  private state = new Map<string, FileState>();
  private emit: ((e: TokenEvent) => void) | null = null;

  constructor(private claudeHome: string) {}

  async start(emit: (e: TokenEvent) => void): Promise<void> {
    this.emit = emit;
    const glob = path.join(this.claudeHome, 'projects', '**', '*.jsonl');
    this.watcher = chokidar.watch(glob, {
      ignoreInitial: false,
      awaitWriteFinish: { stabilityThreshold: 50, pollInterval: 50 }
    });
    this.watcher.on('add', f => this.readNew(f));
    this.watcher.on('change', f => this.readNew(f));
  }

  async stop(): Promise<void> {
    await this.watcher?.close();
    this.watcher = null;
    this.emit = null;
  }

  private readNew(file: string): void {
    if (!this.emit) return;
    let stat: fs.Stats;
    try { stat = fs.statSync(file); } catch { return; }
    const prev = this.state.get(file)?.offset ?? 0;
    if (stat.size < prev) {
      // truncate / rotate
      this.state.set(file, { offset: 0 });
      return this.readNew(file);
    }
    if (stat.size === prev) return;
    const fd = fs.openSync(file, 'r');
    try {
      const buf = Buffer.alloc(stat.size - prev);
      fs.readSync(fd, buf, 0, buf.length, prev);
      const text = buf.toString('utf8');
      const lines = text.split('\n');
      // last element may be partial line; only advance offset to before it
      const complete = lines.slice(0, -1);
      const trailingPartialBytes = Buffer.byteLength(lines[lines.length - 1], 'utf8');
      const newOffset = stat.size - trailingPartialBytes;
      for (const line of complete) {
        if (!line) continue;
        const ev = parseClaudeJsonlLine(line, file);
        if (ev) this.emit(ev);
      }
      this.state.set(file, { offset: newOffset });
    } finally {
      fs.closeSync(fd);
    }
  }
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
npx vitest run core/tokenSource/claudeJsonl.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add core/tokenSource/claudeJsonl.ts core/tokenSource/claudeJsonl.test.ts
git commit -m "feat(claude-jsonl): file watcher source"
```

---

## Task 15: ClaudeStatusLineSource (HTTP receiver)

**Files:**
- Create: `core/tokenSource/claudeStatusLine.ts`, `core/tokenSource/claudeStatusLine.test.ts`

- [ ] **Step 1: Write `core/tokenSource/claudeStatusLine.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ClaudeStatusLineSource } from './claudeStatusLine';
import type { TokenEvent } from '../types';

describe('ClaudeStatusLineSource', () => {
  let src: ClaudeStatusLineSource;

  beforeEach(() => {
    src = new ClaudeStatusLineSource('test-token');
  });
  afterEach(async () => { await src.stop(); });

  it('starts and exposes port + token', async () => {
    await src.start(() => {});
    expect(src.port).toBeGreaterThan(0);
    expect(src.token).toBe('test-token');
  });

  it('accepts POST with valid token and emits TokenEvent', async () => {
    const events: TokenEvent[] = [];
    await src.start(e => events.push(e));
    const body = {
      session_id: 'sess-X',
      transcript_path: '/tmp/transcript.jsonl',
      current_usage: {
        input_tokens: 11,
        output_tokens: 22,
        cache_read_input_tokens: 3,
        cache_creation_input_tokens: 4
      },
      message_id: 'mX',
      request_id: 'rX',
      model: { id: 'claude-opus-4-7' },
      cost: { total_cost_usd: 0.0042 }
    };
    const res = await fetch(`http://127.0.0.1:${src.port}/event`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-pet-token': 'test-token' },
      body: JSON.stringify(body)
    });
    expect(res.status).toBe(204);
    expect(events.length).toBe(1);
    expect(events[0].tokens.output).toBe(22);
    expect(events[0].dedupKey?.messageId).toBe('mX');
    expect(events[0].costUsd).toBeCloseTo(0.0042);
  });

  it('rejects POST with wrong token', async () => {
    await src.start(() => {});
    const res = await fetch(`http://127.0.0.1:${src.port}/event`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-pet-token': 'bad' },
      body: '{}'
    });
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run core/tokenSource/claudeStatusLine.test.ts
```

- [ ] **Step 3: Implement `core/tokenSource/claudeStatusLine.ts`**

```ts
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { TokenSource } from './TokenSource';
import type { TokenEvent } from '../types';

interface StatusLinePayload {
  session_id?: string;
  transcript_path?: string;
  message_id?: string;
  request_id?: string;
  current_usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  model?: { id?: string };
  cost?: { total_cost_usd?: number };
}

export class ClaudeStatusLineSource implements TokenSource {
  readonly id = 'claude-statusline';
  private server: http.Server | null = null;
  private emit: ((e: TokenEvent) => void) | null = null;
  public port = 0;

  constructor(public readonly token: string) {}

  async start(emit: (e: TokenEvent) => void): Promise<void> {
    this.emit = emit;
    this.server = http.createServer((req, res) => this.handle(req, res));
    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject);
      this.server!.listen(0, '127.0.0.1', () => {
        this.port = (this.server!.address() as AddressInfo).port;
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    await new Promise<void>(r => this.server?.close(() => r()));
    this.server = null;
    this.emit = null;
    this.port = 0;
  }

  private handle(req: http.IncomingMessage, res: http.ServerResponse): void {
    if (req.method !== 'POST' || req.url !== '/event') {
      res.statusCode = 404; return res.end();
    }
    if (req.headers['x-pet-token'] !== this.token) {
      res.statusCode = 401; return res.end();
    }
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      let payload: StatusLinePayload;
      try { payload = JSON.parse(body); }
      catch { res.statusCode = 400; return res.end(); }
      const u = payload.current_usage ?? {};
      const ev: TokenEvent = {
        sourceId: this.id,
        sessionId: payload.session_id ?? 'unknown',
        cursor: payload.transcript_path ?? '',
        ts: Date.now(),
        tokens: {
          input: u.input_tokens ?? 0,
          output: u.output_tokens ?? 0,
          cacheRead: u.cache_read_input_tokens ?? 0,
          cacheCreate: u.cache_creation_input_tokens ?? 0
        },
        model: payload.model?.id,
        costUsd: payload.cost?.total_cost_usd,
        dedupKey: { messageId: payload.message_id, requestId: payload.request_id }
      };
      this.emit?.(ev);
      res.statusCode = 204;
      res.end();
    });
  }
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
npx vitest run core/tokenSource/claudeStatusLine.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add core/tokenSource/claudeStatusLine.ts core/tokenSource/claudeStatusLine.test.ts
git commit -m "feat(claude-statusline): HTTP receiver source"
```

---

## Task 16: statusLine shim script

**Files:**
- Create: `scripts/statusline-shim.cjs`

- [ ] **Step 1: Write `scripts/statusline-shim.cjs`**

```js
#!/usr/bin/env node
// Token-eater-pet statusLine shim.
// Claude Code invokes this on every assistant turn and pipes a JSON payload via stdin.
// We forward it to the local pet daemon (best-effort, 1s timeout, never block Claude).

const http = require('node:http');

const PORT  = process.env.PET_PORT  || '';
const TOKEN = process.env.PET_TOKEN || '';

let stdin = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', c => { stdin += c; });
process.stdin.on('end', () => {
  // Always print SOMETHING short to stdout so statusLine is not broken
  process.stdout.write('🐾');
  if (!PORT || !TOKEN || !stdin) return process.exit(0);

  const req = http.request({
    method: 'POST',
    host: '127.0.0.1',
    port: Number(PORT),
    path: '/event',
    headers: {
      'content-type': 'application/json',
      'x-pet-token':  TOKEN,
      'content-length': Buffer.byteLength(stdin)
    },
    timeout: 1000
  }, res => { res.resume(); });
  req.on('error', () => {});       // pet not running — fine
  req.on('timeout', () => req.destroy());
  req.write(stdin);
  req.end();
});
```

- [ ] **Step 2: Verify syntax**

```bash
node --check scripts/statusline-shim.cjs
```

- [ ] **Step 3: Commit**

```bash
git add scripts/statusline-shim.cjs
git commit -m "feat(shim): statusLine forwarder script"
```

---

## Task 17: statusLine installer (settings.json patcher)

**Files:**
- Create: `installers/statusLine.ts`, `installers/statusLine.test.ts`

- [ ] **Step 1: Write `installers/statusLine.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { installStatusLine, uninstallStatusLine } from './statusLine';

describe('installStatusLine', () => {
  let claudeHome: string, settings: string;

  beforeEach(() => {
    claudeHome = mkdtempSync(path.join(tmpdir(), 'claude-'));
    settings = path.join(claudeHome, 'settings.json');
  });

  it('creates settings.json when missing', () => {
    installStatusLine({
      claudeHome,
      shimPath: '/abs/shim.cjs',
      port: 12345,
      token: 't1'
    });
    const cfg = JSON.parse(readFileSync(settings, 'utf8'));
    expect(cfg.statusLine.type).toBe('command');
    expect(cfg.statusLine.command).toContain('shim.cjs');
    expect(cfg.statusLine.env.PET_PORT).toBe('12345');
    expect(cfg.statusLine.env.PET_TOKEN).toBe('t1');
  });

  it('merges into existing settings.json without clobbering other keys', () => {
    writeFileSync(settings, JSON.stringify({ theme: 'dark', model: 'opus' }));
    installStatusLine({ claudeHome, shimPath: '/x.cjs', port: 1, token: 't' });
    const cfg = JSON.parse(readFileSync(settings, 'utf8'));
    expect(cfg.theme).toBe('dark');
    expect(cfg.model).toBe('opus');
    expect(cfg.statusLine).toBeDefined();
  });

  it('uninstall removes only the statusLine key', () => {
    writeFileSync(settings, JSON.stringify({ theme: 'dark', statusLine: { type: 'command' } }));
    uninstallStatusLine(claudeHome);
    const cfg = JSON.parse(readFileSync(settings, 'utf8'));
    expect(cfg.statusLine).toBeUndefined();
    expect(cfg.theme).toBe('dark');
  });

  it('uninstall is a no-op when settings missing', () => {
    expect(() => uninstallStatusLine(claudeHome)).not.toThrow();
    expect(existsSync(settings)).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run installers/statusLine.test.ts
```

- [ ] **Step 3: Implement `installers/statusLine.ts`**

```ts
import fs from 'node:fs';
import path from 'node:path';

export interface InstallOpts {
  claudeHome: string;     // typically ~/.claude
  shimPath:   string;     // absolute path to statusline-shim.cjs
  port:       number;
  token:      string;
}

function settingsPath(claudeHome: string): string {
  return path.join(claudeHome, 'settings.json');
}

function readSettings(file: string): Record<string, unknown> {
  if (!fs.existsSync(file)) return {};
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return {}; }
}

function writeSettings(file: string, cfg: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2));
  fs.renameSync(tmp, file);
}

export function installStatusLine(opts: InstallOpts): void {
  const file = settingsPath(opts.claudeHome);
  const cfg = readSettings(file);
  cfg.statusLine = {
    type: 'command',
    command: `node ${JSON.stringify(opts.shimPath)}`,
    env: {
      PET_PORT:  String(opts.port),
      PET_TOKEN: opts.token
    }
  };
  writeSettings(file, cfg);
}

export function uninstallStatusLine(claudeHome: string): void {
  const file = settingsPath(claudeHome);
  if (!fs.existsSync(file)) return;
  const cfg = readSettings(file);
  delete cfg.statusLine;
  writeSettings(file, cfg);
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
npx vitest run installers/statusLine.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add installers/
git commit -m "feat(installers): claude statusLine settings.json patcher"
```

---

## Task 18: Electron main + transparent window

**Files:**
- Create: `electron/main.ts`, `electron/window.ts`

- [ ] **Step 1: Write `electron/window.ts`**

```ts
import { BrowserWindow, screen } from 'electron';
import path from 'node:path';

export interface WindowOpts {
  preloadPath: string;
  rendererUrl: string | null;   // dev: http://localhost:PORT
  rendererFile: string | null;  // prod: built index.html
  pos: { x: number; y: number };
}

export function createPetWindow(opts: WindowOpts): BrowserWindow {
  const display = screen.getPrimaryDisplay();
  const safeX = Math.min(Math.max(0, opts.pos.x), display.workAreaSize.width  - 200);
  const safeY = Math.min(Math.max(0, opts.pos.y), display.workAreaSize.height - 200);

  const win = new BrowserWindow({
    width: 220,
    height: 220,
    x: safeX,
    y: safeY,
    transparent: true,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: opts.preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  if (opts.rendererUrl) win.loadURL(opts.rendererUrl);
  else if (opts.rendererFile) win.loadFile(opts.rendererFile);
  return win;
}
```

- [ ] **Step 2: Write `electron/main.ts` (skeleton, full wiring in Task 22)**

```ts
import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { createPetWindow } from './window';

let mainWindow: BrowserWindow | null = null;

app.whenReady().then(async () => {
  const devUrl = process.env.VITE_DEV_SERVER_URL ?? null;
  const indexHtml = path.join(__dirname, '../dist/index.html');
  mainWindow = createPetWindow({
    preloadPath: path.join(__dirname, 'preload.js'),
    rendererUrl: devUrl,
    rendererFile: devUrl ? null : indexHtml,
    pos: { x: 1500, y: 80 }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

- [ ] **Step 3: Run dev to verify window appears**

```bash
npm run dev
```
Expected: a small transparent window appears top-right. (Renderer is blank — that's fine.)

Stop with Ctrl+C.

- [ ] **Step 4: Commit**

```bash
git add electron/window.ts electron/main.ts
git commit -m "feat(electron): always-on-top transparent pet window"
```

---

## Task 19: IPC bridge (main ↔ renderer)

**Files:**
- Create: `electron/ipc.ts`

- [ ] **Step 1: Write `electron/ipc.ts`**

```ts
import { ipcMain, BrowserWindow } from 'electron';
import type { PetState } from '../core/pet/PetState';
import type { PetEvent } from '../core/types';

export function wireIpc(win: BrowserWindow, pet: PetState): () => void {
  const handleGet = () => pet.snapshot;
  ipcMain.handle('pet:getSnapshot', handleGet);

  const unsub = pet.on((e: PetEvent) => {
    if (!win.isDestroyed()) win.webContents.send('pet:event', e);
  });

  return () => {
    ipcMain.removeHandler('pet:getSnapshot');
    unsub();
  };
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npx tsc --noEmit
```
Expected: PASS. (`wireIpc` is unused until Task 22 imports it — TypeScript permits unused exports.)

- [ ] **Step 3: Commit**

```bash
git add electron/ipc.ts electron/main.ts
git commit -m "feat(electron): IPC bridge for pet events + snapshot"
```

---

## Task 20: Tray menu (Reset / Wipe / Quit)

**Files:**
- Create: `electron/tray.ts`

- [ ] **Step 1: Write `electron/tray.ts`**

```ts
import { Tray, Menu, dialog, nativeImage } from 'electron';

export interface TrayCallbacks {
  onResetPet:   () => void;
  onWipeAll:    () => void;
  onShowStats:  () => void;
  onQuit:       () => void;
}

export function createTray(cb: TrayCallbacks): Tray {
  const icon = nativeImage.createFromNamedImage('NSImageNameMobileMe', [0, 0, 16, 16]);
  const tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip('Token Eater Pet');
  const menu = Menu.buildFromTemplate([
    { label: 'Show Stats',  click: cb.onShowStats },
    { type: 'separator' },
    { label: 'Reset Pet',   click: () => {
        const choice = dialog.showMessageBoxSync({
          type: 'warning',
          message: 'Reset pet?',
          detail: 'Pet state (XP, phase, condition) will reset. Event history kept.',
          buttons: ['Cancel', 'Reset'],
          defaultId: 0, cancelId: 0
        });
        if (choice === 1) cb.onResetPet();
      }
    },
    { label: 'Wipe Everything', click: () => {
        const choice = dialog.showMessageBoxSync({
          type: 'warning',
          message: 'Wipe everything?',
          detail: 'This deletes pet state AND event history.',
          buttons: ['Cancel', 'Wipe'],
          defaultId: 0, cancelId: 0
        });
        if (choice === 1) cb.onWipeAll();
      }
    },
    { type: 'separator' },
    { label: 'Quit', click: cb.onQuit }
  ]);
  tray.setContextMenu(menu);
  return tray;
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add electron/tray.ts
git commit -m "feat(electron): tray menu (reset/wipe/quit)"
```

---

## Task 21: Renderer skeleton (React + components)

**Files:**
- Create: `renderer/index.html`, `renderer/main.tsx`, `renderer/App.tsx`, `renderer/styles.css`, `renderer/hooks/usePetState.ts`, `renderer/components/Pet.tsx`, `renderer/components/HUD.tsx`, `renderer/components/EatingBurst.tsx`, `renderer/components/EvolveCutscene.tsx`

- [ ] **Step 1: Write `renderer/index.html`**

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Token Eater Pet</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Write `renderer/styles.css`**

```css
html, body, #root {
  margin: 0; padding: 0; width: 100%; height: 100%;
  background: transparent;
  overflow: hidden;
  -webkit-app-region: drag;       /* whole window draggable */
  user-select: none;
}
.pet {
  position: absolute; left: 50%; top: 50%;
  transform: translate(-50%, -50%);
  font-size: 96px;
  -webkit-app-region: no-drag;     /* clickable */
  cursor: pointer;
  transition: transform 0.15s;
}
.pet.feasting { animation: bounce 0.4s ease; }
@keyframes bounce {
  0%   { transform: translate(-50%, -50%) scale(1); }
  50%  { transform: translate(-50%, -65%) scale(1.15); }
  100% { transform: translate(-50%, -50%) scale(1); }
}
.hud {
  position: absolute; left: 4px; bottom: 4px;
  font: 10px monospace; color: #fff;
  text-shadow: 0 0 3px rgba(0,0,0,0.9);
  -webkit-app-region: no-drag;
}
.burst {
  position: absolute; left: 50%; top: 50%;
  transform: translate(-50%, -50%);
  font-size: 14px; color: gold;
  animation: floatUp 1s ease-out forwards;
  pointer-events: none;
}
@keyframes floatUp {
  0%   { opacity: 1; transform: translate(-50%, -50%); }
  100% { opacity: 0; transform: translate(-50%, -160%); }
}
.cutscene {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  background: rgba(255, 255, 255, 0.6);
  font: 14px monospace;
  -webkit-app-region: no-drag;
}
```

- [ ] **Step 3: Write `renderer/hooks/usePetState.ts`**

```ts
import { useEffect, useState } from 'react';
import type { PetSnapshot, PetEvent } from '@core/types';

declare global {
  interface Window {
    pet: {
      subscribe: (cb: (e: PetEvent) => void) => () => void;
      getSnapshot: () => Promise<PetSnapshot>;
    };
  }
}

export function usePetState() {
  const [snap, setSnap] = useState<PetSnapshot | null>(null);
  const [lastEvent, setLastEvent] = useState<PetEvent | null>(null);

  useEffect(() => {
    window.pet.getSnapshot().then(setSnap);
    return window.pet.subscribe(e => {
      setLastEvent(e);
      if (e.type === 'snapshot') setSnap(e.snapshot);
      else {
        // refresh snapshot after stateful events
        window.pet.getSnapshot().then(setSnap);
      }
    });
  }, []);

  return { snap, lastEvent };
}
```

- [ ] **Step 4: Write `renderer/components/Pet.tsx`**

```tsx
import type { Phase, Mood } from '@core/types';

const SPRITE: Record<Phase, string> = {
  0: '🥚',
  1: '🐣',
  2: '🐥',
  3: '🐔'
};

const MOOD_OVERLAY: Record<Mood, string> = {
  happy: '', normal: '', sleepy: '💤', sad: '😔',
  feasting: '✨', curious: '❔'
};

export function Pet({ phase, mood, feasting }: { phase: Phase; mood: Mood; feasting: boolean }) {
  return (
    <div className={`pet ${feasting ? 'feasting' : ''}`}>
      <span>{SPRITE[phase]}</span>
      {MOOD_OVERLAY[mood] && <sup style={{ fontSize: 24 }}>{MOOD_OVERLAY[mood]}</sup>}
    </div>
  );
}
```

- [ ] **Step 5: Write `renderer/components/HUD.tsx`**

```tsx
import type { PetSnapshot } from '@core/types';
import { STAGES, nextThreshold } from '@core/pet/stages';

export function HUD({ snap }: { snap: PetSnapshot }) {
  const stageName = STAGES.find(s => s.phase === snap.phase)?.name ?? '?';
  const next = nextThreshold(snap.phase);
  const pct = next ? Math.min(100, (snap.lifetimeXP / next) * 100).toFixed(1) : '100';
  return (
    <div className="hud">
      <div>{stageName} · XP {snap.lifetimeXP.toFixed(0)}{next ? ` / ${next}` : ' (max)'}</div>
      <div>cond {snap.condition.toFixed(0)} · {snap.mood}</div>
      <div>{pct}%</div>
    </div>
  );
}
```

- [ ] **Step 6: Write `renderer/components/EatingBurst.tsx`**

```tsx
export function EatingBurst({ amount }: { amount: number }) {
  return <div className="burst">+{amount.toFixed(0)} 🍴</div>;
}
```

- [ ] **Step 7: Write `renderer/components/EvolveCutscene.tsx`**

```tsx
import type { Phase } from '@core/types';
import { STAGES } from '@core/pet/stages';

export function EvolveCutscene({ from, to }: { from: Phase; to: Phase }) {
  const fromName = STAGES.find(s => s.phase === from)?.name ?? '?';
  const toName   = STAGES.find(s => s.phase === to)?.name   ?? '?';
  return (
    <div className="cutscene">
      <div>
        <div>✨ EVOLVED ✨</div>
        <div>{fromName} → {toName}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Write `renderer/App.tsx`**

```tsx
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
```

- [ ] **Step 9: Write `renderer/main.tsx`**

```tsx
import { createRoot } from 'react-dom/client';
import { App } from './App';

createRoot(document.getElementById('root')!).render(<App />);
```

- [ ] **Step 10: Verify typecheck**

```bash
npx tsc --noEmit
```
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add renderer/
git commit -m "feat(renderer): React UI — pet, HUD, eating burst, evolution cutscene"
```

---

## Task 22: App bootstrap (wire everything in main)

**Files:**
- Modify: `electron/main.ts`
- Create: `electron/bootstrap.ts`

- [ ] **Step 1: Write `electron/bootstrap.ts`**

```ts
import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { resolveStoragePaths } from '../core/storage/paths';
import { loadPetState, makeDebouncedSaver, makeDefaultSnapshot } from '../core/storage/petState';
import { EventsDb } from '../core/storage/eventsDb';
import { PetState } from '../core/pet/PetState';
import { FeedingPipeline } from '../core/feeding/FeedingPipeline';
import { SourceRegistry } from '../core/tokenSource/registry';
import { ClaudeStatusLineSource } from '../core/tokenSource/claudeStatusLine';
import { ClaudeJsonlSource } from '../core/tokenSource/claudeJsonl';
import { installStatusLine, uninstallStatusLine } from '../installers/statusLine';
import { wireIpc } from './ipc';
import { createTray, TrayCallbacks } from './tray';
import { createPetWindow } from './window';
import fs from 'node:fs';

export interface BootResult {
  window: BrowserWindow;
  shutdown: () => Promise<void>;
}

export async function bootstrap(): Promise<BootResult> {
  const userData    = app.getPath('userData');
  const paths       = resolveStoragePaths(userData);
  fs.mkdirSync(paths.runtimeDir, { recursive: true });

  const snap        = loadPetState(paths.petStateFile, () => Date.now());
  const pet         = new PetState(snap, { now: Date.now });
  const db          = new EventsDb(paths.eventsDbFile);
  const pipeline    = new FeedingPipeline(db, pet);

  const token       = crypto.randomBytes(16).toString('hex');
  const claudeHome  = path.join(os.homedir(), '.claude');
  const statusline  = new ClaudeStatusLineSource(token);
  const jsonlSrc    = new ClaudeJsonlSource(claudeHome);
  const registry    = new SourceRegistry([statusline, jsonlSrc]);

  await registry.start(e => pipeline.handle(e));

  installStatusLine({
    claudeHome,
    shimPath: path.resolve(__dirname, '../scripts/statusline-shim.cjs'),
    port: statusline.port,
    token
  });

  const saver = makeDebouncedSaver(paths.petStateFile, 500);
  pet.on(() => saver.schedule(pet.snapshot));

  // periodic decay tick
  const tickInterval = setInterval(() => pet.tick(), 60_000);
  pet.tick(); // catch-up on launch

  const win = createPetWindow({
    preloadPath:  path.join(__dirname, 'preload.js'),
    rendererUrl:  process.env.VITE_DEV_SERVER_URL ?? null,
    rendererFile: process.env.VITE_DEV_SERVER_URL ? null
                    : path.join(__dirname, '../dist/index.html'),
    pos: snap.windowPos
  });
  const unwire = wireIpc(win, pet);

  // persist window position
  win.on('moved', () => {
    const [x, y] = win.getPosition();
    pet.load({ ...pet.snapshot, windowPos: { x, y } });
  });

  const trayCb: TrayCallbacks = {
    onShowStats: () => win.show(),
    onResetPet:  () => pet.load(makeDefaultSnapshot(Date.now())),
    onWipeAll:   () => {
      pet.load(makeDefaultSnapshot(Date.now()));
      db.close();
      fs.rmSync(paths.eventsDbFile, { force: true });
    },
    onQuit: () => app.quit()
  };
  const tray = createTray(trayCb);

  return {
    window: win,
    shutdown: async () => {
      clearInterval(tickInterval);
      unwire();
      tray.destroy();
      saver.flush();
      await registry.stop();
      db.close();
      uninstallStatusLine(claudeHome);
    }
  };
}
```

- [ ] **Step 2: Rewrite `electron/main.ts`**

```ts
import { app } from 'electron';
import { bootstrap } from './bootstrap';

let shutdownFn: (() => Promise<void>) | null = null;

app.whenReady().then(async () => {
  const { shutdown } = await bootstrap();
  shutdownFn = shutdown;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', async (e) => {
  if (shutdownFn) {
    const fn = shutdownFn;
    shutdownFn = null;
    e.preventDefault();
    await fn();
    app.quit();
  }
});
```

- [ ] **Step 3: Verify typecheck**

```bash
npx tsc --noEmit
```
Expected: PASS.

- [ ] **Step 4: Run end-to-end smoke**

```bash
npm run dev
```
Expected: window appears with 🥚 pet. `~/.claude/settings.json` now has `statusLine` entry. Then in another terminal:
```bash
PORT=$(jq -r '.statusLine.env.PET_PORT'  ~/.claude/settings.json)
TOKEN=$(jq -r '.statusLine.env.PET_TOKEN' ~/.claude/settings.json)
curl -X POST "http://127.0.0.1:$PORT/event" \
  -H "x-pet-token: $TOKEN" \
  -H "content-type: application/json" \
  -d '{"session_id":"s","message_id":"m1","request_id":"r1","current_usage":{"input_tokens":2000,"output_tokens":3000,"cache_read_input_tokens":0,"cache_creation_input_tokens":0}}'
```
Pet should react (eating burst), XP advances toward 10,000 threshold. Send 1 more big request → evolves to phase 1 (🐣) with cutscene.

Stop with Ctrl+C, confirm `~/.claude/settings.json` had statusLine removed on quit.

- [ ] **Step 5: Commit**

```bash
git add electron/bootstrap.ts electron/main.ts
git commit -m "feat: wire bootstrap — sources, pipeline, pet, window, tray"
```

---

## Task 23: Backfill progress (large JSONL)

**Files:**
- Modify: `core/tokenSource/claudeJsonl.ts`

- [ ] **Step 1: Add chunked-read for large initial files**

Replace `readNew` in `core/tokenSource/claudeJsonl.ts` with chunked version:

```ts
private readNew(file: string): void {
  if (!this.emit) return;
  let stat: fs.Stats;
  try { stat = fs.statSync(file); } catch { return; }
  const prev = this.state.get(file)?.offset ?? 0;
  if (stat.size < prev) { this.state.set(file, { offset: 0 }); return this.readNew(file); }
  if (stat.size === prev) return;

  const CHUNK = 1 << 20; // 1MB
  const fd = fs.openSync(file, 'r');
  try {
    let offset = prev;
    let leftover = '';
    while (offset < stat.size) {
      const remaining = stat.size - offset;
      const buf = Buffer.alloc(Math.min(CHUNK, remaining));
      fs.readSync(fd, buf, 0, buf.length, offset);
      const chunk = leftover + buf.toString('utf8');
      const lines = chunk.split('\n');
      leftover = lines.pop() ?? '';
      for (const line of lines) {
        if (!line) continue;
        const ev = parseClaudeJsonlLine(line, file);
        if (ev) this.emit(ev);
      }
      offset += buf.length;
    }
    // leftover is the partial line at end — keep offset before it
    const trailingBytes = Buffer.byteLength(leftover, 'utf8');
    this.state.set(file, { offset: stat.size - trailingBytes });
  } finally {
    fs.closeSync(fd);
  }
}
```

- [ ] **Step 2: Add a backfill-size test**

Append to `core/tokenSource/claudeJsonl.test.ts`:

```ts
it('handles a large file (1000 lines) in one start', async () => {
  const file = path.join(root, 'projects', 'proj1', 'big.jsonl');
  let lines = '';
  for (let i = 0; i < 1000; i++) {
    lines += JSON.stringify({
      type: 'assistant',
      sessionId: 'sess-1',
      requestId: `r${i}`,
      message: { id: `m${i}`, role: 'assistant',
        usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }
    }) + '\n';
  }
  writeFileSync(file, lines);
  const events: TokenEvent[] = [];
  src = new ClaudeJsonlSource(root);
  await src.start(e => events.push(e));
  await waitMs(500);
  expect(events.length).toBe(1000);
});
```

- [ ] **Step 3: Run — expect PASS**

```bash
npx vitest run core/tokenSource/claudeJsonl.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add core/tokenSource/claudeJsonl.ts core/tokenSource/claudeJsonl.test.ts
git commit -m "feat(claude-jsonl): chunked read for large backfills"
```

---

## Task 24: End-to-end manual QA

**Files:**
- Create: `QA_v1.md` (checklist record)

- [ ] **Step 1: Full test sweep**

```bash
npm test
```
Expected: all green.

- [ ] **Step 2: Write `QA_v1.md` and verify each item by hand**

```markdown
# Token Eater Pet — v1 Manual QA

Run `npm run dev`. Verify:

- [ ] Pet window appears top-right, transparent, always-on-top.
- [ ] Pet sprite shows 🥚 (or current phase if state exists).
- [ ] HUD bottom-left shows stage name, XP/next threshold, condition, mood.
- [ ] Drag window — moves freely.
- [ ] Quit (tray → Quit) and relaunch → window opens at last position.
- [ ] `~/.claude/settings.json` contains `statusLine` with `PET_PORT` / `PET_TOKEN` while app runs.
- [ ] `~/.claude/settings.json` `statusLine` is removed after quit.
- [ ] curl POST to `/event` with valid token → eating burst, XP advances.
- [ ] curl POST with wrong token → 401, no effect.
- [ ] Two identical curls (same messageId+requestId) → only one feed.
- [ ] Push enough nutrition to cross 10,000 → evolution cutscene 🥚 → 🐣.
- [ ] Tray → Reset Pet → confirm → pet returns to 🥚, condition 50.
- [ ] Tray → Wipe Everything → confirm → `events.sqlite` deleted.
- [ ] Run Claude Code in a real session (one turn) → pet eats real tokens (visible burst, XP up).
- [ ] After running Claude Code with app off, then relaunching app → JSONL backfill picks up missed tokens (no double-count vs statusLine path).
- [ ] Sleep laptop overnight (or skip clock by 24h+) → relaunch → condition is 0, mood = sad, pet alive.
- [ ] Multi-monitor: window stays on the screen it was on.
```

- [ ] **Step 3: Commit**

```bash
git add QA_v1.md
git commit -m "docs: v1 manual QA checklist"
```

---

## Self-review notes

- Spec coverage check: §3 architecture ✓ (Tasks 18–22), §4 data flow ✓ (11, 14, 15, 22), §5 mechanics ✓ (3–6), §6 storage ✓ (8–10), §7 reliability ✓ (atomic write Task 9; dedup Task 10; truncate Task 14; clock cap Task 5; install/uninstall Task 17; reset/wipe Task 20+22; backfill Task 23), §9 testing ✓ throughout, §8 v1 exclusions respected (no Codex source, no notifications/sound).
- TokenSource interface is the lone extension point — Task 7 locks the shape, Tasks 14 & 15 implement v1 sources, Codex/Aider can be added later without touching anything but `bootstrap.ts`.
- Method/type names verified consistent: `phaseForXP`, `nextThreshold`, `applyGain`, `applyDecay`, `moodForCondition`, `PetState.feed/tick/load/on/snapshot`, `EventsDb.insert/sumSince`, `FeedingPipeline.handle`, `ClaudeStatusLineSource.port/token`, `installStatusLine/uninstallStatusLine`.
- No placeholders ("TBD", "implement later", etc.) — every step has full code or full command.

---

**Plan complete.** Saved to `docs/superpowers/plans/2026-05-14-token-eater-pet.md`.
