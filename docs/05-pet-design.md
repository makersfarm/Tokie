# 05. 펫 디자인

> 현재 펫 비주얼은 손코딩 SVG 4종 (대충 만든 상태) + 이모지 mood 오버레이. EatingBurst / EvolveCutscene 두 가지 transient 이펙트. 향후 제대로 된 아트로 교체 예정.

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

## 이펙트

### EatingBurst

`renderer/components/EatingBurst.tsx`:

```tsx
export function EatingBurst({ amount }) {
  return <div className="burst">+{amount.toFixed(0)} 🍴</div>;
}
```

- App.tsx 가 `fed` 이벤트 받을 때마다 burst 추가, 1초 후 제거.
- CSS keyframe `floatUp` — 위로 떠오르며 fade-out.
- 골드 색상, 14px monospace.

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

## HUD 와의 관계

HUD ([06-ui.md](./06-ui.md#hud) 참고) 는 좌하단 텍스트 (XP/cond/mood). 펫 본체와 별개로 렌더링되지만 동일한 mood 값을 표시.

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
| mood 필터 / bounce / drop-shadow | `renderer/styles.css` |
| 진화/먹기 이펙트 시간 / 텍스트 | `renderer/components/{EvolveCutscene, EatingBurst}.tsx`, `renderer/App.tsx` 의 setTimeout |
| stage 이름 (cutscene 에 표시됨) | `core/pet/stages.ts` 의 `STAGES[].name` |

## 참고 파일

- `renderer/public/sprites/phase0.svg` ~ `phase3.svg`
- `renderer/components/{Pet, EatingBurst, EvolveCutscene}.tsx`
- `renderer/App.tsx`
- `renderer/styles.css`
