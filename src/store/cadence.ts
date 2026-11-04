/**
 * Pop-up cadence: one batch of popup effects (everything a single event produced) is reshaped so the
 * player is never hit with a wall of windows.
 *   1. Onboarding: "Player registered" + "Title acquired: Awakened" + the first Daily Quest become ONE welcome window.
 *   2. More than MAX_SHOWN windows at once: show the first (plus anything sticky, e.g. the penalty) and fold the
 *      rest into a single "[N MORE NOTIFICATIONS]" window with a View action that replays them.
 */
import type { Block, SystemWindowSpec } from "../system/spec";

export type Spec = SystemWindowSpec & { id: string };
export const MAX_SHOWN = 3;
export const MORE_PREFIX = "more:";

export interface Shaped { show: Spec[]; folded: Spec[]; summary?: Spec }

const STICKY = new Set(["penalty"]);

export function mergeWelcome(specs: Spec[]): Spec[] {
  const reg = specs.find((s) => s.title === "PLAYER REGISTERED");
  const daily = specs.find((s) => s.id.startsWith("daily-"));
  if (!reg || !daily) return specs;
  const title = specs.find((s) => s.id === "title-awakened");
  const name = (reg.blocks.find((b) => b.type === "text") as { text?: string } | undefined)?.text ?? "Welcome, Player.";
  const intro: Block[] = [{ type: "text", text: title ? `${name} Title acquired: Awakened.` : name, tone: "cyan" }];
  // the welcome window is friendly: no "GOAL" label and no penalty warning on the very first screen
  const rest = daily.blocks.filter((b) => !(b.type === "text" && (b.text.trim().toUpperCase() === "GOAL" || b.tone === "red")));
  const welcome: Spec = {
    ...daily,
    id: "welcome",
    title: "PLAYER REGISTERED",
    glyph: "diamond",
    blocks: [...intro, ...rest].slice(0, 14),
  };
  const drop = new Set([reg, title, daily]);
  const out: Spec[] = [];
  for (const s of specs) {
    if (s === reg) out.push(welcome);
    else if (!drop.has(s)) out.push(s);
  }
  return out;
}

export function shapePopups(input: Spec[], newId: () => string): Shaped {
  const specs = mergeWelcome(input);
  if (specs.length <= MAX_SHOWN) return { show: specs, folded: [] };
  const first = specs[0];
  const keep = specs.filter((s, i) => i > 0 && STICKY.has(s.variant));
  const folded = specs.filter((s, i) => i > 0 && !STICKY.has(s.variant));
  const id = newId();
  const summary: Spec = {
    id: `${MORE_PREFIX}${id}`,
    variant: "info",
    title: `${folded.length} MORE NOTIFICATIONS`,
    glyph: "alert",
    blocks: [{ type: "list", items: folded.map((s) => s.title).slice(0, 10), tone: "cyan" }],
    actions: [{ label: "View", kind: "accept", arg: `${MORE_PREFIX}${id}`, primary: true }, { label: "Close", kind: "dismiss" }],
    sound: "none",
    timeoutMs: 0,
  };
  return { show: [first, ...keep, summary], folded, summary };
}
