# 04 · Architecture

Decisions here are final for v0/v1 unless a later doc overrides them. Free rein
on the stack was granted, so these are chosen for: fast iteration, a tiny
native binary, real OS-level pop-up windows, and a clean seam for the
generative-UI experiment.

## 1. Stack

| Layer | Choice | Why |
|---|---|---|
| Shell | **Tauri 2** (Rust) | 5–10 MB binary, native multi-window with frameless/transparent/always-on-top windows (the pop-ups), tray, global shortcuts, autostart, notifications. Cross-platform (macOS/Windows/Linux). |
| UI | **React 19 + TypeScript + Vite** | Fast dev loop; the pop-up and main windows share one component library. |
| Styling | **Tailwind v4** + CSS variables | Design tokens in one `@theme` block (see `03-ui-spec.md §1`). |
| Motion / sound | **framer-motion**, Web Audio API (synth chimes), small `.ogg` stingers later | Hologram flicker‑in, level‑up flash, "Ding!". |
| State | **Zustand** | Tiny; stores mirror the engine snapshot. |
| Persistence | **SQLite** via `tauri-plugin-sql` (migrations in Rust) + `tauri-plugin-store` for settings | Local‑first, single file in the app data dir, trivially exportable. |
| Domain logic | **`src/engine/`**: pure TypeScript, no I/O | Deterministic, fully unit‑tested with vitest, runs in the browser preview and in Tauri. |
| Generative UI | **The Oracle**: `@anthropic-ai/sdk` (TypeScript), structured outputs → `SystemWindowSpec` | See §6. |
| Tests | vitest (engine, oracle schema), Playwright (UI smoke) | |
| Packaging | `tauri build` → `.dmg` / `.msi` / `.AppImage`; updater later | |

Repo layout:

```
levels/
├── docs/                    # these plans + the HTML prototype (docs/prototype/)
├── src/
│   ├── main.tsx             # routes: "/" → MainShell, "/system" → SystemPopup
│   ├── components/          # React: screens, SystemWindow renderer, blocks
│   ├── engine/              # pure domain logic (no React, no Tauri)
│   │   ├── config.ts        # DEFAULT_CONFIG: stats, habits, curves, economy ← user edits here
│   │   ├── types.ts
│   │   ├── xp.ts  rank.ts  quests.ts  penalty.ts  streaks.ts  economy.ts  shadows.ts  titles.ts
│   │   ├── reducer.ts       # (state, event) → (state, effects[])
│   │   └── __tests__/
│   ├── oracle/              # Claude client, prompts, SystemWindowSpec zod schema, cache, fallbacks
│   ├── store/               # zustand stores + persistence adapter (sqlite)
│   ├── lib/tauri.ts         # invoke/listen wrappers that no-op in a plain browser
│   └── styles/globals.css
├── src-tauri/               # Rust: windows, tray, shortcuts, scheduler tick, sqlite migrations
└── SETUP.md
```

## 2. Process model

```
┌────────────────────────── Tauri core (Rust) ──────────────────────────┐
│  tray • global shortcut • window mgmt • 60 s scheduler tick • sqlite   │
│        emits: levels://tick, levels://system-window, levels://toggle   │
└───────────────┬───────────────────────────────┬───────────────────────┘
                │ main window (/)               │ system window (/system)
       ┌────────▼─────────┐           ┌─────────▼─────────┐
       │ MainShell        │           │ SystemPopup       │
       │ screens + engine │──invoke──▶│ renders a         │
       │ + oracle         │ show_sys  │ SystemWindowSpec  │
       └──────────────────┘           └───────────────────┘
```

- The **main window** owns the engine state and persistence. It is the only
  writer to SQLite.
- The **system window** is dumb: it receives a `SystemWindowSpec` payload,
  renders it, plays the sound, and sends user actions back via a Tauri event
  (`levels://system-action`). This is what makes the generative-UI experiment
  safe: *every* pop-up, hand-written or Claude-written, goes through the same
  validated spec and renderer.
- The Rust side ticks every 60 s even when the main window is hidden; the
  frontend's scheduler decides whether something is due (quest reset, warning,
  penalty, oracle refresh) and asks Rust to show the pop-up.

## 3. Engine: event-sourced reducer

All state changes are events appended to `events` and folded by a pure reducer.
This gives free undo, a perfect audit log for the Status screen, and
deterministic tests.

