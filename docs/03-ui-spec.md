# 03 · UI Spec

Visual and interaction spec for **Levels**. Feature behaviour lives in `02-features.md`; the `SystemWindowSpec` schema in `04-architecture.md`. Every window, in the main app and as a pop-up, is rendered from a `SystemWindowSpec` by the same component registry.

---

## 1. Design tokens

### 1.1 Colour

| Token | Value | Use |
|---|---|---|
| `--bg` | `#050a14` | App/desktop-behind background |
| `--panel` | `rgba(8,20,40,.82)` | Window fill |
| `--panel-solid` | `#081428` | Fallback when transparency is unavailable |
| `--cyan` | `#3fd8ff` | Primary, borders, headers, normal System message |
| `--cyan-dim` | `#1b8fc2` | Secondary text, inactive borders, bar tracks |
| `--red` | `#ff3b5c` | Warning, penalty, urgent, failed |
| `--gold` | `#ffcc4d` | Rewards, gold, completed goals |
| `--purple` | `#9b5cff` | Shadows, Monarch, Arise |
| `--text` | `#dff6ff` | Body text |
| `--text-dim` | `#7fb4c9` | Captions, disabled |
| `--ok` | `#4dffb0` | Used sparingly: HP full, "CLEAR" ticks |

Variant accent mapping: `system` = cyan, `warning`/`penalty`/`urgent` = red, `reward` = gold, `shadow` = purple. Each variant sets `--accent` and `--accent-glow` on the window root; all borders/glows/headers read from those.

### 1.2 Typography

| Role | Font | Style |
|---|---|---|
| Headers / titles | **Orbitron** 700 | uppercase, letter-spacing .12em |
| Body | **Rajdhani** 500/600 | uppercase, letter-spacing .06em |
| Numbers, timers, counters | **Share Tech Mono** | tabular, no transform |

Bundle fonts locally (no CDN: offline-first). Scale (px, at 100%): title 18, section header 13, body 15, caption 12, big number 32, timer 40. Line-height 1.35.

### 1.3 Spacing and shape

Base unit 4 px. Scale: 4, 8, 12, 16, 24, 32. Window padding 20 (16 compact). Block gap 12. Corner radius **0-2 px** (sharp, canon). Border 1 px; header rule 1 px. Pop-up widths: compact 320, standard 400, wide 520, full 640. Main window: min 1000 x 680.

### 1.4 Border and glow recipe

```css
.sys-window {
  --accent: var(--cyan);
  --accent-glow: rgba(63, 216, 255, .55);
  position: relative;
  background: var(--panel);
  border: 1px solid var(--accent);
  border-radius: 1px;
  color: var(--text);
  box-shadow:
    0 0 0 1px rgba(63, 216, 255, .08) inset,
    0 0 12px var(--accent-glow),
    0 0 36px rgba(63, 216, 255, .18);
  backdrop-filter: blur(6px) saturate(120%);
}
/* corner ticks */
.sys-window::before, .sys-window::after {
  content: ""; position: absolute; width: 10px; height: 10px;
  border: 2px solid var(--accent); pointer-events: none;
}
.sys-window::before { top: -3px; left: -3px; border-right: 0; border-bottom: 0; }
.sys-window::after  { bottom: -3px; right: -3px; border-left: 0; border-top: 0; }
/* scanlines (intensity-configurable) */
.sys-window .scan {
  position: absolute; inset: 0; pointer-events: none; opacity: var(--scan, .06);
  background: repeating-linear-gradient(0deg, transparent 0 2px, rgba(63,216,255,.5) 2px 3px);
}
.sys-window.variant-penalty { --accent: var(--red); --accent-glow: rgba(255, 59, 92, .6); }
.sys-window.variant-reward  { --accent: var(--gold); --accent-glow: rgba(255, 204, 77, .55); }
.sys-window.variant-shadow  { --accent: var(--purple); --accent-glow: rgba(155, 92, 255, .6); }
```

### 1.5 Motion

