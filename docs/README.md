# token-eater-pet

Claude Code(추후 Codex 등) 사용 토큰을 먹고 자라는 데스크탑 펫. always-on-top 투명 윈도우로 떠 있으며, statusLine hook + JSONL 파일 감시로 토큰 사용량을 실시간 수집해 펫의 XP/condition/mood 에 반영한다.

## 카테고리

| | 문서 | 내용 |
|---|---|---|
| 01 | [01-tokens.md](./01-tokens.md) | 토큰을 어떻게 수집·중복제거·영양가로 환산하는지. 새 소스(Codex 등) 붙이는 법. |
| 02 | [02-pet.md](./02-pet.md) | 펫 상태기계. phase/condition/mood, 진화 임계값, decay, 튜닝 위치. |
| 03 | [03-implementation.md](./03-implementation.md) | 디렉토리 구조, 부트 순서, IPC, 저장, 테스트, ABI 함정, manual QA. |
| 04 | [04-permissions-settings.md](./04-permissions-settings.md) | `~/.claude/settings.json` 자동 설치/제거, userData 위치, macOS 메뉴바 권한, Reset/Wipe 동작. |
| 05 | [05-pet-design.md](./05-pet-design.md) | SVG 스프라이트, 표정/mood 오버레이, EatingBurst/EvolveCutscene, 아트 교체 가이드. |
| 06 | [06-ui.md](./06-ui.md) | BrowserWindow 옵션, 드래그/리사이즈, 컨텍스트 메뉴, HUD, 영속화. |

## 빠른 시작

```bash
npm install
npm run postinstall      # better-sqlite3 를 Electron ABI 로 rebuild
npm run dev              # 투명 펫 윈도우 띄움 (alwaysOnTop)
```

Claude Code 한 턴 돌리면 펫이 🐾 먹기 시작. 펫 우클릭하면 컨텍스트 메뉴 (Show Stats / Reset / Wipe / Quit).

## 명령어

| 명령 | 용도 |
|---|---|
| `npm run dev` | Vite + Electron 개발 서버. 펫 윈도우 + HMR. |
| `npm run build` | dist-electron/ 와 dist/ 에 프로덕션 번들 생성. |
| `npm test` | vitest 단위 테스트 (15 files / 73 tests). |
| `npm run postinstall` | better-sqlite3 를 현재 Electron 버전 ABI 로 rebuild. |

## 알려진 함정

- **ABI ping-pong** — `npm test` 는 Node ABI, `npm run dev` 는 Electron ABI 필요. 모드 전환 시 한 번 더 rebuild. 상세: [03-implementation.md](./03-implementation.md#abi-함정)
- **macOS 메뉴바 트레이 안 보임** — Control Center 설정에서 켜야 함. 우클릭 컨텍스트 메뉴가 fallback. 상세: [04-permissions-settings.md](./04-permissions-settings.md#macos-메뉴바-트레이-표시)
