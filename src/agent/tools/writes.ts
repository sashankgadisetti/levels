/**
 * Write tools. Every mutation is an engine event through the store.
 *   source "mcp"   → applies immediately and opens a compact System window of what changed (UNDO where it applies)
 *   source "agent" → plan changes (targets) go through an approval window; logging applies immediately
 *   source "ui"    → applies; log_text without apply opens the confirmation window
 */
import { selectors, type HabitDef, type State } from "../../engine";
import { uid } from "../../lib/format";
import type { EventInput } from "../../store/game";
import type { Block } from "../../system/spec";
import type { ToolResult } from "../contract";
import { agentEnv } from "../env";
import { applyProgress, lastToday, noteChange, revert, type LogRecord } from "./log";
import { parseLogText, type LogEntry, type ParsedLog } from "./parse";
import { getState, noState } from "./reads";
import { resolveGoal, resolveReward } from "./resolve";
import { SCHEMAS } from "./schemas";
import { defineTool, fail, ok, type ToolCtx, type ToolSpec } from "./types";
import { clip, recLine, showApprovalWindow, showChangeWindow } from "./windows";

const dispatch = (e: EventInput) => agentEnv.store().getState().dispatch(e);

const MCP_FOOTER = "Applied at your request via Claude.";
const goalSummary = (s: State | undefined, goalId: string) => {
  const g = s?.today?.goals.find((x) => x.id === goalId);
  return g ? { goal_id: g.id, habit_id: g.habitId, label: g.label, current: g.current, target: g.target, unit: g.unit, done: g.done } : undefined;
};

function withWindow(ctx: ToolCtx, result: ToolResult, show: () => boolean): ToolResult {
  if (ctx.source !== "mcp" || !result.ok) return result;
  return { ...result, windowShown: show() };
}

/** Apply parsed entries to today's goals. */
export function applyEntries(entries: LogEntry[]): { recs: LogRecord[]; skipped: string[] } {
  const recs: LogRecord[] = [];
  const skipped: string[] = [];
  for (const e of entries) {
    const s = getState();
    const r = s && resolveGoal(s, { habit_id: e.habit_id });
    if (!r?.goal) { skipped.push(e.phrase ?? e.habit_id); continue; }
    const rec = applyProgress(r.goal.id, e.value !== undefined ? { value: e.value } : { delta: e.delta ?? 0 });
    if (rec) recs.push(rec);
  }
  return { recs, skipped };
}

const entryLine = (e: LogEntry, habits: HabitDef[]) => {
  const h = habits.find((x) => x.id === e.habit_id);
  const name = h?.label ?? e.habit_id;
  return clip(e.value !== undefined ? `${name} → ${e.value} ${e.unit}` : `${name} ${e.delta! >= 0 ? "+" : ""}${e.delta} ${e.unit}`, 140);
};

/** The quick bar's confirmation window: parsed entries, unmatched phrases dimmed, ACCEPT applies. */
export function showLogProposal(parsed: ParsedLog): string | undefined {
  const s = getState();
  if (!s) return undefined;
  const habits = s.config.habits;
  const blocks: Block[] = [];
  if (parsed.entries.length) blocks.push({ type: "list", items: parsed.entries.slice(0, 10).map((e) => entryLine(e, habits)) });
  else blocks.push({ type: "text", text: "Nothing in that matched a goal." });
  if (parsed.unmatched.length) blocks.push({ type: "text", text: clip(`Not understood: ${parsed.unmatched.join(" · ")}`, 400), tone: "dim" });
  if (!parsed.entries.length) {
    agentEnv.show({ variant: "info", title: "LOG NOT RECOGNISED", glyph: "alert", blocks, actions: [{ label: "OK", kind: "dismiss", primary: true }], sound: "ding" });
    return undefined;
  }
  return showApprovalWindow({
    kind: "log_text", title: "CONFIRM PROGRESS", variant: "quest", blocks, data: parsed,
    footer: parsed.parser === "claude" ? "Parsed by the System (Claude)." : "Parsed offline.",
    onAccept: () => { applyEntries(parsed.entries); },
  });
}

