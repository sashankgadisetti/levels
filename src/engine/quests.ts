import { clamp } from "./vitals";
import { dayBounds, weekdayOf } from "./time";
import type { Config, DailyQuest, Goal, HabitDef, ISO, YMD } from "./types";

export const goalIdFor = (date: YMD, habitId: string) => `${date}:${habitId}`;

export function scaledTarget(h: HabitDef, level: number): number {
  if (h.kind === "check" || !h.scalePerLevel) return h.target;
  return Math.round((h.target + h.scalePerLevel * Math.max(0, level - 1)) * 10) / 10;
}

/** Build the Daily Quest for `date`. Rest days pre-clear the goal (rest: true, done: true). */
export function buildDailyQuest(config: Config, date: YMD, level: number, startedAt?: ISO): DailyQuest {
  const wd = weekdayOf(date);
  const locked = new Set(config.stats.filter((s) => s.locked).map((s) => s.id));
  const goals: Goal[] = config.habits
    .filter((h) => !locked.has(h.stat))
    .map((h) => {
      const target = scaledTarget(h, level);
      const rest = !!h.restDays?.includes(wd);
      return {
        id: goalIdFor(date, h.id), habitId: h.id, stat: h.stat, label: rest ? `${h.label} (rest day)` : h.label,
        target, unit: h.unit, current: rest ? target : 0, done: rest, ...(rest ? { rest: true } : {}), ...(h.checkIn ? { mode: "yesno" as const } : {}),
      };
    });
  return { date, goals, startedAt: startedAt ?? dayBounds(date, config.player.dayEndsAt).start };
}

/** Set a goal's progress (clamped to 0..target). Rest goals stay done. Mutates the goal. */
export function setGoalValue(g: Goal, value: number): void {
  g.current = clamp(Math.round(value * 100) / 100, 0, g.target);
  g.done = !!g.rest || g.current >= g.target;
}
export const isFullClear = (q?: DailyQuest) => !!q && q.goals.length > 0 && q.goals.every((g) => g.done);
export const doneCount = (q: DailyQuest) => q.goals.filter((g) => g.done).length;
export const habitOf = (config: Config, g: Goal) => config.habits.find((h) => h.id === g.habitId);
