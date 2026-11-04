# 01 · Research: how "The System" works in Solo Leveling

This is the canon reference the app is modelled on. Everything in the app should
feel like it was emitted by the System that picked Sung Jinwoo as its only
"Player". Where the source material is vague or where real life needs an
adaptation, the **"App adaptation"** notes say what we do instead.

Sources: the webtoon/manhwa (Chugong, DUBU), the anime (A-1 Pictures, 2024–25),
the light novel, plus the fan wiki and the *Solo Leveling: ARISE* game for stat
and UI conventions. See "Sources" at the bottom.

---

## 1. The Player

- After the Double Dungeon, Jinwoo gets a prompt:
  `[You have qualified to become a Player. Will you accept?]` with `[Yes] / [No]`.
  Refusing is not really an option ("your heart will stop in 0.02 seconds").
- Only the Player can see the System's **blue, translucent, rectangular windows**
  that float in the air, each announced with a sharp **"Ding!"**.
- The System never explains itself. It issues orders, rewards and penalties,
  and it is relentlessly deadpan. That tone is a feature.

**App adaptation:** onboarding is the Player acceptance prompt. All copy is
written in the System's clipped, bracketed, second‑person voice.

## 2. The Status Window

The window Jinwoo opens by saying "Status" (manhwa ch. 3) looks like this:

```
[STATUS WINDOW]
NAME: SUNG JINWOO        LEVEL: 1
JOB: NONE                TITLE: NONE
HP: 100                  MP: 10
FATIGUE: 0

[STATS]
STRENGTH: 10
VITALITY: 10
AGILITY: 10
INTELLIGENCE: 10
SENSE: 10                   (translated as PERCEPTION in the novel / ARISE)

(Available ability points: 0)
[PHYSICAL DAMAGE REDUCTION: 0%]
```

Facts that matter for the design:

| Canon element | What it does in the story | App adaptation |
|---|---|---|
| **Strength (STR)** | Raw physical power. | **Gym / working out.** Exactly what the user asked for. |
| **Vitality (VIT)** | Stamina, toughness; HP is derived from it. | **Eating healthy.** The user called this "hitpoints"; in canon HP is the bar and VIT is the stat behind it, so VIT is the habit stat and **HP is the derived daily health bar**. |
| **Agility (AGI)** | Speed, reflexes. | Optional 5th stat. Suggested: cardio / steps / mobility, or leave locked until the user wants it. |
| **Intelligence (INT)** | Mana pool, magic. | **Learning for your career.** Exactly as asked. |
| **Sense / Perception (SENSE)** | Awareness, reaction, instinct ("sharpness"). | **Sleeping every day.** The user's "sharpness" maps cleanly to the canonical *Sense* stat. |
| **HP** | Health bar. | Derived: fed by VIT + SENSE habits, drains when you skip meals/sleep. |
| **MP** | Mana. | Derived "focus/energy" pool: fed by sleep + learning, spent on skills (see §7). |
| **Fatigue** | Rises with exertion; high fatigue = weaker. | Rises with consecutive heavy gym days; nudges a rest day. Rest days are not a failure. |
| **Ability points** | Gained on level‑up, spent freely. | Same. Level‑up grants points you can allocate to any stat (lets you specialise). |
| **Job** | `NONE` until the Job Change Quest at Lv 40. | Same: a class is earned at Lv 40 based on your dominant stat. |
| **Title** | Passive buffs. | Same: titles unlocked by milestones, each with a small passive bonus. |

## 3. Quests

### 3.1 Daily Quest — "Preparation to Become Powerful"

```
[DAILY QUEST: PREPARATION TO BECOME POWERFUL]

GOAL
  Push-ups      100 times   [0/100]
  Sit-ups       100 times   [0/100]
  Squats        100 times   [0/100]
  Running       10 km       [0/10]

WARNING: Failure to complete the Daily Quest will result in an appropriate penalty.
```

- Appears every day at the same time; expires at midnight.
- Rewards on completion: `[Daily Quest complete. Reward: Random Box ×1]` plus
  ability points. (The first Random Box contained a *Holy Water of Life*.)
- Progress counters tick up live as Jinwoo does the reps.
- Later the quest scales (more reps, longer run) as his level climbs.

**App adaptation:** the Daily Quest *is* the habit tracker. Four goals, one per
stat. Counters can be binary (slept ✓) or numeric (45 min lifted). Difficulty
scales with level. Rewards: XP, gold, a Random Box, and a stat point.

### 3.2 Penalty Quest

Skip the Daily Quest and the System teleports you to a **Penalty Zone**
(desert, giant centipedes) with `[PENALTY QUEST: SURVIVE — 04:00:00]`.
It is terrifying and explicitly meant to teach that *even trivial orders matter*.

**App adaptation:** missing the daily quest at midnight triggers **Penalty
Mode** the next morning: a red‑tinted full‑screen System window, a 4‑hour
"Survive" timer, a stat decay, streak reset for that stat, and the shop is locked
until the makeup task is done. See `02-features.md §4`.