| Motion | Spec |
|---|---|
| Open | scale .94 -> 1, opacity 0 -> 1, 180 ms `cubic-bezier(.2,.9,.2,1)`, then 3-step flicker (opacity 1 / .55 / 1 / .8 / 1) over 140 ms |
| Close | opacity 1 -> 0, 140 ms ease-in (no scale) |
| Bar fill | width transition 600 ms ease-out; number counts up over the same duration |
| Goal tick | row flashes accent for 250 ms; checkbox glyph draws in 120 ms |
| Level up | glow pulses 3 times (400 ms each) + particles burst [V1] |
| Penalty | red vignette fade-in 400 ms; timer digits tick with a 1 s subtle jitter |
| Arise | purple fog rises 600 ms; silhouette fades in with eyes glowing last (200 ms) |
| Hover (buttons) | background fills accent at 18% in 100 ms |

`prefers-reduced-motion`: all of the above become 80 ms opacity fades, no flicker, no jitter, no particles.

### 1.6 Sound

| Event | Sound | Notes |
|---|---|---|
| Every window open | `ding.ogg` ~300 ms chime | default volume 40% |
| Level up | `levelup.ogg` ~2 s stinger | replaces ding |
| Rank up | `levelup.ogg` + low swell | |
| Arise | `arise.ogg` ~2.5 s low choir/whoosh | replaces ding |
| Penalty | `alarm.ogg` loop 3 pulses | respects quiet hours; one play only |
| Goal tick | soft `tick.ogg` ~80 ms | optional (off by default) |
| Urgent | ding + short double-beep | |

Sounds are CC0 / self-generated, bundled as .ogg; mutable per category; no sound when Stealth is on.

---

## 2. Window anatomy

```
 +-- corner tick                                                        corner tick --+
 |  [!]  [ DAILY QUEST: PREPARATION TO BECOME POWERFUL ]              (x)  <- glyph, bracketed title, close
 |  --------------------------------------------------------------------------------  <- header rule (accent)
 |
 |  GOAL                                                                    <- body blocks
 |    [ ] STRENGTH      Lift                        0 / 45 MIN   [+15]
 |    [x] SENSE         Sleep >= 7 H                      CLEAR
 |    [ ] INTELLIGENCE  Study                       12 / 30 MIN   [+15]
 |    [ ] VITALITY      Healthy meals                    1 / 3   [+1]
 |
 |  REWARD   +160 XP   +90 GOLD   RANDOM BOX x1                           <- kv / list blocks
 |
 |  ----------------------------------------------------------------------
 |  [ ACCEPT ]   [ LATER ]                                                 <- action row (right-aligned)
 |
 |  ! WARNING: FAILURE TO COMPLETE THE DAILY QUEST WILL RESULT IN A PENALTY.   <- footer warning (red)
 +-- corner tick                                                        corner tick --+
```

Zones:

| Zone | Rules |
|---|---|
| Glyph | 20 px diamond `[ ]` outlined in accent; `!` for warning/penalty/urgent; filled diamond for reward; crown for shadow. Pulses once on open. |
| Title | Always rendered as `[ TITLE TEXT ]` with square brackets (added by the renderer, not the spec). Orbitron 18. Max 48 chars; truncates with ellipsis. |
| Close | Only shown on dismissible variants; absent on penalty/rank ceremony. Esc closes dismissible windows. |
| Body | Stack of blocks, 12 px gap, scroll if taller than 70% of screen height (thin accent scrollbar). |
| Action row | Right-aligned buttons, primary is filled accent at 18% with solid border; secondary is outline only; destructive uses red. Max 3 actions. |
| Footer warning | Optional `text` block with `tone: "warn"`, red, 12 px caps, with a leading `!`. |
| Auto-dismiss | Thin 2 px progress line along the bottom edge counting down; hover pauses. |

---

## 3. Screen inventory (main app window)

Shell: left nav rail (icons + labels, 72 px collapsed / 200 px expanded), top bar with player name, `LV 12`, rank chip `E`, gold counter, HP bar thin, MP bar thin, and the Penalty banner slot. Content area scrolls. Same System chrome (panels with corner ticks) on all screens. Hotkeys: `1-7` jump to screens.

Global state patterns: **Loading** = skeleton rows with a slow diagonal scan; text `[LOADING DATA...]`. **Error** = red panel `[SYSTEM ERROR: <code>]` with Retry. **Empty** = dim panel with a one-line System instruction and a primary action.

### 3.1 Status
- **Layout:** two columns. Left (40%): identity panel (name, LV, rank chip, job, title dropdown) + HP/MP/Fatigue bars. Right (60%): five stat rows with `[+]` buttons when points exist, 30-day sparklines, ability points badge; below: active buffs row, equipped title passives, streak summary.
- **Key components:** `PlayerCard`, `BarStat` (HP/MP/Fatigue), `StatRow`, `AllocateDock` (Apply/Reset), `BuffChip`, `StreakSummary`.
- **States:** empty (new player, all 10s, `[Complete your first Daily Quest.]`); loading skeleton; error (DB unreadable: offer export-and-reset). AGILITY row greyed "LOCKED" with `[Unlock in Settings]`.

