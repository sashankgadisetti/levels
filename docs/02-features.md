# 02 · Features

Prioritised feature catalog for **Levels**. Canon references point to `01-research.md`.
Window schema (`SystemWindowSpec`) and level curve live in `04-architecture.md`; UI details in `03-ui-spec.md`.

Priority tags: **[MVP]** = first playable build, **[V1]** = first public release, **[LATER]** = post-release.

---

## 1. Product principles

1. **The System has one voice.** Clipped, bracketed, second person, deadpan. It never apologises, never emoji, never says "great job". Praise is a number going up.
2. **Never nag more than it rewards.** Each pop-up must either grant something or demand something specific. Max 6 unsolicited pop-ups/day by default; reminders collapse into one window.
3. **Penalties are recoverable.** Missing a day costs time, streak and a little XP. It never deletes levels, gold already banked, or shadows (they rank down, never die).
4. **Local-first.** All data lives in a local SQLite file. The app works fully offline. The network is used only by The Oracle (optional) and by "Buy" links opened in the user's browser.
5. **Real money only for things that make you better.** The app never takes payment. Gold can only be earned. The only dollars it tracks are the user's own reward budget.
6. **Trust the user, but make cheating boring.** Goals are self-reported. Anti-cheat is about the economy (no gold purchase, daily caps), not surveillance.
7. **Rest is part of the build.** Rest days, sick mode and travel mode are first-class. A system that punishes illness gets uninstalled.
8. **Generated is never unbounded.** The Oracle can change words and layout; it can never change rules, numbers of penalties, or rewards (see section 10).

---

## 2. Core loop

Every morning the System issues a Daily Quest with four goals, one per stat. The user logs progress through the day (quick-log from tray or pop-up). Completing goals pays XP, gold and stat growth; clearing all four pays a Random Box. XP raises level and rank, gold buys System items and **real-world rewards**, streaks extract Shadows that pay gold back. Failing the quest triggers Penalty Mode, which is escaped by a 4-hour Survive task.

```
 06:30 [DAILY QUEST] arrives
        |
        v
   log goals  --(STR/INT/SENSE/VIT)-->  XP + gold + stat points
        |                                   |
        | all 4 clear                       v
        v                             LEVEL UP / RANK UP --> ability points, titles, skills
   RANDOM BOX  --> items (shield, boost, key, potion, gold)
        |
        v
   GOLD --> Shop --+--> System items (shield, boost, key)
                   +--> REAL-WORLD REWARD unlocked --> "Buy" link --> purchase log
        |
   streak milestones (7/30/100/365) --> ARISE --> Shadows --> passive gold --+
        ^                                                                     |
        +---------------------------------------------------------------------+
   miss a day --> PENALTY MODE (Survive 4h, shop lock) --> recover --> loop
```

---

## 3. Feature catalog

### 3.1 Player & Status

#### Acceptance prompt (onboarding) [MVP]
- **Description:** First launch shows `[You have qualified to become a Player. Will you accept?]`. Accepting runs a 5-step setup: name, goals per stat, wake time/day boundary, quiet hours, optional API key.
- **Canon:** Player acceptance; "Yes/No".
- **Acceptance criteria:**
  - "No" re-shows the prompt with a harsher line (`[Refusal is not an option. Your heart will stop in 0.02 seconds.]`) and a visible Yes button; no real harm, it just loops with a wink after 3 tries and a hidden "Exit app" in the tray.
  - Setup writes a `player` row with 10 in every stat, Lv 1, E-rank, 0 gold.
  - Skippable steps (API key, goals) can be finished later in Settings.

#### Status window [MVP]
- **Description:** The canonical window: name, level, rank, job, equipped title, HP/MP/Fatigue, five stats, ability points, active buffs.
- **Canon:** Status Window (research section 2).
- **Acceptance criteria:**
  - Opens from tray, hotkey (default `Alt+S`) and main window; renders from the same `SystemWindowSpec` pipeline as pop-ups.
  - AGILITY row shows as `LOCKED` until enabled in Settings.
  - Shows stat values with `base (+bonus)` where titles/job add bonuses.