```ts
type Event =
  | { type: "PLAYER_ACCEPTED"; name: string; at: ISO }
  | { type: "DAY_STARTED"; date: YMD; quest: DailyQuest }           // generated at day boundary
  | { type: "GOAL_PROGRESS"; date: YMD; goalId: string; delta: number; at: ISO }
  | { type: "DAY_CLOSED"; date: YMD; at: ISO }                       // evaluated at boundary → rewards or penalty
  | { type: "PENALTY_CLEARED"; date: YMD; at: ISO }
  | { type: "POINTS_ALLOCATED"; stat: StatId; points: number }
  | { type: "BOX_OPENED"; boxId: string; seed: number }
  | { type: "ITEM_USED"; itemId: string; at: ISO }
  | { type: "REWARD_PURCHASED"; rewardId: string; goldSpent: number; usd: number; at: ISO }
  | { type: "SHADOW_EXTRACTED"; stat: StatId; name: string; at: ISO }
  | { type: "TITLE_EQUIPPED"; titleId: string }
  | { type: "SKILL_USED"; skillId: string; at: ISO }
  | { type: "DUNGEON_CLEARED"; rank: Rank; minutes: number; bossName: string; at: ISO }
  | { type: "GATE_RESULT"; week: string; cleared: boolean }
  | { type: "CONFIG_CHANGED"; patch: Partial<Config> };

function reduce(state: State, ev: Event): { state: State; effects: Effect[] }
// Effect = { kind: "popup", spec: SystemWindowSpec } | { kind: "notify", ... } | { kind: "sound", ... }
```

Effects are the only way the engine talks to the outside world, which is what
lets a 2 a.m. penalty, a level-up and an Oracle-generated urgent quest all look
the same to the UI.

## 4. Config (the part the user will edit)

`src/engine/config.ts` exports `DEFAULT_CONFIG`; the Settings screen edits a
JSON patch stored in `tauri-plugin-store`. Everything the user said they want
to name/tune lives here, so their naming and goals drop in without code changes:

```ts
export const DEFAULT_CONFIG: Config = {
  player: { name: "PLAYER", dayEndsAt: "03:00" },      // "day" rolls over at 3 a.m., not midnight
  stats: [
    { id: "STR",   label: "STRENGTH",     short: "STR", color: "cyan",   locked: false },
    { id: "VIT",   label: "VITALITY",     short: "VIT", color: "cyan",   locked: false },
    { id: "AGI",   label: "AGILITY",      short: "AGI", color: "cyan",   locked: true  },
    { id: "INT",   label: "INTELLIGENCE", short: "INT", color: "cyan",   locked: false },
    { id: "SENSE", label: "SENSE",        short: "SEN", color: "cyan",   locked: false },
  ],
  habits: [   // the Daily Quest goals; one or more per stat
    { id: "gym",   stat: "STR",   label: "Workout",            kind: "count",    target: 1,  unit: "session", restDays: ["Sun"] },
    { id: "study", stat: "INT",   label: "Study for career",   kind: "minutes",  target: 60, unit: "min" },
    { id: "sleep", stat: "SENSE", label: "Sleep",              kind: "hours",    target: 7,  unit: "h", logPrevNight: true },
    { id: "eat",   stat: "VIT",   label: "Clean meals",        kind: "count",    target: 3,  unit: "meals" },
    { id: "water", stat: "HYD",   label: "Drink water",        kind: "count",    target: 5,  unit: "check-ins",
      checkIn: { everyMinutes: 90, from: "09:00", to: "21:00" } },   // yes/no pop-up every 90 min until met
  ],
  curves: { xpPerGoal: 30, fullClearBonus: 120, levelExponent: 1.45, levelBase: 80, pointsPerLevel: 1, statPointsPerGoal: 1, statBonusEvery: 7 },
  economy: { goldPerGoal: 10, goldFullClear: 50, goldGate: 300, monthlyBudgetUsd: 150, usdToGold: 20 },
  penalty: { surviveHours: 4, hpLoss: 20, lockShop: true, resetStreakOf: "missedStatsOnly" },
  oracle: { enabled: false, model: "claude-opus-5-5", flavorModel: "claude-haiku-5-5", dailyBudgetUsd: 0.25 },
};
```

Habit `kind`s: `count`, `minutes`, `hours`, `check` (binary). Scaling: when the
Player levels up, `target` for numeric habits can grow by the habit's
`scalePerLevel` (default 0, so nothing changes until the user opts in).

## 5. Numbers

