# Changelog

[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) 컨벤션. [Semantic Versioning](https://semver.org/).

## [Unreleased]

(없음)

## [0.1.0] — 2026-05-15

첫 공개 가능한 버전. 프로젝트 이름을 `token-eater-pet` 에서 **Tokie** 로 리네임 (`userData` 경로는 호환 유지).

### Added

- **펫 오버레이 v2** ([설계](docs/specs/2026-05-15-pet-overlay-ui-design.md), [plan](docs/plans/2026-05-15-pet-overlay-ui.md))
  - 펫 위 stage badge (🥚 Egg / 🐣 Baby / 🐤 Middle / 🐔 Final).
  - 펫 아래 lifetime XP / next-threshold readout (K/M 포맷 — K 소수 1자리, M 소수 2자리).
  - 펫 아래 얇은 progress bar, mood 별 색감 변화.
  - 호버 InfoBubble — XP / cond·mood / today 한눈에. 윈도우 ≤ 160px 시 compact 한 줄로 축소.
  - 펫 좌클릭 → bounce + greeting speech bubble (`renderer/data/speech.ts` 의 GREETINGS 풀에서 랜덤).
  - drag vs click 5px threshold + 300ms cooldown 으로 두 동작 분리.
  - 토큰 폭증 (5분 안 nutrition ≥ 50k, 2분 cooldown) 시 mood-flavored proactive speech bubble.
  - EatingBurst 가 펫 주위 랜덤 위치 (30-70% 범위) 에서 K/M 포맷으로 떠올랐다 사라짐.
- **Stats 윈도우** — 우클릭 → Show Stats. 별도 480×600 윈도우. Pet / Lifetime / Today / Last 24h / Last 7d / By source 표.
- **`stats.today` 백엔드 컷** — 로컬 자정 기준 일일 누적, 사용자 시간대 따라 정렬.
- **BurstDetector** (`core/feeding/burstDetector.ts`) — 순수 모듈, 8개 vitest.
- **새 hook 들**: `useHover` / `useTokensToday` / `useBurstDetector`.
- **MIT LICENSE**, root README, CONTRIBUTING, GitHub issue/PR 템플릿.

### Changed

- 프로젝트명 `token-eater-pet` → **Tokie**. `package.json` 의 `productName` 도 같이.
- `userData` 경로는 `app.setPath` 로 `token-eater-pet/` 에 고정 (구버전 데이터 호환).
- Wipe Everything 동작이 db 파일 삭제 → `DELETE FROM events;` 로 변경. 이후 stats 조회가 깨지지 않음.
- 기존 좌하단 HUD 3줄 텍스트 (`HUD.tsx`) 제거. 정보는 항상 보이는 readout / 호버 / Stats 윈도우로 분산.
- vitest 가 `renderer/**/*.test.ts` 도 포함하도록 config 확장.
- 중복된 `fmtK` 헬퍼를 `renderer/data/fmt.ts` 로 통합.

### Fixed

- EvolveCutscene 이 다른 이벤트(snapshot/fed/mood-changed) 발생 시 mid-show 에 잘못 사라지던 버그 — 4초 타이머를 독립 effect 로 분리.
- `useHover` 가 unmount 시 timer 안 정리하던 leak.
- BurstDetector 가 `NaN` nutrition 을 buffer 에 넣고 sum 을 망가뜨리던 문제 — `!(nutrition > 0)` 가드로 0/음수/NaN 전부 거름.

### Docs

- `docs/` 카테고리별 6개 문서 (01 토큰 / 02 펫 / 03 구현 / 04 권한·설정 / 05 디자인 / 06 UI) 신규 작성.
- 코드 변경 시 해당 카테고리 문서 같이 갱신하는 컨벤션을 CLAUDE.md / CONTRIBUTING.md 에 명시.
- 배포 skill (`.claude/skills/release.md`) — electron-builder + GitHub Releases 기반.

## [0.0.x] — pre-history

token-eater-pet 이름으로 만든 v1 — Electron 데스크탑 펫, statusLine + JSONL 하이브리드 토큰 수집, phase / condition / mood 상태기계, 영양가 환산, dedup, 펫·트레이·컨텍스트 메뉴, 위치/크기 영속화, 73 vitest.
