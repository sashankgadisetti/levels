/**
 * Effect routing. The engine returns Effects; this is the only place they touch the outside world.
 *   popup  -> Tauri: the transparent "system" window (Rust show_system_window); browser: overlay layer
 *   notify -> Tauri: plugin-notification; browser: console
 *   sound  -> Web Audio synth (suppressed when a popup in the same batch already plays that sound)
 *   oracle -> whatever the oracle module registered via registerOracleHandler
 */
import type { Effect } from "../engine";
import { playSound } from "../components/system/sound";
import { uid } from "../lib/format";
import { isTauri, showSystemWindow } from "../lib/tauri";
import { parseSpec, type SystemWindowSpec } from "../system/spec";
import { usePopups } from "./popups";

export interface EffectDeps {
  isTauri: () => boolean;
  showSystemWindow: (payload: unknown) => unknown;
  pushOverlay: (spec: SystemWindowSpec & { id: string }) => void;
  notify: (title: string, body: string) => unknown;
  playSound: (s: "ding" | "levelup" | "arise" | "alarm") => void;
  oracle: (e: Extract<Effect, { kind: "oracle" }>) => void;
}

type OracleEffect = Extract<Effect, { kind: "oracle" }>;
let oracleHandler: ((e: OracleEffect) => void) | undefined;
/** The Oracle module calls this once to receive `oracle` effects. */
export const registerOracleHandler = (fn: ((e: OracleEffect) => void) | undefined) => { oracleHandler = fn; };

async function tauriNotify(title: string, body: string) {
  try {
    const n = await import("@tauri-apps/plugin-notification");
    let ok = await n.isPermissionGranted();
    if (!ok) ok = (await n.requestPermission()) === "granted";
    if (ok) n.sendNotification({ title, body });
  } catch (err) {
    console.warn("[levels] notification failed", err);
  }
}

export const defaultEffectDeps: EffectDeps = {
  isTauri,
  showSystemWindow,
  pushOverlay: (spec) => usePopups.getState().push(spec),
  notify: (title, body) => (isTauri() ? tauriNotify(title, body) : console.info(`[notify] ${title}: ${body}`)),
  playSound,
  oracle: (e) => oracleHandler?.(e),
};

export function routeEffects(effects: Effect[], deps: EffectDeps = defaultEffectDeps): void {
  const popupSounds = new Set<string>();
  for (const e of effects) if (e.kind === "popup" && e.spec.sound !== "none") popupSounds.add(e.spec.sound);
  for (const e of effects) {
    switch (e.kind) {
      case "popup": {
        const checked = parseSpec(e.spec);
        if (!checked.success) { console.warn("[levels] invalid popup spec", checked.error); break; }
        const spec = { ...checked.data, id: checked.data.id ?? uid() };
        if (deps.isTauri()) void deps.showSystemWindow(spec);
        else deps.pushOverlay(spec);
        break;
      }
      case "notify": void deps.notify(e.title, e.body); break;
      case "sound": if (!popupSounds.has(e.sound)) deps.playSound(e.sound); break;
      case "oracle": deps.oracle(e); break;
    }
  }
}
