import { canPurchase, rewardGoldPrice, type PurchaseCheck } from "./economy";
import { isPenaltyActive, penaltyGoals } from "./penalty";
import { nextRankAt, rankForLevel } from "./rank";
import { skillReady } from "./skills";
import { TITLE_DEFS } from "./titles";
import { dayBounds, localDate } from "./time";
import { xpToNext as xpToNextRaw } from "./xp";
import { restRecommended as restRec } from "./vitals";
import type { HunterRank, ISO, RewardDef, Skill, StatId, State, Streak, Title } from "./types";

export { rankForLevel, nextRankAt, canPurchase, rewardGoldPrice, penaltyGoals, isPenaltyActive };
export type { PurchaseCheck };

export const xpToNext = (level: number, s?: State) => xpToNextRaw(level, s?.config.curves);

export function todayProgress(s: State) {
  const goals = s.today?.goals ?? [];
  const done = goals.filter((g) => g.done).length;
  return { date: s.today?.date, goals, done, total: goals.length, pct: goals.length ? done / goals.length : 0, allDone: goals.length > 0 && done === goals.length };
}

export const restRecommended = (s: State) => restRec(s);
export const shopLocked = (s: State) => s.config.penalty.lockShop && isPenaltyActive(s);

/** Gold price of a real-world reward including the monthly scarcity multiplier. Accepts (reward, state) or (state, reward). */
export function goldPriceOf(a: RewardDef | State, b: RewardDef | State): number {
  const [reward, state] = "config" in a ? [b as RewardDef, a] : [a as RewardDef, b as State];
  return rewardGoldPrice(reward, state);
}

export interface StatRow { stat: StatId; label: string; short: string; value: number; xp: number; allocated: number; locked: boolean; description?: string }
export const statRows = (s: State): StatRow[] =>
  s.config.stats.map((d) => ({ stat: d.id, label: d.label, short: d.short, value: s.stats[d.id].value, xp: s.stats[d.id].xp, allocated: s.stats[d.id].allocated, locked: d.locked, description: d.description }));

/** streakFor(state, stat) or streakFor(stat, state) */
export function streakFor(a: State | StatId, b: State | StatId): Streak {
  const [s, stat] = typeof a === "string" ? [b as State, a] : [a, b as StatId];
  return s.streaks[stat];
}

export function hoursUntilDayEnd(s: State, now: ISO): number {
  const date = s.today?.date ?? localDate(now, s.config.player.dayEndsAt);
  const end = new Date(dayBounds(date, s.config.player.dayEndsAt).end).getTime();
  return Math.max(0, (end - new Date(now).getTime()) / 3_600_000);
}

export const equippedTitle = (s: State): Title | undefined => s.titles.find((t) => t.id === s.player.equippedTitleId);
export const availableSkills = (s: State, now: ISO): Skill[] => s.skills.filter((k) => skillReady(s, k, now));
export const titleCatalog = () => TITLE_DEFS.map(({ id, name, condition, effect }) => ({ id, name, condition, effect }));
export const nextRank = (s: State): { rank: HunterRank; level: number } | undefined => nextRankAt(s.player.level);
export const pendingExtractions = (s: State) => s.pendingExtractions ?? [];
export const stealthActive = (s: State, now: ISO) => !!s.quietUntil && now < s.quietUntil;
export const canBuy = (s: State, reward: RewardDef) => canPurchase(reward, s);
