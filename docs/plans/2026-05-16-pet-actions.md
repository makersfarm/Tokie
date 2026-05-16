# Pet Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tokie 에 6개 액션 추가 — Breathing / Blink / Sleep / Pet(쓰담) / 모델별 식사 / Almost-there.

**Architecture:** core 의 타입에 `model` 필드 추가 → FeedingPipeline 이 통과시키고 PetState.fed 이벤트가 동반 → renderer 의 EatingBurst 가 분기. 새 IPC `pet:nudgeCondition` 으로 외부 condition 보너스 채널 개설. 시각 효과는 거의 CSS keyframe + 클래스 토글. Blink/Sleep 의 눈 감김은 SVG inline 후 `.pet-eye` 클래스를 CSS 로 조작. 새 hook 2개(useSleepState, useTickleDetector) 는 순수 모듈로 분리해 vitest 커버.

**Tech Stack:** TypeScript 5.7, Electron 33, React 18, Vite 6, vitest 4. Vite `?raw` 임포트로 SVG 인라인.

**Spec:** `docs/specs/2026-05-16-pet-actions-design.md`

---

## File Structure

**Create:**
- `renderer/hooks/useSleepState.ts` — sleep enter/exit 로직
- `renderer/hooks/useSleepState.test.ts`
- `renderer/hooks/useTickleDetector.ts` — 좌우 흔들기 감지
- `renderer/hooks/useTickleDetector.test.ts`

**Modify:**
- `core/types.ts` — `NutritionEvent.model?`, `PetEvent` 의 fed 에 `model?`
- `core/pet/PetState.ts` — `feed(nutrition, model?)`, 새 `nudgeCondition(amount)`
- `core/pet/PetState.test.ts` — 새 케이스
- `core/feeding/FeedingPipeline.ts` — model 전달
- `core/feeding/FeedingPipeline.test.ts` — 새 케이스
- `core/tokenSource/TokenSource.ts` 는 변경 없음 (TokenEvent.model 이미 존재)
- `electron/ipc.ts` — `pet:nudgeCondition` 핸들러
- `electron/preload.ts` — `nudgeCondition` 노출
- `renderer/components/Pet.tsx` — SVG 인라인, sleeping/blink 클래스
- `renderer/components/EatingBurst.tsx` — model prop
- `renderer/App.tsx` — fed.model 사용, blink/sleep/tickle/almost-there 통합
- `renderer/public/sprites/phase[0-3].svg` — 눈 element 에 `class="pet-eye"` 부여
- `renderer/styles.css` — breathing, blink, sleeping, almost-there, burst variant
- `renderer/components/PetProgressBar.tsx` — almost-there 클래스
- `docs/02-pet.md`, `docs/05-pet-design.md`, `docs/03-implementation.md` — 변경 반영

---

## Task 1: NutritionEvent / PetEvent 타입에 model 필드 추가

**Files:**
- Modify: `core/types.ts`

- [ ] **Step 1: 타입 수정**

`core/types.ts` 의 `NutritionEvent` 와 `PetEvent` 의 fed 케이스에 `model?: string` 추가.

```ts
export interface NutritionEvent {
  ts: number;
  nutrition: number;
  source: string;
  model?: string;
}
```

```ts
export type PetEvent =
  | { type: 'fed';          nutrition: number; ts: number; model?: string }
  | { type: 'evolved';      from: Phase; to: Phase; ts: number }
  | { type: 'mood-changed'; from: Mood;  to: Mood;  ts: number }
  | { type: 'snapshot';     snapshot: PetSnapshot };
```

> 주의: 현 `NutritionEvent` 가 `core/feeding/FeedingPipeline` 에서 직접 사용되지 않는다면 (PetState.feed 가 nutrition 만 받음) 별도 충돌 없음. 사용처 grep 으로 확인 후 진행.

- [ ] **Step 2: 타입체크 확인**

Run: `npx tsc --noEmit`
Expected: PASS (의존 모듈이 model 을 안 쓰므로 컴파일은 그대로 통과).

- [ ] **Step 3: Commit**

```bash
git add core/types.ts
git commit -m "types: add optional model field to NutritionEvent/PetEvent.fed"
```

---

## Task 2: PetState.feed 에 model 인자, nudgeCondition 메서드 추가

**Files:**
- Modify: `core/pet/PetState.ts`
- Modify: `core/pet/PetState.test.ts`

- [ ] **Step 1: feed.model 테스트 작성 (실패해야 함)**

`core/pet/PetState.test.ts` 의 `describe('PetState.feed')` 안에 추가:

```ts
it('forwards model in fed event when provided', () => {
  pet.feed(500, 'claude-opus-4-7');
  const fed = captured.find(e => e.type === 'fed');
  expect(fed).toMatchObject({ type: 'fed', nutrition: 500, model: 'claude-opus-4-7' });
});

it('omits model in fed event when not provided', () => {
  pet.feed(500);
  const fed = captured.find(e => e.type === 'fed') as { model?: string };
  expect(fed.model).toBeUndefined();
});
```

- [ ] **Step 2: nudgeCondition 테스트 작성**

같은 파일에 새 describe 추가:

```ts
describe('PetState.nudgeCondition', () => {
  it('caps condition at 100', () => {
    const pet = new PetState({ ...baseSnap, condition: 98 }, { now: () => 1_000 });
    const captured: PetEvent[] = [];
    pet.on(e => captured.push(e));
    pet.nudgeCondition(10);
    expect(pet.snapshot.condition).toBe(100);
  });

  it('ignores non-positive amounts', () => {
    const pet = new PetState({ ...baseSnap, condition: 50 }, { now: () => 1_000 });
    pet.nudgeCondition(0);
    pet.nudgeCondition(-5);
    expect(pet.snapshot.condition).toBe(50);
  });

  it('emits mood-changed when crossing threshold', () => {
    const pet = new PetState({ ...baseSnap, condition: 65, mood: 'normal' }, { now: () => 1_000 });
    const captured: PetEvent[] = [];
    pet.on(e => captured.push(e));
    pet.nudgeCondition(10); // 65 + 10 = 75 → happy
    expect(captured.some(e => e.type === 'mood-changed' && e.to === 'happy')).toBe(true);
  });
});
```

- [ ] **Step 3: 테스트 실행 (실패 확인)**

