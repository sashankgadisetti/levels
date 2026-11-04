/** Hand-written System window specs built from State by the UI itself (e.g. "Open System Window"). */
import type { State } from "../engine";
import type { SystemWindowInput } from "../system/spec";
import { vitalMax } from "./derive";

export function statusSpec(s: State): SystemWindowInput {
  const max = vitalMax(s);
  return {
    id: "status",
    variant: "status",
    title: "Status Window",
    glyph: "none",
    sound: "ding",
    timeoutMs: 20_000,
    blocks: [
      { type: "kv", rows: [["Name", s.player.name || "—"], ["Level", String(s.player.level)], ["Job", s.player.job ?? "None"], ["Rank", s.player.rank]] },
      { type: "bar", label: "HP", value: s.vitals.hp, max: max.hp, tone: "red" },
      { type: "bar", label: "MP", value: s.vitals.mp, max: max.mp, tone: "cyan" },
      { type: "bar", label: "Fatigue", value: s.vitals.fatigue, max: max.fatigue, tone: "gold" },
      { type: "divider" },
      ...s.config.stats.map((d) => ({ type: "statRow" as const, stat: d.label, value: s.stats[d.id]?.value ?? 0, locked: d.locked })),
      ...(s.player.abilityPoints > 0 ? [{ type: "text" as const, text: `[Available ability points: ${s.player.abilityPoints}]`, tone: "gold" as const }] : []),
    ],
    actions: [
      { label: "Open Status", kind: "open:status", primary: true },
      { label: "Close", kind: "dismiss" },
    ],
  };
}
