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
import { shapePopups, type Spec } from "./cadence";
import { remember, stashFolded } from "./snooze";

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

/** While onboarding registers the player, the registration / title / first-quest windows come from separate events: gather them. */
const WELCOME_WINDOW_MS = 150;
let gathering: { specs: Spec[]; deps: EffectDeps } | undefined;

function present(spec: Spec, deps: EffectDeps) {
  remember(spec);
  if (deps.isTauri()) void deps.showSystemWindow(spec);
  else deps.pushOverlay(spec);
}

function showShaped(specs: Spec[], deps: EffectDeps) {
  const shaped = shapePopups(specs, uid);
  if (shaped.summary) stashFolded(shaped.summary.id, shaped.folded);
  shaped.show.forEach((sp) => present(sp, deps));
}

export function routeEffects(effects: Effect[], deps: EffectDeps = defaultEffectDeps): void {
  const specs: Spec[] = [];
  for (const e of effects) {
    if (e.kind !== "popup") continue;
    const checked = parseSpec(e.spec);
    if (!checked.success) { console.warn("[levels] invalid popup spec", checked.error); continue; }
    specs.push({ ...checked.data, id: checked.data.id ?? uid() });
  }
  if (gathering && specs.length) {
    gathering.specs.push(...specs);
  } else if (specs.some((sp) => sp.title === "PLAYER REGISTERED")) {
    const g = { specs: [...specs], deps };
    gathering = g;
    setTimeout(() => { gathering = undefined; showShaped(g.specs, g.deps); }, WELCOME_WINDOW_MS);
  } else if (specs.length) {
    showShaped(specs, deps);
  }
  // Sounds a popup already plays are not repeated by the engine's separate sound effect.
  const popupSounds = new Set<string>();
  for (const sp of specs) if (sp.sound !== "none") popupSounds.add(sp.sound);
  for (const e of effects) {
    switch (e.kind) {
      case "notify": void deps.notify(e.title, e.body); break;
      case "sound": if (!popupSounds.has(e.sound)) deps.playSound(e.sound); break;
      case "oracle": deps.oracle(e); break;
    }
  }
}

/** Re-show specs directly (no reshaping): used by snooze and the "N more" View action. */
export function presentSpecs(specs: Spec[], deps: EffectDeps = defaultEffectDeps): void {
  for (const spec of specs) present(spec, deps);
}
