# Token Eater Pet — Design Spec

**Date:** 2026-05-14
**Status:** Draft (pre-implementation)

## 1. Purpose

Claude Code / Codex 같은 AI CLI를 쓰면 소모되는 토큰을 "먹이"로 받아 성장·반응하는, 데스크탑에 떠 있는 펫. v1은 Claude Code 전용이고, Codex 등 다른 소스는 추후 플러그인처럼 붙일 수 있도록 인터페이스로 추상화한다.

설계 우선순위는 시스템(토큰 감지 → 누적 → 펫 상태)이며, 캐릭터 아트는 placeholder로 진행한다.

## 2. Top-level decisions

| 결정 | 값 |
|---|---|
| 폼팩터 | 데스크탑 always-on-top 윈도우 (한 자리 고정, 드래그로 이동) |
| 스택 | Electron + TypeScript (main + renderer 한 바닥) |
| 구조 | 모노리식 (펫 앱 1개 프로세스. 닫으면 카운트 멈춤 — Tamagotchi 본능과 일치) |
| 토큰 소스 v1 | Claude Code: statusLine push + JSONL file watch 하이브리드 |
| 토큰 소스 확장 | `TokenSource` 인터페이스 — Codex/Aider/기타 추후 플러그인 |
| 펫 모델 | 영구 lifetimeXP (포켓몬식 진화 3단계 + 알) + 24h 단기 condition |
| 죽음 | 없음. condition 0이어도 우울 sprite로 살아 있음 |
| 저장 | `pet-state.json` (hot, 작음) + `events.sqlite` (cold, 누적/통계용). transcript JSONL은 원본 보존 (복제 X) |

## 3. Architecture

```
┌──────────────────── Electron 프로세스 ────────────────────┐
│ Main (Node)                                              │
│  TokenSource registry ──► FeedingPipeline ──► PetState   │
│   - ClaudeStatusLine        (dedup, 영양 환산)  (FSM)    │
│   - ClaudeJSONLWatch                            │        │
│   - [CodexJSONL]  v2                            ▼        │
│                                          pet-state.json  │
│                                          events.sqlite   │
│  statusline-shim.cjs ──HTTP──► main                      │
│                                                          │
│ Renderer (React, transparent always-on-top BrowserWindow)│
│  Pet sprite + HUD ◄── IPC ── PetState events             │
└──────────────────────────────────────────────────────────┘
```

### 3.1 `TokenSource` interface (확장 포인트)

```ts
interface TokenSource {
  readonly id: string;
  start(emit: (e: TokenEvent) => void): Promise<void>;
  stop(): Promise<void>;
  install?(): Promise<InstallReport>;
}

interface TokenEvent {
  sourceId: string;
  sessionId: string;
  cursor: string;
  ts: number;
  tokens: { input: number; output: number; cacheRead: number; cacheCreate: number };
  model?: string;
  costUsd?: number;
  dedupKey?: { messageId?: string; requestId?: string };
}
```

새 소스를 붙일 땐 이 인터페이스만 구현하고 registry에 등록한다. 다른 모듈은 손대지 않는다.

### 3.2 디렉터리

```
token-eater-pet/
├── electron/         # main, window, ipc, tray
├── core/             # 도메인 (Electron 의존 X)
│   ├── tokenSource/  # TokenSource.ts, registry.ts, claudeStatusLine.ts, claudeJsonl.ts
│   ├── feeding/      # FeedingPipeline.ts, nutrition.ts
│   ├── pet/          # PetState.ts, stages.ts, condition.ts
│   └── storage/      # petState.ts, eventsDb.ts, cursor.ts
├── renderer/         # React UI
├── installers/       # statusLine 자동 등록/제거
└── scripts/          # statusline-shim.cjs
```

Electron 의존성은 `electron/`에만. `core/`는 순수 Node로 단위 테스트.

## 4. Data flow

### 4.1 Claude turn → 펫까지

