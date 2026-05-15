# 펫 오버레이 UI 재설계 (v2)

**작성일**: 2026-05-15
**대상**: `renderer/` 의 펫 윈도우 UI 전반
**관련 문서**: [05-pet-design.md](../05-pet-design.md), [06-ui.md](../06-ui.md)

## 배경

v1 의 펫 윈도우는 펫 sprite + mood emoji + 좌하단 monospace HUD 3줄 (`Stage · XP / next` / `cond · mood` / `pct%`) + EatingBurst + EvolveCutscene 으로 구성. 정보는 다 보이지만 "데이터 위젯" 느낌이 강해 펫 자체의 귀여움을 깎고, 사용자와의 직접 인터랙션이 거의 없다 (드래그·우클릭 메뉴뿐).

## 목표

세 축 동시 충족:

1. **귀엽게** — 평소 모습은 펫이 주인공. 데이터는 ambient·작게.
2. **인터랙션** — 호버·클릭으로 펫이 반응. 펫이 먼저 말도 건다.
3. **토큰 사용량 가시성** — 숫자가 항상 떠 있을 필요는 없지만, 자라는 감/사용량은 한 눈에.

## 비목표 (out of scope)

- 새 토큰 소스 추가 (Codex 등)
- Stats 윈도우 구조 변경 (별도 트랙)
- 펫 SVG 아트 교체 (현재 손코딩 SVG 그대로 사용. 추후 별도 작업)
- 코드 사이닝/배포 관련

## 디자인

### 기본 (idle) 모습

```
       🥚 Baby           ← Stage badge: 스테이지 아이콘 + 이름 (작게, 반투명)
        ✨               ← mood overlay (기존 유지, 펫 우상단)
       ◠◠◠◠
      ◠    ◠            ← Pet sprite (가운데, 기존 phase SVG)
      ◠ ˘  ◠
       ◠◠◠◠
      ────●○○○            ← Progress bar: 얇은 가로 바, 다음 phase 까지 XP %
```

**Stage badge**
- 위치: 펫 위쪽 중앙. 폭은 텍스트 길이만큼.
- 내용: phase 별 아이콘 (🥚 / 🐣 / 🐤 / 🐔) + stage 이름 한 단어 (`Egg`/`Baby`/`Middle`/`Final`).
- 스타일: 10–11px, 반투명 흰색, 살짝 drop-shadow.
- 윈도우 폭 ≤ 140px 면 텍스트 숨기고 아이콘만.

**mood emoji overlay**
- 기존 동작 그대로. happy/normal 일 때는 안 보임. sleepy 💤 / sad 😔 / feasting ✨ / curious ❔ 일 때만.
- 위치 그대로 (펫 우상단 -8/-8 offset).

**Progress bar**
- 위치: 펫 아래. 폭 60% 정도, 높이 2–3px.
- 채움: `lifetimeXP / nextThreshold(phase)`. Final phase 에선 max(100%) 표시.
- 색: 채워진 부분은 mood 에 따라 살짝 톤 변화 (happy 황금, normal 흰, sleepy/sad 회색). 빈 부분은 옅은 반투명 회색.
- 숫자 텍스트 없음.

**기존 HUD 3줄 텍스트**: **제거**.

---

### 인터랙션

#### Hover (마우스 올림)

- 펫 옆에 정보 말풍선 페이드인 (150ms).
- 내용 (작은 monospace, 3줄):
  ```
  XP   12,453 / 300,000
  cond  78 · happy
  24h   4.2k
  ```
- 위치: 펫 우측. 우측에 충분한 공간 없으면 좌측으로 flip. 윈도우 폭 ≤ 160px 이면 popup 생략하고 펫 아래 한 줄로 축약 (`12k / 300k · 78 · 4.2k`).
- 마우스 떼면 페이드아웃 (200ms).
- 추가 폴리시 (v1.1 으로 deferred): 호버 동안 펫 눈동자가 마우스 좌표를 살짝 따라감. v2 초기엔 미구현.

#### Click (펫 본체 좌클릭)

1. Bounce 애니메이션 0.4s (기존 `feasting` keyframe 재사용)
2. 펫 위쪽에 speech bubble 0.8s — greeting 풀에서 랜덤:
   - `"고마워✨"`, `"헤헤"`, `"쓰담쓰담~"`, `"넹"`, `"💕"`
3. 수치 변화 **없음** (순수 인사).
4. 쿨다운 300ms — 그동안 또 클릭은 무시.

**Drag-vs-click**: 드래그가 시작되면 click 으로 발화 안 됨. mousedown 위치 기준 5px 이상 이동이면 drag 으로 인식, 미만이면 mouseup 시 click.

#### Right-click

기존 컨텍스트 메뉴 그대로 (Show Stats / Reset Pet / Wipe Everything / Quit).

#### Drag

기존 동작 그대로 (펫 본체 잡으면 윈도우 이동, `-webkit-app-region: drag`). 위 click threshold 만 추가.

---

### 펫이 먼저 거는 말 (proactive speech bubble)

**트리거**: 토큰 폭증 감지.

- 슬라이딩 윈도우 5분 동안 들어온 event 의 `nutrition` 합 추적 (메모리 rolling buffer; 영속화 X).
- 임계값 (v1 placeholder): 5분 안 nutrition 합 ≥ 50,000.
- 한 burst 당 한 번만 발화. 발화 후 burst 가 해소(임계 미만으로 돌아옴) 되기 전엔 재발화 안 함.
- 최소 cooldown 2분.

**발화 내용** (랜덤 풀, mood 별 가벼운 분기):