#### Derived bars: HP / MP / Fatigue [MVP]
- **HP** = health bar derived from VIT + SENSE habits. `HP max = 100 + 10*VIT_total + 5*SENSE_total`. Current HP = 100% at start of day, drains `-25%` of max for a missed meal goal and `-25%` for a sleep goal under target at day close; regenerates +10% per 24h of full compliance. At 0 HP: Penalty Mode risk flag ("Fragile" debuff, -20% XP) until restored by Potion or 2 clean days.
- **MP** = focus pool for skills. `MP max = 10 + 5*INT_total + 2*SENSE_total`. Refills fully at each day boundary (to 100% if sleep goal met, 60% if not).
- **Fatigue** = 0-100. +20 per gym session logged, +10 per 90-minute focus block, -25 per rest day, -15 per goal-cleared sleep. At 60+ the System suggests a rest day; at 80+ STR XP is reduced 25% (and the rest-day button turns gold).
- **Canon:** HP/MP/Fatigue rows.
- **Acceptance criteria:**
  - All three recompute deterministically from the event log (no hidden state), so export/import round-trips.
  - Each bar shows a tooltip with the formula inputs.
  - Fatigue never triggers a penalty by itself.

#### Ability points allocation [MVP]
- **Description:** 3 points per level (canon). Spend on any unlocked stat; +1 permanent point equals +1 to stat base.
- **Acceptance criteria:**
  - Allocation UI is `[+]` buttons with an Apply/Reset-before-apply pattern; applying is irreversible except via a rare "Stat Reset Scroll".
  - Daily Quest clears add a *habit stat gain* (+1 to the matching stat on the 7th clear of that goal in a rolling 7 days, max +1 per stat per week); this is separate from level points.
  - Points banked are shown in a red pulse badge on Status until spent.

#### Job change at Lv 40 [V1]
- **Description:** Reaching Lv 40 opens the Job Change Quest: 7 consecutive days with all four goals cleared (Tenacity grace allowed once). Passing assigns a Job from the dominant stat.
- **Canon:** Job Change Quest.
- **Jobs:** STR = Fighter (+10% STR XP), INT = Mage (+10% INT XP, +20 MP), SENSE = Assassin (+10% SENSE XP, Stealth cooldown -50%), VIT = Tank (+20 max HP, penalty timer -30 min), balanced (all within 10%) = Ranger (+3% all XP). AGI (if unlocked) = Healer-style slot is not used; AGI ties break to Ranger.
- **Acceptance criteria:**
  - Fail = retry next Monday, no penalty beyond normal rules.
  - Job shows in Status and cannot change without a "Job Reset Token" (rare).

#### Hunter rank + re-evaluation ceremony [MVP for rank, V1 for ceremony]
- **Description:** Rank is derived from level: E 1-9, D 10-19, C 20-34, B 35-49, A 50-69, S 70-99, National Level 100+. Crossing a boundary plays the re-evaluation ceremony window.
- **Acceptance criteria:**
  - Ceremony is a full-attention window (no auto-dismiss) with the old and new rank and the unlocks it brings (gate rank, shop stock tier).
  - Rank can never go down (even in penalty).
  - A hidden Shadow Monarch rank appears at Lv 150 + 365-day streak on any stat [LATER].

---

### 3.2 Quests

#### Daily Quest: four goals [MVP]
- **Description:** Daily at the user's wake time, a quest with one goal per stat:

| Stat | Default goal | Type | Default target |
|---|---|---|---|
| STR | Gym / workout | numeric (minutes lifted) or binary | 45 min |
| INT | Career learning | numeric (minutes) | 30 min |
| SENSE | Sleep | binary (hit bedtime/duration target last night) | >= 7 h |
| VIT | Eat healthy | numeric (healthy meals) | 3 of 3 meals |

- **Canon:** Preparation to Become Powerful.
- **Acceptance criteria:**
  - Goals defined by templates the user edits (label, unit, target, type).
  - Counter ticks live; quick-log buttons (+15 min, +1 meal, "Slept" check).
  - Quest closes at the day boundary (default 03:00, see 3.3 and 3.10).

#### Numeric vs binary goals [MVP]
- **Binary:** done / not done. **Numeric:** progress/target with partial credit: >= 50% of target gives half XP and counts as "half-clear" (streak survives only via Tenacity); >= 100% is full clear; over-target up to 150% gives a small XP bonus (anti-overtraining cap).
- **Acceptance criteria:** goal type is editable; changing it mid-day keeps already-logged progress.

#### Difficulty scaling [V1]
- **Description:** Targets rise gently: numeric targets scale `target = base * (1 + 0.02 * floor(level/5))` up to 2x, applied only to quests the user flagged "auto-scale". The user can freeze scaling per goal.
- **Acceptance criteria:** never scales sleep above 9 h or healthy meals above 4; scaling change shows up the day before as a pre-warning, never silently.

#### Rest days (STR) [MVP]
- **Description:** User sets a weekly training plan (e.g. Mon/Wed/Fri/Sat). Non-training days replace the STR goal with `Active recovery (optional)`: auto-cleared, gives reduced XP, +fatigue recovery.
- **Acceptance criteria:**
  - Max 3 declared rest days/week; the 4th consecutive rest day is flagged by the System ("[Rest is a decision. Four in a row is a drift.]").
  - A rest day never breaks the STR streak.
  - "Ad-hoc rest day" button is available once per week without a Tenacity charge when Fatigue >= 60.

