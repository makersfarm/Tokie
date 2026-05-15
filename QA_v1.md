# Token Eater Pet — v1 Manual QA

Run `npm run dev`. Verify each item:

- [ ] Pet window appears top-right, transparent, always-on-top.
- [ ] Pet sprite shows 🥚 (or current phase if state already advanced).
- [ ] HUD bottom-left shows stage name, XP/next threshold, condition, mood.
- [ ] Drag window — moves freely.
- [ ] Quit (tray → Quit) and relaunch → window opens at last position.
- [ ] `~/.claude/settings.json` contains `statusLine` with `PET_PORT` / `PET_TOKEN` while app runs.
- [ ] `~/.claude/settings.json` `statusLine` is removed after quit.
- [ ] curl POST to `/event` with valid token → eating burst, XP advances.
- [ ] curl POST with wrong token → 401, no effect.
- [ ] Two identical curls (same messageId+requestId) → only one feed.
- [ ] Push enough nutrition to cross 10,000 → evolution cutscene 🥚 → 🐣.
- [ ] Tray → Reset Pet → confirm → pet returns to 🥚, condition 50.
- [ ] Tray → Wipe Everything → confirm → `events.sqlite` deleted.
- [ ] Run Claude Code in a real session (one turn) → pet eats real tokens (visible burst, XP up).
- [ ] First-launch on a machine with prior `~/.claude/projects/*.jsonl` history → pet does NOT auto-fill from history (starts at XP=0).
- [ ] After Reset Pet → existing JSONL files do NOT replay; only new appends count.
- [ ] Sleep laptop overnight (or skip clock by 24h+) → relaunch → condition is 0, mood = sad, pet alive.
- [ ] Multi-monitor: window stays on the screen it was on.