### 3.2 Daily Quest
- **Layout:** header with countdown to the day boundary; four large goal cards in a 2x2 grid; right rail with "Reward preview", rest-day / sick-travel toggles, urgent quest slot, the weekly Gate strip below.
- **Key components:** `GoalCard` (stat glyph, label, progress bar, quick-log buttons, edit), `RewardPreview`, `GatePanel`, `UrgentSlot`, `ModeToggle` (Rest/Sick/Travel), `EditYesterday` link (while open).
- **States:** empty (quest not yet issued: `[Quest issues at 07:00.]` + `Issue now`); cleared (cards gold, `Random Box` ready button); penalty (red tint, Survive timer replaces the header, makeup task cards highlighted); loading; error.

### 3.3 Shop
- **Layout:** tabs `SYSTEM` | `REAL-WORLD`. System tab: card grid of items with price, effect, stock tier lock. Real-world tab: left is the Reward Shelf (cards sorted by gold price), right is the Treasury panel (month budget bar, gold-per-dollar rate, purchase log button) and `[+ ADD REWARD]`.
- **Key components:** `ItemCard` (name, effect, price, affordability), `RewardCard` (name, stat chip, USD price, gold price, progress to afford, `[BUY]`/`[RESERVE]`/`[I BOUGHT IT]`), `AddRewardForm` (name, USD, link, stat, category, notes), `TreasuryPanel`, `PurchaseLog` table.
- **States:** empty shelf (`[No rewards listed. Name what you want to earn.]`, Add button); locked (penalty: whole shop overlay `[SHOP LOCKED: PENALTY ACTIVE]`); over-budget cards with `[SCHEDULE]`; unaffordable cards show a gold progress bar `820 / 1350`; loading; error.

### 3.4 Inventory
- **Layout:** 6-column grid of slots; side detail panel for the selected item (description, quantity, `[USE]`, `[SELL]`). Box row at top: `Random Boxes: 2 [OPEN]`.
- **Key components:** `InventorySlot`, `ItemDetail`, `BoxOpener` (opens a reward window with a roll animation, 1.2 s).
- **States:** empty (`[Inventory empty. Clear a Daily Quest.]`); item in cooldown shows timer overlay; sell confirm modal; error.

### 3.5 Shadow Army
- **Layout:** header with army count, total passive gold/day; grid of shadow cards (silhouette on purple glow, glowing eyes, name, rank chip, source stat, daily gold, streak days); detail pane with lore text; "Claimable milestones" strip with `[ARISE]` buttons.
- **Key components:** `ShadowCard` (uses `shadowSilhouette` block art), `MilestoneStrip`, `ShadowDetail`, `RenameDialog`.
- **States:** empty (`[No shadows extracted. Hold a streak to 7 days.]` with progress of the closest streak); broken streak card dims, shows `RANK DOWN` badge; loading; error.

### 3.6 Titles & Skills
- **Layout:** two tabs. Titles: list with locked/unlocked state, equipped badge, condition and passive text, progress bar for conditions that have counts. Skills: list with MP cost, cooldown ring, unlock requirement, `[USE]`; top shows MP bar.
- **Key components:** `TitleRow`, `SkillRow` (cooldown ring SVG), `EquipButton`.
- **States:** locked rows are dimmed with `???` for secret titles; cooldown rows disable Use and show remaining time; insufficient MP shows red shortfall; empty (`[No titles earned.]`); error.

### 3.7 Settings / Oracle
- **Layout:** left sub-nav: `GENERAL`, `GOALS`, `NOTIFICATIONS`, `ORACLE`, `REWARDS BUDGET`, `DATA`, `ABOUT`. Content: form panels.
  - General: day boundary, AGILITY toggle, auto-start, theme intensity, sound volume.
  - Goals: edit templates (label, unit, target, type, scaling), training plan.
  - Notifications: wake time, quiet hours, max per day, per-category toggles, Stealth defaults, position per window type.
  - **Oracle:** API key field (masked, `Test`), enable toggle per feature (flavor, urgent, names, layout, reports), cost meter (today requests/tokens, month $ vs cap), preview a generated window with its raw JSON viewer, `Clear cache`.
  - Rewards budget: monthly USD, carry-over.
  - Data: Export JSON, Import (Merge/Replace), reset progress, DB location.