### 3.3 Other quest types

| Type | Canon | App adaptation |
|---|---|---|
| **Urgent Quest** | `[URGENT QUEST: Kill the enemies!]`, time‑boxed, appears without warning. | A surprise same‑day challenge (e.g. "walk 20 min before 6 pm") worth bonus loot. Opt‑in frequency. |
| **Secret Quest** | `[Secret Quest: Courage of the Weak]` — hidden objective, revealed when done. | Hidden achievements: the System reveals them after the fact ("You have completed a Secret Quest"). |
| **Job Change Quest** | At Lv 40, an Instant Dungeon boss fight (Igris). Pass ⇒ class (Assassin → Necromancer → Shadow Monarch). | At Lv 40, a one‑week gauntlet: hit every daily quest 7/7. Pass ⇒ Job assigned by dominant stat (Fighter/Mage/Assassin/Ranger/Healer/Tanker) with a class bonus. |
| **Strength Training quests** | Special stat‑building quests with escalating counts. | "Training Arc" weekly quests per stat (e.g. 4 gym sessions this week). |

## 4. Levelling

- `[You have leveled up!]` with the Ding. Jinwoo starts at Lv 1, is Lv ~40 at
  the Job Change, and well past 100 by the end.
- Each level grants **ability points** (3 per level in the manhwa; ARISE uses 5)
  to allocate freely.
- Levels drive everything else: shop stock scales with level, instant dungeon
  rank scales with level, titles and skills unlock on thresholds.

**App adaptation:** XP from every completed goal; level curve in
`04-architecture.md §5`. 3 ability points per level (canon).

## 5. Hunter Ranks

The world ranks Hunters **E → D → C → B → A → S**, with "National Level" as an
honorific above S. Jinwoo starts as "the weakest Hunter of all mankind" (E‑rank)
and is re‑evaluated to S‑rank.

**App adaptation:** rank is derived from level (E 1–9, D 10–19, C 20–34,
B 35–49, A 50–69, S 70–99, National Level 100+). A **re‑evaluation ceremony**
window plays on each promotion. A hidden "Shadow Monarch" rank exists for the
long game.

## 6. Shop, Gold, Inventory, Random Boxes

- The **System Shop** sells potions, keys, and gear for **gold**; stock scales
  with the Player's level.
- Known consumables: *Holy Water of Life* (full heal), *Potion of Recovery*,
  *Elixir of Life* (cures all diseases — the item Jinwoo grinds for to save his
  mother), *Instant Dungeon Key* (E–S rank).
- **Random Boxes** are the Daily Quest reward and open into a random item.
- **Inventory** holds items; some are reusable, some consumed.
- Gold comes from selling drops and clearing dungeons.

**App adaptation:** gold is earned from quests; the shop has two shelves:
(1) **System items** (virtual: streak shields, XP boosts, dungeon keys) and
(2) **Real‑world rewards** the user pays actual money for, priced in gold,
backed by a monthly budget. See `02-features.md §5`.

## 7. Skills

Jinwoo acquires skills from level‑ups, rune stones, and quests. The ones worth
borrowing by name:

| Skill | Canon effect | App adaptation (what the user gets) |
|---|---|---|
| **Tenacity** (passive) | Damage reduction when HP is low. | One "grace" per week: a missed goal does not break the streak. |
| **Sprint** (active) | +movement speed for MP. | Spend MP to double today's XP for one stat. |
| **Vital Strike** (active) | Bonus damage on weak points. | Bonus XP for hitting the hardest goal first in the day. |
| **Stealth** (active) | Invisibility. | Do‑Not‑Disturb: suppress pop‑ups for N hours (meetings, travel). |
| **Bloodlust** (active) | Fear aura. | Focus mode: starts an Instant Dungeon timer and optionally blocks distracting sites. |
| **Ruler's Authority** (active) | Telekinesis. | Rearrange / re‑schedule today's quests without penalty. |
| **Shadow Extraction** (active) | Raise fallen enemies as shadow soldiers. | Turn a completed streak milestone into a **Shadow** (see §8). |
| **Shadow Exchange** | Swap places with a shadow. | Delegate: let a shadow "cover" a day when travelling (costs the shadow a rank). |

Skills unlock from stat thresholds and level, cost MP to use, and have cooldowns.

## 8. Shadow Army ("Arise")

The signature mechanic. Jinwoo says **"Arise"** and the fallen become loyal
shadows (Igris, Iron, Tank, Beru, Bellion, Kaisel…). Shadows level up with use
and have ranks: Normal Soldier → Elite Knight → Knight → Commander → Marshal →
Grand Marshal.

**App adaptation:** every **streak milestone** (7, 30, 100, 365 days) on a
stat lets you *extract* a shadow with the "Arise" ceremony. Shadows:
- are named by you (or auto‑named in the Igris / Beru style),
- display in a "Shadow Army" panel as silhouettes with glowing eyes,
- passively generate a little gold each day (your past discipline keeps paying),
- rank up as the streak continues, rank down (never die) if the streak breaks.

## 9. Instant Dungeons & Gates

