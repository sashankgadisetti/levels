export * from "./schema";
export * from "./cache";
export * from "./digest";
export * from "./prompts";
export * from "./client";
import type { Effect, State } from "../engine/types";
import type { SystemWindowSpec } from "../system/spec";
import type { Oracle } from "./client";

/**
 * Store helper for `Effect{kind:"oracle"}`. Returns a popup spec to show, or null
 * (disabled / failed / unknown request) -- in which case the engine's own template
 * window is used. Never throws.
 */
export async function handleOracleEffect(
  effect: Extract<Effect, { kind: "oracle" }>,
  state: State,
  oracle: Oracle,
): Promise<SystemWindowSpec | null> {
  try {
    if (!oracle.enabled()) return null;
    const ctx = effect.context ?? {};
    let r = null;
    switch (effect.request) {
      case "dayStart": r = await oracle.dayStart(state); break;
      case "gate": r = await oracle.gate(state); break;
      case "commentary": r = await oracle.commentary(state, summarize(ctx)); break;
      case "shadowName": r = await oracle.shadowName(state, String(ctx.stat ?? "SENSE")); break;
    }
    return r?.spec ?? null;
  } catch {
    return null;
  }
}

function summarize(ctx: Record<string, unknown>): string {
  if (typeof ctx.summary === "string") return ctx.summary;
  return JSON.stringify(ctx).slice(0, 300);
}
