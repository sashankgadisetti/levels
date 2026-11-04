import type { HunterRank } from "./types";

export const RANKS: HunterRank[] = ["E", "D", "C", "B", "A", "S", "NATIONAL"];
const THRESHOLDS: [number, HunterRank][] = [[100, "NATIONAL"], [70, "S"], [50, "A"], [35, "B"], [20, "C"], [10, "D"], [1, "E"]];

export function rankForLevel(level: number): HunterRank {
  for (const [min, r] of THRESHOLDS) if (level >= min) return r;
  return "E";
}
export const rankIndex = (r: HunterRank) => RANKS.indexOf(r);
/** The next rank boundary above `level`, or undefined at National Level. */
export function nextRankAt(level: number): { rank: HunterRank; level: number } | undefined {
  for (const [min, r] of [...THRESHOLDS].reverse()) if (min > level) return { rank: r, level: min };
  return undefined;
}