1. Claude Code가 메시지 한 턴 끝낼 때마다 `statusLine` 등록된 `statusline-shim.cjs`를 실행하고 stdin으로 JSON 푸시.
2. shim이 main의 localhost HTTP (`127.0.0.1:<randomPort>`, 랜덤 토큰 인증)에 POST.
3. `ClaudeStatusLineSource`가 `TokenEvent` emit.
4. `FeedingPipeline`:
   - `events.sqlite`에서 `(messageId, requestId)` UNIQUE로 dedup.
   - 새 이벤트면 INSERT.
   - `nutrition.ts`로 토큰 → 영양 환산.
   - `PetState.feed({ nutrition, ts })` 호출.
5. `PetState`:
   - `lifetimeXP += nutrition`
   - `condition += nutrition * gain` (cap 100)
   - 진화 임계 넘으면 `evolved` 이벤트
   - mood 재계산 후 `mood-changed`
6. IPC로 renderer에 이벤트 push → 펫 그림/HUD 업데이트.
7. `pet-state.json` atomic write (500ms debounce).

### 4.2 JSONL watcher (병행)

- 앱 시작 시 `~/.claude/projects/**/*.jsonl` scan, cursor 이후 줄들 백필.
- `chokidar`로 append 감지, 새 줄 파싱.
- 같은 `FeedingPipeline`에 emit → dedup이 statusLine과 충돌 막음.
- 앱 꺼져 있었을 때 들어온 토큰을 다음 실행에서 따라잡는 경로.

### 4.3 시간 처리 (condition decay)

- 매 분 setInterval로 `condition -= 100 / (24*60)` 감쇠.
- 앱 꺼져 있었으면 시작 시 `now - lastTickAt` 한꺼번에 적용.
- 시계 점프(sleep/wake) 대비: 적용 가능한 decay는 최대 24시간치로 캡.

## 5. Pet mechanics

### 5.1 영양 환산

```
nutrition = input*1.0 + output*3.0 + cacheCreate*1.5 + cacheRead*0.1
```

### 5.2 진화 (포켓몬식 3단계 + 알)

| Phase | 이름(placeholder) | 임계 nutrition |
|---|---|---|
| Egg | 알 | 0 |
| Phase 1 | 베이비폼 | 10,000 |
| Phase 2 | 미들폼 | 300,000 |
| Phase 3 | 파이널폼 | 3,000,000 |

진화는 컷씬 이벤트 (3~5초). 임계치는 `stages.ts` 데이터 테이블로 분리해서 캘리브레이션 가능.

### 5.3 단기 condition (0~100)

```
condition += nutrition * 0.001
condition -= 100 / (24*60)  per minute decay
```

- ≥70: 행복 / 30~70: 평소 / 10~30: 졸림 / <10: 우울 (죽지 않음)

### 5.4 Mood 이벤트

- 방금 먹음 (≤30s, nutrition>0): EatingBurst 애니
- 폭식 (5분 내 평균*5 이상): 포만 애니
- 굶음 (마지막 식사 >6h): "??" 말풍선
- 진화 직전 (다음 임계까지 <5%): 살짝 빛남

### 5.5 인터랙션 (v1)

- 좌클릭: 펫이 반응 (점프 등)
- 우클릭: 메뉴 (Stats / Settings / Reset Pet / Wipe / Quit)
- 드래그: 윈도우 이동, 위치 영구 저장

## 6. Storage

위치: `app.getPath('userData')` (macOS: `~/Library/Application Support/token-eater-pet/`).

### 6.1 `pet-state.json` (hot)

```json
{
  "schemaVersion": 1,
  "createdAt": 1715000000000,
  "lifetimeXP": 142500.0,
  "phase": 1,
  "condition": 64.2,
  "mood": "happy",
  "lastTickAt": 1715600000000,
  "lastFedAt": 1715599800000,
  "lastCursors": {
    "claude-statusline": { "messageId": "...", "requestId": "..." },
    "claude-jsonl": { "file": "/.../session.jsonl", "lineOffset": 1234 }
  },
  "windowPos": { "x": 1500, "y": 80 }
}
```

매 변경 후 500ms debounce → atomic write (temp + rename).

### 6.2 `events.sqlite` (cold)

