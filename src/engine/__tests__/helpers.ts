import { DEFAULT_CONFIG } from "../config";
import { addDays } from "../time";
import { createInitialState, reduce } from "../reducer";
import type { Config, Effect, Event, State, StatId } from "../types";

/** Local-time ISO for a player-day date and "HH:MM". */
export const T = (date: string, hm: string) => {
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi] = hm.split(":").map(Number);
  return new Date(y, m - 1, d, h, mi, 0, 0).toISOString();
};

export interface Run { s: State; fx: Effect[] }
export function feed(r: Run, ...events: Event[]): Run {
  let s = r.s; const fx = [...r.fx];
  for (const e of events) { const o = reduce(s, e); s = o.state; fx.push(...o.effects); }
  return { s, fx };
}
export const popups = (fx: Effect[]) => fx.flatMap((e) => (e.kind === "popup" ? [e.spec] : []));
export const titles = (fx: Effect[]) => popups(fx).map((p) => p.title);

/** Accepted player whose first quest (Mon 2026-11-02) is open. */
export function started(config: Config = DEFAULT_CONFIG, mutate?: (s: State) => void): Run {
  let s = createInitialState(config);
  mutate?.(s);
  return feed({ s, fx: [] }, { type: "PLAYER_ACCEPTED", name: "Tester", at: T("2026-11-02", "08:00") }, { type: "TICK", at: T("2026-11-02", "08:01") });
}
export const MON = "2026-11-02";

/** Complete every goal of the given stats (or all) for the open day. */
export function complete(r: Run, stats: StatId[] | "all", at: string): Run {
  const goals = r.s.today!.goals.filter((g) => stats === "all" || stats.includes(g.stat));
  return feed(r, ...goals.map((g) => ({ type: "GOAL_SET" as const, goalId: g.id, value: g.target, at })));
}
/** Cross the day boundary of the open day with a TICK (closes it and starts the next). */
export function nextDay(r: Run): Run {
  const d = r.s.today!.date;
  return feed(r, { type: "TICK", at: T(addDays(d, 1), "03:05") });
}
export const lastResult = (s: State) => s.history[s.history.length - 1];
