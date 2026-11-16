/**
 * Progress writes made through tools, plus the undo ring.
 * Every write is an engine event (GOAL_PROGRESS / GOAL_SET) dispatched through the store.
 * The ring remembers each goal's value before the write so undo can GOAL_SET it back.
 */
import type { Goal, State } from "../../engine";
import type { EventInput } from "../../store/game";
import { agentEnv } from "../env";

export interface LogRecord {
  id: number;
  date: string;
  goalId: string;
  label: string;
  unit: string;
  prev: number;
  next: number;
  at: number;
}

const RING_MAX = 50;
let ring: LogRecord[] = [];
let seq = 1;

export const logRing = (): readonly LogRecord[] => ring;
export const clearLogRing = () => { ring = []; };

const state = (): State | undefined => agentEnv.store().getState().state;
const dispatch = (e: EventInput) => agentEnv.store().getState().dispatch(e);

const goalById = (id: string): Goal | undefined => state()?.today?.goals.find((g) => g.id === id);

/**
 * Move a goal to `value` (when given) or by `delta`. Increases use GOAL_PROGRESS so the engine pays
 * completion rewards exactly as a click would; decreases use GOAL_SET. Returns the record, or null if nothing changed.
 */
export function applyProgress(goalId: string, change: { delta?: number; value?: number }): LogRecord | null {
  const s = state();
  const g = goalById(goalId);
  if (!s?.today || !g) return null;
  const prev = g.current;
  const target = change.value !== undefined ? change.value : prev + (change.delta ?? 0);
  const next = Math.max(0, Math.round(target * 100) / 100);
  if (next === prev) return null;
  if (next > prev) dispatch({ type: "GOAL_PROGRESS", goalId, delta: Math.round((next - prev) * 100) / 100 });
  else dispatch({ type: "GOAL_SET", goalId, value: next });
  const after = goalById(goalId)?.current ?? next;
  const rec: LogRecord = { id: seq++, date: s.today.date, goalId, label: g.label, unit: g.unit, prev, next: after, at: agentEnv.now().getTime() };
  ring.push(rec);
  if (ring.length > RING_MAX) ring = ring.slice(-RING_MAX);
  return rec;
}

/** Record a change that some other event made (e.g. a check-in YES) so it can be undone too. */
export function noteChange(goalId: string, prev: number): LogRecord | null {
  const s = state();
  const g = goalById(goalId);
  if (!s?.today || !g || g.current === prev) return null;
  const rec: LogRecord = { id: seq++, date: s.today.date, goalId, label: g.label, unit: g.unit, prev, next: g.current, at: agentEnv.now().getTime() };
  ring.push(rec);
  return rec;
}

/** Revert one record (GOAL_SET back to its previous value). Only today's entries can be undone. */
export function revert(rec: LogRecord): boolean {
  const s = state();
  ring = ring.filter((r) => r.id !== rec.id);
  if (!s?.today || s.today.date !== rec.date || !goalById(rec.goalId)) return false;
  dispatch({ type: "GOAL_SET", goalId: rec.goalId, value: rec.prev });
  return true;
}

/** Revert several records, newest first. */
export function revertMany(ids: number[]): LogRecord[] {
  const recs = ring.filter((r) => ids.includes(r.id)).sort((a, b) => b.id - a.id);
  return recs.filter((r) => revert(r));
}

/** The most recent record from today, if any. */
export function lastToday(): LogRecord | undefined {
  const date = state()?.today?.date;
  for (let i = ring.length - 1; i >= 0; i--) if (ring[i].date === date) return ring[i];
  return undefined;
}
