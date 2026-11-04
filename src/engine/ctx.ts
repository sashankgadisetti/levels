import { inQuietHours } from "./time";
import type { Effect, ISO, State } from "./types";
import type { SystemWindowSpec } from "../system/spec";

/** Working context for one reduce() call. `s` is a private draft; mutate freely. */
export interface Ctx { s: State; fx: Effect[]; at: ISO }

export const isQuiet = (s: State, at: ISO): boolean =>
  (!!s.quietUntil && at < s.quietUntil) || inQuietHours(at, s.config.popups.quietHours);

/**
 * Emit a pop-up. During quiet hours / Stealth only penalty or alarm windows go through; everything else
 * is held in `state.queuedPopups` (released on the first event after quiet ends) unless `droppable`.
 */
export function popup(c: Ctx, spec: SystemWindowSpec, opts: { droppable?: boolean } = {}): void {
  if (isQuiet(c.s, c.at) && spec.variant !== "penalty" && spec.sound !== "alarm") {
    if (!opts.droppable) {
      const q = (c.s.queuedPopups ??= []);
      q.push(spec);
      if (q.length > 12) q.shift();
    }
    return;
  }
  c.fx.push({ kind: "popup", spec });
}

export function flushQueued(c: Ctx): void {
  if (c.s.queuedPopups?.length && !isQuiet(c.s, c.at)) {
    for (const spec of c.s.queuedPopups) c.fx.push({ kind: "popup", spec });
    c.s.queuedPopups = undefined;
  }
}

export const count = (s: State, key: string) => s.counters?.[key] ?? 0;
export function bump(s: State, key: string, n = 1): void {
  s.counters = { ...(s.counters ?? {}), [key]: count(s, key) + n };
}
