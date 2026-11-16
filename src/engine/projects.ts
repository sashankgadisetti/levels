/**
 * Project quests ("boss fights"). A project is a Gate with a boss (docs/01-research.md §9): the player names a
 * real goal with a deadline, the planner breaks it into milestones and one daily "strike". Each strike enters the
 * Daily Quest as an ordinary goal (counts toward full clear, pays goal XP x1.5). When the deadline day closes the
 * Gate is resolved: every milestone done -> cleared (gold + XP + box), otherwise failed.
 * Pure helpers only; the event handling lives in reducer.ts.
 */
import { goalIdFor } from "./quests";
import { addDays, daysBetween } from "./time";
import type { Goal, Project, ProjectStrike, State, YMD } from "./types";

/** Strike goals pay this multiple of normal goal XP. */
export const STRIKE_XP_MULT = 1.5;
/** Gate clear XP (docs/04-architecture.md §5). */
export const GATE_XP = 400;
export const PROJECT_HABIT_PREFIX = "proj:";
export const STRIKE_GLYPH = "⚔ ";

export const projectHabitId = (projectId: string) => PROJECT_HABIT_PREFIX + projectId;

/** The Daily Quest goal for a project's strike on `date`. */
export function strikeGoal(p: Project, date: YMD, strike: ProjectStrike): Goal {
  const minutes = strike.minutes && strike.minutes > 0 ? Math.round(strike.minutes) : undefined;
  const habitId = projectHabitId(p.id);
  return {
    id: goalIdFor(date, habitId), habitId, stat: p.stat, label: STRIKE_GLYPH + strike.title,
    target: minutes ?? 1, unit: minutes ? "min" : "strike", current: 0, done: false, projectId: p.id,
  };
}

/** Strike goals of every active project for `date` (deadline inclusive). */
export function strikeGoalsFor(projects: Project[] | undefined, date: YMD): Goal[] {
  const out: Goal[] = [];
  for (const p of projects ?? []) {
    if (p.status !== "active" || date > p.deadline) continue;
    const st = p.strikes[date];
    if (st) out.push(strikeGoal(p, date, st));
  }
  return out;
}

export const activeProjects = (s: State): Project[] => (s.projects ?? []).filter((p) => p.status === "active");
export const projectById = (s: State, id: string): Project | undefined => s.projects?.find((p) => p.id === id);

/** Today's strike for a project (uses the open day, else nothing). */
export function todayStrike(s: State, projectId: string): (ProjectStrike & { date: YMD; goal?: Goal }) | undefined {
  const p = projectById(s, projectId), date = s.today?.date;
  if (!p || !date) return undefined;
  const st = p.strikes[date];
  if (!st) return undefined;
  return { ...st, date, goal: s.today?.goals.find((g) => g.projectId === projectId) };
}

export interface ProjectProgress { done: number; total: number; pct: number; daysLeft: number; allDone: boolean }
/** Milestone progress; `daysLeft` counts from `today` (if given) to the deadline, inclusive of neither. */
export function projectProgress(p: Project, today?: YMD): ProjectProgress {
  const total = p.milestones.length, done = p.milestones.filter((m) => m.done).length;
  return { done, total, pct: total ? done / total : 0, daysLeft: today ? daysBetween(today, p.deadline) : 0, allDone: total > 0 && done === total };
}

/** Strikes from `from` for `days` days (sorted). */
export function strikesInRange(p: Project, from: YMD, days = 7): { date: YMD; strike: ProjectStrike }[] {
  const out: { date: YMD; strike: ProjectStrike }[] = [];
  for (let i = 0; i < days; i++) {
    const d = addDays(from, i);
    if (p.strikes[d]) out.push({ date: d, strike: p.strikes[d] });
  }
  return out;
}

/** Strike goals completed so far (history + open day), for stats on the card. */
export function strikesLanded(s: State, projectId: string): number {
  let n = 0;
  for (const q of s.history) for (const g of q.goals) if (g.projectId === projectId && g.done) n++;
  for (const g of s.today?.goals ?? []) if (g.projectId === projectId && g.done) n++;
  return n;
}