- **Player XP to reach level L+1:** `round(levelBase · L^levelExponent)` → 80, 219, 393, 597, 825, … At a full clear every day (~270 XP) the Player is Lv 2 after day 1, ~Lv 10 after a month, ~Lv 15 after 3 months and mid-20s after a year.
- **Ability points:** `pointsPerLevel` (1) per level-up only; a full clear no longer grants one.
- **XP sources:** each goal `xpPerGoal × difficulty` (difficulty 1.0 for a base target, scales with how far above base the target is); full clear `fullClearBonus`; Instant Dungeon `rank × 40`; Gate `400`.
- **Stat value:** `10 + floor(statXp / 100) + allocatedPoints`. Each completed goal credits its stat `statPointsPerGoal` (1) point (100 stat XP) the moment it is logged, +1 more when that day is a multiple of `statBonusEvery` (7) in the stat's streak; rest days pay half. One habit done daily takes its stat from 10 to 100 in about 11 weeks. Stats: STR, VIT, AGI, INT, SENSE and HYD (HYDRATION, fed by the water check-ins). Saves made before HYD existed are upgraded by `engine/migrate.ts`.
- **HP (0–100):** starts 100; `+10` per VIT/SENSE/HYD goal (cap 100); `−20` for a penalty; `−5` per missed VIT/SENSE/HYD goal at day close. Below 30 the status window shows it red and the Oracle gets "low HP" context.
- **MP (0–100):** `+15` per SENSE goal, `+10` per INT goal; spent by active skills.
- **Fatigue (0–100):** `+25` per STR goal on consecutive days, `−40` on a rest day; at ≥75 the daily quest marks the gym goal "Rest recommended" and completing a rest day counts as the STR goal.
- **Gold:** `goldPerGoal` per goal, `goldFullClear` on a full clear, shadows yield `rank × 2` per day, Gate `goldGate`. Gold is never purchasable.
- **Real-world reward price in gold:** `ceil(usd × usdToGold × scarcity)` where `scarcity = 1 + max(0, (spentThisMonthUsd + usd − monthlyBudgetUsd) / monthlyBudgetUsd)`; a purchase is disabled (not just expensive) when the monthly budget is exceeded.
- **Ranks:** E 1–9 · D 10–19 · C 20–34 · B 35–49 · A 50–69 · S 70–99 · National Level 100+.
- **Streak milestones → Shadow extraction:** 7 (Normal Soldier), 30 (Elite Knight), 100 (Knight → Commander), 365 (Marshal). Breaking a streak demotes the shadow one rank; it never disappears.
- **Random Box drop table:** 60 % consumable (Potion of Recovery = +20 HP, Mana Potion = +30 MP), 25 % Streak Shield (one missed day forgiven, max 2 held), 10 % Dungeon Key (rank by level), 4 % XP Boost (+50 % XP tomorrow), 1 % "Elixir of Life" (clears Penalty Mode instantly and restores HP — legendary).

## 6. The Oracle (generative UI)

The experiment: instead of hard‑coding every pop-up, let Claude *be* the
System. The constraint that makes it safe and testable is that Claude never
emits HTML or React — it emits a **`SystemWindowSpec`**, validated with Zod,
rendered by a fixed registry of blocks.

```ts
const SystemWindowSpec = z.object({
  variant: z.enum(["info","quest","warning","reward","levelup","penalty","status","shop","shadow","gate"]),
  title: z.string().max(80),                         // rendered in [BRACKETS], uppercase
  glyph: z.enum(["alert","diamond","skull","crown","box"]).optional(),
  blocks: z.array(Block).max(12),
  actions: z.array(z.object({ label: z.string().max(24), action: Action })).max(3),
  sound: z.enum(["ding","levelup","arise","alarm","none"]).default("ding"),
  timeoutMs: z.number().int().min(0).max(600_000).optional(),
});
const Block = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string().max(400), tone: z.enum(["normal","dim","warn","gold"]).optional() }),
  z.object({ type: z.literal("goalRow"), goalId: z.string(), label: z.string(), current: z.number(), target: z.number(), unit: z.string() }),
  z.object({ type: z.literal("statRow"), stat: z.string(), value: z.number(), delta: z.number().optional() }),
  z.object({ type: z.literal("bar"), label: z.string(), value: z.number(), max: z.number(), tone: z.enum(["cyan","red","gold","purple"]).optional() }),
  z.object({ type: z.literal("kv"), rows: z.array(z.tuple([z.string(), z.string()])).max(12) }),
  z.object({ type: z.literal("timer"), endsAt: z.string(), label: z.string().optional() }),
  z.object({ type: z.literal("list"), items: z.array(z.string().max(120)).max(10) }),
  z.object({ type: z.literal("divider") }),
  z.object({ type: z.literal("itemCard"), name: z.string(), rarity: z.enum(["common","rare","epic","legendary"]), description: z.string().max(200) }),
  z.object({ type: z.literal("shadow"), name: z.string(), rank: z.string() }),
]);
// Action is a closed set: the model can only trigger things the engine already allows.
const Action = z.enum(["dismiss","accept","open:status","open:quest","open:shop","open:shadows","complete:goal","start:dungeon","allocate:points"]);
```

