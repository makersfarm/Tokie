# Tokie

Claude Code 토큰을 먹고 자라는 데스크탑 펫. 작은 투명 창이 화면 위에 떠 있다가, 네가 클로드를 쓸 때마다 펫이 토큰을 받아먹고 진화한다.

> 스크린샷 자리. README 마무리 단계에서 GIF / PNG 박을 것.

## 다운로드

[GitHub Releases](https://github.com/ikseong/tokie/releases/latest) 에서 OS 에 맞는 빌드:

- **macOS**: `Tokie-<version>-mac.dmg`
- (Windows / Linux 빌드 — 추후 추가)

> macOS 처음 실행 시 "확인되지 않은 개발자" 차단 시: `.app` **우클릭 → 열기** 로 한 번 우회하면 다음부턴 더블클릭 OK. (코드 사이닝 미적용 — Roadmap 참고)

## 어떻게 동작해

1. 앱이 켜지면 작은 펫 창이 화면 위에 always-on-top 으로 뜬다.
2. Claude Code (`~/.claude`) 의 `statusLine` 훅과 JSONL 사용 로그를 감시.
3. 토큰이 들어올 때마다 펫 주위에 `+12.3k` 가 떠올랐다 사라지고, 진화 진행도가 차오른다.
4. 펫을 좌클릭하면 인사, 우클릭하면 메뉴 (Show Stats / Reset Pet / Wipe Everything / Quit).
5. 호버하면 XP / 컨디션 / 오늘 사용량 팝업.

## 진화 단계

| Phase | 누적 XP 임계값 |
|---|---|
| 🥚 Egg | 0 |
| 🐣 Baby | 10k |
| 🐤 Middle | 300k |
| 🐔 Final | 3M |

XP = `input*1 + output*3 + cacheCreate*1.5 + cacheRead*0.1` (토큰 → 영양가 환산).

조건 (`condition`) 은 24시간 동안 안 먹으면 100 → 0 으로 선형 감소. 다시 먹으면 회복. 0 근처가 되면 mood 가 `sad` / `sleepy` 로 바뀌고 펫이 어둡게 보임.

## 개인정보 / 데이터

전부 **로컬**. 외부 서버로 아무것도 안 보냄.

| 무엇 | 어디 |
|---|---|
| 펫 상태 (XP / condition / 윈도우 위치 등) | `~/Library/Application Support/token-eater-pet/pet-state.json` (macOS) |
| 토큰 사용 이벤트 SQLite | 같은 디렉토리 `events.db` |
| statusLine 등록 | `~/.claude/settings.json` 의 `statusLine` 키 |

전부 우클릭 → **Wipe Everything** 으로 한 번에 삭제 가능. 앱 종료 시 statusLine 등록도 자동 해제.

## Quick start (개발)

```bash
git clone https://github.com/ikseong/tokie
cd tokie
npm install            # postinstall 이 better-sqlite3 를 Electron ABI 로 rebuild
npm run dev            # 펫 윈도우 + HMR
npm test               # vitest (자세한 건 docs/03-implementation.md ABI 함정)
```

## 문서

- 사람용 카테고리별 문서: [`docs/`](./docs/README.md)
  - [01. 토큰 수집](./docs/01-tokens.md)
  - [02. 펫 상태기계](./docs/02-pet.md)
  - [03. 구현 (부트·IPC·테스트)](./docs/03-implementation.md)
  - [04. 권한·설정](./docs/04-permissions-settings.md)
  - [05. 펫 디자인](./docs/05-pet-design.md)
  - [06. UI](./docs/06-ui.md)
- 설계 스펙: [`docs/specs/`](./docs/specs/)
- 구현 plan: [`docs/plans/`](./docs/plans/)
- Claude Code 세션용 메모: [CLAUDE.md](./CLAUDE.md)

## 기여

[CONTRIBUTING.md](./CONTRIBUTING.md) 참고. PR / 이슈 환영.

## Roadmap (대략)

- v0.1 ✓ 펫 오버레이 v2 (badge / progress bar / hover / click / burst speech / random K-format bursts)
- v0.2 코드 사이닝 + macOS notarization
- v0.2+ Windows / Linux 빌드
- 추후 Codex 토큰 소스, eye-follow, speech 풀 외부화

## 라이선스

[MIT](./LICENSE).