```sql
CREATE TABLE events (
  ts INTEGER NOT NULL,
  source TEXT NOT NULL,           -- 'claude-statusline' | 'claude-jsonl' | 'codex' (v2)
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
CREATE UNIQUE INDEX idx_dedup ON events(message_id, request_id) WHERE message_id IS NOT NULL;
CREATE INDEX idx_ts ON events(ts);
```

차트/통계는 이 테이블에서 집계. transcript JSONL 자체는 복제하지 않는다.

## 7. Reliability & edge cases

| 상황 | 처리 |
|---|---|
| 앱 안 켜진 채 shim POST | shim 1s timeout, 실패 시 조용히 종료 (Claude 흐름 방해 X) |
| 포트 충돌 | main이 빈 포트 잡고 `~/.claude/settings.json`의 statusLine command에 박아 저장 |
| 인증 | 랜덤 토큰을 shim에 박고 POST 헤더로 검증 |
| JSONL truncate/rotate | inode 변경 감지 → cursor 재설정 |
| JSONL 줄 깨짐 | 해당 줄 skip, warn 로그, 다음 줄 진행 |
| GB급 백필 | 첫 실행 시 청크 처리 + 진행률 표시 |
| transcript 디렉터리 없음 | "Claude Code를 한 번도 안 썼나봐" 안내, 빈 상태로 대기 |
| Dedup 키 부재(구버전) | fallback: `(sessionId, turnIndex, ts반올림)` |
| 강제 종료 중 쓰기 | atomic write로 절반 쓰임 방지 |
| 시계 점프/장기간 sleep | decay 최대 24h치로 캡 |
| schema 마이그레이션 | `schemaVersion` 검사, up-migrator |

### Reset / Wipe
- **Reset Pet**: pet-state.json 초기화. events.sqlite는 보존 (통계용).
- **Wipe Everything**: 둘 다 삭제.

## 8. Out of scope (v1)

- 멀티 펫
- 클라우드 동기
- 시스템 알림 / 사운드
- Codex 등 다른 토큰 소스 (인터페이스만 마련)
- 분기 진화 / shiny (확장 후보)
- 캐릭터 아트 완성형 (placeholder sprite로 진행)

## 9. Testing strategy

### 9.1 단위 (`core/`, Vitest)
- `nutrition.ts`: 토큰 조합 → 영양값 케이스 표
- `stages.ts`: 임계 진입/탈출 경계값
- `condition.ts`: decay, 시간 점프 캡, floor/ceiling
- `PetState.ts`: feed → 이벤트 시퀀스 (fed/evolved/mood-changed 순서)
- `FeedingPipeline.ts`: dedup (같은 messageId 두 번 → 한 번만 누적)
- `claudeJsonl.ts`: 샘플 fixture 파싱, cursor 추적, 깨진 줄 skip
- `cursor.ts`: inode rotate 재설정

### 9.2 통합
- statusLine end-to-end (mock HTTP): shim 실행 → PetState 반영
- 백필 + 실시간 동시 유입 → dedup 한 row
- 재시작 → cursor 재개 (새 줄만 처리)

### 9.3 수동 QA (Electron)
- always-on-top + 투명 윈도우 (Mission Control / 풀스크린)
- 드래그 이동 → 재시작 후 위치 복원
- 우클릭 메뉴 동작
- Reset / Wipe 동작
- 다중 모니터

### 9.4 Fixtures
- `core/tokenSource/__tests__/fixtures/` — 익명화한 JSONL 샘플
- statusLine stdin payload 샘플

### 9.5 CI
- v1에서는 도입 안 함. 로컬 `npm test`로 충분.

## 10. Open / deferred questions

- 영양 환산 가중치 (output=3.0 등) 및 진화 임계치는 placeholder. 실제 플레이로 캘리브레이션.
- 분기 진화 (output/cache 비율 기반) — v2 후보.
- 알림(notification)은 v1 제외했지만 진화 시점은 살짝 띄울지 차후 검토.
- 캐릭터 아트는 시스템 안정 후 별도 디자인 페이즈.
