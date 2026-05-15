# 04. 권한 / 설정

> 펫은 부팅 시 `~/.claude/settings.json` 의 statusLine 키를 자동 설치하고 종료 시 제거. 저장은 OS 의 userData 경로 사용. macOS 메뉴바 트레이는 시스템 설정에서 켜야 보일 수 있음.

## ~/.claude/settings.json — statusLine 자동 설치

`installers/statusLine.ts` 가 담당.

### 부팅 시 (`installStatusLine`)

`~/.claude/settings.json` 에 다음 키를 머지:

```json
{
  "statusLine": {
    "type": "command",
    "command": "node \"/abs/path/to/scripts/statusline-shim.cjs\"",
    "env": {
      "PET_PORT":  "53421",
      "PET_TOKEN": "랜덤 16바이트 hex"
    }
  }
}
```

- PET_PORT: 부팅 시 ClaudeStatusLineSource 가 잡은 임의 포트(127.0.0.1).
- PET_TOKEN: 매 부팅 시 새로 생성된 16바이트 hex (`crypto.randomBytes`). shim 이 `x-pet-token` 헤더로 전달, 데몬이 검증.
- 파일에 이미 다른 키(theme 등) 가 있으면 보존. statusLine 키만 덮어씀.
- atomic write — `.tmp` 에 쓰고 rename.

### 종료 시 (`uninstallStatusLine`)

`statusLine` 키 **만** 제거. 사용자가 설정한 다른 항목은 그대로.

### shim 토큰 인증

`scripts/statusline-shim.cjs` 가 환경변수 PORT/TOKEN 으로 호출됨. localhost POST 시 헤더에 토큰 첨부. 1초 타임아웃, 에러 무시 — 펫이 떠 있지 않아도 Claude 는 멈추지 않음. stdout 에는 항상 `🐾` 출력.

## userData 디렉토리

`app.getPath('userData')` 를 베이스로 두 파일:

| 파일 | 용도 |
|---|---|
| `pet-state.json` | hot snapshot. atomic 갱신. |
| `events.sqlite` (+ `.sqlite-wal`, `.sqlite-shm`) | append-only 이벤트 로그. |

OS 별 위치:

| OS | 경로 |
|---|---|
| macOS | `~/Library/Application Support/token-eater-pet/` |
| Linux | `~/.config/token-eater-pet/` |
| Windows | `%APPDATA%\token-eater-pet\` |

`core/storage/paths.ts` 의 `resolveStoragePaths(userDataDir)` 가 경로 산출. 변경 시 여기만 손대면 됨.

## electron-rebuild (native module)

`package.json` 의 `postinstall: "electron-rebuild -f -w better-sqlite3"`.

- better-sqlite3 는 native module. **현재 Electron 버전의 ABI 로 컴파일** 돼야 main 프로세스에서 require 가능.
- `npm install` 후 자동 실행.
- 단, vitest (Node 실행) 로 테스트할 때는 Node ABI 필요 — [03-implementation.md](./03-implementation.md#abi-함정) 참고.

## macOS 메뉴바 트레이 표시

`electron/tray.ts` 가 Tray 객체 + 메뉴를 만들지만, 메뉴바에 보일지는 macOS 의 권한/설정에 좌우됨.

### 안 보일 때 체크

1. **시스템 설정 → 제어 센터 → "메뉴 막대 전용"** 섹션에 token-eater-pet 항목이 있으면 켜기.
2. **MacBook 노치 가려짐** — 메뉴바 우측에 다른 앱이 너무 많으면 노치 뒤로 밀려서 안 보임. Bartender / Hidden Bar 같은 도구로 다른 메뉴바 앱을 숨겨 자리 확보.
3. **그래도 안 보이면 우클릭 컨텍스트 메뉴 사용** — 펫 본체 우클릭하면 트레이 메뉴와 동일한 메뉴가 popup. 트레이는 사실상 부가 기능.

### 메뉴 항목

| 항목 | 동작 |
|---|---|
| Show Stats | 펫 윈도우 보이기 (현재는 win.show() 만, 통계창은 TODO). |
| Reset Pet | 다이얼로그 확인 후 phase/XP/condition 초기화. events.sqlite 는 보존. cursor 를 현재 파일 크기로 snap. |
| Wipe Everything | 다이얼로그 확인 후 pet-state.json + events.sqlite 모두 삭제. |
| Quit | `app.quit()` → 정상 shutdown 시퀀스. statusLine 자동 제거. |

## Reset Pet vs Wipe Everything

| | Reset Pet | Wipe Everything |
|---|---|---|
| pet-state.json | 초기화 | 삭제 |
| events.sqlite | **보존** | 삭제 |
| JSONL cursor | 현재 파일 크기로 snap | 삭제 (다음 부팅에 isFresh 판정 → 과거 무시) |
| 통계 / 과거 이벤트 | 살아있음 | 사라짐 |

Reset 은 "펫만 새로 키우고 싶다", Wipe 는 "다 지우고 처음부터".

## 보안 메모

- **statusLine HTTP** 는 127.0.0.1 로만 바인딩. 외부에서 접근 불가.
- **PET_TOKEN** 으로 헤더 검증. 같은 머신의 다른 프로세스가 익명 POST 못 보냄.
- **shim 의 1초 타임아웃** + 에러 무시. 데몬이 안 떠 있어도 Claude 워크플로우 영향 X.
- statusLine 자동 설치는 **사용자 동의 없이** 진행. 우려되면 `installStatusLine` 호출부에 사용자 확인 다이얼로그 추가하는 게 다음 작업.

## 수정 위치

| 바꿀 것 | 파일 |
|---|---|
| settings.json 키 형식 | `installers/statusLine.ts` |
| shim 동작 / 타임아웃 | `scripts/statusline-shim.cjs` |
| 저장 경로 | `core/storage/paths.ts` |
| 트레이 메뉴 항목 | `electron/tray.ts` 의 `buildMenuTemplate` |
| Reset/Wipe 동작 | `electron/bootstrap.ts` 의 `trayCb` |
| 권한 정책 (사용자 동의 등) | `electron/bootstrap.ts` 의 `installStatusLine` 호출부 |

## 참고 파일

- `installers/statusLine.ts`
- `scripts/statusline-shim.cjs`
- `electron/{bootstrap.ts, tray.ts}`
- `core/storage/paths.ts`
