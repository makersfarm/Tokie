# 01. 토큰

> Claude Code 가 소비하는 토큰을 push(statusLine) + pull(JSONL) 두 경로로 수집해 중복 제거 후 영양가로 환산. TokenSource 인터페이스로 새 소스(Codex 등) 확장 가능.

## 데이터 흐름

```
[Claude Code 한 턴 종료]
        │
        ├── push: statusLine hook
        │     └── statusline-shim.cjs ─HTTP─► ClaudeStatusLineSource
        │
        └── pull: ~/.claude/projects/**/*.jsonl 새 줄
              └── chokidar watcher ─► ClaudeJsonlSource
                      │
                      ▼
                TokenEvent
                      │
                      ▼
              FeedingPipeline
                      │
                ┌─────┴──────┐
                ▼            ▼
            EventsDb     PetState.feed
            (dedup)       (XP/cond/mood)
```

같은 턴이 push 와 pull 양쪽에서 도착해도 SQLite UNIQUE 제약으로 한 번만 반영.

## TokenSource 인터페이스

`core/tokenSource/TokenSource.ts` — 새 소스 붙이는 확장점.

```ts
interface TokenSource {
  readonly id: string;
  start(emit: (e: TokenEvent) => void): Promise<void>;
  stop(): Promise<void>;
  install?(): Promise<InstallReport>;
}
```

`SourceRegistry` (`core/tokenSource/registry.ts`) 가 소스 목록을 받아 순차로 start/stop. 부트 시 `electron/bootstrap.ts` 에서 `new SourceRegistry([statusline, jsonlSrc])` 식으로 구성.

### 새 소스 붙이는 법

1. `core/tokenSource/<your-source>.ts` 에 TokenSource 구현. start 에서 emit 콜백으로 TokenEvent 흘려보내기.
2. `electron/bootstrap.ts` 에서 인스턴스 만들어 SourceRegistry 배열에 추가.
3. 만약 외부 시스템 설정 변경이 필요하면 `install()` 도 구현하고 부트 시 호출 (statusLine 처럼 `~/.claude/settings.json` 손대는 경우).

## statusLine 소스 (push)

`core/tokenSource/claudeStatusLine.ts`

- 부트 시 `127.0.0.1:0` (랜덤 포트) HTTP 서버 기동.
- `x-pet-token` 헤더로 인증 (매 부팅 새 토큰). 일치 안 하면 401.
- `POST /event` 받아 본문 JSON 을 파싱, TokenEvent 로 emit.
- 설치는 `installers/statusLine.ts` 의 `installStatusLine` 이 `~/.claude/settings.json` 의 `statusLine` 키에 shim 실행 명령 + 환경변수(PORT/TOKEN) 기록.

## shim 동작

`scripts/statusline-shim.cjs` — Claude Code 가 매 턴 마지막에 호출.

- stdin 으로 JSON payload 받음 (Claude Code 의 statusLine 입력 포맷).
- stdout 으로 `🐾` 출력 (Claude UI 의 status 줄에 표시되는 텍스트).
- localhost POST `/event` 로 페이로드 전송. **1초 타임아웃, 에러 무시** — 펫이 안 떠 있어도 Claude 는 절대 block 되지 않게.

## JSONL 소스 (pull)

`core/tokenSource/claudeJsonl.ts` + `core/tokenSource/claudeJsonlParse.ts`

- `~/.claude/projects/` 를 chokidar 5 로 재귀 감시. 파일 add/change 마다 `.endsWith('.jsonl')` 필터.
- 파일별 byteOffset cursor 유지. 새로 추가된 바이트만 1MB 청크로 읽고 라인 단위 파싱.
- partial-line 안전 (마지막 미완 라인은 다음 호출까지 버퍼).
- assistant 메시지가 아니거나 `message.usage` 가 없으면 skip.
- `(message_id, request_id)` 를 dedupKey 로 TokenEvent emit.
- `exportCursors()` / `loadCursors()` 로 cursor 영속화 — 펫 재시작해도 이미 읽은 위치 이후부터 재개.

### first-launch backfill 스킵

`electron/bootstrap.ts` 에서 판단:

```ts
const isFresh = snap.lifetimeXP === 0 && Object.keys(snap.lastCursors).length === 0;
const jsonlSrc = new ClaudeJsonlSource(claudeHome, { skipExistingHistory: isFresh });
```

처음 펫을 띄울 때 과거 JSONL 을 다 먹어서 인스턴트 max 가 되는 걸 방지. 기존 파일들은 cursor 를 현재 파일 크기로 snap. **Reset Pet** 시에도 cursor 를 다시 snap (재섭취 방지).

## 중복 제거

`core/storage/eventsDb.ts` — better-sqlite3 WAL.

- 테이블 `events` 컬럼: ts, source_id, session_id, cursor, input/output/cache_*, model, cost_usd, message_id, request_id.
- `CREATE UNIQUE INDEX IF NOT EXISTS uniq_msg_req ON events(message_id, request_id) WHERE message_id IS NOT NULL AND request_id IS NOT NULL`.
- `insert(e)` 가 `INSERT OR IGNORE` 후 changes() 로 신규 여부 반환. 신규일 때만 펫이 먹음.

## 영양가 환산

`core/feeding/nutrition.ts`

```
nutrition = max(0,input)*1.0 + max(0,output)*3.0
          + max(0,cacheCreate)*1.5 + max(0,cacheRead)*0.1
```

가중치는 `NUTRITION_WEIGHTS` 상수. 출력 토큰을 가장 비싸게 잡고 cache_read 는 거의 무시. 음수 입력은 0 으로 클램프.

## 수정 위치

| 바꿀 것 | 파일 |
|---|---|
| 영양 가중치 | `core/feeding/nutrition.ts` 의 `WEIGHTS` |
| 새 토큰 소스 | `core/tokenSource/<new>.ts` + `electron/bootstrap.ts` 의 SourceRegistry 배열 |
| statusLine 포트/토큰 정책 | `core/tokenSource/claudeStatusLine.ts`, `electron/bootstrap.ts` |
| 첫 실행 backfill 정책 | `electron/bootstrap.ts` 의 `isFresh` 판정 |
| 중복 키 정의 | `core/storage/eventsDb.ts` 의 UNIQUE INDEX |

## 참고 파일

- `core/types.ts` — TokenEvent / TokenCounts 스키마
- `core/tokenSource/{TokenSource.ts, registry.ts, claudeStatusLine.ts, claudeJsonl.ts, claudeJsonlParse.ts}`
- `core/feeding/{nutrition.ts, FeedingPipeline.ts}`
- `core/storage/eventsDb.ts`
- `installers/statusLine.ts`
- `scripts/statusline-shim.cjs`
