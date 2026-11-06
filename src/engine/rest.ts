/**
 * Rest days. A habit's weekly rest allowance is the number of `restDays` it has (the workout: 1, Sunday).
 * The scheduled day rests automatically, or the player takes the rest early with the Rest day button,
 * which then turns the scheduled day back into a normal day. High fatigue unlocks an extra STR rest.
 */
import { addDays, isoWeek } from "./time";
import { habitOf } from "./quests";
import { restRecommended } from "./vitals";
import type { Goal, State, YMD } from "./types";

/** Rest goals of `habitId` already taken in the ISO week of `date` (history plus the open day). */
export function restsUsed(s: State, habitId: string, date: YMD): number {
  const week = isoWeek(date), from = addDays(date, -7);
  let n = 0;
  const count = (goals: Goal[]) => { for (const g of goals) if (g.habitId === habitId && g.rest) n++; };
  for (let i = s.history.length - 1; i >= 0 && s.history[i].date > from; i--) {
    if (isoWeek(s.history[i].date) === week) count(s.history[i].goals);
  }
  if (s.today && isoWeek(s.today.date) === week) count(s.today.goals);
  return n;
}

export const restAllowance = (s: State, habitId: string) => s.config.habits.find((h) => h.id === habitId)?.restDays?.length ?? 0;

/** Can today's goal `g` be switched to a rest day with the button? */
export function canRest(s: State, g: Goal): boolean {
  const q = s.today;
  if (!q || g.done || g.rest || g.mode === "yesno" || !habitOf(s.config, g)) return false;
  if (restsUsed(s, g.habitId, q.date) < restAllowance(s, g.habitId)) return true;
  return g.stat === "STR" && restRecommended(s);
}

/** Can a rest taken with the button be undone? Only before the day's rewards are paid. */
export const canUndoRest = (s: State, g: Goal) => !!s.today && !s.today.rewardedAt && !!g.restManual;
