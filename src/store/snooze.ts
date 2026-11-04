/** Remembers recently shown specs (so the main window can resolve a pop-up window id), snoozes, and "N more" folds. */
import * as engine from "../engine";
import { questProgress } from "../lib/derive";
import { gameStore } from "./game";
import { presentSpecs } from "./effects";
import type { Spec } from "./cadence";

export const SNOOZE_MS = 30 * 60_000;

const recent = new Map<string, Spec>();
const folded = new Map<string, Spec[]>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

export function remember(spec: Spec): void {
  recent.delete(spec.id);
  recent.set(spec.id, spec);
  if (recent.size > 60) recent.delete(recent.keys().next().value as string);
}
export const recall = (id?: string): Spec | undefined => (id ? recent.get(id) : undefined);

export function stashFolded(summaryId: string, specs: Spec[]): void {
  folded.set(summaryId, specs);
  if (folded.size > 10) folded.delete(folded.keys().next().value as string);
}

/** The "View" action on a "[N MORE NOTIFICATIONS]" window: replay what was folded away. */
export function replayFolded(summaryId: string): boolean {
  const list = folded.get(summaryId);
  if (!list) return false;
  folded.delete(summaryId);
  presentSpecs(list);
  return true;
}

/** Re-show a pop-up after `ms` (default 30 min). The Daily Quest window is rebuilt from live state so it is never stale. */
export function snooze(spec: Spec | undefined, ms = SNOOZE_MS): void {
  if (!spec) return;
  const old = timers.get(spec.id);
  if (old) clearTimeout(old);
  timers.set(spec.id, setTimeout(() => {
    timers.delete(spec.id);
    let next: Spec = spec;
    if (spec.id.startsWith("daily-") || spec.id === "welcome") {
      const st = gameStore.getState().state;
      if (!st?.today) return;
      const p = questProgress(st.today);
      if (p.total > 0 && p.done === p.total) return;
      next = { ...engine.windows.dailyQuest(st), id: spec.id };
    }
    presentSpecs([next]);
  }, ms));
}

export const isSnoozeAction = (a: { kind: string; label: string; arg?: string }) =>
  a.kind === "dismiss" && (a.arg === "snooze" || /^later$/i.test(a.label.trim()));
