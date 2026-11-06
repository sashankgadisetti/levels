import { DEFAULT_CONFIG } from "./config";
import type { Config, Goal } from "./types";

type Curves = Config["curves"];

/** XP required to go from `level` to `level + 1`. */
export const xpToNext = (level: number, curves: Curves = DEFAULT_CONFIG.curves): number =>
  Math.round(curves.levelBase * Math.pow(level, curves.levelExponent));

export interface XpGain { level: number; xp: number; levelsGained: number; pointsGained: number; fromLevel: number }

/** Add XP, carrying overflow through as many level-ups as it covers. */
export function applyXp(level: number, xp: number, amount: number, curves: Curves): XpGain {
  let l = level, x = xp + Math.max(0, amount);
  while (x >= xpToNext(l, curves)) { x -= xpToNext(l, curves); l++; }
  const levelsGained = l - level;
  return { level: l, xp: x, levelsGained, pointsGained: levelsGained * curves.pointsPerLevel, fromLevel: level };
}

/** Stat XP per stat point: a stat's value is 10 + floor(stat xp / STAT_XP_PER_POINT) + allocated points. */
export const STAT_XP_PER_POINT = 100;

/**
 * Stat points a goal is worth: `statPointsPerGoal` (1) when done, +1 when `streakDay` (the day of the stat's
 * streak this goal falls on) is a multiple of `statBonusEvery` (7). Rest days pay half and no bonus.
 */
export function goalStatPoints(g: Goal, streakDay: number, curves: Curves): number {
  if (!g.done) return 0;
  const base = curves.statPointsPerGoal ?? 1;
  if (g.rest) return base / 2;
  const every = curves.statBonusEvery ?? 7;
  return base + (every > 0 && streakDay > 0 && streakDay % every === 0 ? 1 : 0);
}
