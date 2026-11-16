/**
 * Free-text → progress entries. `parseLogText` uses claude-haiku-5-5 structured output when
 * Claude is available, else `regexParse`, a small deterministic parser that handles the
 * common shapes: "40 min study", "gym done", "2 meals", "slept 7", "1.5h reading", "water".
 */
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { HabitDef } from "../../engine";
import { agentModels, claudeClient, recordUsage } from "../budget";
import { findHabit } from "./resolve";

export interface LogEntry {
  habit_id: string;
  /** Amount to add, in the habit's unit. */
  delta?: number;
  /** Absolute value to set, in the habit's unit. */
  value?: number;
  unit: string;
  /** The phrase this came from (for display). */
  phrase?: string;
}
export interface ParsedLog { entries: LogEntry[]; unmatched: string[]; parser: "claude" | "regex" }

const DONE = /\b(done|did|finished|complete|completed|crushed|hit|nailed)\b/;
const HOURS = /\b(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours)\b/;
const MINS = /\b(\d+(?:\.\d+)?)\s*(m|min|mins|minute|minutes)\b/;
const NUM = /(\d+(?:\.\d+)?)/;
/** Numbers that measure something other than the goal's unit ("ran 5k", "3 sets"): ignored. */
const OTHER_MEASURE = /\d+(?:\.\d+)?\s*(k|km|mi|miles?|reps?|sets?|kg|lbs?|pages?|cals?|kcal|steps?)\b/g;

export function splitPhrases(text: string): string[] {
  return text
    .split(/[,;\n]+|\s+\band\b\s+|\s+\+\s+|\.\s+|\s+then\s+/i)
    .map((s) => s.trim().replace(/\.$/, ""))
    .filter(Boolean);
}

const round = (n: number) => Math.round(n * 100) / 100;

export function regexParse(text: string, habits: HabitDef[]): ParsedLog {
  const entries: LogEntry[] = [];
  const unmatched: string[] = [];
  for (const phrase of splitPhrases(text)) {
    const p = phrase.toLowerCase().replace(OTHER_MEASURE, " ");
    const h = findHabit(habits, p);
    if (!h) { unmatched.push(phrase); continue; }
    const hrs = p.match(HOURS), mins = p.match(MINS), num = p.match(NUM);
    let amount: number | undefined;
    if (hrs) amount = h.kind === "minutes" ? Number(hrs[1]) * 60 : Number(hrs[1]);
    else if (mins) amount = h.kind === "hours" ? Number(mins[1]) / 60 : Number(mins[1]);
    else if (num) amount = Number(num[1]);
    const e: LogEntry = { habit_id: h.id, unit: h.unit, phrase };
    if (amount === undefined) {
      // "gym done" / "workout" / "water": completes a single-shot goal, +1 for counters.
      if (DONE.test(p) || h.kind === "check") e.value = h.target;
      else e.delta = 1;
    } else if (h.kind === "hours") {
      e.value = round(amount); // sleep-like habits are a total, not an increment
    } else {
      e.delta = round(amount);
    }
    entries.push(e);
  }
  return { entries, unmatched, parser: "regex" };
}

const ClaudeLog = z.object({
  entries: z.array(z.object({
    habit_id: z.string(),
    delta: z.number().nullable(),
    value: z.number().nullable(),
    unit: z.string(),
    phrase: z.string(),
  })),
  unmatched: z.array(z.string()),
});

// Stable (cacheable) instructions; the habit list and the text go in the user turn.
const LOG_SYSTEM = `You convert a player's free-text activity log into progress entries for their habit tracker.
Rules:
- Only use habit ids from the provided list. One entry per distinct activity.
- Convert amounts into the habit's own unit (hours ↔ minutes as needed).
- Use "value" (absolute total) for hour-based totals such as sleep, and for "done"/"finished" on single-session habits (value = the target). Use "delta" (amount to add) for everything else. Set the other field to null.
- A habit mentioned without an amount means +1 for count habits, or value = target for check habits.
- Put any phrase that matches no habit, verbatim, into "unmatched". Never invent activities.
- "phrase" is the part of the text the entry came from.`;

function habitList(habits: HabitDef[]): string {
  return habits.map((h) => `- ${h.id}: "${h.label}" (${h.kind}, target ${h.target} ${h.unit})`).join("\n");
}

/** Parse with Claude when available; the regex parser otherwise (or on any failure). */
export async function parseLogText(text: string, habits: HabitDef[]): Promise<ParsedLog> {
  const c = await claudeClient();
  if (!("client" in c)) return regexParse(text, habits);
  const model = agentModels().cheap;
  try {
    const res = await c.client.messages.parse({
      model,
      max_tokens: 2000,
      output_config: { effort: "low", format: zodOutputFormat(ClaudeLog) },
      system: [{ type: "text", text: LOG_SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: `Habits:\n${habitList(habits)}\n\nLog:\n${text}` }],
    });
    recordUsage(model, res.usage);
    const out = res.parsed_output;
    if (res.stop_reason === "refusal" || !out) return regexParse(text, habits);
    const known = new Map(habits.map((h) => [h.id, h]));
    const entries: LogEntry[] = [];
    const unmatched = [...out.unmatched];
    for (const e of out.entries) {
      const h = known.get(e.habit_id);
      const amount = e.value ?? e.delta;
      if (!h || amount == null || !Number.isFinite(amount)) { unmatched.push(e.phrase || e.habit_id); continue; }
      entries.push(e.value != null ? { habit_id: h.id, value: e.value, unit: h.unit, phrase: e.phrase } : { habit_id: h.id, delta: e.delta!, unit: h.unit, phrase: e.phrase });
    }
    return { entries, unmatched, parser: "claude" };
  } catch (err) {
    console.warn("[agent] log_text: Claude parse failed, using regex", err);
    return regexParse(text, habits);
  }
}