export const WRITE_TOOLS: ToolSpec[] = [
  defineTool({
    name: "log_progress", mutating: true, schema: SCHEMAS.log_progress,
    description: "Log numeric progress on one of today's goals. Identify the goal by goal_id (from get_today), habit_id, or a fuzzy label. Give delta to add (e.g. delta 40 for \"studied 40 minutes\" on a minutes goal, delta 2 for two meals) or value to set an absolute total (e.g. value 7 for \"slept 7 hours\"). Amounts are in the goal's own unit. Undo with undo_last_log.",
    run(args, ctx) {
      const s = getState(); if (!s) return noState();
      if (args.delta === undefined && args.value === undefined) return fail("Give delta or value.");
      const r = resolveGoal(s, args);
      if (!r.goal) return fail(r.error ?? "Goal not found.");
      const rec = applyProgress(r.goal.id, args.value !== undefined ? { value: args.value } : { delta: args.delta });
      const g = goalSummary(getState(), r.goal.id)!;
      if (!rec) return ok(`No change: ${g.label} is already ${g.current}/${g.target} ${g.unit}.`, g);
      const res = ok(`[LOGGED] ${recLine(rec)}${g.done ? " · goal complete" : ""}`, { ...g, previous: rec.prev });
      return withWindow(ctx, res, () => showChangeWindow({ title: "PROGRESS LOGGED", recs: [rec], footer: MCP_FOOTER }));
    },
  }),
  defineTool({
    name: "log_text", mutating: true, schema: SCHEMAS.log_text,
    description: "Parse a free-text activity log (\"gym done, 40 min study, 2 meals, slept 7\") into progress entries for today's goals. With apply:false (default) it only returns the parsed entries and phrases it could not match; with apply:true it logs them and shows the player a confirmation window with UNDO. Prefer this over several log_progress calls when the player describes their day in words.",
    async run(args, ctx) {
      const s = getState(); if (!s) return noState();
      if (!s.today) return fail("No quest is open today.");
      const habits = s.config.habits.filter((h) => s.today!.goals.some((g) => g.habitId === h.id));
      const parsed = await parseLogText(args.text, habits);
      const proposal = { entries: parsed.entries, unmatched: parsed.unmatched, parser: parsed.parser };
      if (!args.apply) {
        const lines = parsed.entries.map((e) => entryLine(e, habits));
        const content = parsed.entries.length
          ? `[PROPOSED] ${lines.join("; ")}${parsed.unmatched.length ? ` · unmatched: ${parsed.unmatched.join(", ")}` : ""}`
          : `[PROPOSED] nothing matched a goal${parsed.unmatched.length ? ` (unmatched: ${parsed.unmatched.join(", ")})` : ""}`;
        if (ctx.source === "ui") {
          const id = showLogProposal(parsed);
          return ok(content, { ...proposal, proposal_id: id ?? null }, true);
        }
        return ok(content, proposal);
      }
      const { recs, skipped } = applyEntries(parsed.entries);
      const unmatched = [...parsed.unmatched, ...skipped];
      const shown = recs.length > 0 || unmatched.length > 0
        ? showChangeWindow({ title: "LOGGED", recs, lines: recs.map(recLine), unmatched, footer: ctx.source === "mcp" ? MCP_FOOTER : undefined })
        : false;
      const content = recs.length ? `[LOGGED] ${recs.map(recLine).join("; ")}${unmatched.length ? ` · unmatched: ${unmatched.join(", ")}` : ""}` : `Nothing logged${unmatched.length ? ` (unmatched: ${unmatched.join(", ")})` : ""}.`;
      return { ...ok(content, { ...proposal, applied: recs.map((r) => goalSummary(getState(), r.goalId)), unmatched }), windowShown: shown };
    },
  }),
  defineTool({
    name: "complete_goal", mutating: true, schema: SCHEMAS.complete_goal,
    description: "Mark one of today's goals fully done (sets progress to its target). Identify it by goal_id, habit_id or fuzzy label. Use when the player says they finished something without an amount, e.g. \"did my workout\".",
    run(args, ctx) {
      const s = getState(); if (!s) return noState();
      const r = resolveGoal(s, args);
      if (!r.goal) return fail(r.error ?? "Goal not found.");
      if (r.goal.done) return ok(`${r.goal.label} is already complete.`, goalSummary(s, r.goal.id));
      const rec = applyProgress(r.goal.id, { value: Math.max(r.goal.target, r.goal.current) });
      const g = goalSummary(getState(), r.goal.id)!;
      if (!rec) return fail(`Could not complete ${r.goal.label}.`);
      return withWindow(ctx, ok(`[QUEST COMPLETE] ${g.label} ${g.current}/${g.target} ${g.unit}`, g), () => showChangeWindow({ title: "GOAL COMPLETE", recs: [rec], footer: MCP_FOOTER }));
    },
  }),
  defineTool({
    name: "answer_checkin", mutating: true, schema: SCHEMAS.answer_checkin,
    description: "Answer a yes/no check-in for a habit that uses them (e.g. water). yes:true counts one check-in toward today's target; yes:false just records the answer.",
    run(args, ctx) {
      const s = getState(); if (!s) return noState();
      const goal = s.today?.goals.find((g) => g.habitId === args.habit_id);
      const habit = s.config.habits.find((h) => h.id === args.habit_id);
      if (!habit) return fail(`Unknown habit "${args.habit_id}". Habits: ${s.config.habits.map((h) => h.id).join(", ")}`);
      const prev = goal?.current ?? 0;
      dispatch({ type: "CHECKIN_ANSWERED", habitId: args.habit_id, yes: args.yes });
      const rec = goal ? noteChange(goal.id, prev) : null;
      const g = goal ? goalSummary(getState(), goal.id) : undefined;
      const res = ok(args.yes ? `[CHECK-IN] ${habit.label}: yes${g ? ` · ${g.current}/${g.target} ${g.unit}` : ""}` : `[CHECK-IN] ${habit.label}: not yet.`, g ?? { habit_id: args.habit_id, yes: args.yes });
      return withWindow(ctx, res, () => (rec ? showChangeWindow({ title: "CHECK-IN RECORDED", recs: [rec], footer: MCP_FOOTER }) : false));
    },
  }),
  defineTool({
    name: "take_rest_day", mutating: true, schema: SCHEMAS.take_rest_day,
    description: "Use one of the habit's weekly rest days today (only habits with rest days, e.g. the workout; or a STR goal when fatigue is high). The goal counts as rested. Identify the goal by goal_id, habit_id or fuzzy label.",
    run(args, ctx) {
      const s = getState(); if (!s) return noState();
      const r = resolveGoal(s, args);
      if (!r.goal) return fail(r.error ?? "Goal not found.");
      const g = r.goal;
      if (!selectors.canRest(s, g)) {
        const why = g.done ? "it is already complete" : g.rest ? "it is already a rest day" : "no rest day is left this week for it";
        return fail(`Cannot rest ${g.label}: ${why}.`);
      }
      dispatch({ type: "GOAL_RESTED", goalId: g.id });
      const after = getState()?.today?.goals.find((x) => x.id === g.id);
      if (!after?.rest) return fail(`The System refused the rest day for ${g.label}.`);
      return withWindow(ctx, ok(`[REST DAY] ${g.label} rests today.`, goalSummary(getState(), g.id)), () => {
        agentEnv.show({ variant: "info", glyph: "diamond", title: "REST DAY TAKEN", blocks: [{ type: "text", text: clip(`${g.label} rests today. Recovery is part of the training.`, 400) }], actions: [{ label: "OK", kind: "dismiss", primary: true }], footer: MCP_FOOTER, sound: "ding" });
        return true;
      });
    },
  }),
  defineTool({
    name: "undo_last_log", mutating: true, schema: SCHEMAS.undo_last_log,
    description: "Revert the most recent progress entry made through these tools today (log_progress, log_text, complete_goal, check-ins), restoring the goal's previous value. Call repeatedly to step further back.",
    run(_args, ctx) {
      const rec = lastToday();
      if (!rec) return fail("Nothing to undo today.");
      if (!revert(rec)) return fail("That entry can no longer be undone.");
      const g = goalSummary(getState(), rec.goalId);
      const res = ok(`[UNDONE] ${rec.label} back to ${rec.prev} ${rec.unit}.`, { ...g, reverted: { from: rec.next, to: rec.prev } });
      return withWindow(ctx, res, () => {
        agentEnv.show({ variant: "info", glyph: "diamond", title: "ENTRY REVERTED", blocks: [{ type: "text", text: clip(`${rec.label}: ${rec.next} → ${rec.prev} ${rec.unit}`, 400) }], actions: [{ label: "OK", kind: "dismiss", primary: true }], footer: MCP_FOOTER, sound: "none" });
        return true;
      });
    },
  }),
  defineTool({
    name: "add_reward", mutating: true, schema: SCHEMAS.add_reward,
    description: "Add a real-world reward to the shop (name and USD price; the gold price is derived). Use when the player wants to save up for something.",
    run(args, ctx) {
      const s = getState(); if (!s) return noState();
      const id = uid();
      dispatch({ type: "REWARD_ADDED", reward: { id, name: args.name.trim(), usd: args.usd, url: args.url, stat: args.stat, note: args.note } });
      const r = getState()?.rewards.find((x) => x.id === id);
      if (!r) return fail("The System could not add that reward.");
      const price = selectors.goldPriceOf(r, getState()!);
      return withWindow(ctx, ok(`[SHOP] Added ${r.name}: ${price} G ($${r.usd}).`, { reward_id: id, name: r.name, usd: r.usd, gold_price: price }), () => {
        agentEnv.show({ variant: "shop", glyph: "box", title: "REWARD ADDED", blocks: [{ type: "itemCard", name: clip(r.name, 48), rarity: "rare", description: clip(r.note ?? "A real-world reward.", 200), goldPrice: price, usdPrice: r.usd }], actions: [{ label: "OPEN SHOP", kind: "open:shop", primary: true }, { label: "OK", kind: "dismiss" }], footer: MCP_FOOTER, sound: "ding" });
        return true;
      });
    },
  }),
  defineTool({
    name: "buy_reward", mutating: true, schema: SCHEMAS.buy_reward,
    description: "Buy a reward from the shop with gold (by reward_id from list_rewards, or fuzzy name). Fails if gold is short, the monthly budget is spent, the shop is locked by a penalty, or it was already bought.",
    run(args, ctx) {
      const s = getState(); if (!s) return noState();
      const r = resolveReward(s, args);
      if (!r) return fail(`No reward matches. Use list_rewards for ids.`);
      const chk = selectors.canPurchase(r, s);
      if (!chk.ok) return fail(`Cannot buy ${r.name}: ${chk.reason} (price ${chk.price} G, you have ${s.gold} G).`);
      dispatch({ type: "REWARD_PURCHASED", rewardId: r.id });
      const after = getState()?.rewards.find((x) => x.id === r.id);
      if (!after?.purchasedAt) return fail(`The purchase of ${r.name} did not go through.`);
      return withWindow(ctx, ok(`[PURCHASED] ${r.name} for ${chk.price} G. ${getState()!.gold} G left.`, { reward_id: r.id, gold_paid: chk.price, gold: getState()!.gold }), () => {
        agentEnv.show({ variant: "reward", glyph: "crown", title: "REWARD PURCHASED", blocks: [{ type: "text", text: clip(`${r.name} — ${chk.price} G spent. Enjoy it. You earned it.`, 400), tone: "gold" }], actions: [{ label: "OK", kind: "dismiss", primary: true }], footer: MCP_FOOTER, sound: "ding" });
        return true;
      });
    },
  }),
  defineTool({
    name: "open_screen", mutating: false, schema: SCHEMAS.open_screen,
    description: "Bring the Levels window forward on a screen: daily (Daily Quest), status, shop, inventory, shadows, titles, settings.",
    run(args) {
      agentEnv.openScreen(args.screen);
      return ok(`Opened ${args.screen}.`, { screen: args.screen });
    },
  }),
  defineTool({
    name: "ask_system", mutating: false, schema: SCHEMAS.ask_system,
    description: "Route a question to the System (the in-app Oracle, which sees a digest of the player's state) and return its answer as text. Needs the Oracle enabled with an API key and budget left.",
    async run(args) {
      const s = getState(); if (!s) return noState();
      const text = await agentEnv.ask(args.question);
      if (!text) return fail("The System did not answer (Oracle off, no API key, or daily budget spent).");
      return ok(text, { answer: text });
    },
  }),
  defineTool({
    name: "propose_targets", mutating: true, schema: SCHEMAS.propose_targets,
    description: "Propose new daily targets for habits. Nothing changes until the player presses ACCEPT in the approval window this opens. Include a short reason; optionally a 3–5 line verdict on the week and a proposed Gate (weekly challenge) for next week. From the in-app agent each change is clamped to ±25% of the current target. Returns immediately with \"Proposal shown to the player\".",
    run(args, ctx) {
      const s = getState(); if (!s) return noState();
      const changes: { habit_id: string; label: string; unit: string; from: number; to: number }[] = [];
      const unknown: string[] = [];
      for (const c of args.changes) {
        const h = s.config.habits.find((x) => x.id === c.habit_id);
        if (!h) { unknown.push(c.habit_id); continue; }
        let to = c.target;
        if (ctx.source === "agent") to = Math.min(h.target * 1.25, Math.max(h.target * 0.75, to));
        to = h.kind === "count" || h.kind === "check" ? Math.max(1, Math.round(to)) : h.kind === "minutes" ? Math.max(5, Math.round(to / 5) * 5) : Math.round(to * 2) / 2;
        if (to !== h.target) changes.push({ habit_id: h.id, label: h.label, unit: h.unit, from: h.target, to });
      }
      if (!changes.length && !args.verdict && !args.next_gate) return fail(unknown.length ? `Unknown habit ids: ${unknown.join(", ")}` : "No target would change.");
      const blocks: Block[] = [];
      if (args.verdict) blocks.push({ type: "text", text: clip(args.verdict.trim(), 400) });
      if (changes.length) {
        blocks.push({ type: "divider" });
        blocks.push({ type: "kv", rows: changes.slice(0, 12).map((c) => [clip(c.label, 32), clip(`${c.from} → ${c.to} ${c.unit}`, 64)] as [string, string]) });
      } else blocks.push({ type: "text", text: "Targets hold.", tone: "dim" });
      blocks.push({ type: "text", text: clip(args.reason, 400), tone: "dim" });
      if (args.next_gate) blocks.push({ type: "text", text: clip(`NEXT GATE: ${args.next_gate}`, 400), tone: "gold" });
      const title = args.verdict ? "WEEKLY RE-EVALUATION" : "TARGET REVISION PROPOSED";
      const proposalId = showApprovalWindow({
        kind: "targets", title, blocks, data: { changes, reason: args.reason, verdict: args.verdict, next_gate: args.next_gate },
        footer: changes.length ? "ACCEPT applies the new targets from the next quest." : undefined,
        onAccept: () => {
          if (!changes.length) return;
          const cur = agentEnv.store().getState().state;
          if (!cur) return;
          const habits = cur.config.habits.map((h) => {
            const c = changes.find((x) => x.habit_id === h.id);
            return c ? { ...h, target: c.to } : h;
          });
          agentEnv.store().getState().dispatch({ type: "CONFIG_CHANGED", patch: { habits } });
        },
      });
      return ok("Proposal shown to the player", { proposal_id: proposalId, changes, unknown, next_gate: args.next_gate ?? null }, true);
    },
  }),
];
