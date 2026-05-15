# 03. 구현

> Electron + Vite + React + better-sqlite3 + chokidar. main 프로세스가 토큰 수집·펫 상태·저장을 담당하고, renderer 가 UI. IPC 로 snapshot/이벤트/메뉴 호출 연결.

## 디렉토리

```
electron/         main 프로세스 (Electron)
  main.ts         앱 진입점, lifecycle
  bootstrap.ts    전체 wiring (소스 ↔ 펫 ↔ 저장 ↔ 윈도우)
  window.ts       BrowserWindow 옵션
  ipc.ts          renderer ↔ main 채널
  preload.ts      contextBridge 노출
  tray.ts         메뉴바 트레이 + 공용 메뉴 템플릿
core/             플랫폼 비의존 도메인 로직 (테스트 가능)
  types.ts
  pet/            상태기계, phase, condition
  feeding/        nutrition, pipeline
  tokenSource/    인터페이스, registry, Claude 구현체들
  storage/        pet-state.json, events.sqlite, cursor, paths
renderer/         React UI (Vite)
  main.tsx, App.tsx
  components/     Pet, StageBadge, PetProgressBar, EatingBurst,
                  SpeechBubble, InfoBubble, EvolveCutscene, StatsView
  hooks/          usePetState, useHover, useTokensToday, useBurstDetector
  data/           speech.ts (greeting/burst pools), fmt.ts (K/M format)
  public/sprites/ phase0..3.svg
  styles.css
installers/       외부 시스템 손대는 코드 (statusLine settings.json)
scripts/          외부에서 호출되는 stub (statusline-shim.cjs)
docs/             이 문서
```

빌드 산출물: `dist-electron/` (main+preload) + `dist/` (renderer).

## Tech stack

| | 버전 | 핀 이유 |
|---|---|---|
| Electron | ^33 | better-sqlite3 NODE_MODULE_VERSION 호환. 42 는 V8 API 깨짐. |
| TypeScript | ^5.7 | baseUrl 등 5.x 시맨틱. |
| Vite | ^6/8 | vite-plugin-electron 호환. |
| React | ^18/19 | 무관. |
| better-sqlite3 | ^12 | WAL + sync API. native module → electron-rebuild 필요. |
| chokidar | ^5 | ESM-only. glob 미지원 → 재귀 dir 감시 + extension 필터로 우회. |
| vitest | ^4 | Node 환경 단위 테스트. |

## 명령

```bash
npm run dev          # vite + vite-plugin-electron, HMR
npm run build        # 프로덕션 번들 (dist-electron/ + dist/)
npm test             # vitest run (one-shot)
npm run test:watch   # vitest watch
npm run postinstall  # better-sqlite3 를 Electron ABI 로 rebuild
```

## 부트 순서

`electron/main.ts` → `app.whenReady` → `bootstrap()`:

1. `app.getPath('userData')` → `resolveStoragePaths` 로 `pet-state.json`, `events.sqlite` 경로 산출.
2. `loadPetState` 로 snapshot 읽기 (없으면 default).
3. `new PetState(snap)` 인스턴스화.
4. `new EventsDb(...)` (WAL 초기화).
5. `new FeedingPipeline(db, pet)`.
6. `new ClaudeStatusLineSource(token)` + `new ClaudeJsonlSource(claudeHome, { skipExistingHistory: isFresh })`.
7. 저장된 cursor 가 있으면 jsonlSrc.loadCursors() 로 주입.
8. `SourceRegistry.start(emit => pipeline.handle(emit))`.
9. `installStatusLine({...})` → `~/.claude/settings.json` 갱신.
10. `makeDebouncedSaver(...)` + `pet.on(... saver.schedule(snapshot))`.
11. 60s `setInterval(pet.tick)`. 부트 직후 한 번 호출 (catch-up).
12. 60s `setInterval` 로 jsonl cursor 들을 snapshot 에 백업.
13. `createPetWindow({ pos, size })` → renderer 로드.
14. Stats 윈도우 lazy 핸들 (`statsWin`) + `openStats()` 함수 — 첫 호출 시 `createStatsWindow` 로 생성, `?view=stats` 라우트로 같은 renderer 번들 재사용.
15. `wireIpc({ pet, db, menuTemplate, petWindow, broadcastWindows })` — broadcast 는 함수로 받아 매번 평가 (statsWin 생성 시 자동 포함).
16. `win.on('moved' / 'resized')` 에서 windowPos / windowSize 갱신.
17. `createTray(trayCb)`.
18. `shutdown` 함수 반환 → `app.on('before-quit')` 에서 호출.

