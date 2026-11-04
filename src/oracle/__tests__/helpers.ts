import { DEFAULT_CONFIG } from "../../engine/config";
import type { State, StatId } from "../../engine/types";
import type { OracleClientLike, OracleResponse, OracleUsage } from "../client";
import type Anthropic from "@anthropic-ai/sdk";

export const NOW = new Date(2026, 10, 4, 9, 30); // Wed 2026-11-04 local

export function makeState(over: Partial<State> = {}): State {
  const cfg = { ...DEFAULT_CONFIG, oracle: { ...DEFAULT_CONFIG.oracle, enabled: true } };
  const ids: StatId[] = ["STR", "VIT", "AGI", "INT", "SENSE"];
  const stats = Object.fromEntries(ids.map((i) => [i, { value: 10, xp: 0, allocated: 0 }])) as State["stats"];
  const streaks = Object.fromEntries(ids.map((i) => [i, { stat: i, current: 3, best: 5 }])) as State["streaks"];
  return {
    version: 1, config: cfg,
    player: { accepted: true, name: "HUNTER", level: 12, xp: 40, xpToNext: 200, abilityPoints: 0, rank: "E", equippedTitleId: "t1" },
    stats, vitals: { hp: 80, mp: 50, fatigue: 30 }, gold: 100,
    today: {
      date: "2026-11-04", startedAt: NOW.toISOString(),
      goals: [
        { id: "g-gym", habitId: "gym", stat: "STR", label: "Workout", target: 1, unit: "session", current: 0, done: false },
        { id: "g-study", habitId: "study", stat: "INT", label: "Study for career", target: 60, unit: "min", current: 0, done: false },
        { id: "g-sleep", habitId: "sleep", stat: "SENSE", label: "Sleep", target: 7, unit: "h", current: 7, done: true },
        { id: "g-eat", habitId: "eat", stat: "VIT", label: "Clean meals", target: 3, unit: "meals", current: 1, done: false },
      ],
    },
    history: [{ date: "2026-11-03", startedAt: "", result: "partial", goals: [
      { id: "a", habitId: "gym", stat: "STR", label: "Workout", target: 1, unit: "session", current: 1, done: true },
      { id: "b", habitId: "eat", stat: "VIT", label: "Clean meals", target: 3, unit: "meals", current: 1, done: false },
    ] }],
    streaks, inventory: [], boxes: 0, rewards: [], spentThisMonthUsd: 0,
    titles: [{ id: "t1", name: "WOLF ASSASSIN", effect: "", unlockedAt: "" }],
    skills: [], shadows: [], dungeonsCleared: 0, gatesCleared: 0,
    ...over,
  };
}

export const goodDayStart = (state: State) => ({
  variant: "quest", title: "[DAILY QUEST: PREPARATION TO BECOME POWERFUL]", glyph: "diamond",
  blocks: [
    { type: "text", text: "Yesterday: partial clear. Fatigue noted.", tone: "dim" },
    ...state.today!.goals.map((g) => ({ type: "goalRow", goalId: g.id, label: g.label, current: g.current, target: g.target, unit: g.unit, stat: g.stat })),
  ],
  actions: [{ label: "ACCEPT", kind: "accept", primary: true }, { label: "LATER", kind: "dismiss" }],
  sound: "ding",
});

export const USAGE: OracleUsage = { input_tokens: 2000, output_tokens: 500, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };

export function mockClient(replies: (OracleResponse | Error)[] | ((p: Anthropic.MessageCreateParamsNonStreaming) => OracleResponse)) {
  const calls: Anthropic.MessageCreateParamsNonStreaming[] = [];
  let i = 0;
  const client: OracleClientLike = {
    messages: {
      async create(params) {
        calls.push(params);
        if (typeof replies === "function") return replies(params);
        const r = replies[Math.min(i++, replies.length - 1)];
        if (r instanceof Error) throw r;
        return r;
      },
    },
  };
  return { client, calls, factory: () => client };
}

export const reply = (obj: unknown, over: Partial<OracleResponse> = {}): OracleResponse => ({
  content: [{ type: "text", text: typeof obj === "string" ? obj : JSON.stringify(obj) }],
  stop_reason: "end_turn", usage: USAGE, ...over,
});