- **Key components:** `FormRow`, `Toggle` (System style), `KeyField`, `UsageMeter`, `SpecInspector` (JSON viewer of last generated spec with validation result).
- **States:** Oracle disabled (no key): `[THE ORACLE IS SILENT. Add an API key to enable generation.]`; key invalid: red; offline: `[ORACLE OFFLINE: using templates.]`; cap reached: gold warning.

---

## 4. Pop-up window catalogue

Common rules: frameless, transparent, always-on-top, `focus: false`, drop-shadow-free (glow is CSS). All use the anatomy in section 2. Default positions are relative to the work area of the active monitor; users can drag and the app remembers per window type. Auto-dismiss 0 = never. Copy is the *template fallback*; the Oracle may rewrite strings but not structure.

| Window | Variant | Sound | Position | Auto-dismiss | Actions |
|---|---|---|---|---|---|
| Acceptance | system | ding | center (modal) | never | `YES` (primary), `NO` |
| Daily Quest | system | ding | top-right | 0 (stays; collapses to tray after 60 s) | `ACCEPT`, `LATER` |
| Warning | warning | ding | center-right | 30 s | `LOG NOW`, `DISMISS` |
| Quest Complete | reward | ding | center | 20 s | `OPEN BOX`, `CLOSE` |
| Level Up | reward | levelup | center | 12 s | `ALLOCATE`, `CLOSE` |
| Title | reward | ding | top-center | 15 s | `EQUIP`, `CLOSE` |
| Skill | system | ding | top-center | 15 s | `VIEW`, `CLOSE` |
| Rank Re-evaluation | system | levelup | center (modal) | never | `ACCEPT RANK` |
| Penalty | penalty | alarm | center, wide | never | `BEGIN`, `USE POTION` |
| Urgent Quest | urgent | ding+beep | top-right | timer end | `ACCEPT`, `IGNORE` |
| Arise | shadow | arise | center | never | `ARISE`, `LATER` |
| Gate | system | ding | top-right | 0 | `ENTER`, `LATER` |

### 4.1 Acceptance (system, wide)
```
[ NOTIFICATION ]
You have qualified to become a Player.
Will you accept?
                          [ YES ]   [ NO ]
```
On NO: title becomes `[ REFUSAL ]`, text `Refusal is not an option. Your heart will stop in 0.02 seconds.`, only `[ YES ]` remains highlighted (NO becomes `[ RECONSIDER ]`).
On YES: `[ PLAYER REGISTERED ]  Welcome, {name}. Your Daily Quest begins tomorrow.`

### 4.2 Daily Quest (system)
```
[ DAILY QUEST: PREPARATION TO BECOME POWERFUL ]
GOAL
  STRENGTH       Lift                0 / 45 MIN
  INTELLIGENCE   Study               0 / 30 MIN
  SENSE          Sleep >= 7 H        CLEAR
  VITALITY       Healthy meals       0 / 3
REWARD   XP +160   GOLD +90   RANDOM BOX x1
! WARNING: FAILURE TO COMPLETE THE DAILY QUEST WILL RESULT IN A PENALTY.
[ ACCEPT ] [ LATER ]
```
Rest-day variant swaps STRENGTH to `Active recovery (optional)`. Tutorial Week replaces the warning with `Penalties are disabled during your first 7 days.`

### 4.3 Warning (warning)
```
[ WARNING ]
3 hours remain. 2 goals are incomplete.
STRENGTH   0 / 45 MIN
VITALITY   1 / 3
! Incomplete quests trigger a penalty at 03:00.
[ LOG NOW ] [ DISMISS ]
```
Sent once at (day boundary - 3 h) and only if goals are open and the penalty rule would fire (0/4 cleared or the 2nd missed day). Otherwise not shown.

### 4.4 Quest Complete + Random Box (reward)
```
[ DAILY QUEST COMPLETE ]
All objectives cleared.
REWARD   XP +160   GOLD +90   STR +1
         RANDOM BOX x1   [ BOX ICON ]
STREAK   Overall 12 days
[ OPEN BOX ] [ CLOSE ]
```
Box roll result is a second window: `[ RANDOM BOX ]  Obtained: XP BOOST (+25% / 24H).` with an `itemCard`. Partial-clear variant: `[ DAILY QUEST ENDED ]  3 / 4 objectives cleared. Streak: SENSE 12, STR broken.`

