# Pet Actions — Design

> 날짜: 2026-05-16
> 범위: Tokie 가 "살아있다" 는 인상을 강화하기 위한 6개 액션 정의. 윈도우 안 동작만, 외부 데스크탑 이동 없음.

## 목적

현재 펫 동작은 토큰 들어올 때 bounce/burst, 클릭 시 인사, 진화 컷씬, mood 오버레이 이모지 정도. idle 일 때 정지 이미지처럼 보이고 사용자 인터랙션 폭이 좁음. 6개 액션을 추가해 (a) 항상 살아있는 베이스 + (b) 의미 있는 사용자 인터랙션 1개 + (c) 코딩 컨텍스트 시그널 1개 + (d) 장기 진행감 1개 를 채운다.

## 액션 정의

### 1. Breathing (호흡)

- **상태**: 항상 ON.
- **트리거**: 없음 — CSS keyframe 으로 영속.
- **효과**: `.pet-sprite` 가 0.4초 주기로 `scale(1.00 ↔ 1.02)` 미세 상하. drop-shadow 도 같이 살짝 변동.
- **예외**: `feasting` bounce 또는 `evolve` cutscene 진행 중에는 일시 정지(상위 애니가 우선).
- **수정 위치**: `renderer/styles.css` 의 `.pet` 또는 `.pet-sprite` keyframe 추가.

### 2. Blink (눈 깜빡)

- **상태**: happy / normal mood 일 때만.
- **트리거**: 15~30초 랜덤 인터벌(매 발생마다 다음 인터벌 재추첨).
- **효과**: 0.15초 동안 눈 부분이 감김.
- **구현**: 각 phase 스프라이트에 "눈 감김" 변형이 필요 → SVG 안의 눈 element 에 `id` 부여 후 CSS 변형 또는 별도 sprite 1장. 우선 CSS 클래스 토글 방식 권장 (`.blink` 시 눈 element opacity 0 또는 height 1px).
- **예외**: sleepy/sad/sleep 상태에서는 비활성 — 이미 눈 표현이 다름.
- **수정 위치**: `renderer/components/Pet.tsx` (인터벌 훅) + 각 `phase[0-3].svg` (눈 element id) + `renderer/styles.css`.

### 3. Sleep (수면)

- **상태**: 별도 플래그 `isAsleep`. mood 와 독립.
- **트리거**: 다음 둘 중 하나 충족 시 enter:
  - 마지막 토큰 유입 후 60분 이상 경과, **또는**
  - 현지 시각 23:00~06:00 구간.
- **종료**: 다음 중 하나로 즉시 wake — 토큰 유입, 펫 클릭, 드래그 시작, 쓰담쓰담. wake 시 0.6초 stretch 모션(미세 scale-y 1.1 한 번). 23~06시 트리거였더라도 한 번 wake 하면 그 세션 동안은 시간 트리거로 다시 자지 않음(같은 시간 구간 안에서 깨우자마자 다시 잠드는 깜빡임 방지). 마지막 토큰 60분 트리거는 60분 카운터 재시작.
- **효과**: 눈 감김 + `💤` 오버레이(기존 sleepy 이모지 재활용) + breathing 진폭 1.5배. 색상 필터는 기존 sleepy 와 동일.
- **수정 위치**: 새 hook `useSleepState.ts` (시간/마지막 fed 감지) + `Pet.tsx` 의 클래스 분기 + `styles.css`.

### 4. Pet / 쓰담쓰담

- **트리거**: 펫 영역 hover 중 마우스 좌→우→좌 방향 전환 3회 이상을 1초 안에 감지(이동 거리 합산 ≥ 40px).
- **효과**:
  - happy 말풍선 1개 (greeting 풀에서 "헤헤", "기분 좋아~" 등 일부).
  - `condition += 5` (cap 100).
  - 1분 cooldown — 어뷰징 방지.
  - feasting mood 오버레이 0.6초.
- **구현**: 새 hook `useTickleDetector.ts` — 마우스 방향 전환 카운터. cooldown 은 메모리 변수(영속화 불요).
- **수정 위치**: 새 hook + `App.tsx` 에서 이벤트 발생 시 `pet:applyCondition` (또는 기존 IPC 재사용) 호출.
- **백엔드 변경**: condition 외부 증가 경로가 없으면 새 IPC `pet:nudgeCondition(amount)` 추가. PetState 에 메서드 1개.

