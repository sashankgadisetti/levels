import { canPurchase, rewardGoldPrice, type PurchaseCheck } from "./economy";
import { isPenaltyActive, penaltyGoals } from "./penalty";
import { nextRankAt, rankForLevel } from "./rank";
import { skillReady } from "./skills";
import { TITLE_DEFS } from "./titles";
import { dayBounds, localDate } from "./time";
import { xpToNext as xpToNextRaw } from "./xp";
import { restRecommended as restRec } from "./vitals";
import { BACKFILL_DAYS, buildDailyQuest, isFullClear } from "./quests";
import { restsUsed as restsUsedRaw } from "./rest";
import { addDays } from "./time";
import type { DailyQuest, HunterRank, ISO, RewardDef, Skill, StatId, State, Streak, Title } from "./types";

export { rankForLevel, nextRankAt, canPurchase, rewardGoldPrice, penaltyGoals, isPenaltyActive };
export { canRest, canUndoRest, restsUsed, restAllowance } from "./rest";
export { activeDungeon, dungeonSecondsLeft, dungeonKeys, dungeonBoundsFor, clampDungeonMinutes, linkableGoals, defaultLinkGoal, defaultBossName, keyRank } from "./dungeons";
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

/**
 * Finished days (newest first, up to BACKFILL_DAYS back, or two days for a new player) that still have goals open and can be logged with
 * PAST_DAY_LOGGED. Days the app was never opened on are previewed as a fresh quest (`recorded: false`).
 */
export function pastDays(s: State, now: ISO): { date: string; quest: DailyQuest; recorded: boolean }[] {
  if (!s.player.accepted) return [];
  const cur = localDate(now, s.config.player.dayEndsAt);
  const first = s.today && s.today.date < cur ? s.today.date : cur;
  const began = s.history[0]?.date ?? s.today?.date ?? cur;
  const out: { date: string; quest: DailyQuest; recorded: boolean }[] = [];
  for (let k = 1; k <= BACKFILL_DAYS; k++) {
    const date = addDays(cur, -k);
    if (date >= first) continue;
    if (k > 2 && date < began) break; // before the player's first day: only the last two days are offered
    const have = s.history.find((d) => d.date === date);
    const quest = have ?? buildDailyQuest(s.config, date, s.player.level, undefined, (id) => restsUsedRaw(s, id, date));
    if (quest.goals.length && !isFullClear(quest)) out.push({ date, quest, recorded: !!have });
  }
  return out;
}