- **Instant Dungeons** are private pocket dungeons the System opens for Jinwoo
  to grind in without witnesses; entered with a key, ranked E–S, contain a boss.
- **Gates** are the public portals Hunters raid; **Red Gates** trap you until
  the boss is cleared.

**App adaptation:**
- **Instant Dungeon** = a timed focus session (25/50/90 min) with a named
  *boss* (the task). Rank scales XP. Keys drop from Random Boxes.
- **Weekly Gate** = a bigger weekly challenge across all stats (e.g. "Clear
  the C‑rank Gate: 4 workouts, 5 nights ≥7 h, 5 clean‑eating days, 3 study
  blocks"). Clearing it drops gold and rare items.
- **Red Gate** = an occasional surprise week with a larger reward.

## 10. Titles

Jinwoo gains titles such as **Wolf Assassin** (slaying the instant‑dungeon
wolves), **Demon Hunter** (Demon Castle), and **The Player Who Has Overcome
Adversity**; each gives a passive stat bonus.

**App adaptation:** titles unlock from milestones and give +% XP or +gold:
"Wolf Assassin" (first 30‑day gym streak), "Demon Hunter" (clear 10 Gates),
"The Player Who Has Overcome Adversity" (complete a Daily Quest while in
Penalty Mode), "Early Riser", "Iron Body", "Scholar", etc. One title is
equipped at a time (canon) and shows in the Status Window.

## 11. The look and sound

- **Windows:** dark translucent navy/black panels with a thin luminous
  **cyan‑blue** border, soft outer glow, sharp corners, centered monospaced /
  geometric caps text, bracketed headers `[LIKE THIS]`, and a small diamond or
  `!` glyph. Season 2 adds subtle scanline and particle effects.
- **Sound:** every window is preceded by the **"Ding!"** chime. Level‑ups and
  the "Arise" moment have heavier stingers.
- **Typography:** the logo is custom lettering; **Orbitron** is the closest
  free face. For body text in the windows a clean geometric sans
  (**Rajdhani**, **Exo 2**, or **Share Tech Mono**) reads right.
- **Colour language:** cyan‑blue = normal System message; **red** = warning /
  penalty / urgent quest; **gold** = reward; **purple** = Shadow / Monarch.

---

## Sources

- Status window stats and ability‑point conventions:
  [Dot Esports](https://dotesports.com/solo-leveling-arise/news/solo-leveling-arise-best-stats-jinwoo),
  [Pro Game Guides](https://progameguides.com/solo-leveling-arise/best-stats-to-add-for-sung-jinwoo-in-solo-leveling-arise/),
  [EarlyGame stats guide](https://acc.earlygame.com/guides/mobile-gaming/solo-leveling-arise-stats-guide),
  [MyDramaList novel summary](https://mydramalist.com/785338-solo-leveling/discussions/153392-web-novel-s-summary-spoiler)
- Daily Quest and Penalty Zone:
  [Epicstream](https://epicstream.com/article/what-is-solo-leveling-daily-quest-sung-jin-woo-workout),
  [Anime News Network ep. 12 review](https://animenewsnetwork.com/review/solo-leveling/episode-12/.209434),
  [In Between Drafts review](https://inbetweendrafts.com/solo-leveling-review-the-rules-are-set-in-its-like-a-game/)
- System overview, Job Change, Instant Dungeons, Shadow Extraction:
  [Deltia's Gaming – What is the System](https://deltiasgaming.com/?p=120546),
  [Beebom – Shadow Monarch](https://beebom.com/solo-leveling-sung-jinwoo-shadow-monarch/amp/),
  [Yahoo – Elixir of Life explained](https://www.yahoo.com/entertainment/solo-leveling-elixir-life-explained-150435080.html)
- Hunter ranks:
  [Sportskeeda](https://sportskeeda.com/anime/solo-leveling-s-hunter-ranking-system-explained),
  [Beebom – National Level Hunters](https://beebom.com/solo-leveling-national-level-hunters-explained),
  [MacMyths](https://macmyths.com/solo-leveling-hunter-ranks-in-order-what-e-rank-s-rank-and-national-level-mean/)
- UI / font conventions and fan recreations:
  [Made Good Designs – font](https://madegooddesigns.com/?p=10502),
  [Roblox devforum – system UI effect](https://devforum.roblox.com/t/feedback-on-system-ui-effect/2132743),
  [Modrinth – Solo Leveling custom GUI](https://modrinth.com/resourcepack/solo-leveling-custom-gui)
- Existing habit apps in this niche (all closed‑source, mobile‑only):
  [Solo Leveling Your Self (iOS)](https://apps.apple.com/us/app/-/id6770878729),
  [HabitForge](https://habitforgeio.netlify.app/about/),
  [Solo Level: System (Android)](https://appgoblin.info/apps/com.RedDragon.SoloLevel)

Note: the Solo Leveling Fandom wiki could not be fetched from this environment,
so exact window wording above is reconstructed from the manhwa/anime and the
secondary sources; verify against the wiki before shipping copy.
