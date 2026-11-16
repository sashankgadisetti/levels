/**
 * Weekly re-evaluation. The agent reads history/status/config and calls propose_targets once with
 * a 3–5 line verdict, target changes within ±25% per habit, and a proposed Gate for next week.
 * The result is ONE approval window; ACCEPT applies the targets (the Gate text is informational).
 * With no API key / budget, or if the agent fails to propose, a deterministic heuristic proposes instead.
 * Offered automatically on Sunday evenings once per ISO week (see maybeOfferReevaluation).
 */
import { isoWeek, localDate, type State } from "../engine";
import { createProposal, proposalArg } from "./proposals";
import { agentEnv } from "./env";
import { runAgent, type RunAgentResult } from "./runner";
import { executeTool } from "./tools";
import { historyData } from "./tools/reads";

export interface ReevaluationResult {
  ok: boolean;
  via: "claude" | "heuristic";
  proposalId?: string;
  text: string;
  agent?: RunAgentResult;
}

export function reevaluationTask(s: State, now: Date): string {
  const date = localDate(now, s.config.player.dayEndsAt);
  return `Today is ${date} (ISO week ${isoWeek(date)}). Run the weekly re-evaluation for player ${s.player.name}.
Steps:
1. Call get_history with days 14, then get_status and get_config.
2. Call propose_targets exactly once with:
   - verdict: 3 to 5 short lines (separated by newlines) judging the past week in the System's voice, citing real numbers.
   - changes: target changes only where the data supports it, each within ±25% of the current target. Raise targets the player clears almost every day; lower targets missed most days; leave the rest. Use habit ids from get_config.
   - reason: one or two sentences explaining the changes.
   - next_gate: one proposed Gate (weekly challenge) for next week, as one line of plain text with a boss name.
3. Reply with one line confirming the proposal was shown. Do not call any other tools.`;
}

/** Offline proposal: raise habits done ≥ 6/7 days by ~10%, lower habits done ≤ 2/7 days by ~15%. */
export function heuristicProposal(s: State): { changes: { habit_id: string; target: number }[]; verdict: string; reason: string; next_gate: string } {
  const hist = historyData(s, 7);
  const changes: { habit_id: string; target: number }[] = [];
  const strong: string[] = [], weak: string[] = [];
  for (const h of s.config.habits) {
    const p = hist.per_habit[h.id];
    if (!p || p.days < 3) continue;
    const rate = p.done / p.days;
    if (rate >= 6 / 7 && h.kind !== "check") { changes.push({ habit_id: h.id, target: h.target * 1.1 }); strong.push(h.label); }
    else if (rate <= 2 / 7) { changes.push({ habit_id: h.id, target: h.target * 0.85 }); weak.push(h.label); }
  }
  const days = hist.days.length;
  const clears = hist.days.filter((d) => d.result === "clear").length;
  const lines = [
    `${days} day(s) reviewed. ${clears} full clear(s).`,
    strong.length ? `Consistent: ${strong.join(", ")}. The load increases.` : "No habit was held every day.",
    weak.length ? `Neglected: ${weak.join(", ")}. The target is reduced. It will not be reduced again.` : "No habit was abandoned.",
    "The System continues to observe.",
  ];
  const weakest = weak[0] ?? s.config.habits[0]?.label ?? "the Daily Quest";
  return {
    changes, verdict: lines.join("\n"),
    reason: changes.length ? "Targets follow last week's completion rate." : "Last week's results do not justify a change.",
    next_gate: `Clear ${weakest} on 5 of 7 days. Boss: the Warden of Habit.`,
  };
}

async function proposeHeuristic(s: State): Promise<ReevaluationResult> {
  const p = heuristicProposal(s);
  const r = await executeTool({ name: "propose_targets", args: p, source: "agent" });
  const id = (r.data as { proposal_id?: string } | undefined)?.proposal_id;
  return { ok: r.ok, via: "heuristic", proposalId: id, text: r.ok ? p.verdict : r.content };
}

let running: Promise<ReevaluationResult> | undefined;

/** Run the re-evaluation (de-duplicated while one is in flight). Always ends with one approval window when it can. */
export function runReevaluation(): Promise<ReevaluationResult> {
  running ??= (async () => {
    const s = agentEnv.store().getState().state;
    if (!s) return { ok: false, via: "heuristic" as const, text: "No state." };
    const agent = await runAgent({
      task: reevaluationTask(s, agentEnv.now()),
      tools: ["get_history", "get_status", "get_config", "propose_targets"],
      maxTurns: 8,
      effort: "medium",
    });
    const proposed = agent.toolCalls.find((c) => c.name === "propose_targets" && c.result.ok);
    if (proposed) {
      const id = (proposed.result.data as { proposal_id?: string } | undefined)?.proposal_id;
      return { ok: true, via: "claude" as const, proposalId: id, text: agent.text, agent };
    }
    const fallback = await proposeHeuristic(agentEnv.store().getState().state ?? s);
    return { ...fallback, agent };
  })().finally(() => { running = undefined; });
  return running;
}

/* ---------- Sunday-evening offer ---------- */
const OFFER_KEY = "levels.agent.reevalOfferedWeek";
const lsGet = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

/** True when it is Sunday ≥ 18:00 local (app clock) and this ISO week has not been offered yet. */
export function shouldOfferReevaluation(now: Date, offeredWeek: string | null): boolean {
  if (now.getDay() !== 0 || now.getHours() < 18) return false;
  return offeredWeek !== isoWeekOf(now);
}
const isoWeekOf = (d: Date) => isoWeek(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);

/** Call periodically (the quick bar does, every minute). Shows the offer window at most once per ISO week. */
export function maybeOfferReevaluation(): boolean {
  const s = agentEnv.store().getState().state;
  if (!s?.player.accepted) return false;
  const now = agentEnv.now();
  if (!shouldOfferReevaluation(now, lsGet(OFFER_KEY))) return false;
  lsSet(OFFER_KEY, isoWeekOf(now));
  const p = createProposal({ kind: "reeval-offer", onAccept: () => { void runReevaluation(); } });
  agentEnv.show({
    variant: "status", glyph: "diamond", title: "WEEKLY RE-EVALUATION",
    blocks: [
      { type: "text", text: "The week is ending. The System will review your record and propose next week's targets and Gate." },
      { type: "text", text: "Nothing changes until you accept the proposal.", tone: "dim" },
    ],
    actions: [{ label: "BEGIN", kind: "accept", arg: proposalArg(p.id), primary: true }, { label: "LATER", kind: "decline", arg: proposalArg(p.id) }],
    sound: "ding", timeoutMs: 0,
  });
  return true;
}