#### Urgent Quests [V1]
- **Description:** Surprise same-day mini-quests (e.g. "Walk 20 minutes before 18:00", "Drink 500 ml of water now", "Read 10 pages"), 1-2 per week by default, opt-in, 30-180 min timers.
- **Canon:** Urgent Quest.
- **Acceptance criteria:**
  - Never spawned during quiet hours, Stealth, rest/sick/travel mode, or Penalty Mode.
  - Failure = no penalty; only the bonus (gold + box chance) is lost. Success pays 2x gold and a guaranteed Box tier+1 chance.
  - Content from the Oracle (section 3.8) or templates; always completable at a computer-adjacent distance.

#### Secret Quests [V1]
- **Description:** Hidden achievements that reveal after completion (e.g. "Complete all four goals before noon", "Log a 3 a.m. bedtime goal and recover next day").
- **Canon:** Secret Quest: Courage of the Weak.
- **Acceptance criteria:** at least 12 shipped; each fires once; reward = title or Box; a `[SECRET QUEST COMPLETE]` window reveals the condition.

#### Weekly Gate [V1]
- **Description:** Every Monday a Gate opens, ranked to the player's rank, across all stats, e.g. `C-RANK GATE: 4 workouts, 5 nights >= 7 h, 5 clean-eating days, 3 study blocks`. Ends Sunday night.
- **Canon:** Gates.
- **Acceptance criteria:** progress is derived from existing logs (no extra logging); clearing pays 300 gold x rank multiplier (E x1, D x1.5, C x2, B x3, A x4, S x6) + one Box (rare+); missing a Gate has no penalty. Gate clear count feeds the Demon Hunter title.

