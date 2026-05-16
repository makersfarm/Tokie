# 02. 펫

> 토큰이 영양가로 변환돼 들어오면 펫의 lifetimeXP 와 condition 이 오른다. 시간 경과로 condition 은 감소. condition 구간에 따라 mood 결정. XP 임계값에서 phase(진화) 갱신.

## 상태 스키마

`core/types.ts` 의 `PetSnapshot`:

| 필드 | 타입 | 의미 |
|---|---|---|
| schemaVersion | number | 마이그레이션용. 현재 1. |
| createdAt | number | 펫이 처음 생성된 epoch ms. |
| lifetimeXP | number | 누적 영양가. 진화 임계값과 비교. |
| phase | 0\|1\|2\|3 | 진화 단계. |
| condition | 0..100 | 단기 컨디션. 영양으로 오르고 시간으로 감소. |
| mood | happy\|normal\|sleepy\|sad\|feasting\|curious | 표시용. condition 에서 파생 + 일시 오버레이. |
| lastTickAt | number | 마지막 decay tick 시각. |
| lastFedAt | number\|null | 마지막 먹은 시각. |
| lastCursors | Record<string, CursorRecord> | TokenSource 별 재개용 cursor 저장소. |
| windowPos | {x, y} | 윈도우 위치 영속화. |
| windowSize | {w, h} | 윈도우 크기 영속화. |

## Phase / 진화

`core/pet/stages.ts`:

| phase | 이름 | 필요 누적 XP |
|---|---|---|
| 0 | Egg | 0 |
| 1 | Baby | 10,000 |
| 2 | Middle | 300,000 |
| 3 | Final | 3,000,000 |

`phaseForXP(xp)` 가 누적 XP 로 현재 phase 결정. `nextThreshold(phase)` 는 다음 단계 임계값(없으면 null).

**임계값/이름 수정**: `STAGES` 배열 직접 편집. 단조 증가만 유지하면 됨.

## Condition

`core/pet/condition.ts`:

```ts
MAX_CONDITION    = 100
GAIN_PER_NUTRITION = 0.001     // nutrition 1000 → condition +1
DECAY_PER_MS       = 100 / (24*60*60*1000)  // 24h 에 0 으로 선형 감소
MAX_DECAY_MS       = 24*60*60*1000           // 한 번에 깎이는 상한
```

`applyGain(c, n) = min(100, c + max(0,n)*0.001)`  
`applyDecay(c, ms)`: 경과시간을 24h 로 클램프 후 선형 감소. 24시간 안 켜도 0 이하로 안 가게.

## Mood 매핑

`moodForCondition(c)`:

| condition | mood |
|---|---|
| ≥ 70 | happy |
| ≥ 30 | normal |
| ≥ 10 | sleepy |
| < 10 | sad |

`feasting` / `curious` 는 transient 오버레이 (먹는 순간/궁금할 때) — 별도 이벤트로 잠깐 표시되고 다시 condition 기반 mood 로 복귀.

## PetEvent

`core/types.ts` 의 디스크리미네이티드 유니언:

```ts
| { type: 'fed';          nutrition: number; ts: number; model?: string }
| { type: 'evolved';      from: Phase; to: Phase; ts: number }
| { type: 'mood-changed'; from: Mood;  to: Mood;  ts: number }
| { type: 'snapshot';     snapshot: PetSnapshot }
```

`PetState.on(cb)` 으로 구독. bootstrap 에서 IPC 로 renderer 에 push (`pet:event` 채널).

## FSM (PetState)

`core/pet/PetState.ts` — 펫 코어.

- `feed(nutritionEvent, model?)`: condition 증가 → mood 갱신 → lifetimeXP 누적 → phase 재계산 → 변화한 항목들을 이벤트로 emit. `model` 인자가 있으면 fed 이벤트에 동반.
- `tick()`: 직전 tick 으로부터 경과 시간만큼 decay 적용. condition 변경 시 mood-changed 이벤트.
- `load(snapshot)`: 외부에서 snapshot 강제 교체 (Reset Pet, cursor 영속화 갱신 등). 변경 시 snapshot 이벤트 발행.
- `snapshot` getter: 현재 상태 immutable read.
- `nudgeCondition(amount)`: 외부에서 condition 직접 가산 (0..100 단위). cap 100. tickle 같은 인터랙션 보상용. mood 변화 시 mood-changed 이벤트.

## Feeding pipeline

`core/feeding/FeedingPipeline.ts`:

```
handle(event):
  if !db.insert(event):     // 이미 있는 (message_id, request_id)
    return                  // 무시
  nutrition = tokensToNutrition(event.tokens)
  pet.feed({ ts, nutrition, source })
```

dedup 통과한 이벤트만 펫 입에 들어감.

## 주기적 동작 (bootstrap.ts)

| 주기 | 동작 |
|---|---|
| 60s | `pet.tick()` — decay 적용 |
| 60s | JSONL cursor 들을 `pet.lastCursors['claude-jsonl-files']` 에 백업 (재시작 시 재개) |
| 500ms 디바운스 | snapshot 변경 시 `pet-state.json` 에 저장 (atomic) |

## 튜닝 가이드

| 바꿀 것 | 위치 |
|---|---|
| 진화 임계값 / phase 이름 | `core/pet/stages.ts` 의 `STAGES` |
| condition 증가/감소 속도 | `core/pet/condition.ts` 의 `GAIN_PER_NUTRITION`, `DECAY_PER_MS` |
| mood 구간 | `core/pet/condition.ts` 의 `moodForCondition` |
| 영양 가중치 | `core/feeding/nutrition.ts` — [01-tokens.md](./01-tokens.md) 도 참고 |
| tick 주기 | `electron/bootstrap.ts` 의 `setInterval(..., 60_000)` |

## 참고 파일

- `core/types.ts`
- `core/pet/{stages.ts, condition.ts, PetState.ts}`
- `core/feeding/{nutrition.ts, FeedingPipeline.ts}`
- `core/storage/petState.ts` — snapshot 저장 / 디바운스