`electron/main.ts` 의 시작 부분에서 `app.setPath('userData', ...token-eater-pet/...)` 로 저장 경로를 고정. v0.0 (구 프로젝트명 `token-eater-pet`) 데이터 호환 위해 의도적으로 박혀 있음. 새 설치도 동일 경로 사용.

## IPC

`electron/ipc.ts` 가 노출하는 채널:

| 채널 | 종류 | 동작 |
|---|---|---|
| `pet:getSnapshot` | invoke | 현재 snapshot 반환 |
| `pet:getStats` | invoke | EventsDb.stats(now) 반환 — lifetime / today (로컬 자정 기준) / last24h / last7d / bySource 등 |
| `pet:openMenu` | invoke | 펫 윈도우 위에 컨텍스트 메뉴 popup (트레이와 동일 내용) |
| `pet:event` | push (main→renderer) | PetEvent 매번 전달. 펫 윈도우 + Stats 윈도우 둘 다에 broadcast |

preload (`electron/preload.ts`) 가 `window.pet.{getSnapshot, getStats, subscribe, openMenu}` 으로 노출. renderer 의 `usePetState` / `useTokensToday` / `StatsView` 훅이 각각 사용.

## 저장 패턴

### pet-state.json (hot, 자주 바뀜)

`core/storage/petState.ts`:
- 위치: `<userData>/pet-state.json`.
- 저장: `makeDebouncedSaver(file, 500ms)` — pet 이벤트마다 schedule, 500ms 무이벤트면 flush.
- 쓰기: atomic — `.tmp` 에 쓰고 rename.
- 로드: 파일 없으면 `makeDefaultSnapshot`. 손상되면 default fallback. 스키마 차이가 있어도 default 와 spread 로 미존재 필드 채움.

### events.sqlite (cold, append-only)

`core/storage/eventsDb.ts`:
- 위치: `<userData>/events.sqlite`.
- WAL + synchronous=NORMAL.
- 테이블 events: 토큰 수치 + dedup 키 + 메타.
- UNIQUE INDEX (message_id, request_id) WHERE both NOT NULL.
- `insert(e)`: INSERT OR IGNORE → changes() 가 1 이면 신규.
- `sumSince(ts)`: TokenSum (input/output/cacheRead/cacheCreate) 반환.
- `stats(now)`: EventStats — `lifetime` / `today` (로컬 자정 이후) / `last24h` (rolling 24h) / `last7d` + `bySource` 집계 + 메타.

## shutdown 시퀀스

`app.on('before-quit')` 에서 한 번만 실행:

1. tick / cursor interval clear
2. IPC handler 해제
3. tray.destroy
4. saver.flush
5. registry.stop (각 소스의 stop — statusLine HTTP server close, chokidar close)
6. db.close
7. uninstallStatusLine — `~/.claude/settings.json` 의 `statusLine` 키 제거

## 테스트

vitest 단위 테스트, 약 90 케이스 (현재 수치는 `npm test` 결과로 확인).

| 영역 | 파일 위치 |
|---|---|
| 타입 인스턴스화 | `core/types.test.ts` |
| stages / condition / PetState FSM | `core/pet/*.test.ts` |
| nutrition / pipeline / BurstDetector | `core/feeding/*.test.ts` |
| JSONL 파서 / cursor / chokidar 통합 | `core/tokenSource/*.test.ts` |
| pet-state.json / events.sqlite (stats 포함) | `core/storage/*.test.ts` |
| statusLine installer | `installers/*.test.ts` |
| speech pickers | `renderer/data/speech.test.ts` |