Run: `npm test -- core/pet/PetState.test.ts`
Expected: FAIL — `pet.feed` 가 두 번째 인자 받지 않고, `nudgeCondition` 메서드가 없음.

- [ ] **Step 4: 구현**

`core/pet/PetState.ts`:

```ts
feed(nutrition: number, model?: string): void {
  if (nutrition <= 0) return;
  const now = this.clock.now();
  const prevPhase = this.snap.phase;
  const prevMood = this.snap.mood;

  this.snap.lifetimeXP += nutrition;
  this.snap.condition = applyGain(this.snap.condition, nutrition);
  this.snap.lastFedAt = now;
  this.snap.phase = phaseForXP(this.snap.lifetimeXP);
  this.snap.mood = moodForCondition(this.snap.condition);

  this.emit({ type: 'fed', nutrition, ts: now, ...(model ? { model } : {}) });
  if (this.snap.phase !== prevPhase) {
    this.emit({ type: 'evolved', from: prevPhase, to: this.snap.phase, ts: now });
  }
  if (this.snap.mood !== prevMood) {
    this.emit({ type: 'mood-changed', from: prevMood, to: this.snap.mood, ts: now });
  }
}

nudgeCondition(amount: number): void {
  if (amount <= 0) return;
  const prevMood = this.snap.mood;
  this.snap.condition = applyGain(this.snap.condition, amount * 1000);
  // applyGain 의 GAIN_PER_NUTRITION = 0.001 이라 nutrition*0.001 = amount.
  // 직접 산식으로 명확히 가도 OK — 가독성 위해 명시:
  this.snap.condition = Math.min(100, this.snap.condition);
  this.snap.mood = moodForCondition(this.snap.condition);
  if (this.snap.mood !== prevMood) {
    this.emit({ type: 'mood-changed', from: prevMood, to: this.snap.mood, ts: this.clock.now() });
  }
}
```

> 위 nudgeCondition 의 첫 줄은 applyGain 의 단위 변환이 헷갈리니 단순 산식으로 교체 권장:
>
> ```ts
> nudgeCondition(amount: number): void {
>   if (amount <= 0) return;
>   const prevMood = this.snap.mood;
>   this.snap.condition = Math.min(100, this.snap.condition + amount);
>   this.snap.mood = moodForCondition(this.snap.condition);
>   if (this.snap.mood !== prevMood) {
>     this.emit({ type: 'mood-changed', from: prevMood, to: this.snap.mood, ts: this.clock.now() });
>   }
> }
> ```
>
> 단위는 condition 의 0..100 동일 단위. amount=5 → +5. 위 산식 버전을 사용할 것.

- [ ] **Step 5: 테스트 통과 확인**

Run: `npm test -- core/pet/PetState.test.ts`
Expected: PASS (기존 + 신규 모두).

- [ ] **Step 6: Commit**

```bash
git add core/pet/PetState.ts core/pet/PetState.test.ts
git commit -m "pet: feed accepts optional model; add nudgeCondition for tickle"
```

---

## Task 3: FeedingPipeline 이 model 전달

**Files:**
- Modify: `core/feeding/FeedingPipeline.ts`
- Modify: `core/feeding/FeedingPipeline.test.ts` (있으면) 또는 신규 케이스 추가

- [ ] **Step 1: 기존 테스트 확인**

Run: `ls core/feeding/`
Expected: `FeedingPipeline.test.ts` 가 있는지 확인. 없으면 만들기.

- [ ] **Step 2: 테스트 작성**

`core/feeding/FeedingPipeline.test.ts` 에 추가 (없으면 신규 파일):

```ts
import { describe, it, expect } from 'vitest';
import { FeedingPipeline } from './FeedingPipeline';
import { PetState } from '../pet/PetState';
import type { PetEvent, TokenEvent } from '../types';

const baseSnap = {
  schemaVersion: 1, createdAt: 0, lifetimeXP: 0, phase: 0 as const,
  condition: 50, mood: 'normal' as const,
  lastTickAt: 0, lastFedAt: null,
  lastCursors: {}, windowPos: { x: 0, y: 0 }, windowSize: { w: 220, h: 220 }
};

function makeFakeDb() {
  return {
    insert: (_: TokenEvent) => true,
    upsertSession: () => {}
  } as any;
}

describe('FeedingPipeline', () => {
  it('passes model from TokenEvent into PetState.feed', () => {
    const pet = new PetState({ ...baseSnap }, { now: () => 1_000 });
    const captured: PetEvent[] = [];
    pet.on(e => captured.push(e));
    const pipe = new FeedingPipeline(makeFakeDb(), pet);
    pipe.handle({
      sourceId: 's', sessionId: 'x', cursor: 'c1', ts: 1_000,
      tokens: { input: 0, output: 10_000, cacheRead: 0, cacheCreate: 0 },
      model: 'claude-opus-4-7'
    });
    const fed = captured.find(e => e.type === 'fed') as { model?: string };
    expect(fed.model).toBe('claude-opus-4-7');
  });

  it('omits model when TokenEvent has none', () => {
    const pet = new PetState({ ...baseSnap }, { now: () => 1_000 });
    const captured: PetEvent[] = [];
    pet.on(e => captured.push(e));
    const pipe = new FeedingPipeline(makeFakeDb(), pet);
    pipe.handle({
      sourceId: 's', sessionId: 'x', cursor: 'c1', ts: 1_000,
      tokens: { input: 0, output: 10_000, cacheRead: 0, cacheCreate: 0 }
    });
    const fed = captured.find(e => e.type === 'fed') as { model?: string };
    expect(fed.model).toBeUndefined();
  });
});
```

- [ ] **Step 3: 테스트 실행 (실패 확인)**

Run: `npm test -- core/feeding/FeedingPipeline.test.ts`
Expected: FAIL — pipeline 이 model 을 전달하지 않음.

- [ ] **Step 4: 구현**

`core/feeding/FeedingPipeline.ts` 의 `handle` 수정:

```ts
handle(e: TokenEvent): void {
  const inserted = this.db.insert(e);
  if (!inserted) return;
  const nutrition = tokensToNutrition(e.tokens);
  if (nutrition > 0) this.pet.feed(nutrition, e.model);
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npm test -- core/feeding/FeedingPipeline.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add core/feeding/FeedingPipeline.ts core/feeding/FeedingPipeline.test.ts
git commit -m "feeding: forward TokenEvent.model into pet.feed"
```

