/**
 * System windows the tool layer opens. All go through agentEnv.show → routeEffects, the same
 * popup path engine effects use. Buttons that need an answer carry `accept` / `decline` with a
 * `proposal:<id>` arg (see src/agent/proposals.ts).
 */
import type { Block, SystemWindowInput } from "../../system/spec";
import { createProposal, proposalArg } from "../proposals";
import { agentEnv } from "../env";
import { revertMany, type LogRecord } from "./log";
import { getState } from "./reads";

export const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

const fmt = (n: number) => String(Math.round(n * 100) / 100);

/** goalRow blocks for the goals a set of records touched (current values). */
function goalRows(recs: LogRecord[]): Block[] {
  const goals = getState()?.today?.goals ?? [];
  const seen = new Set<string>();
  const rows: Block[] = [];
  for (const r of recs) {
    if (seen.has(r.goalId)) continue;
    seen.add(r.goalId);
    const g = goals.find((x) => x.id === r.goalId);
    if (!g) continue;
    rows.push({ type: "goalRow", goalId: g.id, label: clip(g.label, 48), current: g.current, target: g.target, unit: clip(g.unit, 12), stat: g.stat, done: g.done });
  }
  return rows.slice(0, 10);
}

/** "Study for career +40 min" / "Sleep → 7 h" */
export const recLine = (r: LogRecord) => {
  const d = r.next - r.prev;
  return clip(`${r.label} ${d >= 0 ? "+" : ""}${fmt(d)} ${r.unit} (${fmt(r.prev)} → ${fmt(r.next)})`, 140);
};

/** A compact "what changed" window with UNDO, used for MCP writes and log_text(apply:true). Returns true if shown. */
export function showChangeWindow(opts: { title: string; recs: LogRecord[]; lines?: string[]; unmatched?: string[]; footer?: string }): boolean {
  const blocks: Block[] = [];
  if (opts.lines?.length) blocks.push({ type: "list", items: opts.lines.slice(0, 10).map((l) => clip(l, 140)) });
  blocks.push(...goalRows(opts.recs));
  if (opts.unmatched?.length) blocks.push({ type: "text", text: clip(`Not understood: ${opts.unmatched.join(" · ")}`, 400), tone: "dim" });
  const ids = opts.recs.map((r) => r.id);
  const p = ids.length ? createProposal({ kind: "undo", onDecline: () => { revertMany(ids); } }) : undefined;
  const spec: SystemWindowInput = {
    variant: "info", glyph: "diamond", title: clip(opts.title, 80), blocks: blocks.slice(0, 14),
    actions: p
      ? [{ label: "OK", kind: "accept", arg: proposalArg(p.id), primary: true }, { label: "UNDO", kind: "decline", arg: proposalArg(p.id) }]
      : [{ label: "OK", kind: "dismiss", primary: true }],
    footer: opts.footer ? clip(opts.footer, 160) : undefined,
    sound: "ding",
  };
  try { agentEnv.show(spec); return true; } catch (err) { console.warn("[agent] window failed", err); return false; }
}

/** A yes/no approval window. `onAccept` runs only on ACCEPT. Returns the proposal id. */
export function showApprovalWindow(opts: {
  kind: string; title: string; blocks: Block[]; onAccept: () => void | Promise<void>; onDecline?: () => void;
  data?: unknown; variant?: SystemWindowInput["variant"]; footer?: string; acceptLabel?: string;
}): string {
  const p = createProposal({ kind: opts.kind, onAccept: opts.onAccept, onDecline: opts.onDecline, data: opts.data });
  agentEnv.show({
    variant: opts.variant ?? "status", glyph: "diamond", title: clip(opts.title, 80), blocks: opts.blocks.slice(0, 14),
    actions: [
      { label: opts.acceptLabel ?? "ACCEPT", kind: "accept", arg: proposalArg(p.id), primary: true },
      { label: "DECLINE", kind: "decline", arg: proposalArg(p.id) },
    ],
    footer: opts.footer ? clip(opts.footer, 160) : undefined,
    sound: "ding",
    timeoutMs: 0,
  });
  return p.id;
}
