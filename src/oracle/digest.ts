/**
 * Compact state digest sent to the model (target < 600 tokens). Never raw history:
 * only today's goals, the last closed day, streak counters and vitals.
 */
import type { State, StatId } from "../engine/types";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const pad = (n: number) => String(n).padStart(2, "0");

/** The player's "game day" (YYYY-MM-DD): the day rolls over at config.player.dayEndsAt. */
export function gameDate(now: Date, dayEndsAt: string): string {
  const [h, m] = dayEndsAt.split(":").map(Number);
  const shifted = new Date(now.getTime() - ((h || 0) * 60 + (m || 0)) * 60_000);
  return `${shifted.getFullYear()}-${pad(shifted.getMonth() + 1)}-${pad(shifted.getDate())}`;
}

export interface Digest {
  now: { date: string; time: string; weekday: string; dayEndsAt: string };
  player: { name: string; level: number; rank: string; xpPct: number; job?: string; title?: string; abilityPoints: number };
  stats: Record<string, number>;
  lockedStats: string[];
  goals: { id: string; stat: StatId; label: string; current: number; target: number; unit: string; done: boolean; rest?: boolean }[];
  cleared: string;
  streaks: Record<string, number>;
  vitals: { hp: number; mp: number; fatigue: number };
  yesterday: { date: string; result: string; cleared: string } | null;
  penalty: { active: boolean; endsAt?: string; missed?: number };
  habits: { id: string; stat: StatId; label: string; target: number; unit: string; restDays?: string[] }[];
  shadows: number;
  gold: number;
  gatesCleared: number;
}

export function buildDigest(state: State, now: Date): Digest {
  const cfg = state.config;
  const today = state.today;
  const last = state.history.length ? state.history[state.history.length - 1] : undefined;
  const equipped = state.titles.find((t) => t.id === state.player.equippedTitleId);

  const stats: Record<string, number> = {};
  const streaks: Record<string, number> = {};
  for (const def of cfg.stats) {
    stats[def.id] = state.stats[def.id]?.value ?? 0;
    streaks[def.id] = state.streaks[def.id]?.current ?? 0;
  }
  const goals = (today?.goals ?? []).map((g) => ({
    id: g.id, stat: g.stat, label: g.label, current: g.current, target: g.target, unit: g.unit, done: g.done,
    ...(g.rest ? { rest: true } : {}),
  }));

  return {
    now: {
      date: today?.date ?? gameDate(now, cfg.player.dayEndsAt),
      time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
      weekday: WEEKDAYS[now.getDay()],
      dayEndsAt: cfg.player.dayEndsAt,
    },
    player: {
      name: state.player.name,
      level: state.player.level,
      rank: state.player.rank,
      xpPct: state.player.xpToNext > 0 ? Math.round((state.player.xp / state.player.xpToNext) * 100) : 0,
      ...(state.player.job ? { job: state.player.job } : {}),
      ...(equipped ? { title: equipped.name } : {}),
      abilityPoints: state.player.abilityPoints,
    },
    stats,
    lockedStats: cfg.stats.filter((s) => s.locked).map((s) => s.id),
    goals,
    cleared: `${goals.filter((g) => g.done).length}/${goals.length}`,
    streaks,
    vitals: { hp: Math.round(state.vitals.hp), mp: Math.round(state.vitals.mp), fatigue: Math.round(state.vitals.fatigue) },
    yesterday: last
      ? { date: last.date, result: last.result ?? "unknown", cleared: `${last.goals.filter((g) => g.done).length}/${last.goals.length}` }
      : null,
    penalty: state.penalty && !state.penalty.cleared
      ? { active: true, endsAt: state.penalty.endsAt, missed: state.penalty.missedGoalIds.length }
      : { active: false },
    habits: cfg.habits.map((h) => ({
      id: h.id, stat: h.stat, label: h.label, target: h.target, unit: h.unit,
      ...(h.restDays?.length ? { restDays: h.restDays } : {}),
    })),
    shadows: state.shadows.length,
    gold: state.gold,
    gatesCleared: state.gatesCleared,
  };
}

/** Rough token estimate (chars / 4) used by tests and budget heuristics. */
export const estimateTokens = (v: unknown) => Math.ceil(JSON.stringify(v).length / 4);