#### Red Gate [LATER]
- **Description:** Occasional (about monthly, never in a penalty week) surprise week: harder Gate (+30% targets) with a larger reward and a "locked in" rule: cannot swap goals until clear (Ruler's Authority can).
- **Acceptance criteria:** opt-in toggle; one visible warning day before; skip option with no penalty.

#### Instant Dungeon focus timer [V1]
- **Description:** A 25/50/90-minute focus session against a named "boss" (the task). Entered with an Instant Dungeon Key (starter: 3 free/week). Logs minutes to INT (or STR for gym, user choice).
- **Canon:** Instant Dungeon.
- **Acceptance criteria:**
  - Compact always-on-top timer window; pause allowed once; quitting early pays pro-rata only above 50% completion.
  - Dungeon rank E-S scales XP multiplier (x1.0 - x2.5) and key rarity.
  - Pairs with Bloodlust skill (optional site blocking is [LATER]).

#### Training Arc weekly quests [V1]
- **Description:** One weekly stat-specific quest chosen by the System based on the weakest stat (e.g. "Strength Training: 4 sessions this week").
- **Acceptance criteria:** pays a stat point on clear; difficulty adapts to last 4 weeks; user can reroll once per week for 50 gold.

---

### 3.3 Penalty system

Design goal: the penalty must sting enough to matter, take under ~4 hours of one afternoon's attention, and always be escapable the same day.

#### Triggers [MVP]
| Trigger | Result |
|---|---|
| Day boundary passes with **0 of 4** goals cleared | Full Penalty Mode |
| Day boundary passes with **1** goal cleared | Warning only: "Partial penalty" = -XP, streak of missed stat(s) freezes (not broken) |
| 2-3 goals cleared | No penalty; missed stats' streaks break (unless Tenacity) |
| Skipping 2 days in a row | Penalty Mode with +1h survive timer (5 h), shop lock extended to 24 h |
| Rest/sick/travel mode or Stealth active | Never triggers |

(Opinion: the original anime punishes *any* miss. We soften to "0 of 4 or 2 days in a row" because partial progress should be rewarded; a life-RPG that triggers every time you miss a gym day will be abandoned.)

#### Penalty Mode flow [MVP]
1. At the day boundary (default 03:00) the app computes the result. If triggered, the next time the app is open or at wake time, a red `[PENALTY QUEST: SURVIVE]` window opens with `04:00:00` countdown and alarm sound.
2. The 4-hour timer is a **wall-clock timer that must be physically survived**: the app asks for a makeup task (see below) and the timer shows how long the penalty lasts if ignored.
3. Entering the Survive state tints all windows red; the main window shows a `PENALTY ZONE` banner.

#### What decays [MVP]
- **XP:** -10% of the current level's XP progress (floored at 0; never de-levels).
- **Streak:** missed stats' streaks reset to 0 (shield/Tenacity respected).
- **Shadows:** each shadow whose stat's streak broke ranks down one step (Grand Marshal -> Marshal ...); Normal Soldier is the floor.
- **HP:** drops to 50%.
- **Gold:** never decays. (Principle 3.)

#### Shop lock [MVP]
All shop purchases (System and real-world "Buy" links unlock) are disabled until the Penalty is cleared. Existing inventory use is allowed except Streak Shield after the fact.

#### How to escape [MVP]
Complete **any one** makeup task within the Survive window:
- Do the missed goal of your choice to 100% (STR or INT or VIT-type tasks in person; SENSE counts as a 20-min nap or lights-out by 22:30 tonight).
- Or burn a **Potion of Recovery** (clears penalty, no XP loss) [item cost 400 gold, shop locked, so must be pre-owned].
- Or wait the timer out and accept the XP/streak loss only: the mode ends at 04:00:00 regardless. The point is ritual, not imprisonment.

Clearing a Daily Quest while in Penalty Mode grants the *The Player Who Has Overcome Adversity* title.

#### Grace rules [MVP]
- **Day boundary at 03:00** (user-configurable 00:00-06:00) so late-night logging counts for "yesterday".
- **Late log window:** you may back-log yesterday until 10:00 today by tapping `[Edit yesterday]`; after that locked.
- **Streak Shield** (item) absorbs one broken-streak event.
- **Tenacity** (skill): one weekly grace per week (see 3.4).
- First 7 days after onboarding are a **Tutorial Week**: no penalty mode, missed goals simply show as missed.

#### Travel / sick mode [MVP]
- Toggle with start/end dates (or open-ended). Quest is replaced with a 1-goal `Maintain` quest (SENSE or VIT, user's choice); no penalties; streaks frozen; XP/gold at 50%; Stealth is implicit.
- Sick mode limit 5 days before the System asks to confirm; travel mode 21 days.
- Cannot be activated retroactively past the late-log window.

---

### 3.4 Progression

#### XP & levels [MVP]
- **Description:** XP from goals, quests, dungeons, gates, boxes. Level curve defined in `04-architecture.md` section 5.
- **Base XP:** goal full clear 40, half 20, daily all-clear +60, Urgent 50, Dungeon 30/25 min x rank, Weekly Gate 400 x rank mult.
- **Acceptance criteria:** XP breakdown visible per event; multipliers (titles, boost, streak) stack additively then multiply once; a hard cap of 3x total multiplier.

#### Stat growth [MVP]
- Stats grow from level-up points and weekly habit gains (3.1). Stat milestones at 25/50/100 unlock skills (3.4 skills) and titles.
- **Acceptance criteria:** changes are logged in `stat_events`; Status shows a 30-day sparkline per stat.

#### Streaks [MVP]
- One streak per stat (each goal) plus an **overall streak** (all four cleared). Half-clears don't extend but don't break if Tenacity covers.
- Milestones: 3, 7, 14, 30, 60, 100, 200, 365.
- **Acceptance criteria:** streak calc is derived from daily results; rest days and sick/travel days are neutral (skip, do not break).

#### Titles (one equipped, passives) [MVP with 6, V1 with all]
| # | Title | Unlock condition | Passive effect |
|---|---|---|---|
| 1 | **Awakened** | Accept Player status | None (cosmetic) |
| 2 | **Wolf Assassin** | First 30-day STR streak | +5% STR XP |
| 3 | **Iron Body** | 100 gym sessions logged | +10% max HP |
| 4 | **Scholar** | 100 INT hours logged | +5% INT XP, +10 MP |
| 5 | **Early Riser** | 14 days of wake-before-07:00 SENSE goal | Daily Quest arrives 15 min early; +3% SENSE XP |
| 6 | **Night Watch** | 30-day SENSE streak | Fatigue recovery +5 per day |
| 7 | **Clean Slate** | 30-day VIT streak | +5% VIT XP; Potion of Recovery -10% price |
| 8 | **The Player Who Has Overcome Adversity** | Clear a Daily Quest during Penalty Mode | Survive timer -30 min |
| 9 | **Demon Hunter** | Clear 10 Gates | +10% Gate gold |
| 10 | **Gate Breaker** | Clear a Red Gate | +10% Box drop quality |
| 11 | **Dungeon Diver** | 50 Instant Dungeon sessions | Dungeon XP +10% |
| 12 | **Shadow Sovereign** | Hold 5 shadows at Knight+ | Shadow passive gold +20% |
| 13 | **Unbroken** | 100-day overall streak | +1 Tenacity grace per week |
| 14 | **Comeback Kid** | Recover to Lv N after a 7+ day gap | XP +10% for 7 days after returning |
| 15 | **Treasure Hunter** | Open 50 Random Boxes | +5% gold from all sources |
| 16 | **Frugal Hunter** | Finish a month under reward budget | Treasury shows +5% unspent carryover |
| 17 | **Well-Equipped** | Redeem 5 real-world rewards | +3% to the stat each reward helps |
| 18 | **National Level** | Reach rank National Level | All XP +5% |

- **Acceptance criteria:** equipping swaps instantly; passives are listed in the Status window; titles never stack (one equipped).

#### Skills [MVP with 3, V1 with all]
MP costs scale with level; cooldowns are real hours. Active skills are fired from the Skills screen or tray.

| # | Skill | Type | Unlock | MP | Cooldown | Effect |
|---|---|---|---|---|---|---|
| 1 | **Tenacity** | passive | Lv 5 | - | 7 days (grace recharges) | One missed goal per week doesn't break its streak |
| 2 | **Sprint** | active | Lv 10, STR >= 20 | 15 | 24 h | Double today's XP for one chosen stat |
| 3 | **Vital Strike** | passive | Lv 12 | - | daily | +25% XP on the first goal cleared each day if it is your hardest |
| 4 | **Stealth** | active | Lv 15, SENSE >= 25 | 10 | 12 h | Suppress all pop-ups for 1-8 h (no penalty trigger meanwhile) |
| 5 | **Bloodlust** | active | Lv 20, INT >= 30 | 20 | 6 h | Start Focus: auto-start Instant Dungeon, +15% INT XP for the session |
| 6 | **Ruler's Authority** | active | Lv 30 | 30 | 7 days | Re-schedule or swap one of today's goals without penalty |
| 7 | **Shadow Extraction** | active | Lv 25 + first milestone | 25 | per milestone | Perform an Arise at a streak milestone |
| 8 | **Shadow Exchange** | active | Lv 40 + 2 shadows | 50 | 30 days | A shadow covers one travel/sick day; it ranks down one step |
| 9 | **Domain Expansion** | active | Lv 60 | 60 | 14 days | All XP x1.5 for 24 h; bypasses the 3x cap by +0.5 |
| 10 | **Detection** | passive | SENSE >= 50 | - | - | Shows the next Urgent Quest 30 min ahead and a hint for one Secret Quest |

- **Acceptance criteria:** skill cooldown timers survive restart; insufficient MP shows exact shortfall; all effects are applied through the same multiplier pipeline.

---

### 3.5 Rewards economy

#### Gold sources [MVP]
| Source | Gold |
|---|---|
| Goal full clear | 20 |
| Goal half clear | 8 |
| All four cleared (daily) | +50 |
| Urgent Quest | 60 |
| Instant Dungeon (per session) | 20-80 by rank |
| Weekly Gate | 300 x rank mult |
| Streak milestone | 7: 100 / 30: 400 / 100: 1500 / 365: 6000 |
| Random Box | 0-250 (drop table) |
| Shadows (passive) | 2-30 each per day by rank |
| Selling items | 50% of shop price |

Expected income: ~130 gold/day clean, ~4,500/month with a small shadow army. Daily cap (anti-grind): 400 gold from non-Quest sources.

#### Gold sinks [MVP]
System Shop items (below), re-roll Training Arc (50), Stat Reset Scroll (1500), and real-world reward unlocks (price formula below).

#### Random Box drop table [MVP]
One Box per all-four clear; Weekly Gate and streak milestones drop rarer boxes. Box tier sets the table:

| Item | Normal | Rare | Epic |
|---|---|---|---|
| Gold (50-250 / 150-500 / 400-1000) | 45% | 35% | 25% |
| XP Boost (+25% 24 h) | 20% | 20% | 15% |
| Streak Shield | 12% | 15% | 15% |
| Instant Dungeon Key (E-C / D-B / B-A) | 12% | 15% | 20% |
| Potion of Recovery | 6% | 8% | 10% |
| Stat Point (+1 ability point) | 4% | 5% | 8% |
| Skill Scroll / Title Crate (cosmetic, rare+) | 1% | 2% | 7% |

Pity: after 14 boxes without a Streak Shield or Potion, the next one guarantees it.

#### Inventory [MVP]
- Grid of stackable items with quantity badges; Use / Sell actions; items tracked in `inventory`.
- **Acceptance criteria:** consuming is idempotent and logged; Streak Shield is auto-consumed (toggle) when a streak would break, with a window confirming.

#### System items (shop) [MVP]
| Item | Effect | Gold |
|---|---|---|
| **Streak Shield** | Absorbs one broken-streak event (any stat) | 250 |
| **XP Boost** | +25% XP for 24 h | 200 |
| **Dungeon Key (E/D/C/B/A/S)** | Opens an Instant Dungeon of that rank | 100-800 |
| **Potion of Recovery** | Clears Penalty Mode without XP loss | 400 |
| **Holy Water of Life** | Restores HP to full and clears Fatigue | 300 |
| **Stat Reset Scroll** | Refund all allocated ability points | 1500 |
| **Rest Day Token** | Extra weekly rest day without Tenacity cost | 120 |

Stock tier unlocks with rank (e.g. B+ keys appear at rank B).

#### Real-world rewards shelf [MVP for shelf + link + budget, V1 for full Treasury]
**Add flow:** `Add reward` -> name, **USD price**, **link** (optional), **stat it helps** (STR/INT/SENSE/VIT/AGI/any), category (gear, book, course, sleep gear, meal prep, other), optional image/notes, "one-time" or "repeatable".

**Gold price formula**
```
monthly_budget_usd  = B          (user-set, default $100)
expected_monthly_gold = E        (rolling median of the last 3 months of earned gold; defaults to 3000)
gold_per_usd        = E / B
price_gold          = max(50, ceil(usd_price * gold_per_usd * stat_factor))
stat_factor         = 0.9  if the stat it helps has a >= 7-day active streak, else 1.0
```
Example: B = $100, E = 4500 gold -> 45 g/$; a $30 book costs 1350 gold (about 10 clean days). Re-quoted when E is recomputed (price shown "locked" once the user taps `Reserve`, until bought or 30 days pass).

**Unlock & Buy:** when gold >= price, the card turns gold and shows `[BUY]`, which opens the item's link in the default browser. Afterward the user confirms `[I bought it]`: gold is deducted, the item moves to the Purchase Log with actual amount spent.

**Treasury [V1]**
- Month budget bar: spent / budget, with unspent carryover (max 50%).
- Unlock does not spend dollars. If actual spend would push the month over budget, the card shows `OVER BUDGET: next month` and `[BUY]` is replaced by `[SCHEDULE]` (becomes buyable on the 1st) [MVP: warning only].
- Purchase log: date, item, stat, USD actual, gold spent, optional "did it help?" 1-5 rating after 30 days (feeds Well-Equipped and the Oracle's suggestions).

**Anti-cheat**
- Gold is earned only; there is no gold purchase, import of gold, or edit UI. Export/import preserves the event log, and imported logs are re-derived, not trusted for balances (the DB stores *events*, balances are computed).
- Daily gold cap on non-Quest sources; back-logging past the late-log window is blocked.
- Reward items with a price under $5 or flagged "consumable" are limited to 1 purchase per week to prevent gold-for-snacks.
- Reward items must pick a stat; "any" rewards cost +25% gold.
- Acceptance: the shop UI has no way to change gold; developer tools are removed in release builds.

---

### 3.6 Shadow Army

#### Extraction on streak milestones [MVP]
- Milestones 7 / 30 / 100 / 365 on any stat or overall: opens an **Arise** window. The extraction requires the Shadow Extraction skill (granted free for the first shadow).
- **Acceptance criteria:** each milestone yields exactly one shadow per stat per tier; extraction can be deferred (milestone stays claimable for 7 days).

#### Naming [MVP]
- User names the shadow, or picks **Auto-name** (Oracle-generated or from a template list in the Igris/Beru/Tank/Iron style).
- Name is editable once later for 50 gold.

#### Ranks [MVP]
Normal Soldier -> Elite Knight -> Knight -> Commander -> Marshal -> Grand Marshal.
A shadow ranks up as the streak of its source stat continues: 7 d start, 30 d Elite Knight, 60 d Knight, 100 d Commander, 200 d Marshal, 365 d Grand Marshal.

#### Passive gold [MVP]
Per day: Normal Soldier 2, Elite Knight 5, Knight 8, Commander 14, Marshal 20, Grand Marshal 30. Paid at the day boundary only if the source stat's streak is alive.

#### Rank-down on break [MVP]
A broken streak drops each shadow of that stat one rank (never below Normal Soldier, never deleted). Rebuilding the streak climbs back at normal thresholds measured from the new streak start.

#### Roster screen [MVP]
Grid of silhouettes with glowing eyes, name, rank, source stat, daily gold, "since" date; click opens detail with a short Oracle-written lore line [V1]. Empty state: `[No shadows extracted. Hold a streak to 7 days.]`.

---

### 3.7 Pop-up System windows

The app runs as a tray app that spawns frameless transparent always-on-top windows (Tauri secondary windows) that never take focus.

| Event | Window | Default position |
|---|---|---|
| Wake time / quest ready | Daily Quest | top-right |
| Goal progress logged | none (silent counter) | - |
| 1 hour before day boundary & goals missing | Warning | center-right |
| Quest completed | Quest Complete + Box | center |
| Level up | Level Up | center |
| Rank change | Re-evaluation | center, modal |
| Title / skill unlocked | Title / Skill | top-center |
| Penalty trigger | Penalty | full-screen-ish, centered, red |
| Urgent quest spawn | Urgent Quest | top-right, red |
| Streak milestone | Arise | center, purple |
| Weekly Gate opens (Mon) | Gate | top-right |
| Oracle message | whichever variant | per type |

**Default schedule (all editable):** wake-time quest at 07:00; midday reminder 13:00 *only if* zero logged; evening warning at 21:00 if goals open; day close at 03:00; weekly Gate Monday 07:05; Urgent Quests inside 09:00-19:00 window.

**Quiet hours:** default 22:30-06:30. Pop-ups queue and appear collapsed in the morning, except the Penalty alarm which respects them (no sound) but still shows at wake time.

**Stealth/DND:** the Stealth skill, a tray toggle ("Stealth for 1/2/4/8 h"), and automatic detection of fullscreen apps/screen sharing/meetings (macOS focus, Windows focus-assist) [V1]. Queued windows collapse into a single `[3 NOTIFICATIONS WAITED]` window at end.

**Sounds:** a "ding" on every window (synthesised or bundled CC0), level-up stinger, Arise stinger, penalty alarm; master volume + per-category mute; default volume 40%.

**Acceptance criteria:**
- Pop-ups never steal keyboard focus; click-through pass-through outside the panel is on by default.
- Max 6 pop-ups/day unsolicited; a global 90-second cooldown between non-urgent windows.
- Multi-monitor: appears on the monitor with the mouse/active window.

---

### 3.8 The Oracle (Generative UI)  [MVP for templates and one generated window, V1 full]

**What it is.** Claude (Anthropic API) generates System windows at runtime, strictly validated against the `SystemWindowSpec` schema and rendered by the block component registry. The Oracle is optional; every window has a hand-written template fallback.

**What Claude generates**
| Output | When | Cached |
|---|---|---|
| Quest flavor text (title, one-line order, warning text) | once at day start | per day |
| Surprise Urgent Quest (name, objective, timer, stat) | 1-2 per week, at scheduled time | per instance |
| Title names + flavor for custom/unlocked titles | at unlock | permanent |
| Shadow names + one-line lore | at Arise | permanent |
| Window layout itself (blocks and ordering, e.g. weekly report) | on demand and weekly | per week |
| "System Report" (weekly review window with insights) | Sunday night | per week |
| Reward suggestions ("sleep mask for SENSE ~ $18") | on request in Shop | per request |

**Strict schema.** The model is called with a tool/JSON-schema output of `SystemWindowSpec` (variant, title, blocks[], actions[], sound). The renderer rejects unknown block types, unknown action ids, unknown variants and any text over length limits (title 48 chars, block text 220 chars); on rejection it re-asks once and then falls back. Actions are limited to an allow-list of ids (`dismiss`, `open_screen`, `accept_quest`, `log_goal`, ...) that never take free-form commands or URLs (links only come from the user's own reward shelf).

**Caching.** One generation batch per day at day start (quest flavor, today's urgent quest slot if due), stored in `oracle_cache` keyed by `(kind, date, input_hash)`; reused on restart and for retries.

**Fallbacks.** No API key, offline, error, timeout (8 s) or invalid output -> a hand-written template window with the same spec shape. The UI never shows a spinner for a pop-up: templates render instantly; Oracle-enhanced text replaces fallback text only for non-time-critical windows.

**Cost ceiling.** Default model: a small fast Claude model; hard ceiling 40 requests and ~60k tokens/day and a user-set monthly cap (default $2). Settings shows usage; reaching the cap flips to templates until next month. Each prompt is short and inputs are summaries, not raw logs.

**Key handling.** User supplies their own API key, stored in the OS keychain (never in SQLite/export); a "Test key" button; no key = full app still works.

**Example prompts (system prompt abbreviated)**
- *Quest flavor:* "You are the System from Solo Leveling. Voice: deadpan, bracketed, second person, no praise, no emoji. Given player {level, rank, streaks, weakest stat, goals}, output SystemWindowSpec variant=quest with a title <= 48 chars and a one-sentence order. Do not change goal numbers."
- *Urgent quest:* "Create one Urgent Quest completable in <= 30 min at home or nearby that trains {stat}. Timer 30-120 min. Reward fields are filled by the app, not you."
- *Shadow name:* "Name a shadow soldier in the style of Igris, Beru, Tank, Iron. One word, <= 12 chars, then a one-line lore about the habit {stat} and streak {n} days."
- *Weekly report layout:* "Given this week's JSON summary, compose a window using only blocks: text, bar, kv, list, statRow. Highlight one win and one weakness. Do not recommend purchases."

**Safety rules (hard-coded, not prompt-based)**
- The Oracle supplies *text and layout only*; penalty severity, XP, gold, timers' upper bounds and triggers are computed by the app and injected afterward; any numeric field returned by the model for rewards/penalties is ignored.
- Urgent quests are validated: no medical, extreme-fitness or fasting content, nothing beyond a 2-hour timer, no more than two per week. A content filter keyword list rejects dangerous suggestions (e.g. "no food", "no sleep", "run 20 km").
- Penalty windows are template-only in Penalty Mode (the Oracle may append one flavor line).
- Only aggregated stats leave the machine (no goal text with personal notes unless the user toggles it).

---

### 3.9 Integrations [LATER]

| Integration | Feeds | Notes |
|---|---|---|
| Apple Health / Google Fit | SENSE sleep duration, STR workouts | via mobile companion or export import first |
| Oura / Whoop | SENSE sleep score, Fatigue (recovery) | OAuth, optional |
| Strava / Hevy | STR workouts, AGI cardio | auto-clear the STR goal when a workout is detected |
| MyFitnessPal | VIT meals/calories | import daily summary |
| Google Calendar | Urgent Quest scheduling, Stealth during meetings | read-only |
| iCloud / Google Drive | encrypted backup of the JSON export | |
| Mobile companion (iOS/Android) | quick logging, push notifications | shares data via file sync first |

Principle: all integrations propose logs; the user confirms with one click ("[Import 52 min workout?]").

---

### 3.10 Settings & data

#### Local storage [MVP]
SQLite via Tauri's SQL plugin; schema migrations; event-sourced logs (`goal_logs`, `xp_events`, `gold_events`, `inventory_events`) with derived views.

#### Export / import JSON [MVP]
- Export full event log + settings (no API key). Import validates, offers `Merge` vs `Replace`, and recomputes balances from events.

#### Day boundary [MVP]
Default 03:00, range 00:00-06:00; changing it applies from tomorrow.

#### Notification schedule [MVP]
Wake time, midday, evening, quiet hours, max per day, per-category toggles, sound volume.

#### API key in the OS keychain [V1]
macOS Keychain / Windows Credential Manager / Secret Service via Tauri keyring plugin; masked display, replace/delete, "test connection".

#### Other
- Goal templates and units, stat names/labels (cosmetic rename allowed), AGI enable switch [MVP].
- Theme: System default only (no light mode) with intensity slider (glow, scanlines) [V1].
- Auto-start on login [MVP].
- Reset progress (hard confirm window) [MVP].

---

## 4. Ideas parking lot

1. **Double Dungeon event** [LATER]: once a year (on install anniversary) a doubled-stakes week with a secret "Statue of God" choice (accept hard-mode for 2x loot).
2. **Monarch's Domain**: a visual room/dashboard that fills with your shadows and trophies; Pure vanity, unlocked at Lv 100.
3. **"Kamish's Wrath" legendary item**: a one-off, absurdly expensive real-world reward tier ($200+ goals like a bike or standing desk) that takes a quarter to earn; unlock triggers a full cinematic.
4. **Guild / friends leaderboard**: sync-optional weekly leaderboard (levels, streaks) with a friend code; no social feed.
5. **Beru commentary**: an occasional sardonic one-line "Beru" note on the weekly report (Oracle) with a different voice from the System.
6. **Igris co-op**: a friend's gate where both clear a shared weekly goal.
7. **Rune Stone drops**: rare skill-alteration items (swap Sprint for another stat).
8. **System Merchant**: weekly rotating shop stock with a limited-time discount.
9. **Hunter Association exam**: a quarterly "rank exam" that tests a custom 7-day challenge for a cosmetic frame around the rank.
10. **Cursed Dungeon**: opt-in high-risk gamble: stake gold on a 3-day goal, win 2x or lose it.
11. **Sleep Sentinel**: a bedtime wind-down window at 22:00 with ambient dimming.
12. **Shadow Review**: end-of-year Shadow Army parade, Spotify-wrapped style.
13. **Voice**: optional TTS reading of `[Ding!]` and quest text.
14. **Window skins**: Season 2 particles skin, Penalty Zone desert skin.
15. **Accountability ally**: share only the daily clear/miss to one trusted person.
