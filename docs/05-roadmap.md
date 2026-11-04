# 05 · Roadmap & implementation plan

Target: a usable first build ("Phase 0 + 1") the same night, then weekly
phases. Each phase ends with something you can run. Priorities match the
tags in `02-features.md`.

## Phase 0 — Foundation (tonight)

| # | Task | Done when |
|---|---|---|
| 0.1 | Tauri 2 + React + Vite + Tailwind scaffold, two windows (main, system), tray, global shortcut | `npm run tauri dev` opens the main window; tray shows; `Cmd/Ctrl+Shift+S` toggles |
| 0.2 | Design tokens + fonts + `SystemWindow` renderer with all block types from `04 §6` | Every spec in the prototype renders in React identically |
| 0.3 | Engine: config, types, reducer, XP/levels/ranks, daily quest, day close, penalty, streaks, gold, random box, shadows, titles | `npm test` green; 400-day simulation passes |
| 0.4 | HTML prototype of every pop-up (`docs/prototype/index.html`) as the visual spec | Screenshots in `docs/prototype/screenshots/` |
| 0.5 | Oracle module: schema, prompts, client, cache, fallback; Settings field for the API key | Mocked tests pass; with a key, "Ask the System" returns a rendered window |
| 0.6 | Plan docs 01–05 committed | this file |

## Phase 1 — Core loop (week 1)

1. **Onboarding:** Player acceptance prompt → name → pick which of the 4 habits (edit targets) → first Daily Quest.
2. **Daily Quest screen + pop-up:** log progress by clicking rows or typing a number; sleep logs "last night"; gym rest-day handling via Fatigue.
3. **Status screen:** canon layout, live bars, ability point allocation, rank badge.
4. **Day boundary & penalties:** 60 s tick, warnings at T‑3h / T‑1h, Penalty Mode with the 4‑hour Survive timer and escape rule, Streak Shield consumption.
5. **Rewards:** XP/gold/box on completion, Random Box opening ceremony, inventory, consumables usable from inventory.
6. **Persistence:** SQLite events + nightly snapshot; export/import JSON.
7. **Ceremonies:** level up, rank re-evaluation.
8. **Packaging:** `tauri build` for the user's OS; autostart toggle.

Exit criteria: the user can live on the app for a week without touching code.

## Phase 2 — Economy & real-world rewards (week 2)

1. System Shop with two shelves; real-world rewards CRUD (name, $, link, stat tag); gold pricing with the monthly budget; Treasury screen (budget, spent, pending).
2. Purchase flow: gold deducted → opens link → "Mark as bought" → purchase log; monthly reset.
3. Weekly Gate + Red Gate; Instant Dungeon focus timer (25/50/90 min) with keys from boxes.
4. Titles (12+) and Skills (8+) with real effects (Tenacity grace, Stealth DND, Sprint 2× XP, Bloodlust focus).

## Phase 3 — Shadow Army & Oracle (week 3)

1. Shadow extraction ceremony on streak milestones; roster screen; passive gold; rank up/down.
2. Oracle in production: day-start quest generation, Gate generation, commentary, "Ask the System"; cost meter in Settings; daily cache.
3. Job Change Quest at Lv 40 (7/7 gauntlet) → class + bonus.
4. Urgent quests (Oracle-proposed, engine-clamped) and Secret quests.

## Phase 4 — Integrations & polish (week 4+)

1. Health data: Apple Health export / Oura / Whoop / Garmin for sleep auto-logging; Strava/Hevy for workouts; MyFitnessPal/CSV for meals. Start with manual + CSV import, then APIs.
2. Google Calendar: block Instant Dungeons on the calendar; read focus blocks as quest hints.
3. Cloud backup (Drive/iCloud folder sync of the SQLite file), auto-updater, signed builds.
4. Sound pack (licensed/original stingers), reduced-motion mode, Windows transparency QA.
5. Mobile companion (read-only status + quick log) — only if the desktop loop sticks.

## Open questions for the user (answer whenever)

1. Your name as it should appear in the Status Window, and any renames for the four stats (e.g. keep SENSE vs PERCEPTION).
2. Exact daily targets: gym sessions/week and which days are rest days; study minutes/day; sleep hours target and bedtime; what counts as a "clean meal" (count per day, or a simple ✓).
3. Day boundary: midnight, or 3 a.m. (recommended for late sleepers).
4. Monthly real-world reward budget in dollars, and a first list of 5–10 rewards with links.
5. ~~OS~~ — answered: **macOS**. First packaged build is a `.dmg`; Windows/Linux later.
6. Whether to enable the Oracle from day one (needs an Anthropic API key) or run on template windows first.

## Risks

- **Transparent always-on-top windows** behave differently per OS (macOS needs the private API flag; Windows needs `transparent` + no shadow; some Linux compositors ignore it). Mitigation: the pop-up degrades to an opaque dark window.
- **Day-boundary bugs** (DST, laptop asleep at the boundary) are the classic habit-app failure. Mitigation: boundaries are computed from wall-clock dates in the user's zone, closes are idempotent, and the simulation test covers sleep/wake gaps.
- **Oracle cost/latency**: capped by the daily budget and cached per day; the app never blocks on it.
- **Penalty harshness**: tuned to sting, not to make you quit. Everything is recoverable; Elixir of Life and Streak Shields exist for a reason.
