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
  const out: PenaltyGoalView[] = [];
  for (const id of p.missedGoalIds) {
    const g = findGoal(s, id);
    if (!g) continue;
    const target = makeupTarget(g), current = Math.min(target, p.makeup?.[id] ?? 0);
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
  p.makeup = { ...(p.makeup ?? {}), [goalId]: Math.max(0, Math.min(makeupTarget(g), (p.makeup?.[goalId] ?? 0) + delta)) };
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
