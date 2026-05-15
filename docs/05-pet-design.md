# 05. 펫 디자인

> 현재 펫 비주얼은 손코딩 SVG 4종 (대충 만든 상태) + 이모지 mood 오버레이 + 위쪽 stage badge + 아래쪽 lifetime/threshold readout + 얇은 progress bar. transient 이펙트는 EatingBurst (랜덤 위치 K-format 토큰 표시), 클릭/burst SpeechBubble, EvolveCutscene. 향후 제대로 된 아트로 교체 예정.

## SVG 스프라이트

위치: `renderer/public/sprites/phase[0-3].svg`. Vite 가 root 에서 서빙하므로 렌더러에서 `/sprites/phaseN.svg` 로 참조.

| phase | 파일 | 묘사 |
|---|---|---|
| 0 | phase0.svg | 황금 알 (껍데기 지그재그). 검은 점 두 개로 미세한 표정. |
| 1 | phase1.svg | 깨진 알 껍데기 위에 파란 병아리. 흰 눈동자 + 작은 부리 + 머리 깃털. |
| 2 | phase2.svg | 노란 중간 단계. 날개, 발, blush, 머리 깃털 더 풍성. |
| 3 | phase3.svg | 흰/회색 닭. 빨간 볏 + 턱볏(wattle), 꼬리 깃털, 다리 두 개. |

뷰박스 128x128. 투명 배경. drop-shadow 는 CSS 에서 따로 적용.

### 렌더링

`renderer/components/Pet.tsx`:

```tsx
const SPRITE: Record<Phase, string> = {
  0: '/sprites/phase0.svg',
  1: '/sprites/phase1.svg',
  2: '/sprites/phase2.svg',
  3: '/sprites/phase3.svg'
};
```

`<img className="pet-sprite" src={SPRITE[phase]}>` 으로 표시. `object-fit: contain` 으로 윈도우 크기에 따라 자동 스케일.

## Mood 오버레이

같은 파일 `Pet.tsx`:

| mood | overlay |
|---|---|
| happy | (없음) |
| normal | (없음) |
| sleepy | 💤 |
| sad | 😔 |
| feasting | ✨ |
| curious | ❔ |

오버레이는 펫 우상단에 절대 위치(`top: -8px; right: -8px`).

### mood 별 필터

`renderer/styles.css`:

```css
.pet.mood-sleepy .pet-sprite { filter: brightness(0.85) saturate(0.7); }
.pet.mood-sad    .pet-sprite { filter: brightness(0.9)  saturate(0.6); }
```

condition 낮을수록 펫이 어둡고 채도 낮게 보임.

## 정적 정보 요소 (idle 시 항상 표시)

### Stage badge

`renderer/components/StageBadge.tsx` — 펫 위쪽 중앙. phase 별 아이콘 + 이름 한 단어.

| phase | 아이콘 | 이름 |
|---|---|---|
| 0 | 🥚 | Egg |
| 1 | 🐣 | Baby |
| 2 | 🐤 | Middle |
| 3 | 🐔 | Final |

윈도우 폭 ≤ 140px 이면 이름 텍스트 숨기고 아이콘만. 10px 반투명 흰 글자.

### Lifetime / threshold readout

App.tsx 안의 `.token-today` div. K/M 포맷의 `{lifetimeXP} / {nextThreshold}` (Final 일 땐 Final 입성 임계값 = 3M 가 분모). 600 weight 13px monospace, 펫 아래·progress bar 위에 위치. K 는 소수점 1자리, M 은 소수점 2자리.

### Progress bar

`renderer/components/PetProgressBar.tsx` — 펫 하단 얇은 막대 (높이 2px, 폭 60%). 채워진 비율 = `lifetimeXP / nextThreshold`. mood 별 색감 분기 (happy=골드, normal=흰, sleepy/sad=회색). 숫자 없음 — 위쪽 readout 이 숫자 담당.

## Transient 이펙트

### EatingBurst (랜덤 위치 토큰 popup)

`renderer/components/EatingBurst.tsx`:

```tsx
export function EatingBurst({ amount, xPct, yPct }) {
  return <div className="burst" style={{ left: `${xPct}%`, top: `${yPct}%` }}>
    +{fmtK(amount)}
  </div>;
}
```

- App.tsx 가 `fed` 이벤트 받을 때마다 burst 추가, 1.3초 후 제거.
- 좌표는 펫 중심 주변 30–70% 범위 랜덤 (`xPct`, `yPct`).
- K/M 포맷 (영양가 단위, 토큰 환산 전).
- CSS keyframe `floatUp` — 살짝 떠오르며 fade-in/out.
- 600 weight 14px monospace, 골드 색상.

### SpeechBubble

`renderer/components/SpeechBubble.tsx`, 두 가지 variant:

| variant | 트리거 | TTL | 풀 |
|---|---|---|---|
| `greeting` | 펫 좌클릭 (drag-vs-click 5px threshold, 300ms cooldown) | 800ms | `renderer/data/speech.ts` 의 `GREETINGS` ("고마워✨", "헤헤", "쓰담쓰담~" 등) |
| `proactive` | 토큰 폭증 감지 (5분 안 nutrition ≥ 50k, 2분 cooldown) | 2.5초 | `BURST_BY_MOOD` — happy / normal / sleepy/sad 별 분기 |