### 4.5 Level Up (reward)
```
[ LEVEL UP ]
You have leveled up.
LEVEL   11 -> 12
ABILITY POINTS   +3
HP/MP restored.
[ ALLOCATE ] [ CLOSE ]
```
Multi-level (e.g. +2) text: `LEVEL 11 -> 13`. Rank crossing chains to Rank Re-evaluation.

### 4.6 Title acquired (reward)
```
[ TITLE ACQUIRED ]
WOLF ASSASSIN
Condition: 30-day STRENGTH streak.
PASSIVE   STR XP +5%
[ EQUIP ] [ CLOSE ]
```

### 4.7 Skill acquired (system)
```
[ NEW SKILL ]
TENACITY   (PASSIVE)
One missed goal per week will not break its streak.
MP COST --   COOLDOWN 7 DAYS
[ VIEW ] [ CLOSE ]
```
Active skills show MP/cooldown numbers.

### 4.8 Rank Re-evaluation (system, wide, modal)
```
[ RANK RE-EVALUATION ]
Analysing Player data...
PREVIOUS RANK   E
CURRENT RANK    D
LEVEL 10   Hunter licence updated.
UNLOCKED   D-RANK GATE   SHOP TIER II
[ ACCEPT RANK ]
```
Sequence: the first line types in (40 ms/char), then the rank letters flip with a 600 ms glow. For National Level: `[ NATIONAL LEVEL ]  Your existence is now classified.`

### 4.9 Penalty (penalty, wide)
```
[ PENALTY QUEST: SURVIVE ]
You failed to clear the Daily Quest.
TIME REMAINING   04:00:00
EFFECTS   XP -10%   STREAKS RESET   SHOP LOCKED
MAKEUP   Clear one missed objective to end the penalty early.
  STRENGTH   Lift                     0 / 45 MIN
  VITALITY   Healthy meals            1 / 3
! The timer does not stop for excuses.
[ BEGIN ] [ USE POTION OF RECOVERY ]
```
Clearing: `[ PENALTY CLEARED ]  Survival confirmed. Shop restored.` (Overcame Adversity title popup chains if first time.) Two-day miss: `TIME REMAINING 05:00:00`, `! Consecutive failure detected.`

### 4.10 Urgent Quest (urgent)
```
[ URGENT QUEST: {NAME} ]
{Objective sentence, <= 120 chars.}
TIME LIMIT   00:30:00
REWARD   GOLD +60   BOX CHANCE
! This quest has no penalty. It has an expiry.
[ ACCEPT ] [ IGNORE ]
```
Example: `[ URGENT QUEST: STAND UP ]  Walk for 20 minutes outside before 18:00.` On expiry: `[ URGENT QUEST EXPIRED ]  Opportunity lost.`

### 4.11 Arise (shadow, wide)
```
[ SHADOW EXTRACTION ]
7-day SENSE streak confirmed.
A shadow awaits your command.
  (silhouette with glowing eyes)
NAME   [ ______ ]   [ AUTO-NAME ]
RANK   NORMAL SOLDIER   PASSIVE   +2 GOLD / DAY
[ ARISE ] [ LATER ]
```
After ARISE: silhouette fade-in + `[ ARISE ]` text slam, then `{NAME} has joined your army.`

### 4.12 Gate (system)
```
[ GATE DETECTED ]
C-RANK GATE   Expires Sunday 23:59
  Workouts            0 / 4
  Nights >= 7 h       0 / 5
  Clean-eating days   0 / 5
  Study blocks        0 / 3
REWARD   GOLD +600   RARE BOX
[ ENTER ] [ LATER ]
```
Clear: `[ GATE CLEARED ]  Rank C Gate eliminated. REWARD...` (reward variant). Red Gate swaps the header to `[ RED GATE ]` with red accents and the line `You cannot leave until the boss is dead.`

---

## 5. Block types (renderer contract)

The single source of truth is `src/system/spec.ts` (`SystemWindowSpec`, zod). Hand-written windows (engine effects) and Oracle-generated windows both produce it; `parseSpec()` validates every spec before rendering and rejects anything outside the closed sets below. The renderer is `src/components/system/SystemWindow.tsx`; one component per block in `src/components/system/blocks/`, mapped by the registry in `blocks/index.ts` (`type -> component`; an unknown type renders nothing).