**What the Oracle generates, and when**

| Trigger | Model | Output | Cached |
|---|---|---|---|
| Day start (once/day) | `claude-opus-5-5` | The day's Daily Quest window: canon wording, but flavor lines reacting to yesterday (streaks, fatigue, low HP), plus an optional *urgent quest* suggestion | yes, per date |
| Quest complete / level up / title | `claude-haiku-5-5` | One-line System commentary (deadpan) inside the template window | no (cheap) |
| Weekly Gate (Mondays) | `claude-opus-5-5` | A Gate window: a themed weekly challenge within the rules, with a boss name | yes, per ISO week |
| Shadow extraction | `claude-haiku-5-5` | Shadow name + one-line epithet in the Igris/Beru register | no |
| "Ask the System" (user types) | `claude-opus-5-5` | Free-form window: e.g. "plan my week", "why is my VIT lagging" — answers rendered as kv/list blocks | no |

Rules the Oracle runs under (enforced in code, not just prompt):
1. Output is **structured** (`output_config.format` with the JSON schema of `SystemWindowSpec`), parsed with `client.messages.parse()`, then re-validated with Zod. Invalid → fall back to the template window; log it.
2. The model gets a compact **state digest** (level, stats, streaks, HP/MP/fatigue, yesterday's result, today's habits, equipped title, time of day), never raw history.
3. It can **propose** numbers (an urgent quest's reward) but the engine clamps them to configured caps. It cannot create penalties; penalties are rule-driven only.
4. **Offline / no key / over budget** → template windows (the same specs the engine already produces). The app is fully functional without an API key.
5. Spend guard: count tokens from `usage`, stop calling when `dailyBudgetUsd` is hit.
6. Prompt caching: a stable system prompt (voice guide + schema explanation + the canon window examples) with `cache_control`, state digest after it.
7. Streaming is unnecessary (windows are small); adaptive thinking on; `fallbacks: "default"` on for refusals.

Where it lives: `src/oracle/{client.ts, prompts.ts, schema.ts, digest.ts, cache.ts, index.ts}`. The API key is entered in Settings and stored via `tauri-plugin-store` for v0 (move to the OS keychain via `tauri-plugin-stronghold`/keyring in V1). The SDK runs in the webview with `dangerouslyAllowBrowser: true`; acceptable for a single-user local app, and swappable for a Rust-side command later.

## 7. Scheduling

| When | What |
|---|---|
| App launch / tray "Show Daily Quest" | If today's `DAY_STARTED` is missing → close previous day, start today, show the Daily Quest pop-up. |
| Every 60 s tick | Check day boundary (using `dayEndsAt`), warning thresholds (default 3 h and 1 h before the boundary), penalty timer, Oracle refresh. |
| `dayEndsAt` | `DAY_CLOSED`: full clear → rewards pop-up queued for next open; otherwise → Penalty Mode (`PENALTY_STARTED` effect). |
| Monday first open | Gate window. |
| Streak milestone | Arise prompt. |
| Level/rank/title | Ceremony pop-ups (queued, shown one at a time, 1.5 s apart). |

Pop-ups never steal keyboard focus; they appear top-right, auto-dismiss per
their `timeoutMs`, and queue if another is open. Quiet hours and the Stealth
skill suppress everything except the penalty alarm.

## 8. Data

SQLite tables: `events(id, at, type, payload JSON)`, `snapshots(date, state JSON)`
(nightly materialisation so startup does not replay years of events),
`oracle_cache(key, spec JSON, model, cost_usd, created_at)`, `rewards(id, name,
usd, url, stat, gold_price, created_at, purchased_at)`. Export = the events
table as JSON; import = replay.

## 9. Testing strategy

- Engine: property-style tests on the reducer (replaying any event log is
  deterministic; XP never negative; rank monotonic with level), golden tests
  for the XP curve and penalty transitions, a "simulate 400 days" test.
- Oracle: schema tests, a prompt snapshot test, and a mocked-client test that
  feeds an invalid spec and asserts fallback.
- UI: Playwright screenshot smoke of each pop-up variant in the browser build.