---

## Task 4: IPC `pet:nudgeCondition` 추가

**Files:**
- Modify: `electron/ipc.ts`
- Modify: `electron/preload.ts`

- [ ] **Step 1: ipc.ts 수정**

`electron/ipc.ts` 의 `wireIpc` 함수에서 다른 `ipcMain.handle` 들 아래에 추가:

```ts
ipcMain.handle('pet:nudgeCondition', (_e, amount: number) => {
  const n = Number(amount);
  if (!Number.isFinite(n)) return;
  // 어뷰징 방지: 단발 최대 10 (스펙의 +5 보다 여유)
  pet.nudgeCondition(Math.min(10, Math.max(0, n)));
});
```

teardown 의 `removeHandler` 목록에도 추가:

```ts
ipcMain.removeHandler('pet:nudgeCondition');
```

- [ ] **Step 2: preload.ts 노출**

`electron/preload.ts` 의 `exposeInMainWorld` 객체에 추가:

```ts
nudgeCondition: (amount: number) => ipcRenderer.invoke('pet:nudgeCondition', amount),
```

- [ ] **Step 3: window.pet 타입 보강 (필요 시)**

`renderer/global.d.ts` 또는 동등한 위치에 `pet` 인터페이스가 정의돼 있다면 추가. 없으면 다음을 `renderer/global.d.ts` 에 신규 작성:

```ts
declare global {
  interface Window {
    pet?: {
      subscribe?: (cb: (e: unknown) => void) => () => void;
      getSnapshot?: () => Promise<any>;
      getStats?: () => Promise<any>;
      todayBySession?: () => Promise<any>;
      sessionDetailToday?: (sessionId: string) => Promise<any>;
      openMenu?: () => Promise<void>;
      nudgeCondition?: (amount: number) => Promise<void>;
    };
  }
}
export {};
```

> 기존에 비슷한 d.ts 가 있으면 거기에 `nudgeCondition` 만 추가.

