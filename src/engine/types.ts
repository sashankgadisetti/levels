/**
 * Engine contract. The engine is pure TypeScript: no React, no Tauri, no I/O.
 * See docs/04-architecture.md §3–5 for the semantics and numbers.
 */
import type { SystemWindowSpec } from "../system/spec";

export type ISO = string;        // ISO-8601 timestamp
export type YMD = string;        // "2026-11-04" in the player's local day (see dayEndsAt)
export type StatId = "STR" | "VIT" | "AGI" | "INT" | "SENSE" | "HYD";
export type HunterRank = "E" | "D" | "C" | "B" | "A" | "S" | "NATIONAL";
export type ShadowRank = "Normal Soldier" | "Elite Knight" | "Knight" | "Commander" | "Marshal" | "Grand Marshal";
export type Rarity = "common" | "rare" | "epic" | "legendary";
export type Weekday = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";

export interface StatDef { id: StatId; label: string; short: string; locked: boolean; description?: string }
export interface HabitDef {
  id: string;
  stat: StatId;
  label: string;
  kind: "count" | "minutes" | "hours" | "check";
  target: number;
  unit: string;
  restDays?: Weekday[];        // days on which the goal is auto-satisfied as "rest"
  logPrevNight?: boolean;      // sleep: logged in the morning for last night
  scalePerLevel?: number;      // target growth per player level (default 0)
  /** Yes/no check-in prompts (e.g. water): the System asks every N minutes inside the window; YES = +1. */
  checkIn?: { everyMinutes: number; from: string; to: string; question?: string };
}
export interface Config {
  player: { name: string; dayEndsAt: string /* "HH:MM" */; timezone?: string };
  stats: StatDef[];
  habits: HabitDef[];
  curves: {
    xpPerGoal: number; fullClearBonus: number; levelExponent: number; levelBase: number; pointsPerLevel: number;
    /** Stat points a completed goal adds to its stat (default 1). */
    statPointsPerGoal?: number;
    /** Every Nth consecutive day of a stat's streak, its goals pay one extra stat point (default 7; 0 = off). */
    statBonusEvery?: number;
  };
  economy: { goldPerGoal: number; goldFullClear: number; goldGate: number; monthlyBudgetUsd: number; usdToGold: number };
  penalty: { surviveHours: number; hpLoss: number; lockShop: boolean; resetStreakOf: "missedStatsOnly" | "all" | "none" };
  popups: { warnHoursBefore: number[]; quietHours?: { from: string; to: string } };
  oracle: { enabled: boolean; model: string; flavorModel: string; dailyBudgetUsd: number };
}

export interface Goal { id: string; habitId: string; stat: StatId; label: string; target: number; unit: string; current: number; done: boolean; rest?: boolean; xpMult?: number /* set by Sprint */; mode?: "yesno" /* logged one yes at a time, no amounts */; statPaid?: number /* stat points already credited for this goal */ }
export interface DailyQuest { date: YMD; goals: Goal[]; startedAt: ISO; closedAt?: ISO; rewardedAt?: ISO /* full-clear rewards paid at this time */; result?: "clear" | "partial" | "fail"; xpEarned?: number; goldEarned?: number }

export interface Item { id: string; defId: string; name: string; rarity: Rarity; description: string; consumable: boolean; obtainedAt: ISO }
export interface RewardDef { id: string; name: string; usd: number; url?: string; stat?: StatId; note?: string; createdAt: ISO; purchasedAt?: ISO; goldPaid?: number }
export interface Title { id: string; name: string; effect: string; unlockedAt: ISO }
export interface Skill { id: string; name: string; kind: "passive" | "active"; effect: string; mpCost: number; cooldownHours: number; unlockedAt: ISO; lastUsedAt?: ISO }
export interface Shadow { id: string; name: string; stat: StatId; rank: ShadowRank; epithet?: string; extractedAt: ISO; streakAtExtraction: number }
export interface Streak { stat: StatId; current: number; best: number; lastDate?: YMD }
export interface Penalty {
  startedAt: ISO; endsAt: ISO; date: YMD; missedGoalIds: string[]; cleared: boolean;
  /** makeup progress per missed goal id (target = ceil(original target / 2)) */
  makeup?: Record<string, number>;
  /** last date a "penalty persists" reminder was shown */
  warnedDate?: YMD;
}
export interface PendingExtraction { stat: StatId; milestone: number; offeredAt: ISO }