`vitest.config.ts` 의 include 에 `core/**`, `installers/**`, `renderer/**` 의 `*.test.ts` 셋 다 포함됨.

패턴:
- 가짜 시계 주입 (`now: () => N`).
- 임시 디렉토리 사용 (`fs.mkdtempSync`).
- 외부 의존 모킹 최소화 — 실제 sqlite/파일 시스템 사용.

## ABI 함정

better-sqlite3 는 native module. **Node ABI** 와 **Electron ABI** 가 달라서 한쪽에서 컴파일하면 다른 쪽에서 에러:

- `npm test` (Node 실행) → Node ABI 필요.
- `npm run dev` / `npm run build` (Electron 실행) → Electron ABI 필요.

전환 시:

```bash
# Electron 으로 돌릴 때
npm run postinstall

# Node (vitest) 로 돌릴 때
npx prebuild-install -r node --prefix node_modules/better-sqlite3
```

## manual QA 체크리스트

### statusLine 통합
- [ ] `npm run dev` 후 `~/.claude/settings.json` 의 `statusLine` 키가 생겼는지.
- [ ] Quit 후 그 키가 제거됐는지. 다른 키(theme 등) 는 유지됐는지.
- [ ] Claude Code 한 턴 돌리면 펫이 EatingBurst 표시하는지.

### dedup
- [ ] statusLine + JSONL 양쪽에서 같은 턴이 도착해도 한 번만 먹는지 (events.sqlite 의 row 수 확인).

### 영속화
- [ ] 위치/크기 옮긴 후 재시작 → 그 자리에 그 크기로 복원.
- [ ] XP 누적된 상태에서 재시작 → 같은 phase, 같은 condition.

### first-launch
- [ ] pet-state.json 삭제 후 부팅 → lifetimeXP=0 으로 시작. 과거 JSONL 안 먹음.

### Reset Pet
- [ ] 컨텍스트 메뉴에서 Reset → phase 0, XP 0, condition 50. events.sqlite 는 그대로.
- [ ] Reset 후 펫이 과거 JSONL 안 다시 먹음 (cursor 가 현재 파일 끝으로 snap).

### Wipe Everything
- [ ] 컨텍스트 메뉴에서 Wipe → pet-state.json + events.sqlite 모두 삭제.

### 진화
- [ ] XP 10k / 300k / 3M 임계 넘을 때마다 EvolveCutscene 4s 표시.

### 다중 모니터
- [ ] 펫을 보조 모니터에 두고 재시작 → 보조 모니터 위치 복원 (workArea 클램프 동작).

### 풀스크린
- [ ] 다른 앱 풀스크린에서도 펫 보임 (`visibleOnFullScreen: true`).

## 수정 위치

| 바꿀 것 | 파일 |
|---|---|
| 새 IPC 채널 | `electron/ipc.ts` + `electron/preload.ts` + `renderer/global.d.ts` (타입 노출) |
| 부트 순서 / 새 의존성 wiring | `electron/bootstrap.ts` |
| 저장 경로 (userData 고정) | `electron/main.ts` 의 `app.setPath` |
| stats 집계 시간창 (today / 24h / 7d) | `core/storage/eventsDb.ts` |
| Burst 감지 (renderer side) | `core/feeding/burstDetector.ts` + `renderer/hooks/useBurstDetector.ts` |
| 테스트 추가 | 해당 영역의 `*.test.ts` (renderer 도 vitest 포함됨) |

## 참고 파일

- `electron/{main.ts, bootstrap.ts, window.ts, ipc.ts, preload.ts, tray.ts, statsWindow.ts}`
- `core/storage/{petState.ts, eventsDb.ts, paths.ts}`
- `core/feeding/{burstDetector.ts, nutrition.ts, FeedingPipeline.ts}`
- `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`
