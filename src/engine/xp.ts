import { DEFAULT_CONFIG } from "./config";
import type { Config } from "./types";

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