export interface State {
  version: 1;
  /** Save-format revision; `migrate` upgrades older snapshots (absent = 1). */
  rev?: number;
  config: Config;
  player: { accepted: boolean; name: string; level: number; xp: number; xpToNext: number; abilityPoints: number; job?: string; equippedTitleId?: string; rank: HunterRank };
  stats: Record<StatId, { value: number; xp: number; allocated: number }>;
  vitals: { hp: number; mp: number; fatigue: number };
  gold: number;
  today?: DailyQuest;            // the open day
  history: DailyQuest[];         // closed days, most recent last (cap ~400 in snapshots)
  streaks: Record<StatId, Streak>;
  penalty?: Penalty;             // active penalty mode
  inventory: Item[];
  boxes: number;                 // unopened Random Boxes
  rewards: RewardDef[];          // real-world reward catalog + purchase log
  spentThisMonthUsd: number;
  titles: Title[];
  skills: Skill[];
  shadows: Shadow[];
  dungeonsCleared: number;
  gatesCleared: number;
  lastTickAt?: ISO;
  // --- optional engine bookkeeping (added by the engine implementation) ---
  quietUntil?: ISO;                                  // Stealth
  monthKey?: string;                                 // "2026-11" of the last event (monthly reset)
  warned?: { date: YMD; hours: number[] };           // warning popups already fired today
  sprintArmed?: boolean;                             // next goal completion today pays 2x XP
  xpBoostFor?: YMD;                                  // XP Boost applies to the close of this date
  tenacityUsedWeek?: string;                         // ISO week "2026-W45"
  pendingExtractions?: PendingExtraction[];
  counters?: Record<string, number>;                 // title-condition counters
  checkIns?: Record<string, ISO>;                    // last yes/no prompt time per habit id
  lastGymDate?: YMD;
  queuedPopups?: SystemWindowSpec[];                 // held back by quiet hours / Stealth
}

export type Event =
  | { type: "PLAYER_ACCEPTED"; name: string; at: ISO }
  | { type: "DAY_STARTED"; date: YMD; at: ISO }
  | { type: "GOAL_PROGRESS"; goalId: string; delta: number; at: ISO }
  | { type: "GOAL_SET"; goalId: string; value: number; at: ISO }
  | { type: "DAY_CLOSED"; date: YMD; at: ISO }
  | { type: "PENALTY_PROGRESS"; goalId: string; delta: number; at: ISO }
  | { type: "PENALTY_CLEARED"; at: ISO }
  | { type: "POINTS_ALLOCATED"; stat: StatId; points: number; at: ISO }
  | { type: "BOX_OPENED"; seed: number; at: ISO }
  | { type: "ITEM_USED"; itemId: string; at: ISO }
  | { type: "REWARD_ADDED"; reward: Omit<RewardDef, "createdAt" | "purchasedAt" | "goldPaid">; at: ISO }
  | { type: "REWARD_REMOVED"; rewardId: string; at: ISO }
  | { type: "REWARD_PURCHASED"; rewardId: string; at: ISO }
  | { type: "SHADOW_EXTRACTED"; stat: StatId; name: string; epithet?: string; at: ISO }
  | { type: "TITLE_EQUIPPED"; titleId: string; at: ISO }
  | { type: "SKILL_USED"; skillId: string; at: ISO; hours?: number /* Stealth duration, default 4 */ }
  | { type: "DUNGEON_CLEARED"; rank: HunterRank; minutes: number; bossName: string; at: ISO }
  | { type: "GATE_RESULT"; week: string; cleared: boolean; at: ISO }
  | { type: "CHECKIN_ANSWERED"; habitId: string; yes: boolean; at: ISO }
  | { type: "TICK"; at: ISO }
  | { type: "CONFIG_CHANGED"; patch: Partial<Config>; at: ISO };

export type Effect =
  | { kind: "popup"; spec: SystemWindowSpec }
  | { kind: "notify"; title: string; body: string }
  | { kind: "sound"; sound: "ding" | "levelup" | "arise" | "alarm" }
  | { kind: "oracle"; request: "dayStart" | "gate" | "commentary" | "shadowName"; context: Record<string, unknown> };

export interface ReduceResult { state: State; effects: Effect[] }
