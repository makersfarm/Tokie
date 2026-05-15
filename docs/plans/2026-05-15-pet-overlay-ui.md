# Pet Overlay UI v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the pet window into a cute, interactive, ambient companion: stage badge + thin progress bar by default, hover for info popup, click for petting bounce + greeting, proactive speech bubbles on token bursts. Remove the dense 3-line HUD.

**Architecture:** Renderer-only feature for the most part. One new pure-function module in `core/feeding/` for token-burst detection (testable in Node). New presentation components in `renderer/components/`, custom hooks in `renderer/hooks/`. `App.tsx` rewires composition; `HUD.tsx` is deleted.

**Tech Stack:** TypeScript 5.7 (strict), React 18/19 functional components + hooks, plain CSS in `renderer/styles.css`, vitest for unit tests on pure modules.

**Spec:** `docs/specs/2026-05-15-pet-overlay-ui-design.md`

---

## File Map

**Create:**
- `core/feeding/burstDetector.ts` — pure rolling-window burst detection
- `core/feeding/burstDetector.test.ts` — vitest unit tests
- `renderer/components/StageBadge.tsx` — icon + stage name above pet
- `renderer/components/PetProgressBar.tsx` — thin bar under pet, XP→nextThreshold
- `renderer/components/InfoBubble.tsx` — hover info popup (XP / cond·mood / 24h)
- `renderer/components/SpeechBubble.tsx` — shared bubble used by click greeting & proactive burst speech
- `renderer/data/speech.ts` — greeting + burst phrase pools + pickers
- `renderer/data/speech.test.ts` — picker tests
- `renderer/hooks/useHover.ts` — hover state with enter/leave delays
- `renderer/hooks/useBurstDetector.ts` — wraps BurstDetector with React state from PetEvent stream
- `renderer/hooks/useStats24h.ts` — fetches `window.pet.getStats()` periodically for hover popup

**Modify:**
- `renderer/App.tsx` — compose new layout; click/drag threshold; greet on click; show speech on burst
- `renderer/styles.css` — add `.badge`, `.progress`, `.info-bubble`, `.speech-bubble`, `.speech-bubble.proactive`; remove `.hud` rules
- `renderer/components/Pet.tsx` — accept optional `onClick` / `onPointerMove`; otherwise unchanged
- `renderer/components/EatingBurst.tsx` — confirm z-index sits under speech bubble (no behavior change needed if already lower)
- `docs/05-pet-design.md` — document new components + speech pools
- `docs/06-ui.md` — document hover/click/drag threshold + new ambient elements

**Delete:**
- `renderer/components/HUD.tsx`

---

## Task 1: BurstDetector — pure rolling-window logic

**Purpose:** Decide whether the last 5 minutes contain a "burst" of nutrition. Decoupled from React for unit testing in Node ABI.

**Files:**
- Create: `core/feeding/burstDetector.ts`
- Test: `core/feeding/burstDetector.test.ts`

**Constants (from spec):**
- `WINDOW_MS = 5 * 60_000` (5 minutes)
- `THRESHOLD = 50_000` (nutrition sum)
- `COOLDOWN_MS = 2 * 60_000` (2 minutes after firing)

- [ ] **Step 1: Write failing tests**