흰 반투명 둥근 말풍선, 펫 위쪽에 표시. `bubblePop` keyframe 으로 가볍게 등장. burst 감지는 `core/feeding/burstDetector.ts` (pure module, vitest 커버) + `renderer/hooks/useBurstDetector.ts` 가 PetEvent 스트림에 붙음.

### EvolveCutscene

`renderer/components/EvolveCutscene.tsx`:

```tsx
<div className="cutscene">
  <div>✨ EVOLVED ✨</div>
  <div>{fromName} → {toName}</div>
</div>
```

- `evolved` 이벤트 받으면 4초간 표시 후 자동 제거.
- 흰 반투명(`background: rgba(255,255,255,0.6)`) 풀스크린 오버레이.
- App.tsx 의 `setTimeout(() => setEvo(null), 4000)`.

### feasting bounce

`renderer/styles.css` 의 `@keyframes bounce`:

```
0%   translate(-50%, -50%) scale(1)
50%  translate(-50%, -65%) scale(1.15)
100% translate(-50%, -50%) scale(1)
```

`fed` 이벤트 동안 `.pet` 에 `.feasting` 클래스 토글 → 0.4초 통통 튀는 모션. App.tsx 의 `setFeasting` 으로 제어.

### drop-shadow

`.pet { filter: drop-shadow(0 4px 6px rgba(0,0,0,0.35)); }` — 투명 배경 위에서 펫이 뜬 것처럼 보이게.

## v2 에서 제거된 요소

- 기존 좌하단 `HUD.tsx` 3줄 monospace 텍스트 — 제거됨. 정보는 (a) 항상 보이는 lifetime/threshold readout, (b) 호버 시 InfoBubble (XP·cond·today), (c) 우클릭 → Show Stats 로 분산.

## 아트 교체 가이드

손코딩 SVG → 제대로 된 일러스트 교체 시 체크리스트:

1. **파일명 유지** — `phase[0-3].svg` 그대로. Pet.tsx 코드 안 바꿔도 됨.
2. **viewBox 128x128** — 다른 크기여도 동작하지만 일관성 위해 권장.
3. **투명 배경** — 윈도우 자체가 투명이므로 배경은 비울 것.
4. **외곽선 굵기** — 작은 윈도우(120px) 에서도 보이게 적당히 굵게.
5. **drop-shadow 고려** — CSS 그림자가 SVG 밖으로 살짝 빠지므로 외곽 여백 4-6px 추천.
6. **mood 필터에 적합한 색감** — `filter: brightness/saturate` 가 SVG 전체에 걸리므로 너무 어둡거나 채도 낮은 원본은 sleepy/sad 시 식별이 안 될 수 있음.

PNG 도 가능하지만 SVG 가 리사이즈 시 깔끔. 둘 다 쓸거면 Pet.tsx 의 `SPRITE` 맵 확장자만 바꾸면 됨.

## 추가 mood 표정 늘리기

각 phase 당 mood 별 별도 스프라이트로 가고 싶으면:

- `SPRITE: Record<Phase, Record<Mood, string>>` 로 확장.
- 파일 16개 (4 phase × 4 mood) — `phase0-happy.svg` 등.
- 현재 emoji 오버레이는 제거 또는 보조로만.

## 수정 위치

| 바꿀 것 | 파일 |
|---|---|
| 스프라이트 그림 | `renderer/public/sprites/phase[0-3].svg` |
| 스프라이트 매핑 / 오버레이 이모지 | `renderer/components/Pet.tsx` |
| Stage badge 아이콘/이름 | `renderer/components/StageBadge.tsx` (ICON 맵) + `core/pet/stages.ts` (이름) |
| Lifetime readout 포맷 / 위치 | `renderer/App.tsx` (`fmtK`, `.token-today` div) + `renderer/styles.css` (`.token-today`) |
| Progress bar 색감 / 굵기 | `renderer/components/PetProgressBar.tsx` + `renderer/styles.css` (`.progress`, `.progress-fill`) |
| EatingBurst 랜덤 범위 / TTL | `renderer/App.tsx` 의 fed 핸들러 (`xPct/yPct` 계산, setTimeout 1300ms) |
| Speech bubble 풀 / TTL | `renderer/data/speech.ts` (풀) + `renderer/App.tsx` (`GREETING_TTL_MS`, `BURST_TTL_MS`) |
| Burst 감지 임계값 / cooldown | `core/feeding/burstDetector.ts` 의 `THRESHOLD`, `COOLDOWN_MS`, `WINDOW_MS` |
| mood 필터 / bounce / drop-shadow | `renderer/styles.css` |
| 진화 이펙트 시간 / 텍스트 | `renderer/components/EvolveCutscene.tsx` + `renderer/App.tsx` 의 setTimeout |
| stage 이름 (cutscene 에 표시됨) | `core/pet/stages.ts` 의 `STAGES[].name` |

## 참고 파일

- `renderer/public/sprites/phase0.svg` ~ `phase3.svg`
- `renderer/components/{Pet, StageBadge, PetProgressBar, EatingBurst, SpeechBubble, InfoBubble, EvolveCutscene}.tsx`
- `renderer/data/speech.ts`
- `renderer/hooks/{useHover, useBurstDetector, useTokensToday}.ts`
- `core/feeding/burstDetector.ts`
- `renderer/App.tsx`
- `renderer/styles.css`
