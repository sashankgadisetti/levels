import { popup, type Ctx } from "./ctx";
import { addHours } from "./time";
import { addHp } from "./vitals";
import { penaltyEscaped, penaltyQuest, type PenaltyGoalView } from "./windows";
import { bump } from "./ctx";
import type { DailyQuest, Goal, State } from "./types";

export const isPenaltyActive = (s: State) => !!s.penalty && !s.penalty.cleared;
export const makeupTarget = (g: Goal) => Math.ceil(g.target / 2);

export function findGoal(s: State, id: string): Goal | undefined {
  const t = s.today?.goals.find((g) => g.id === id);
  if (t) return t;
  for (let i = s.history.length - 1; i >= 0; i--) {
    const g = s.history[i].goals.find((x) => x.id === id);
    if (g) return g;
  }
  return undefined;
}

export function penaltyGoals(s: State): PenaltyGoalView[] {
  const p = s.penalty;
  if (!p) return [];
  // One row per habit: several failed days in a row must not stack the same habit several times.
  // The most recent missed goal of a habit defines the row; its credit is the best across all of that habit's ids.
  const byHabit = new Map<string, { id: string; g: Goal; credit: number }>();
  for (const id of p.missedGoalIds) {
    const g = findGoal(s, id);
    if (!g) continue;
    const credit = p.makeup?.[id] ?? 0;
    const prev = byHabit.get(g.habitId);
    byHabit.set(g.habitId, { id, g, credit: Math.max(credit, prev?.credit ?? 0) }); // later ids win (ids are appended chronologically)
  }
  const out: PenaltyGoalView[] = [];
  for (const { id, g, credit } of byHabit.values()) {
    const target = makeupTarget(g), current = Math.min(target, credit);
    out.push({ goalId: id, label: g.label, stat: g.stat, unit: g.unit, current, target, done: current >= target });
  }
  return out;
}
export const makeupComplete = (s: State) => penaltyGoals(s).every((g) => g.done);

/** Enter Penalty Mode. A still-active penalty is extended and merged. */
export function startPenalty(c: Ctx, quest: DailyQuest, missed: Goal[]): void {
  const s = c.s;
  const prev = isPenaltyActive(s) ? s.penalty : undefined;
  const ids = [...new Set([...(prev?.missedGoalIds ?? []), ...missed.map((g) => g.id)])];
  s.penalty = {
    startedAt: c.at, endsAt: addHours(c.at, s.config.penalty.surviveHours), date: quest.date,
    missedGoalIds: ids, cleared: false, makeup: { ...(prev?.makeup ?? {}) },
  };
  addHp(s, -s.config.penalty.hpLoss);
  popup(c, penaltyQuest(s.penalty, penaltyGoals(s)));
}

export function progressPenalty(c: Ctx, goalId: string, delta: number): void {
  const s = c.s, p = s.penalty;
  if (!p || p.cleared || !p.missedGoalIds.includes(goalId)) return;
  const g = findGoal(s, goalId);
  if (!g) return;
  const makeup = { ...(p.makeup ?? {}) };
  for (const id of p.missedGoalIds) { // all missed days of this habit advance together
    const other = findGoal(s, id);
    if (!other || other.habitId !== g.habitId) continue;
    makeup[id] = Math.max(0, Math.min(makeupTarget(other), (makeup[id] ?? 0) + delta));
  }
  p.makeup = makeup;
  if (makeupComplete(s)) clearPenalty(c, "makeup");
}

/**
 * Credit today's progress on the missed habits to the makeup (idempotent, keeps the larger value).
 * Runs on every tick so a penalty also clears retroactively when the work was logged earlier.
 */
export function syncMakeupFromToday(c: Ctx): void {
  const s = c.s, p = s.penalty, today = s.today;
  if (!p || p.cleared || !today) return;
  let changed = false;
  const makeup = { ...(p.makeup ?? {}) };
  for (const id of p.missedGoalIds) {
    const missed = findGoal(s, id);
    if (!missed) continue;
    const todays = today.goals.find((g) => g.habitId === missed.habitId);
    if (!todays) continue;
    const credit = Math.min(makeupTarget(missed), todays.current);
    if (credit > (makeup[id] ?? 0)) { makeup[id] = credit; changed = true; }
  }
  if (!changed) return;
  p.makeup = makeup;
  if (makeupComplete(s)) clearPenalty(c, "makeup");
}

export function clearPenalty(c: Ctx, how: "makeup" | "elixir"): void {
  const s = c.s;
  if (!s.penalty || s.penalty.cleared) return;
  s.penalty = { ...s.penalty, cleared: true };
  if (how === "elixir") { s.vitals.hp = 100; }
  else { addHp(s, 10); bump(s, "penaltyCleared"); }
  popup(c, penaltyEscaped());
}