- [ ] **Step 4: 타입체크**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add electron/ipc.ts electron/preload.ts renderer/global.d.ts
git commit -m "ipc: add pet:nudgeCondition channel"
```

---

## Task 5: Breathing — 항상 ON CSS keyframe

**Files:**
- Modify: `renderer/styles.css`

- [ ] **Step 1: keyframe + animation 적용**

`renderer/styles.css` 의 `.pet-sprite` 블록 바로 아래에 추가:

```css
@keyframes breathe {
  0%   { transform: scale(1); }
  50%  { transform: scale(1.02); }
  100% { transform: scale(1); }
}
.pet-sprite { animation: breathe 3.6s ease-in-out infinite; }
/* feasting / evolve 진행 중엔 호흡 일시정지: bounce 가 transform 을 점유 */
.pet.feasting .pet-sprite { animation: none; }
```

> 펫의 squash bounce 는 `.pet` 자체의 `transform` 을 만지고, 호흡은 `.pet-sprite` 의 `transform` 을 만진다. 충돌 없음. 단 feasting 중에는 sprite transform 도 정지시켜 squash 와 베이스 호흡이 겹쳐 보이지 않게 한다.

- [ ] **Step 2: 시각 확인**

Run: `npm run dev`
Expected: 펫이 미세하게 호흡함. 먹을 때 squash 모션은 정상.

종료: ctrl-c.

- [ ] **Step 3: Commit**

```bash
git add renderer/styles.css
git commit -m "css: add breathing animation on pet sprite"
```

---

## Task 6: Almost-there — 진화 90% 펄스

**Files:**
- Modify: `renderer/components/PetProgressBar.tsx`
- Modify: `renderer/App.tsx`
- Modify: `renderer/styles.css`

- [ ] **Step 1: PetProgressBar 가 almost prop 받기**

`renderer/components/PetProgressBar.tsx` 를 읽고 (현재 시그니처 확인 후) `almost?: boolean` prop 추가. fill 에 `almost-there` 클래스 토글.

예상 패턴 (실제 파일 구조에 맞춰 적용):

```tsx
export function PetProgressBar({ phase, xp, mood, almost }: { phase: Phase; xp: number; mood: Mood; almost?: boolean }) {
  // ... 기존 계산 ...
  return (
    <div className={`progress mood-${mood}`}>
      <div className={`progress-fill ${almost ? 'almost-there' : ''}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
```

- [ ] **Step 2: App.tsx 에서 파생값 계산 및 전달**

`renderer/App.tsx` 의 `PetView` 내부, `if (!snap) return null;` 직전 또는 직후에:

```tsx
const threshold = targetThreshold(snap.phase);
const ratio = threshold > 0 ? snap.lifetimeXP / threshold : 0;
const almostThere = snap.phase < 3 && ratio >= 0.9;
```

`PetProgressBar` 호출에 `almost={almostThere}` 전달. 펫 wrapper div 에 `${almostThere ? 'almost-there' : ''}` 클래스 추가:

```tsx
<div className={`pet-wrap ${almostThere ? 'almost-there' : ''}`} {...hover.bind} ...>
  <Pet ... />
</div>
```

> 기존엔 wrapper div 가 익명. 클래스 부착 위치는 `<Pet>` 의 outer wrapper. `Pet` 컴포넌트 자체에 prop 추가 대신 wrapper 에 클래스 다는 게 변경이 작다.

- [ ] **Step 3: CSS 추가**

`renderer/styles.css` 끝에 추가:

```css
.progress-fill.almost-there {
  background: rgba(255,200,80,1);
  animation: almostPulse 0.8s ease-in-out infinite;
}
@keyframes almostPulse {
  0%, 100% { opacity: 0.7; }
  50%      { opacity: 1; }
}
.pet-wrap.almost-there .pet-sprite {
  filter: drop-shadow(0 0 8px rgba(255,210,120,0.85));
}
```

- [ ] **Step 4: 시각 확인 (수동)**

Run: `npm run dev`. (조건 충족 데이터가 없을 수 있음 — 임시로 `pet-state.json` 의 lifetimeXP 를 phase1 임계 9000 같은 값으로 만들면 확인 가능. 단, 수정 후 원복.)
Expected: 진행률 90% 이상에서 progress bar 가 골드 펄스 + 펫이 노란 글로우.

- [ ] **Step 5: Commit**

```bash
git add renderer/components/PetProgressBar.tsx renderer/App.tsx renderer/styles.css
git commit -m "ui: almost-there pulse when next phase ≥ 90%"
```

---

## Task 7: 모델별 EatingBurst 차등

**Files:**
- Modify: `renderer/components/EatingBurst.tsx`
- Modify: `renderer/App.tsx`
- Modify: `renderer/styles.css`

- [ ] **Step 1: EatingBurst 에 model prop 추가**

`renderer/components/EatingBurst.tsx` 전체 교체:

```tsx
import { fmtK } from '../data/fmt';

function variantOf(model?: string): 'opus' | 'haiku' | 'default' {
  if (!model) return 'default';
  const m = model.toLowerCase();
  if (m.includes('opus'))  return 'opus';
  if (m.includes('haiku')) return 'haiku';
  return 'default';
}

const PREFIX: Record<'opus' | 'haiku' | 'default', string> = {
  opus:    '✨',
  haiku:   '🍿',
  default: ''
};

export function EatingBurst({ amount, xPct, yPct, model }: {
  amount: number; xPct: number; yPct: number; model?: string;
}) {
  const v = variantOf(model);
  return (
    <div className={`burst burst-${v}`} style={{ left: `${xPct}%`, top: `${yPct}%` }}>
      {PREFIX[v]}+{fmtK(amount)}
    </div>
  );
}
```

- [ ] **Step 2: CSS variant 추가**

`renderer/styles.css` 의 `.burst` 블록 아래에 추가:

```css
.burst-opus  { font-size: 18px; color: #ffd24a; }
.burst-haiku { font-size: 11px; color: rgba(255,220,120,0.7); }
/* burst-default: 기존 .burst 스타일 그대로 */
```

- [ ] **Step 3: App.tsx 에서 model 전달**

`renderer/App.tsx` 의 fed 핸들러:

```tsx
if (lastEvent.type === 'fed') {
  const id = Math.random();
  const amount = lastEvent.nutrition;
  const model = lastEvent.model;
  const xPct = 30 + Math.random() * 40;
  const yPct = 30 + Math.random() * 40;
  setBursts(b => [...b, { id, amount, xPct, yPct, model }]);
  // ... 나머지 동일
}
```

`bursts` state 타입:

```tsx
const [bursts, setBursts] = useState<{ id: number; amount: number; xPct: number; yPct: number; model?: string }[]>([]);
```

렌더:

```tsx
{bursts.map(b => <EatingBurst key={b.id} amount={b.amount} xPct={b.xPct} yPct={b.yPct} model={b.model} />)}
```

- [ ] **Step 4: 타입체크 + 시각 확인**

Run: `npx tsc --noEmit`
Expected: PASS.

Run: `npm run dev`, 실제 Claude 세션으로 토큰 유입 시 모델별 다른 burst 확인. (실제 fed 이벤트가 안 나오는 환경이면 일단 skip — 코드만 검증.)

- [ ] **Step 5: Commit**

```bash
git add renderer/components/EatingBurst.tsx renderer/App.tsx renderer/styles.css
git commit -m "ui: EatingBurst variants per model (opus/sonnet/haiku)"
```

---

## Task 8: SVG 인라인 + Blink

**Files:**
- Modify: `renderer/public/sprites/phase0.svg` ~ `phase3.svg`
- Modify: `renderer/components/Pet.tsx`
- Modify: `renderer/styles.css`

> 배경: `<img src>` 는 CSS 가 SVG 내부에 닿지 못함. blink 를 CSS 만으로 처리하려면 SVG 를 DOM 에 인라인해야 한다. Vite 의 `?raw` 임포트로 SVG 문자열을 받아 `dangerouslySetInnerHTML` 로 삽입한다.

- [ ] **Step 1: 각 SVG 에 `class="pet-eye"` 부여**

`renderer/public/sprites/phase0.svg` — 알의 검은 점 두 개에:
- `<circle cx="..." cy="..." r="..." fill="#000"/>` 형태 두 개에 `class="pet-eye"` 추가.

`renderer/public/sprites/phase1.svg` — 흰 눈동자 위 검은 점 (line 16~17):
- `<circle cx="55" cy="61" r="2.5" fill="#111" class="pet-eye"/>`
- `<circle cx="75" cy="61" r="2.5" fill="#111" class="pet-eye"/>`

`renderer/public/sprites/phase2.svg` — 눈 element 식별 후 `class="pet-eye"` 부여.

`renderer/public/sprites/phase3.svg` — 동일.

> 각 phase 의 정확한 element 는 파일을 직접 열어 눈 좌표를 확인하고 그 element 들에만 클래스를 부여. 흰 sclera 가 있는 phase 는 검은 동공(pupil)에만 적용 — 그게 더 자연스러운 blink.

- [ ] **Step 2: Vite SVG raw 임포트 동작 확인**

Vite 기본으로 `?raw` 임포트가 지원됨 — 별도 설정 불필요. 단, 경로는 `renderer/public/` 가 아니라 `src` 트리에 있어야 `?raw` 가 작동. 현재는 `public/` 에 있으므로 `src/sprites/` 로 옮기거나, fetch 방식으로 가져온다.

대안: 빌드 시 `public/` 자산을 fetch 로 로드.

```tsx
const [svg, setSvg] = useState<string>('');
useEffect(() => {
  fetch(SPRITE[phase]).then(r => r.text()).then(setSvg);
}, [phase]);
```

이 방식이 기존 `public/` 폴더 유지에 가장 가벼움. 단 처음 로드 시 잠깐 빈 상태. ⇒ phase 별로 캐시:

```tsx
const SVG_CACHE: Record<Phase, string | undefined> = { 0: undefined, 1: undefined, 2: undefined, 3: undefined };
```

세션 동안 캐시. 첫 fetch 후 SVG 노출.

- [ ] **Step 3: Pet.tsx 변경**

`renderer/components/Pet.tsx` 를 다음으로 교체:

```tsx
import { useEffect, useState } from 'react';
import type { Phase, Mood } from '@core/types';

const SPRITE: Record<Phase, string> = {
  0: 'sprites/phase0.svg',
  1: 'sprites/phase1.svg',
  2: 'sprites/phase2.svg',
  3: 'sprites/phase3.svg'
};

const MOOD_OVERLAY: Record<Mood, string> = {
  happy: '', normal: '', sleepy: '💤', sad: '😔',
  feasting: '✨', curious: '❔'
};

const SVG_CACHE: Partial<Record<Phase, string>> = {};

function usePhaseSvg(phase: Phase): string {
  const [svg, setSvg] = useState<string>(SVG_CACHE[phase] ?? '');
  useEffect(() => {
    if (SVG_CACHE[phase]) { setSvg(SVG_CACHE[phase]!); return; }
    fetch(SPRITE[phase]).then(r => r.text()).then(text => {
      SVG_CACHE[phase] = text;
      setSvg(text);
    });
  }, [phase]);
  return svg;
}

export function Pet({ phase, mood, feasting, blinking, sleeping }: {
  phase: Phase; mood: Mood; feasting: boolean;
  blinking?: boolean; sleeping?: boolean;
}) {
  const svg = usePhaseSvg(phase);
  const effectiveMood: Mood = sleeping ? 'sleepy' : mood;
  const overlay = MOOD_OVERLAY[effectiveMood];
  return (
    <div className={`pet ${feasting ? 'feasting' : ''} mood-${effectiveMood} ${blinking ? 'blink' : ''} ${sleeping ? 'sleeping' : ''}`}>
      <div className="pet-sprite" dangerouslySetInnerHTML={{ __html: svg }} />
      {overlay && <span className="pet-overlay">{overlay}</span>}
    </div>
  );
}
```

> `pet-sprite` 가 이제 `<div>` 안에 인라인 `<svg>`. CSS 의 `.pet-sprite { animation: breathe ... }` 는 div 에 적용되므로 그대로 작동. 단 `object-fit` 은 더 이상 효과 없음 — SVG 자체의 viewBox 가 scale 담당.

- [ ] **Step 4: CSS — pet-sprite > svg 가 100% 크기 차지하게**

`renderer/styles.css` 의 기존 `.pet-sprite` 블록을 수정:

```css
.pet-sprite {
  width: 100%; height: 100%;
  pointer-events: none;
  -webkit-user-drag: none;
  animation: breathe 3.6s ease-in-out infinite;
}
.pet-sprite > svg { width: 100%; height: 100%; display: block; }
```

`image-rendering` 라인은 제거 (이제 `<img>` 가 아님).

- [ ] **Step 5: Blink CSS**

`renderer/styles.css` 끝에:

```css
.pet.blink .pet-eye { opacity: 0; transition: opacity 60ms ease; }
.pet:not(.blink) .pet-eye { transition: opacity 80ms ease; }
```

- [ ] **Step 6: Blink 트리거 (App.tsx)**

`renderer/App.tsx` 의 `PetView` 내부에 hook 추가:

```tsx
const [blinking, setBlinking] = useState(false);
useEffect(() => {
  if (!snap) return;
  if (snap.mood !== 'happy' && snap.mood !== 'normal') return;
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout>;
  const schedule = () => {
    const delay = 15_000 + Math.random() * 15_000;
    timer = setTimeout(() => {
      if (cancelled) return;
      setBlinking(true);
      setTimeout(() => { if (!cancelled) setBlinking(false); }, 150);
      schedule();
    }, delay);
  };
  schedule();
  return () => { cancelled = true; clearTimeout(timer); };
}, [snap?.mood]);
```

`<Pet>` 호출에 `blinking={blinking}` 추가.

- [ ] **Step 7: 시각 확인**

Run: `npm run dev`
Expected: 펫이 호흡하며, 가끔(15-30초) 눈을 깜빡. happy/normal 일 때만.

종료.

- [ ] **Step 8: Commit**

```bash
git add renderer/public/sprites/phase0.svg renderer/public/sprites/phase1.svg \
        renderer/public/sprites/phase2.svg renderer/public/sprites/phase3.svg \
        renderer/components/Pet.tsx renderer/styles.css renderer/App.tsx
git commit -m "ui: inline SVG sprites and add blink animation"
```

---

## Task 9: Sleep state hook + 비주얼

**Files:**
- Create: `renderer/hooks/useSleepState.ts`
- Create: `renderer/hooks/useSleepState.test.ts`
- Modify: `renderer/App.tsx`
- Modify: `renderer/styles.css`

- [ ] **Step 1: hook 테스트 작성**

`renderer/hooks/useSleepState.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeSleep } from './useSleepState';

describe('computeSleep', () => {
  const HOUR = 3600_000;

  it('asleep when last fed > 60min ago (any hour)', () => {
    const now = new Date('2026-05-16T14:00:00').getTime(); // 14:00
    expect(computeSleep({ now, lastFedAt: now - 61 * 60_000, wokenInBucket: null })).toEqual({
      asleep: true, reason: 'idle'
    });
  });

  it('asleep at 23:30 by clock', () => {
    const now = new Date('2026-05-16T23:30:00').getTime();
    expect(computeSleep({ now, lastFedAt: now - 5_000, wokenInBucket: null })).toEqual({
      asleep: true, reason: 'night'
    });
  });

  it('awake at 14:00 when recently fed', () => {
    const now = new Date('2026-05-16T14:00:00').getTime();
    expect(computeSleep({ now, lastFedAt: now - 5_000, wokenInBucket: null }))
      .toEqual({ asleep: false, reason: null });
  });

  it('night sleep suppressed once woken in same night bucket', () => {
    const now = new Date('2026-05-16T23:30:00').getTime();
    expect(computeSleep({ now, lastFedAt: now - 5_000, wokenInBucket: 'night-2026-05-16' }))
      .toEqual({ asleep: false, reason: null });
  });

  it('idle reason still wins even after night suppression', () => {
    const now = new Date('2026-05-16T23:30:00').getTime();
    expect(computeSleep({ now, lastFedAt: now - 65 * 60_000, wokenInBucket: 'night-2026-05-16' }))
      .toEqual({ asleep: true, reason: 'idle' });
  });
});
```

- [ ] **Step 2: 테스트 실행 (실패 확인)**

Run: `npm test -- renderer/hooks/useSleepState.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 순수 모듈 구현**

`renderer/hooks/useSleepState.ts`:

```ts
import { useEffect, useRef, useState } from 'react';

export type SleepReason = 'idle' | 'night';

export interface SleepInput {
  now: number;
  lastFedAt: number | null;
  /** Bucket id of the night the user was last woken in. Used to avoid re-sleeping
   *  the same night after wake. Format: 'night-YYYY-MM-DD'. */
  wokenInBucket: string | null;
}

const IDLE_THRESHOLD_MS = 60 * 60_000;

function nightBucket(d: Date): string {
  // The night bucket extends from one calendar day at 23:00 until next day 06:00.
  // Use the date on which 23:00 falls.
  const h = d.getHours();
  const ref = new Date(d);
  if (h < 6) ref.setDate(ref.getDate() - 1);
  const y = ref.getFullYear();
  const m = String(ref.getMonth() + 1).padStart(2, '0');
  const day = String(ref.getDate()).padStart(2, '0');
  return `night-${y}-${m}-${day}`;
}

export function isNightHour(d: Date): boolean {
  const h = d.getHours();
  return h >= 23 || h < 6;
}

export function computeSleep(input: SleepInput): { asleep: boolean; reason: SleepReason | null } {
  const { now, lastFedAt, wokenInBucket } = input;
  const idle = lastFedAt == null ? false : (now - lastFedAt) > IDLE_THRESHOLD_MS;
  if (idle) return { asleep: true, reason: 'idle' };
  const d = new Date(now);
  if (isNightHour(d)) {
    const bucket = nightBucket(d);
    if (wokenInBucket === bucket) return { asleep: false, reason: null };
    return { asleep: true, reason: 'night' };
  }
  return { asleep: false, reason: null };
}

export function useSleepState(lastFedAt: number | null, wakeNonce: number): {
  asleep: boolean; reason: SleepReason | null; nightBucketNow: string;
} {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  // wakeNonce changes when the user interacts (click/drag/tickle) or tokens arrive.
  const wokenBucketRef = useRef<string | null>(null);
  const lastWakeRef = useRef<number>(0);
  if (wakeNonce !== lastWakeRef.current) {
    lastWakeRef.current = wakeNonce;
    const now = new Date(Date.now());
    if (isNightHour(now)) wokenBucketRef.current = nightBucket(now);
  }
  void tick;
  const now = Date.now();
  const result = computeSleep({ now, lastFedAt, wokenInBucket: wokenBucketRef.current });
  return { ...result, nightBucketNow: nightBucket(new Date(now)) };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- renderer/hooks/useSleepState.test.ts`
Expected: PASS.

- [ ] **Step 5: App.tsx 통합**

`renderer/App.tsx` 내 `PetView`:

```tsx
import { useSleepState } from './hooks/useSleepState';
// ...

const [wakeNonce, setWakeNonce] = useState(0);
const bumpWake = () => setWakeNonce(n => n + 1);

useEffect(() => {
  if (!lastEvent) return;
  if (lastEvent.type === 'fed') bumpWake();
}, [lastEvent]);

const sleep = useSleepState(snap?.lastFedAt ?? null, wakeNonce);
```

기존 `onPointerDown` 이 사용자 클릭/드래그 진입점이므로 그 안에서도 `bumpWake()`:

```tsx
const onPointerDown = (e: React.PointerEvent) => {
  downRef.current = { x: e.clientX, y: e.clientY };
  bumpWake();
};
```

`<Pet>` 호출에 `sleeping={sleep.asleep}` 추가:

```tsx
<Pet phase={snap.phase} mood={snap.mood} feasting={feasting} blinking={blinking} sleeping={sleep.asleep} />
```

> 잠자는 동안 blink 는 의미 없음. Pet.tsx 안 `sleeping` 이 true 일 때 blink 효과는 영구 적용된 셈이므로 별도 코드 불필요 (다음 step CSS 가 처리).

- [ ] **Step 6: Sleeping CSS**

`renderer/styles.css` 끝에:

```css
.pet.sleeping .pet-eye { opacity: 0; }
.pet.sleeping .pet-sprite { animation: breathe 5.4s ease-in-out infinite; }
@keyframes stretchPop {
  0%   { transform: scaleY(1);   }
  40%  { transform: scaleY(1.10); }
  100% { transform: scaleY(1);   }
}
.pet.waking .pet-sprite { animation: stretchPop 0.6s ease; }
```

- [ ] **Step 7: Stretch on wake (App.tsx)**

`renderer/App.tsx`:

```tsx
const [waking, setWaking] = useState(false);
const wasAsleepRef = useRef(sleep.asleep);
useEffect(() => {
  if (wasAsleepRef.current && !sleep.asleep) {
    setWaking(true);
    const t = setTimeout(() => setWaking(false), 600);
    return () => clearTimeout(t);
  }
  wasAsleepRef.current = sleep.asleep;
}, [sleep.asleep]);
```

`<Pet>` 컴포넌트는 waking 클래스를 직접 받지 않으니, wrapper div 에 `${waking ? 'waking' : ''}` 추가:

```tsx
<div className={`pet-wrap ${almostThere ? 'almost-there' : ''} ${waking ? 'waking-wrap' : ''}`} ...>
```

CSS 선택자도 `.pet-wrap.waking-wrap .pet-sprite` 로 맞추거나, 더 단순하게 `Pet` 컴포넌트가 `waking` prop 도 받게 확장. 여기서는 후자를 선택:

`renderer/components/Pet.tsx` 시그니처에 `waking?: boolean` 추가, className 에 `${waking ? 'waking' : ''}`:

```tsx
export function Pet({ phase, mood, feasting, blinking, sleeping, waking }: {
  phase: Phase; mood: Mood; feasting: boolean;
  blinking?: boolean; sleeping?: boolean; waking?: boolean;
}) {
  // ... className 에 ${waking ? 'waking' : ''} 추가
}
```

CSS 의 `.pet.waking` 그대로 작동.

- [ ] **Step 8: 시각 확인**

Run: `npm run dev`. 시스템 시각이 23-06 이거나 1시간 동안 토큰이 없는 환경에서 펫이 자야 함. 클릭하면 깸 + stretch.
Expected: sleeping 시 눈 감김, 깨면 0.6s stretch.

- [ ] **Step 9: Commit**

```bash
git add renderer/hooks/useSleepState.ts renderer/hooks/useSleepState.test.ts \
        renderer/components/Pet.tsx renderer/App.tsx renderer/styles.css
git commit -m "ui: sleep state (idle 60min or 23-06h) with wake stretch"
```

---

## Task 10: Tickle (쓰담쓰담) detector hook + 통합

**Files:**
- Create: `renderer/hooks/useTickleDetector.ts`
- Create: `renderer/hooks/useTickleDetector.test.ts`
- Modify: `renderer/App.tsx`
- Modify: `renderer/data/speech.ts`

- [ ] **Step 1: 순수 로직 추출 & 테스트 작성**

`renderer/hooks/useTickleDetector.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { TickleTracker } from './useTickleDetector';

describe('TickleTracker', () => {
  it('fires when ≥3 direction reversals within 1s and ≥40px total movement', () => {
    const t = new TickleTracker();
    const fires: number[] = [];
    t.onFire(now => fires.push(now));
    t.move(0,  0, 1000);
    t.move(20, 0, 1100); // right
    t.move(0,  0, 1200); // left  (reversal 1)
    t.move(20, 0, 1300); // right (reversal 2)
    t.move(0,  0, 1400); // left  (reversal 3) — total movement 80px > 40
    expect(fires.length).toBe(1);
  });

  it('does not fire if reversals span > 1s window', () => {
    const t = new TickleTracker();
    const fires: number[] = [];
    t.onFire(now => fires.push(now));
    t.move(0,  0, 1000);
    t.move(20, 0, 1300);
    t.move(0,  0, 1700);
    t.move(20, 0, 2100); // > 1s old reversals slide out
    t.move(0,  0, 2200);
    expect(fires.length).toBe(0);
  });

  it('respects cooldown after firing (60s)', () => {
    const t = new TickleTracker();
    const fires: number[] = [];
    t.onFire(now => fires.push(now));
    const burst = (base: number) => {
      t.move(0,  0, base);
      t.move(20, 0, base + 100);
      t.move(0,  0, base + 200);
      t.move(20, 0, base + 300);
      t.move(0,  0, base + 400);
    };
    burst(1_000);
    burst(2_000); // within cooldown — should not fire
    burst(70_000); // after cooldown
    expect(fires.length).toBe(2);
  });

  it('does not fire if total movement < 40px even with reversals', () => {
    const t = new TickleTracker();
    const fires: number[] = [];
    t.onFire(now => fires.push(now));
    t.move(0, 0, 1000);
    t.move(5, 0, 1100);
    t.move(0, 0, 1200);
    t.move(5, 0, 1300);
    t.move(0, 0, 1400);
    expect(fires.length).toBe(0);
  });
});
```

- [ ] **Step 2: 테스트 실행 (실패 확인)**

Run: `npm test -- renderer/hooks/useTickleDetector.test.ts`
Expected: FAIL.

- [ ] **Step 3: 구현**

`renderer/hooks/useTickleDetector.ts`:

```ts
import { useEffect, useRef } from 'react';

const WINDOW_MS = 1_000;
const MIN_REVERSALS = 3;
const MIN_TOTAL_MOVEMENT_PX = 40;
const COOLDOWN_MS = 60_000;

type Sample = { x: number; t: number; dir: 1 | -1 | 0 };

export class TickleTracker {
  private samples: Sample[] = [];
  private lastFireAt = -Infinity;
  private fireCb: (now: number) => void = () => {};

  onFire(cb: (now: number) => void): void { this.fireCb = cb; }

  move(x: number, _y: number, now: number): void {
    const prev = this.samples[this.samples.length - 1];
    const dir: 1 | -1 | 0 = prev ? (x > prev.x ? 1 : x < prev.x ? -1 : 0) : 0;
    this.samples.push({ x, t: now, dir });
    // drop samples older than WINDOW_MS
    while (this.samples.length && this.samples[0]!.t < now - WINDOW_MS) {
      this.samples.shift();
    }
    if (now - this.lastFireAt < COOLDOWN_MS) return;

    // count direction reversals within window
    let reversals = 0;
    let totalMovement = 0;
    let prevDir: 1 | -1 | 0 = 0;
    for (let i = 1; i < this.samples.length; i++) {
      const cur = this.samples[i]!;
      const last = this.samples[i - 1]!;
      totalMovement += Math.abs(cur.x - last.x);
      if (cur.dir !== 0 && prevDir !== 0 && cur.dir !== prevDir) reversals++;
      if (cur.dir !== 0) prevDir = cur.dir;
    }
    if (reversals >= MIN_REVERSALS && totalMovement >= MIN_TOTAL_MOVEMENT_PX) {
      this.lastFireAt = now;
      this.samples = [];
      this.fireCb(now);
    }
  }
}

export function useTickleDetector(onTickle: () => void) {
  const trackerRef = useRef<TickleTracker | null>(null);
  if (!trackerRef.current) trackerRef.current = new TickleTracker();
  useEffect(() => {
    trackerRef.current!.onFire(() => onTickle());
  }, [onTickle]);
  return {
    onPointerMove: (e: React.PointerEvent) => {
      trackerRef.current!.move(e.clientX, e.clientY, Date.now());
    }
  };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- renderer/hooks/useTickleDetector.test.ts`
Expected: PASS.

- [ ] **Step 5: speech 풀에 tickle 라인 추가**

`renderer/data/speech.ts`:

```ts
export const TICKLE_LINES = [
  '큭큭',
  '간지러워!',
  '쓰담쓰담 좋아~',
  '헤헤헷'
] as const;

export function pickTickleLine(rng: () => number = Math.random): string {
  return pick(TICKLE_LINES, rng);
}
```

- [ ] **Step 6: App.tsx 통합**

`renderer/App.tsx`:

```tsx
import { useTickleDetector } from './hooks/useTickleDetector';
import { pickTickleLine } from './data/speech';

// 안쪽 ...
const [tickleLine, setTickleLine] = useState<string | null>(null);
const tickle = useTickleDetector(() => {
  setTickleLine(pickTickleLine());
  setFeasting(true);
  scheduleTimer(() => setFeasting(false), 600);
  scheduleTimer(() => setTickleLine(null), 1200);
  bumpWake();
  window.pet?.nudgeCondition?.(5);
});
```

펫 wrapper 의 이벤트 핸들러에 `onPointerMove={tickle.onPointerMove}` 추가:

```tsx
<div className={`pet-wrap ${almostThere ? 'almost-there' : ''}`}
     {...hover.bind}
     onPointerDown={onPointerDown}
     onPointerUp={onPointerUp}
     onPointerMove={tickle.onPointerMove}>
  <Pet ... />
</div>
```

렌더:

```tsx
{tickleLine && <SpeechBubble text={tickleLine} variant="greeting" />}
```

> tickleLine 과 greeting 이 동시에 안 뜨도록 `greeting && !tickleLine` 가드도 가능. 단순화를 위해 둘 다 작아 겹쳐도 무방하다고 보면 그대로.

- [ ] **Step 7: 시각 확인**

Run: `npm run dev`. 펫 위에서 마우스를 좌우로 빠르게 흔들면 "큭큭" 같은 라인 등장, condition 회복.
Expected: 1분 안에 같은 동작 반복하면 추가 발화 없음 (cooldown).

- [ ] **Step 8: Commit**

```bash
git add renderer/hooks/useTickleDetector.ts renderer/hooks/useTickleDetector.test.ts \
        renderer/data/speech.ts renderer/App.tsx
git commit -m "ui: tickle detector — mouse wiggle restores condition (+5, 60s cooldown)"
```

---

## Task 11: 문서 업데이트

**Files:**
- Modify: `docs/02-pet.md`
- Modify: `docs/05-pet-design.md`
- Modify: `docs/03-implementation.md`

- [ ] **Step 1: 02-pet.md — nudgeCondition 항목 추가**

`PetState` FSM 섹션의 메서드 목록에 추가:

```md
- `nudgeCondition(amount)`: 외부에서 condition 직접 가산 (0..100 단위). cap 100. tickle 같은 인터랙션 보상용. mood 변화 시 mood-changed 이벤트.
```

PetEvent fed 타입에 `model?: string` 표기 갱신.

- [ ] **Step 2: 05-pet-design.md — 6개 액션 섹션 추가**

새 섹션 "Pet Actions (v0.2)" 아래 6개 정의를 코드 위치와 함께 한 단락씩.

- Breathing — `.pet-sprite` keyframe, feasting 시 일시정지.
- Blink — SVG 인라인 + `.pet-eye` 클래스 + JS 인터벌 (`useState` + `setTimeout`), happy/normal 만.
- Sleep — `useSleepState`, `.pet.sleeping`, wake stretch.
- Pet/쓰담 — `useTickleDetector`, `pet:nudgeCondition` IPC, 1분 cooldown.
- 모델별 burst — `EatingBurst` 의 `model` prop, `.burst-opus / .burst-haiku`.
- Almost-there — `lifetimeXP / threshold ≥ 0.9` 파생, progress fill pulse + 펫 글로우.

- [ ] **Step 3: 03-implementation.md — IPC 표 갱신**

기존 IPC 표에 추가:

```md
| pet:nudgeCondition | (amount: number) => void | tickle 등 외부 인터랙션이 condition 을 가산. main 측에서 0..10 clamp. |
```

- [ ] **Step 4: CLAUDE.md 의 "코드 변경 영역 ↔ 문서" 표 검토**

`renderer/hooks/{useSleepState, useTickleDetector}.ts` 와 `core/pet/PetState.ts` 의 `nudgeCondition` 추가가 표의 어떤 행에 매핑되는지 확인. `05-pet-design.md` 와 `02-pet.md` 행에 새 파일명 누락됐으면 추가.

- [ ] **Step 5: Commit**

```bash
git add docs/02-pet.md docs/05-pet-design.md docs/03-implementation.md CLAUDE.md
git commit -m "docs: pet actions v0.2 — breathing/blink/sleep/tickle/model burst/almost"
```

---

## Task 12: 최종 검증

- [ ] **Step 1: 전체 테스트**

Run: `npm test`
Expected: PASS — 기존 73 tests + 새 케이스들. 카운트 80 전후.

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: 빌드**

Run: `npm run build`
Expected: dist-electron + dist 정상 생성.

- [ ] **Step 4: dev 스모크**

Run: `npm run dev`
Expected:
- 펫이 호흡함
- 가끔 깜빡임 (happy/normal 일 때)
- 23-06시이거나 1시간 무활동이면 자고 있음, 클릭하면 깨고 stretch
- 마우스 좌우 흔들기 → "큭큭" + condition 회복
- 모델별 burst (Opus 큰 ✨, Haiku 작은 🍿) — 실제 토큰 유입 시 확인
- 다음 phase 90% 근접 시 progress bar 골드 펄스 + 펫 글로우

- [ ] **Step 5: README/CHANGELOG 갱신 (있다면)**

`docs/README.md` 의 v0.2 섹션 또는 변경 이력 부분 갱신. (선택)

- [ ] **Step 6: 최종 push 는 사용자 컨펌 후**

사용자에게 "구현/테스트 끝났습니다. push 할까요?" 확인 후 진행.

---

## Self-Review

**Spec coverage**: 6개 액션 모두 Task 매핑 — Breathing(T5), Blink(T8), Sleep(T9), Tickle(T10), Model burst(T7), Almost-there(T6). 데이터/타입 변경 (NutritionEvent.model, PetEvent.fed.model, nudgeCondition IPC) 은 T1-T4 가 커버. 상태 우선순위는 CSS/JS 자연 합성으로 처리 (feasting 동안 breathing 정지 명시, sleeping 시 mood overlay 강제 sleepy).

**Placeholder scan**: 큰 placeholder 없음. T8 Step 1 의 phase2/3 SVG 는 "파일 열어 확인 후 부여" 안내 — 파일 구조가 외부 작업자에게 명확하지 않아 일부러 직접 보게 둠 (각 SVG 작아 30초 작업).

**Type consistency**: `nudgeCondition`, `useSleepState`, `TickleTracker`, `EatingBurst.model`, `PetEvent.fed.model` 이름이 모든 task 에서 일관.

**미해결 위험**:
- T8 의 `?raw` 대신 fetch 방식 선택은 첫 phase 전환 시 SVG 가 비는 한 frame 가능. 캐시로 같은 phase 재방문은 즉시. 첫 로드 안 좋다면 후속 패치로 dist 빌드 시 직접 import.
- Tickle 의 X 축만 보는 reversal 감지: 사용자가 위아래로 흔드는 경우 미감지. 의도된 단순화 (좌우만).