```ts
// core/feeding/burstDetector.test.ts
import { describe, it, expect } from 'vitest';
import { BurstDetector } from './burstDetector';

describe('BurstDetector', () => {
  it('does not fire below threshold', () => {
    const d = new BurstDetector();
    d.addEvent(1000, 10_000);
    d.addEvent(2000, 20_000);
    expect(d.evaluate(3000)).toEqual({ isBurst: false });
  });

  it('fires when window sum >= threshold', () => {
    const d = new BurstDetector();
    d.addEvent(1000, 30_000);
    d.addEvent(2000, 25_000);
    const r = d.evaluate(3000);
    expect(r.isBurst).toBe(true);
  });

  it('drops events older than WINDOW_MS', () => {
    const d = new BurstDetector();
    d.addEvent(0, 60_000);                    // would fire
    const t = 1000 + 5 * 60_000;              // 5 min + 1s later
    d.addEvent(t, 1_000);
    expect(d.evaluate(t).isBurst).toBe(false);
  });

  it('does not refire during cooldown', () => {
    const d = new BurstDetector();
    d.addEvent(1000, 60_000);
    expect(d.evaluate(2000).isBurst).toBe(true);
    // adding more events during cooldown stays false
    d.addEvent(3000, 60_000);
    expect(d.evaluate(4000).isBurst).toBe(false);
  });

  it('can fire again after cooldown ends AND window drops below threshold then re-crosses', () => {
    const d = new BurstDetector();
    d.addEvent(0, 60_000);
    expect(d.evaluate(1).isBurst).toBe(true);     // 1st fire
    // After window expires and cooldown also expires, a fresh burst fires.
    const later = 10 * 60_000;
    d.addEvent(later, 60_000);
    expect(d.evaluate(later + 1).isBurst).toBe(true);
  });

  it('reports window sum for callers that want to display intensity', () => {
    const d = new BurstDetector();
    d.addEvent(1000, 30_000);
    d.addEvent(2000, 20_000);
    expect(d.evaluate(3000).sum).toBe(50_000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run core/feeding/burstDetector.test.ts`
Expected: FAIL — `Cannot find module './burstDetector'`

- [ ] **Step 3: Implement BurstDetector**

```ts
// core/feeding/burstDetector.ts
export const WINDOW_MS   = 5 * 60_000;
export const THRESHOLD   = 50_000;
export const COOLDOWN_MS = 2 * 60_000;

interface Sample { ts: number; nutrition: number }

export interface BurstResult {
  isBurst: boolean;
  sum: number;
}

export class BurstDetector {
  private samples: Sample[] = [];
  private lastFiredAt: number | null = null;

  addEvent(ts: number, nutrition: number): void {
    if (nutrition <= 0) return;
    this.samples.push({ ts, nutrition });
  }

  evaluate(now: number): BurstResult {
    const cutoff = now - WINDOW_MS;
    while (this.samples.length && this.samples[0]!.ts < cutoff) {
      this.samples.shift();
    }
    const sum = this.samples.reduce((a, s) => a + s.nutrition, 0);

    if (this.lastFiredAt !== null && now - this.lastFiredAt < COOLDOWN_MS) {
      return { isBurst: false, sum };
    }
    if (sum >= THRESHOLD) {
      this.lastFiredAt = now;
      return { isBurst: true, sum };
    }
    return { isBurst: false, sum };
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run core/feeding/burstDetector.test.ts`
Expected: All 6 tests PASS.

> **Note: ABI ping-pong.** If vitest fails with `NODE_MODULE_VERSION` mismatch, the native module is built for Electron. Run `npm rebuild better-sqlite3 --update-binary` once, retry. After this task you'll do `npm run postinstall` to flip back to Electron ABI before `npm run dev`.

- [ ] **Step 5: Commit**

```bash
git add core/feeding/burstDetector.ts core/feeding/burstDetector.test.ts
git commit -m "feat(core): BurstDetector rolling-window pure module"
```

---

## Task 2: Speech pools + pickers

**Purpose:** Centralize the phrase pools. Pure pickers so they're easy to test and override later.

**Files:**
- Create: `renderer/data/speech.ts`
- Test: `renderer/data/speech.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// renderer/data/speech.test.ts
import { describe, it, expect } from 'vitest';
import { pickGreeting, pickBurstLine, GREETINGS, BURST_BY_MOOD } from './speech';

describe('speech pickers', () => {
  it('greeting returns one of the pool', () => {
    for (let i = 0; i < 20; i++) {
      expect(GREETINGS).toContain(pickGreeting(Math.random));
    }
  });

  it('burst line uses happy pool when mood=happy', () => {
    const line = pickBurstLine('happy', () => 0);
    expect(BURST_BY_MOOD.happy).toContain(line);
  });

  it('burst line falls back to normal pool when mood is feasting/curious', () => {
    const line = pickBurstLine('feasting', () => 0);
    expect(BURST_BY_MOOD.normal).toContain(line);
  });

  it('burst line uses sad/sleepy pool when mood is sad', () => {
    const line = pickBurstLine('sad', () => 0);
    expect(BURST_BY_MOOD.sleepy).toContain(line);
  });

  it('rng=0 returns the first item', () => {
    expect(pickGreeting(() => 0)).toBe(GREETINGS[0]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run renderer/data/speech.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement speech module**

```ts
// renderer/data/speech.ts
import type { Mood } from '@core/types';

