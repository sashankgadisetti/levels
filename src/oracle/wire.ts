/**
 * Wires the Oracle into the running app:
 *   - engine `oracle` effects → Claude → a SystemWindowSpec shown through the normal popup path
 *   - "Ask the System" from the Settings screen
 * Generated windows reuse the template window's id (e.g. `daily-2026-11-04`), so the popup
 * layers upsert them in place: the template appears instantly, the Oracle's version replaces it.
 */
import { DEFAULT_CONFIG, type Effect } from "../engine";
import { registerOracleHandler, routeEffects } from "../store/effects";
import { gameStore } from "../store/game";
import { getOracleApiKey } from "../store/settings";
import type { SystemWindowSpec } from "../system/spec";
import { LocalStorageOracleCache } from "./cache";
import { createOracle, type Oracle } from "./client";
import { handleOracleEffect } from "./index";

let oracle: Oracle | undefined;

export function getOracle(): Oracle {
  if (!oracle) {
    oracle = createOracle({
      getApiKey: getOracleApiKey,
      config: () => (gameStore.getState().state ?? { config: DEFAULT_CONFIG }).config.oracle,
      cache: new LocalStorageOracleCache(),
      log: (msg, err) => console.warn("[oracle]", msg, err ?? ""),
    });
  }
  return oracle;
}

const show = (spec: SystemWindowSpec) => routeEffects([{ kind: "popup", spec }]);

/** Call once at app start (main window only). */
export function installOracle(): void {
  registerOracleHandler((effect: Extract<Effect, { kind: "oracle" }>) => {
    const state = gameStore.getState().state;
    if (!state) return;
    const ctx = effect.context ?? {};
    void handleOracleEffect(effect, state, getOracle()).then((spec) => {
      if (!spec) return;
      // Same id as the engine's template window so the layers replace instead of stacking.
      const id = effect.request === "dayStart" && typeof ctx.date === "string" ? `daily-${ctx.date}` : spec.id;
      show({ ...spec, id });
    });
  });
}

/** "Ask the System": returns the spec and also shows it as a pop-up. */
export async function askTheSystem(question: string): Promise<SystemWindowSpec | null> {
  const state = gameStore.getState().state;
  if (!state) return null;
  const r = await getOracle().ask(state, question);
  if (r?.spec) show(r.spec);
  return r?.spec ?? null;
}

export const oracleSpentTodayUsd = () => getOracle().spentTodayUsd();
