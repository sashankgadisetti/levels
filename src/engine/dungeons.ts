/**
 * Instant Dungeons (docs/01-research.md §9): a timed focus session with a named boss. Entered with a Dungeon
 * Key (rank from the key) or keyless (E-rank, half rewards). Pure helpers only; events live in reducer.ts.
 */
import { habitOf } from "./quests";
import type { ActiveDungeon, Goal, HunterRank, ISO, Item, State } from "./types";

/** Abandoning within this many ms of entering returns the key. */
export const KEY_REFUND_MS = 2 * 60_000;
export const DUNGEON_CHIPS = [25, 50, 90] as const;

const BOUNDS: Record<HunterRank, [number, number]> = {
  E: [25, 25], D: [25, 50], C: [50, 50], B: [50, 90], A: [90, 90], S: [90, 90], NATIONAL: [90, 90],
};

/** Allowed duration for a rank: min/max minutes and the 25/50/90 chips inside the range. */
export function dungeonBoundsFor(rank: HunterRank): { min: number; max: number; options: number[] } {
  const [min, max] = BOUNDS[rank] ?? BOUNDS.E;
  return { min, max, options: DUNGEON_CHIPS.filter((m) => m >= min && m <= max) };
}

/** Clamp a requested duration to the rank's bounds (default: the shortest allowed). */
export function clampDungeonMinutes(rank: HunterRank, minutes?: number): number {
  const { min, max } = dungeonBoundsFor(rank);
  if (minutes === undefined || !Number.isFinite(minutes)) return min;
  return Math.min(max, Math.max(min, Math.round(minutes)));
}

const KEY_RANK = /\((E|D|C|B|A|S)\)/;
/** The rank a Dungeon Key opens (encoded in its name, e.g. "Dungeon Key (C)"). */
export function keyRank(item: Item): HunterRank {
  const m = KEY_RANK.exec(item.name) ?? KEY_RANK.exec(item.description);
  return (m?.[1] as HunterRank | undefined) ?? "E";
}
export const isDungeonKey = (item: Item | undefined): item is Item => item?.defId === "dungeon-key";

const RANK_ORDER: HunterRank[] = ["E", "D", "C", "B", "A", "S", "NATIONAL"];
/** Dungeon keys in the inventory, highest rank first. */
export function dungeonKeys(s: State): { item: Item; rank: HunterRank }[] {
  return s.inventory.filter(isDungeonKey).map((item) => ({ item, rank: keyRank(item) }))
    .sort((a, b) => RANK_ORDER.indexOf(b.rank) - RANK_ORDER.indexOf(a.rank));
}

export const activeDungeon = (s: State): ActiveDungeon | undefined => s.dungeon;

/** Whole seconds until the active dungeon's timer ends (0 when time is up or none is open). */
export function dungeonSecondsLeft(s: State, nowIso: ISO): number {
  const d = s.dungeon;
  if (!d) return 0;
  return Math.max(0, Math.ceil((Date.parse(d.endsAt) - Date.parse(nowIso)) / 1000));
}

/** A goal dungeon minutes can count toward: a minutes habit, or a project strike measured in minutes. */
export function isMinutesGoal(s: State, g: Goal): boolean {
  if (g.rest) return false;
  if (g.projectId) return g.unit === "min";
  return habitOf(s.config, g)?.kind === "minutes";
}
/** Today's goals that a dungeon can be linked to (unfinished first). */
export function linkableGoals(s: State): Goal[] {
  const gs = (s.today?.goals ?? []).filter((g) => isMinutesGoal(s, g));
  return [...gs.filter((g) => !g.done), ...gs.filter((g) => g.done)];
}
/** Default link: the unfinished Study goal, else the first unfinished minutes goal. */
export function defaultLinkGoal(s: State): Goal | undefined {
  const open = linkableGoals(s).filter((g) => !g.done);
  return open.find((g) => g.habitId === "study") ?? open[0];
}
/** Default boss name: today's ⚔ strike, else the first unfinished goal's label. */
export function defaultBossName(s: State): string {
  const goals = s.today?.goals ?? [];
  const strike = goals.find((g) => g.projectId && !g.done);
  const g = strike ?? goals.find((x) => !x.done && !x.rest);
  return g ? g.label.replace(/^⚔\s*/, "") : "Unnamed Boss";
}