**Window fields (`SystemWindowSpec`)**

| Field | Type | Notes |
|---|---|---|
| `id` | `string?` (max 64) | Stable id; echoed back in `SystemActionEvent.windowId`. Generated when absent. |
| `variant` | `info \| quest \| warning \| reward \| levelup \| penalty \| status \| shop \| shadow \| gate` | Accent: info/quest/status/shop = cyan; warning/penalty = red; reward/levelup = gold; shadow = purple; gate = cyan border + gold title/glyph. `penalty` is sticky (no close button, no Esc, no auto-dismiss). |
| `title` | `string` (1-80) | Rendered as `[ UPPERCASE ]` by the renderer (Orbitron). |
| `glyph` | `alert \| diamond \| skull \| crown \| box \| none` (optional) | Defaults by variant (alert for warning/penalty/quest/info, diamond for reward/levelup/gate, crown for shadow, none for status/shop). |
| `blocks` | `Block[]` (max 14) | See below. |
| `actions` | `Action[]` (max 3, default `[]`) | Buttons, centred under the body. |
| `footer` | `string?` (max 160) | Red warning line with a leading warning sign. |
| `sound` | `ding \| levelup \| arise \| alarm \| none` (default `ding`) | Synthesised with Web Audio (`sound.ts`, no files); respects the `muted` setting. |
| `timeoutMs` | `int 0..600000?` | Auto-dismiss with a 2 px countdown line; pauses on hover. Omitted/0 = stays. |
| `generated` | `boolean?` | True when Claude wrote it; the renderer shows a tiny `ORACLE` mark. |

Colours are tone names (`cyan | red | gold | purple | dim`), never raw CSS.

**Blocks (`type` discriminates)**

| Type | Props | Renders as |
|---|---|---|
| `text` | `text` (max 400), `tone?`, `align?: left \| center` (default center) | A paragraph. |
| `goalRow` | `goalId`, `label` (48), `current`, `target`, `unit` (12), `stat?` (8), `done?` | Goal card: label + `(STAT) target unit`, `[current/target]`, progress bar, quick-log buttons `+1`, `+N` (15 for minute goals, 5 for targets >= 8) and a tick. Click the number to type a value. Emits `progress:goal` (`arg = "goalId:delta"`) or `complete:goal` (`arg = goalId`). In-block actions do not close the window. |
| `statRow` | `stat` (16), `value`, `delta?`, `max?`, `locked?` | Stat name, bar, value, optional gold `+delta`; `locked` greys it out. |
| `bar` | `label` (24), `value`, `max`, `tone?` | Labelled animated bar with `value / max`. |
| `kv` | `rows: [key (32), value (64)][]` (max 12) | Key/value grid; values in Share Tech Mono. |
| `timer` | `endsAt` (ISO), `label?` (40), `tone?` | Big mono `HH:MM:SS` countdown, ticks every second. |
| `list` | `items: string[]` (max 10, 140 each), `tone?` | Diamond-bullet list. |
| `divider` | none | Accent rule. |
| `itemCard` | `name` (48), `rarity: common \| rare \| epic \| legendary`, `description` (200), `goldPrice?`, `usdPrice?`, `affordable?` | Rarity-bordered tile with prices; `affordable: false` dims and shows `INSUFFICIENT`. |
| `shadow` | `name` (32), `rank` (24), `epithet?` (80) | Purple silhouette with glowing eyes, name and rank. |
| `rankBadge` | `rank` (16), `previous?` (16) | Diamond rank badge; with `previous`, old (dim) arrow new (gold). |

**Actions.** `{ label (1-24), kind, arg? (max 64), primary? }`. `kind` is the closed set: `dismiss`, `accept`, `decline`, `open:status`, `open:quest`, `open:shop`, `open:shadows`, `open:inventory`, `complete:goal`, `progress:goal`, `allocate:points`, `start:dungeon`, `open:box`, `use:item`, `extract:shadow`. Pressing a button emits `SystemActionEvent = { windowId?, action }` and then closes the window (except `progress:goal` / `complete:goal`). Keyboard: Enter triggers the primary action (or the only action), Esc dismisses (not on `penalty`).