### 5. 모델별 식사 차등

- **트리거**: `fed` 이벤트에 `model` 필드가 있을 때.
- **효과 (EatingBurst 분기)**:
  - **Opus**: 폰트 18px, 골드, 텍스트 앞에 `✨` 접두.
  - **Sonnet**: 현재 동일 (14px, 골드, 접두 없음).
  - **Haiku**: 폰트 11px, 옅은 골드, `🍿` 접두.
  - **모델 미상**: Sonnet 와 동일 처리.
- **데이터 흐름 변경**:
  - `core/types.ts` 의 `NutritionEvent` 에 `model?: string` 추가.
  - `core/feeding/FeedingPipeline.ts` 가 TokenEvent.model 을 그대로 전달.
  - `PetState` 의 `fed` 이벤트 페이로드에 `model?: string` 포함.
  - IPC `pet:event` 의 fed 이벤트도 `model` 동반.
- **수정 위치**: `core/types.ts`, `core/feeding/FeedingPipeline.ts`, `core/pet/PetState.ts`, `electron/ipc.ts`(전달만), `renderer/components/EatingBurst.tsx`(prop 추가), `renderer/App.tsx`(fed 핸들러에서 분기).

### 6. 진화 임박 (Almost there)

- **트리거**: `phase < 3` 이고 `lifetimeXP / nextThreshold ≥ 0.9`.
- **종료**: 진화 발생 또는 비율이 다시 0.9 미만으로 떨어지면 해제(이론상 비율은 단조 증가지만 안전망).
- **효과**:
  - progress bar fill 색이 골드로 변하고 0.8초 펄스(opacity 0.7↔1).
  - drop-shadow 색이 골드 톤으로 보강 (기존 검정 그림자 + 골드 글로우).
- **수정 위치**: `renderer/App.tsx` 에서 파생값 계산 → `.pet.almost-there` 클래스 토글. `renderer/styles.css` 에 키프레임 + `.progress-fill.almost-there` 색감. `renderer/components/PetProgressBar.tsx` 에 prop 또는 클래스 통과.

## 상태 우선순위

여러 이펙트가 겹칠 때 시각적 우선순위 (높을수록 위):

1. EvolveCutscene (풀스크린, 4초)
2. feasting bounce (0.4초, fed 직후)
3. Sleep
4. Pet/쓰담 happy bubble (0.6~0.8초)
5. mood 오버레이 (정상 표시)
6. Almost-there 펄스 + breathing (베이스 레이어)

`breathing` 은 `feasting`/`evolve` 진행 중 일시 정지. 나머지는 동시 활성 가능.

## 데이터/타입 변경 요약

- `NutritionEvent` ← `model?: string`
- `PetEvent.fed` ← `model?: string`
- 새 IPC: `pet:nudgeCondition(amount: number)` — Pet/쓰담용 condition 외부 증가 채널
- 새 hooks: `useSleepState`, `useTickleDetector`
- SVG: 각 phase 의 "눈" element 에 `id` 부여 (blink 토글용)

## 테스트 범위

- `useTickleDetector` 의 방향 전환 카운팅 (jsdom 마우스 이벤트 시뮬레이션)
- `useSleepState` 의 시간/마지막 fed 분기
- `FeedingPipeline` 이 `model` 을 NutritionEvent 로 전파하는지
- 기존 PetState 테스트에 `nudgeCondition` cap 동작 추가

## 비범위 (NOT in scope)

- 윈도우 밖 이동, wander, walk
- 사용자 시선 추적(eye follow), tickle 외 클릭 패턴
- cost milestone, multi-session, cache 효율 표시
- anniversary, weekend mode
- mood × phase 별 별도 스프라이트 (현재 1 phase = 1 sprite 유지)

## 영향 받는 문서

`docs/02-pet.md` — Sleep 플래그, nudgeCondition 메서드 추가 항목.
`docs/05-pet-design.md` — Breathing/Blink/Sleep/AlmostThere/모델별 burst/Tickle 섹션 추가.
`docs/03-implementation.md` — 새 IPC `pet:nudgeCondition` 등재, 새 hooks 위치.