export const GREETINGS = [
  '고마워✨',
  '헤헤',
  '쓰담쓰담~',
  '넹',
  '💕',
  '오 안녕'
] as const;

export const BURST_BY_MOOD: Record<'happy' | 'normal' | 'sleepy', readonly string[]> = {
  happy:  ['오 키 핀좌 우적~', '배 터져✨', '맛있다맛있다', 'GG 그만 먹어...'],
  normal: ['흠냠', '잘 먹는 중~', '오늘 풍년이네'],
  sleepy: ['오 깨워줘서 고마워...', '오랜만에 먹는다', '기운나려나']
};

function pick<T>(arr: readonly T[], rng: () => number): T {
  const i = Math.min(arr.length - 1, Math.floor(rng() * arr.length));
  return arr[i]!;
}

export function pickGreeting(rng: () => number = Math.random): string {
  return pick(GREETINGS, rng);
}

export function pickBurstLine(mood: Mood, rng: () => number = Math.random): string {
  const bucket =
      mood === 'happy'                       ? BURST_BY_MOOD.happy
    : mood === 'sad' || mood === 'sleepy'    ? BURST_BY_MOOD.sleepy
    :                                          BURST_BY_MOOD.normal;
  return pick(bucket, rng);
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run renderer/data/speech.test.ts`
Expected: PASS (all 5).

- [ ] **Step 5: Commit**

```bash
git add renderer/data/speech.ts renderer/data/speech.test.ts
git commit -m "feat(renderer): speech pools + pickers"
```

---

## Task 3: StageBadge component

**Files:**
- Create: `renderer/components/StageBadge.tsx`

- [ ] **Step 1: Implement**

```tsx
// renderer/components/StageBadge.tsx
import type { Phase } from '@core/types';
import { STAGES } from '@core/pet/stages';

const ICON: Record<Phase, string> = { 0: '🥚', 1: '🐣', 2: '🐤', 3: '🐔' };

export function StageBadge({ phase, compact }: { phase: Phase; compact: boolean }) {
  const name = STAGES.find(s => s.phase === phase)?.name ?? '?';
  return (
    <div className="badge" aria-label={`Stage ${name}`}>
      <span className="badge-icon">{ICON[phase]}</span>
      {!compact && <span className="badge-name">{name}</span>}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add renderer/components/StageBadge.tsx
git commit -m "feat(renderer): StageBadge component"
```

---

## Task 4: PetProgressBar component

**Files:**
- Create: `renderer/components/PetProgressBar.tsx`

- [ ] **Step 1: Implement**

```tsx
// renderer/components/PetProgressBar.tsx
import type { Phase, Mood } from '@core/types';
import { nextThreshold } from '@core/pet/stages';

export function PetProgressBar({ phase, xp, mood }: { phase: Phase; xp: number; mood: Mood }) {
  const next = nextThreshold(phase);
  const pct = next === null ? 100 : Math.min(100, (xp / next) * 100);
  return (
    <div className={`progress mood-${mood}`} role="progressbar"
         aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
      <div className="progress-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add renderer/components/PetProgressBar.tsx
git commit -m "feat(renderer): PetProgressBar component"
```

---

## Task 5: SpeechBubble component

**Files:**
- Create: `renderer/components/SpeechBubble.tsx`

Used for both click greetings (short) and proactive burst lines (longer). Auto-dismiss is owned by the caller — this component is just presentation.

- [ ] **Step 1: Implement**

```tsx
// renderer/components/SpeechBubble.tsx
export function SpeechBubble(
  { text, variant }: { text: string; variant: 'greeting' | 'proactive' }
) {
  return (
    <div className={`speech-bubble ${variant}`} role="status">
      {text}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add renderer/components/SpeechBubble.tsx
git commit -m "feat(renderer): SpeechBubble component"
```

---

## Task 6: InfoBubble component (hover)

**Files:**
- Create: `renderer/components/InfoBubble.tsx`

Shows compact 3-line info on hover. Number formatting uses local helpers (small, same file).

- [ ] **Step 1: Implement**

```tsx
// renderer/components/InfoBubble.tsx
import type { PetSnapshot } from '@core/types';
import { nextThreshold } from '@core/pet/stages';

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return n.toFixed(0);
}

export function InfoBubble(
  { snap, tokens24h, compact }: { snap: PetSnapshot; tokens24h: number; compact: boolean }
) {
  const next = nextThreshold(snap.phase);
  if (compact) {
    return (
      <div className="info-bubble compact">
        {fmt(snap.lifetimeXP)}{next ? ` / ${fmt(next)}` : ''} · {snap.condition.toFixed(0)} · {fmt(tokens24h)}
      </div>
    );
  }
  return (
    <div className="info-bubble">
      <div>XP   {fmt(snap.lifetimeXP)}{next ? ` / ${fmt(next)}` : ' (max)'}</div>
      <div>cond {snap.condition.toFixed(0)} · {snap.mood}</div>
      <div>24h  {fmt(tokens24h)}</div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add renderer/components/InfoBubble.tsx
git commit -m "feat(renderer): InfoBubble component"
```

---

## Task 7: useHover hook

**Files:**
- Create: `renderer/hooks/useHover.ts`

Returns `{ hovered, bind }` where `bind` is JSX props (`onPointerEnter`/`onPointerLeave`). 150ms enter delay, 200ms leave delay.

- [ ] **Step 1: Implement**

```ts
// renderer/hooks/useHover.ts
import { useRef, useState } from 'react';

export function useHover(enterMs = 150, leaveMs = 200) {
  const [hovered, setHovered] = useState(false);
  const enterTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = () => {
    if (enterTimer.current) { clearTimeout(enterTimer.current); enterTimer.current = null; }
    if (leaveTimer.current) { clearTimeout(leaveTimer.current); leaveTimer.current = null; }
  };

  const onPointerEnter = () => {
    clear();
    enterTimer.current = setTimeout(() => setHovered(true), enterMs);
  };
  const onPointerLeave = () => {
    clear();
    leaveTimer.current = setTimeout(() => setHovered(false), leaveMs);
  };

  return { hovered, bind: { onPointerEnter, onPointerLeave } };
}
```

- [ ] **Step 2: Commit**

```bash
git add renderer/hooks/useHover.ts
git commit -m "feat(renderer): useHover hook with enter/leave delays"
```

---

## Task 8: useStats24h hook

**Purpose:** Polls `window.pet.getStats()` to expose 24h token total for the InfoBubble. Refresh on PetEvent and on a 30s interval.

**Files:**
- Create: `renderer/hooks/useStats24h.ts`

- [ ] **Step 1: Implement**

```ts
// renderer/hooks/useStats24h.ts
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

  // also refresh when any non-snapshot event arrives
  useEffect(() => {
    if (!lastEvent || lastEvent.type === 'snapshot') return;
    window.pet.getStats().then(s => {
      const t = s.last24h;
      setTokens24h(t.input + t.output + t.cacheRead + t.cacheCreate);
    });
  }, [lastEvent]);

  return tokens24h;
}
```

- [ ] **Step 2: Commit**

```bash
git add renderer/hooks/useStats24h.ts
git commit -m "feat(renderer): useStats24h hook"
```

---

## Task 9: useBurstDetector hook

**Purpose:** Bridge `PetEvent` stream → BurstDetector → returns a "burst trigger nonce" so callers can re-render speech bubble on each new burst.

**Files:**
- Create: `renderer/hooks/useBurstDetector.ts`

- [ ] **Step 1: Implement**

```ts
// renderer/hooks/useBurstDetector.ts
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
```

- [ ] **Step 2: Commit**

```bash
git add renderer/hooks/useBurstDetector.ts
git commit -m "feat(renderer): useBurstDetector hook"
```

---

## Task 10: CSS — new styles + remove old HUD

**Files:**
- Modify: `renderer/styles.css`

- [ ] **Step 1: Remove the old `.hud` ruleset**

In `renderer/styles.css`, delete:
```css
.hud {
  position: absolute; left: 4px; bottom: 4px;
  font: 10px monospace; color: #fff;
  text-shadow: 0 0 3px rgba(0,0,0,0.9);
  -webkit-app-region: no-drag;
}
```

- [ ] **Step 2: Append new styles to the same file**

```css
/* --- pet overlay v2 --- */
.badge {
  position: absolute; top: 4px; left: 50%;
  transform: translateX(-50%);
  display: flex; align-items: center; gap: 4px;
  font: 10px -apple-system, system-ui, sans-serif;
  color: rgba(255,255,255,0.85);
  text-shadow: 0 0 3px rgba(0,0,0,0.9);
  -webkit-app-region: no-drag;
  pointer-events: none;
}
.badge-icon { font-size: 12px; }
.badge-name { font-weight: 500; }

.progress {
  position: absolute; bottom: 8px; left: 20%; right: 20%;
  height: 2px;
  background: rgba(255,255,255,0.18);
  border-radius: 1px; overflow: hidden;
  -webkit-app-region: no-drag;
  pointer-events: none;
}
.progress-fill {
  height: 100%;
  background: rgba(255,220,120,0.9);
  transition: width 0.4s ease;
}
.progress.mood-sleepy .progress-fill,
.progress.mood-sad    .progress-fill { background: rgba(180,180,190,0.7); }
.progress.mood-normal .progress-fill { background: rgba(230,230,235,0.85); }

.info-bubble {
  position: absolute; top: 30%; left: calc(100% + 6px);
  white-space: nowrap;
  background: rgba(28,28,31,0.92);
  color: #e5e5e7;
  padding: 6px 8px; border-radius: 6px;
  font: 10px ui-monospace, "SF Mono", monospace;
  pointer-events: none;
  -webkit-app-region: no-drag;
  animation: fadeIn 150ms ease;
  z-index: 5;
}
.info-bubble.compact {
  top: auto; bottom: 16px;
  left: 50%; transform: translateX(-50%);
  font-size: 9px;
}
.info-bubble.flip-left { left: auto; right: calc(100% + 6px); }
@keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }

.speech-bubble {
  position: absolute; left: 50%;
  transform: translateX(-50%);
  background: rgba(255,255,255,0.95);
  color: #1c1c1f;
  padding: 4px 8px; border-radius: 10px;
  font: 11px -apple-system, system-ui, sans-serif;
  pointer-events: none;
  -webkit-app-region: no-drag;
  z-index: 10;
  animation: bubblePop 200ms ease;
}
.speech-bubble.greeting  { top: -4px; }
.speech-bubble.proactive { top: -4px; }
@keyframes bubblePop {
  from { opacity: 0; transform: translate(-50%, 6px) scale(0.85); }
  to   { opacity: 1; transform: translate(-50%, 0)  scale(1);    }
}
```

- [ ] **Step 3: Commit**

```bash
git add renderer/styles.css
git commit -m "feat(renderer): styles for badge/progress/info-bubble/speech-bubble; drop HUD css"
```

---

## Task 11: Wire it all up in App.tsx + delete HUD.tsx

**Files:**
- Modify: `renderer/App.tsx`
- Delete: `renderer/components/HUD.tsx`

Responsibilities here:
1. Compose `Pet` + `StageBadge` + `PetProgressBar` + `EatingBurst` + `EvolveCutscene` + `InfoBubble` (on hover) + `SpeechBubble` (greeting on click, proactive on burst).
2. Drag-vs-click threshold (5px) — only fire greeting if pointer didn't move ≥ 5px between down/up.
3. 300ms greeting cooldown.
4. Auto-dismiss greeting bubble after 800ms.
5. Auto-dismiss proactive burst bubble after 2500ms.
6. Compact mode when window width ≤ 160px.

- [ ] **Step 1: Replace `renderer/App.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import { usePetState } from './hooks/usePetState';
import { useHover } from './hooks/useHover';
import { useStats24h } from './hooks/useStats24h';
import { useBurstDetector } from './hooks/useBurstDetector';
import { Pet } from './components/Pet';
import { StageBadge } from './components/StageBadge';
import { PetProgressBar } from './components/PetProgressBar';
import { InfoBubble } from './components/InfoBubble';
import { SpeechBubble } from './components/SpeechBubble';
import { EatingBurst } from './components/EatingBurst';
import { EvolveCutscene } from './components/EvolveCutscene';
import { pickGreeting, pickBurstLine } from './data/speech';
import type { Phase } from '@core/types';

const COMPACT_W = 160;
const CLICK_THRESHOLD_PX = 5;
const GREETING_COOLDOWN_MS = 300;
const GREETING_TTL_MS = 800;
const BURST_TTL_MS = 2500;

export function App() {
  if (new URLSearchParams(window.location.search).get('view') === 'stats') {
    const { StatsView } = require('./components/StatsView');
    return <StatsView />;
  }
  return <PetView />;
}

function useWindowWidth(): number {
  const [w, setW] = useState(window.innerWidth);
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return w;
}

function PetView() {
  const { snap, lastEvent } = usePetState();
  const tokens24h = useStats24h(lastEvent);
  const burst = useBurstDetector(lastEvent);
  const winW = useWindowWidth();
  const compact = winW <= COMPACT_W;

  const hover = useHover();

  const [bursts, setBursts]   = useState<{ id: number; amount: number }[]>([]);
  const [evo, setEvo]         = useState<{ from: Phase; to: Phase } | null>(null);
  const [feasting, setFeasting] = useState(false);
  const [greeting, setGreeting] = useState<string | null>(null);
  const [burstLine, setBurstLine] = useState<string | null>(null);
  const lastClickAt = useRef(0);

  useEffect(() => {
    if (!lastEvent) return;
    if (lastEvent.type === 'fed') {
      const id = Math.random();
      const amount = lastEvent.nutrition;
      setBursts(b => [...b, { id, amount }]);
      setFeasting(true);
      setTimeout(() => setBursts(b => b.filter(x => x.id !== id)), 1000);
      setTimeout(() => setFeasting(false), 400);
    } else if (lastEvent.type === 'evolved') {
      setEvo({ from: lastEvent.from, to: lastEvent.to });
    }
  }, [lastEvent]);

  useEffect(() => {
    if (!evo) return;
    const t = setTimeout(() => setEvo(null), 4000);
    return () => clearTimeout(t);
  }, [evo]);

  // proactive burst speech
  useEffect(() => {
    if (burst.nonce === 0 || !snap) return;
    setBurstLine(pickBurstLine(snap.mood));
    const t = setTimeout(() => setBurstLine(null), BURST_TTL_MS);
    return () => clearTimeout(t);
  }, [burst.nonce]);

  // click → greeting (with drag-vs-click threshold)
  const downRef = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    downRef.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = downRef.current;
    downRef.current = null;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.hypot(dx, dy) >= CLICK_THRESHOLD_PX) return; // was a drag
    const now = Date.now();
    if (now - lastClickAt.current < GREETING_COOLDOWN_MS) return;
    lastClickAt.current = now;
    setGreeting(pickGreeting());
    setFeasting(true);
    setTimeout(() => setFeasting(false), 400);
    setTimeout(() => setGreeting(null), GREETING_TTL_MS);
  };

  if (!snap) return null;

  const handleContext = (e: React.MouseEvent) => {
    e.preventDefault();
    window.pet?.openMenu?.();
  };

  return (
    <div className="root" onContextMenu={handleContext}>
      <StageBadge phase={snap.phase} compact={winW <= 140} />
      <div {...hover.bind} onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
        <Pet phase={snap.phase} mood={snap.mood} feasting={feasting} />
      </div>
      <PetProgressBar phase={snap.phase} xp={snap.lifetimeXP} mood={snap.mood} />

      {bursts.map(b => <EatingBurst key={b.id} amount={b.amount} />)}
      {hover.hovered && <InfoBubble snap={snap} tokens24h={tokens24h} compact={compact} />}
      {greeting   && <SpeechBubble text={greeting}   variant="greeting"  />}
      {burstLine  && <SpeechBubble text={burstLine}  variant="proactive" />}
      {evo && <EvolveCutscene from={evo.from} to={evo.to} />}
    </div>
  );
}
```

- [ ] **Step 2: Delete HUD.tsx**

```bash
git rm renderer/components/HUD.tsx
```

- [ ] **Step 3: Commit**

```bash
git add renderer/App.tsx
git commit -m "feat(renderer): wire pet overlay v2; remove HUD"
```

---

## Task 12: Lazy-import fix for StatsView (avoid require in renderer)

**Files:**
- Modify: `renderer/App.tsx`

The `require()` inside `App` may not work in Vite. Switch to a static import (small footprint, fine for this app).

- [ ] **Step 1: At top of `renderer/App.tsx`, add the import**

```tsx
import { StatsView } from './components/StatsView';
```

- [ ] **Step 2: Replace the `App` body**

```tsx
export function App() {
  if (new URLSearchParams(window.location.search).get('view') === 'stats') {
    return <StatsView />;
  }
  return <PetView />;
}
```

- [ ] **Step 3: Run dev once and confirm both windows still mount**

```bash
npm run postinstall   # flip native module back to Electron ABI if you ran tests
npm run dev
```

Expected: pet window renders new layout (badge top, sprite center, thin bar bottom). Right-click → Show Stats opens stats window unchanged.

- [ ] **Step 4: Commit**

```bash
git add renderer/App.tsx
git commit -m "fix(renderer): static-import StatsView in App"
```

---

## Task 13: Manual QA pass

No commit at this step — just verification before docs.

- [ ] **Step 1: Idle render**
  - Launch `npm run dev`. Pet window shows: badge at top (🥚 Egg if fresh / 🐣 Baby etc), pet sprite center, thin progress bar bottom. No 3-line HUD text anywhere.
- [ ] **Step 2: Hover**
  - Move cursor onto pet. ~150ms later, info bubble fades in to the right of the pet with 3 lines (XP / cond·mood / 24h).
  - Move off. Bubble fades out within ~200ms.
- [ ] **Step 3: Click → greeting**
  - Click pet body. Pet bounces (0.4s). Greeting bubble pops above pet (e.g. "고마워✨") and disappears in ~800ms.
  - Rapid double-click — second click within 300ms is ignored.
- [ ] **Step 4: Drag**
  - Mouse-down on pet, drag ≥ 5px, release. Window moves. **No** greeting bubble.
- [ ] **Step 5: Burst**
  - Force a token burst: in another terminal, post fake events to the statusLine HTTP shim, or run a real claude session that consumes ≥ 50k nutrition in <5 min.
  - Expect proactive bubble (mood-flavored) above pet for ~2.5s. Should not re-fire within 2 min even if more events arrive.
- [ ] **Step 6: Resize**
  - Drag corner to ~120px. Badge collapses to icon only. Info bubble (on hover) becomes compact one-liner at bottom.
  - Resize back up to ~400px. All elements scale; progress bar centered with 20% margins.
- [ ] **Step 7: Evolve cutscene still works**
  - Use existing Reset Pet flow to verify evolved overlay still appears and clears after 4s without sticking (the v1 bug fix). Doesn't interfere with new elements.
- [ ] **Step 8: Right-click menu unchanged**
  - Right-click pet → Show Stats / Reset Pet / Wipe Everything / Quit menu appears as before. Show Stats opens the 480×600 stats window.

If anything fails, stop and fix before continuing. No commit — verification only.

---

## Task 14: Doc updates

**Files:**
- Modify: `docs/05-pet-design.md`
- Modify: `docs/06-ui.md`

- [ ] **Step 1: Update `docs/05-pet-design.md`**

Add sections (anywhere appropriate, follow existing heading style):

```markdown
## Stage badge & progress bar

- `renderer/components/StageBadge.tsx` — phase icon (🥚🐣🐤🐔) + stage name top-center. Collapses to icon-only when window ≤ 140px wide.
- `renderer/components/PetProgressBar.tsx` — thin 2px bar bottom-center (20% left/right margin). Fill width = lifetimeXP / nextThreshold(phase). Fill color tints by mood (gold=happy, neutral=normal, gray=sleepy/sad). No numbers.

## Speech bubbles

- `renderer/components/SpeechBubble.tsx` — shared component, two variants:
  - `greeting` — fires on pet click. 800ms. Phrases from `renderer/data/speech.ts#GREETINGS`.
  - `proactive` — fires on token burst (5min nutrition ≥ 50k, 2min cooldown). 2.5s. Phrases by mood from `BURST_BY_MOOD`.
- Burst detection lives in `core/feeding/burstDetector.ts` (pure, vitest covered); `renderer/hooks/useBurstDetector.ts` bridges it to React.

## Removed in v2

- `renderer/components/HUD.tsx` (3-line bottom-left text) — replaced by badge + progress bar + hover info popup.
```

- [ ] **Step 2: Update `docs/06-ui.md`**

Add/replace sections to describe new interactions:

```markdown
## Hover

`renderer/hooks/useHover.ts` provides 150ms enter / 200ms leave delays.
On hover over the pet body, `renderer/components/InfoBubble.tsx` shows 3 lines
(XP / cond·mood / 24h tokens) to the right of the pet. Flips to compact one-liner
at the bottom when window width ≤ 160px.

## Click vs drag

The pet body element listens to `onPointerDown`/`onPointerUp` in `App.tsx`. If
the pointer moved < 5px between down and up, it's a click → bounce + greeting
speech bubble (`pickGreeting` from `renderer/data/speech.ts`). ≥ 5px = drag,
window moves via `-webkit-app-region: drag` and no greeting fires. Click cooldown
is 300ms.

## HUD removed

The old left-bottom 3-line monospace HUD was removed in v2. All numeric info is
now accessible via hover (compact) or right-click → Show Stats (full breakdown).
```

- [ ] **Step 3: Commit**

```bash
git add docs/05-pet-design.md docs/06-ui.md
git commit -m "docs: pet overlay v2 in design + ui docs"
```

---

## Self-Review Checklist

- [ ] Spec covered:
  - Default idle (badge / mood overlay / progress bar / HUD removed) → Tasks 3, 4, 10, 11
  - Hover info popup → Tasks 6, 7, 8, 11
  - Click bounce + greeting + drag threshold + cooldown → Tasks 2, 5, 11
  - Proactive burst speech → Tasks 1, 2, 5, 9, 11
  - Window-size compaction (≤140 badge, ≤160 info) → Tasks 3, 6, 11
  - Eye-follow deferred — intentionally not in plan
  - Doc updates → Task 14
- [ ] No `TBD`/`TODO`/"add appropriate"/"similar to" — none present.
- [ ] Type consistency:
  - `BurstDetector#addEvent(ts, nutrition)` — same signature in Task 1, used by Task 9.
  - `pickGreeting` / `pickBurstLine` — same signatures used in Task 2 and Task 11.
  - `useHover().bind` — same shape in Task 7 and Task 11.
- [ ] ABI ping-pong called out (Task 1 note + Task 12 step 3).
- [ ] All file paths are exact.