**Action routing (`src/store/actions.ts`).** `open:*` navigate the main window; `progress:goal` -> `GOAL_PROGRESS` (negative delta -> `GOAL_SET`); `complete:goal` -> `GOAL_PROGRESS` for the remainder; `allocate:points` (`arg` = stat id) -> `POINTS_ALLOCATED`; `open:box` -> `BOX_OPENED` (random seed); `use:item` (`arg` = item id) -> `ITEM_USED`; `extract:shadow` (`arg` = `STAT[:name]`) -> `SHADOW_EXTRACTED`; `start:dungeon` -> opens the Daily Quest screen; `dismiss | accept | decline` do nothing.

**Transport.** In Tauri the engine's `popup` effect calls the Rust command `show_system_window`, which emits `levels://system-window` to the transparent `system` window (`SystemPopup`). That window validates with `parseSpec`, queues specs and shows them one at a time, emits `levels://system-action` back to the main window, and calls `hide_system_window` when the queue empties. In a plain browser the main window renders the same specs itself in an overlay layer (`PopupLayer`, top-right).

## 6. Accessibility and platform notes

**Accessibility**
- **Reduced motion:** respect OS `prefers-reduced-motion` plus a Settings override; disable flicker, particles, scanlines animation and typing effects.
- **Flashing:** no element flashes more than 3 times per second (WCAG 2.3.1). The flicker is a single short sequence.
- **Font scaling:** all sizes in `rem`; Settings has 90%-150% UI scale; pop-up windows resize to content (up to 70% of screen height, then scroll).
- **Contrast:** body text `#dff6ff` on panel is above 12:1; `--cyan-dim` is only for non-essential text; red on dark meets 4.5:1 at body sizes (verify the `#ff3b5c` caption at 12 px).
- **Colour is never the only signal:** variants also differ by glyph and title text; goal state uses `[x]` and the word CLEAR.
- **Keyboard:** every action reachable by Tab; Enter triggers the primary, Esc dismisses dismissible windows; pop-ups can be summoned and cycled via hotkey `Alt+Space` (focus is only taken on user request).
- **Screen readers:** windows use `role="dialog"` (modal) or `role="status"` (non-modal, `aria-live="polite"`; penalty uses `assertive` once). Timer values are announced at coarse intervals, not each second.
- **Sound:** every sound has a visual equivalent; global mute and per-category volume.

**Platform**
- **Do not steal focus:** create pop-ups with `focus: false`, `skipTaskbar: true`, `alwaysOnTop: true`, `decorations: false`, `transparent: true`, `shadow: false`; show with `show()` not `setFocus()`. On Windows use `WS_EX_NOACTIVATE` (via a small Rust helper) so clicking a button does not pull focus from a game or editor. Fullscreen apps: on macOS use `setVisibleOnAllWorkspaces` + `NSWindowCollectionBehaviorFullScreenAuxiliary`; pop-ups queue instead of appearing above exclusive-fullscreen games on Windows.
- **macOS transparent windows** require `"macOSPrivateApi": true` in `tauri.conf.json` (`app` section) and the Cargo feature `macos-private-api`; this affects App Store eligibility (acceptable: direct-download distribution). Test on Sonoma+ for rounded-corner and shadow artifacts.
- **Windows transparency:** works with WebView2 when the window is transparent and `decorations: false`; avoid `backdrop-filter` over a fully transparent webview on older Windows 10 builds (blur silently falls back to flat panel; keep `--panel` alpha high enough to read). Per-monitor DPI v2 must be respected for window positioning.
- **Linux (Wayland):** always-on-top and click-through are compositor-dependent; treat Linux as [LATER] and degrade to normal windows.
- **Click-through:** use `setIgnoreCursorEvents(true)` on the transparent margin region, and only the panel is interactive (hit-test region sent from the webview).
- **Multi-monitor and DPI:** place by `monitor.workArea`; clamp inside bounds; remember offset per window type.
- **Tray:** the app lives in the tray/menu bar (hide-on-close); tray menu: Open Status, Today's Quest, Log (submenu: STR, INT, SENSE, VIT), Stealth (1/2/4/8 h), Settings, Quit.
- **Performance:** pop-up windows are created on demand and destroyed on close (target < 80 MB overall idle, < 150 ms from event to first paint); sprite/particle effects use CSS/canvas only; no continuous animation when the window is not visible.
- **Fonts:** bundle woff2 subsets (Latin) for Orbitron, Rajdhani, Share Tech Mono; no network at runtime.