| mood | 풀 |
|---|---|
| happy | `"오 키 핀좌 우적~"`, `"배 터져✨"`, `"맛있다맛있다"`, `"GG 그만 먹어..."` |
| normal | `"흠냠"`, `"잘 먹는 중~"`, `"오늘 풍년이네"` |
| sleepy/sad | `"오 깨워줘서 고마워..."`, `"오랜만에 먹는다"`, `"기운나려나"` |

**표시 방식**
- 펫 위쪽 speech bubble, 2.5초 표시 후 페이드아웃.
- click greeting bubble 과 같은 SpeechBubble 컴포넌트 재사용 (꼬리 방향만 조정).
- 동시에 EatingBurst (`+N 🍴`) 가 별도 레이어로 떠 있어도 OK (z-index 분리).
- 윈도우 상단에 너무 붙으면 좌/우측으로 flip.

---

### 유지 / 제거 / 추가 요약

| 요소 | 처리 |
|---|---|
| Pet sprite (4 phase SVG) | 유지 |
| mood emoji overlay (우상단) | 유지 |
| EatingBurst `+N 🍴` | 유지 (fed event 그대로) |
| EvolveCutscene 4초 화면 | 유지 |
| HUD 3줄 좌하단 텍스트 (`HUD.tsx`) | **제거** |
| Stage badge (위쪽 작은 라벨) | **신규** |
| Progress bar (하단 얇은 바) | **신규** |
| Hover info popup | **신규** |
| Click bounce + greeting bubble | **신규** (bounce keyframe 은 기존 재사용) |
| Proactive speech bubble (토큰 폭증) | **신규** |
| Drag-vs-click threshold | **신규** |
| Eye-follow on hover | **deferred (v1.1)** |

---

## 영향 받는 파일

### 신규
- `renderer/components/StageBadge.tsx`
- `renderer/components/PetProgressBar.tsx`
- `renderer/components/InfoBubble.tsx`
- `renderer/components/SpeechBubble.tsx`
- `renderer/data/speech.ts` — greeting + burst 발화 풀
- `renderer/hooks/useBurstDetector.ts` — event stream → burst boolean
- `renderer/hooks/useHover.ts` — 호버 상태 + delay 처리
- `core/feeding/burstDetector.ts` — 순수 함수 분리 (테스트 가능)

### 수정
- `renderer/App.tsx` — PetView 조립부 새 컴포넌트로 교체. drag-vs-click threshold 로직. 클릭 시 greeting bubble.
- `renderer/components/Pet.tsx` — 변화 거의 없음. mood overlay 유지.
- `renderer/components/EatingBurst.tsx` — 좌표/z-index 만 조정 가능.
- `renderer/styles.css` — badge / progress bar / info bubble / speech bubble 스타일. HUD 관련 클래스 제거.

### 삭제
- `renderer/components/HUD.tsx`

### 문서
- `docs/05-pet-design.md` — 새 컴포넌트, speech bubble, eye-follow deferred 반영.
- `docs/06-ui.md` — hover/click/drag-threshold/badge/bar 반영.

---

## 데이터 / 영속화

- 새로 영속화할 항목 없음.
- Burst 감지용 rolling buffer 는 메모리 (앱 재시작 시 리셋).
- Speech 풀은 코드에 박음 (`renderer/data/speech.ts`). 추후 사용자 커스텀 빼고 싶으면 별도 트랙.

---

## 테스트 전략

### 단위 테스트 (vitest, Node ABI)
- `core/feeding/burstDetector.ts` — event 스트림 + 시간 입력 → burst boolean 출력. 임계/cooldown/리셋 케이스 커버.

### 수동 QA (Electron, 사람)
1. 평소 모습: badge + progress bar + sprite 만 보이고 HUD 3줄 텍스트 없는지.
2. Hover: 펫 위에 마우스 → 150ms 후 info popup 페이드인. 마우스 떼면 페이드아웃.
3. Click: 펫 클릭 → bounce + greeting bubble. 수치 변화 없음. 연타 시 cooldown 적용.
4. Drag: 펫 잡고 5px 이상 끌면 윈도우 이동만, click 발화 X.
5. Burst speech: 짧은 시간에 토큰 많이 들이부어 (real 또는 dev mock) → speech bubble 자동 발화. cooldown 동안 재발화 안 함.
6. 작은 윈도우 (120px): badge 텍스트 사라지고 아이콘만. info popup 은 한 줄 축약 또는 생략.
7. 큰 윈도우 (600px): 모든 요소 비례 확대. 깨지지 않음.
8. Mood 별 progress bar 색·speech 풀 분기 확인.
9. EvolveCutscene 발생 시 다른 오버레이와 z-index 충돌 없음.

---

## 마이그레이션 / 호환성

- 저장 스키마 변경 없음. 기존 `pet-state.json` 그대로 호환.
- 사용자 입장 변경: HUD 3줄 텍스트가 사라지므로 "숫자 어디 갔어?" 라는 반응 가능 — 호버하면 나오고, 우클릭 → Show Stats 에 전부 있다는 점이 명확해야 함. README 또는 첫 실행 시 짧은 안내 (v2 후속 작업, 이번 스펙엔 포함 X).

---

## 오픈 이슈 / 후속 작업

- Burst 임계값 (5분 / 50k nutrition) 은 placeholder. 1주 사용해보고 튜닝.
- Eye-follow (v1.1): SVG 의 눈동자 ID 부여 → transform translate. sprite 4개 모두 적용 필요.
- Info popup 외부 BrowserWindow 분리 — 현 v2 는 윈도우 내부에 그림. 작은 윈도우에서 잘림 이슈 있으면 그때 분리 검토.
- Speech 풀 외부화 (JSON / 사용자 커스텀).
