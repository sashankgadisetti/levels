import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../../engine";
import { handleAction } from "../../store/actions";
import { setGameStore } from "../../store/game";
import { TOOL_NAMES } from "../contract";
import { getProposal, resolveProposal } from "../proposals";
import { TOOLS, toolHost } from "../tools";
import { regexParse } from "../tools/parse";
import { heuristicProposal, runReevaluation, shouldOfferReevaluation } from "../reevaluate";
import { setupAgentStore } from "./helpers";

const run = (name: string, args: Record<string, unknown> = {}, source: "mcp" | "agent" | "ui" = "agent") => toolHost.execute({ name, args, source });

describe("tool definitions", () => {
  it("defines every canonical tool with a draft-07 object schema and additionalProperties:false", () => {
    expect(TOOLS.map((t) => t.name)).toEqual([...TOOL_NAMES]);
    expect(toolHost.listTools()).toBe(TOOLS);
    for (const t of TOOLS) {
      expect(t.inputSchema.type).toBe("object");
      expect(t.inputSchema.additionalProperties).toBe(false);
      expect(String(t.inputSchema.$schema)).toContain("draft-07");
      expect(t.description.length).toBeGreaterThan(40);
    }
    expect(TOOLS.find((t) => t.name === "get_status")!.mutating).toBe(false);
    expect(TOOLS.find((t) => t.name === "log_progress")!.mutating).toBe(true);
  });

  it("rejects unknown tools and invalid arguments without throwing", async () => {
    await setupAgentStore();
    expect((await run("nope")).ok).toBe(false);
    const bad = await run("get_history", { days: 500 });
    expect(bad.ok).toBe(false);
    expect(bad.content).toMatch(/days/);
    expect((await run("get_status", { extra: 1 })).ok).toBe(false);
  });
});

describe("read tools", () => {
  beforeEach(async () => { await setupAgentStore(); });

  it("every read tool returns ok with content and data", async () => {
    for (const [name, args] of [["get_status", {}], ["get_today", {}], ["get_history", { days: 7 }], ["get_config", {}], ["list_rewards", {}]] as const) {
      const r = await run(name, args);
      expect(r.ok, name).toBe(true);
      expect(r.content.length, name).toBeGreaterThan(10);
      expect(r.data, name).toBeTruthy();
    }
  });

  it("returns the requested slice of history and today's goals with ids", async () => {
    const h = await run("get_history", { days: 7 });
    expect((h.data as { days: unknown[] }).days).toHaveLength(7);
    const t = await run("get_today");
    const goals = (t.data as { goals: { habit_id: string; current: number }[] }).goals;
    expect(goals.find((g) => g.habit_id === "study")!.current).toBe(25);
    expect(t.content).toContain("goal_id");
  });
});

describe("write tools", () => {
  it("log_progress resolves a goal by fuzzy label and logs a delta", async () => {
    const { goal, show } = await setupAgentStore();
    const r = await run("log_progress", { label: "studying", delta: 20 });
    expect(r.ok).toBe(true);
    expect(goal("study").current).toBe(45);
    expect(show).not.toHaveBeenCalled(); // agent-source logging opens no window of its own
    const m = await run("log_progress", { label: "meals", value: 2 });
    expect(m.ok).toBe(true);
    expect(goal("eat").current).toBe(2);
    expect((await run("log_progress", { label: "basket weaving", delta: 1 })).ok).toBe(false);
  });

  it("undo_last_log reverts the most recent entry with GOAL_SET", async () => {
    const { goal } = await setupAgentStore();
    await run("log_progress", { habit_id: "study", delta: 30 });
    await run("log_progress", { habit_id: "eat", delta: 1 });
    expect(goal("study").current).toBe(55);
    expect((await run("undo_last_log")).ok).toBe(true);
    expect(goal("eat").current).toBe(0);
    expect((await run("undo_last_log")).ok).toBe(true);
    expect(goal("study").current).toBe(25);
    expect((await run("undo_last_log")).ok).toBe(false);
  });

  it("MCP writes apply immediately and open a compact window whose UNDO reverts", async () => {
    const { goal, shown } = await setupAgentStore();
    const r = await run("log_progress", { label: "study", delta: 10 }, "mcp");
    expect(r.ok && r.windowShown).toBe(true);
    expect(goal("study").current).toBe(35);
    const undo = shown[0].actions!.find((a) => a.label === "UNDO")!;
    handleAction({ label: "UNDO", kind: "decline", arg: undo.arg }); // through the store's action hook
    await Promise.resolve();
    expect(goal("study").current).toBe(25);
  });

  it("complete_goal, answer_checkin, rewards and open_screen work", async () => {
    const { goal, openScreen, store } = await setupAgentStore();
    expect((await run("complete_goal", { label: "meals" })).ok).toBe(true);
    expect(goal("eat").done).toBe(true);
    expect((await run("answer_checkin", { habit_id: "water", yes: true })).ok).toBe(true);
    const add = await run("add_reward", { name: "Book", usd: 5 });
    expect(add.ok).toBe(true);
    const id = (add.data as { reward_id: string }).reward_id;
    const buy = await run("buy_reward", { reward_id: id });
    expect(buy.ok).toBe(true);
    expect(store.getState().state!.rewards.find((r) => r.id === id)!.purchasedAt).toBeTruthy();
    expect((await run("open_screen", { screen: "shop" })).ok).toBe(true);
    expect(openScreen).toHaveBeenCalledWith("shop");
    expect((await run("ask_system", { question: "why?" })).content).toContain("why?");
  });

  it("take_rest_day dispatches GOAL_RESTED for a habit with rest days", async () => {
    const { goal, store } = await setupAgentStore();
    // gym is already done in the fixture; undo that first so it can rest
    store.getState().dispatch({ type: "GOAL_SET", goalId: goal("gym").id, value: 0 });
    const r = await run("take_rest_day", { habit_id: "gym" });
    expect(r.ok, r.content).toBe(true);
    expect(goal("gym").rest).toBe(true);
    expect((await run("take_rest_day", { habit_id: "study" })).ok).toBe(false);
  });

  it("log_past_day amends yesterday: marks its goals complete and records the day", async () => {
    const { store } = await setupAgentStore();
    const r = await run("log_past_day", { days_ago: 1 });
    expect(r.ok, r.content).toBe(true);
    expect(r.content).toMatch(/RECORD AMENDED/);
    const data = r.data as { date: string; done: number; total: number; result?: string };
    expect(data.done).toBe(data.total);
    const day = store.getState().state!.history.find((d) => d.date === data.date);
    expect(day?.goals.every((g) => g.done)).toBe(true);
    // a second call has nothing left to log
    expect((await run("log_past_day", { date: data.date })).ok).toBe(false);
  });

  it("propose_targets opens an approval window; ACCEPT applies CONFIG_CHANGED, clamped to ±25% for the agent", async () => {
    const { store, shown } = await setupAgentStore();
    setGameStore(store);
    const r = await run("propose_targets", { changes: [{ habit_id: "study", target: 200 }], reason: "You clear it daily." });
    expect(r.ok).toBe(true);
    expect(r.content).toBe("Proposal shown to the player");
    expect(r.windowShown).toBe(true);
    const id = (r.data as { proposal_id: string }).proposal_id;
    expect(getProposal(id)).toBeTruthy();
    expect(shown[0].actions!.map((a) => a.kind)).toEqual(["accept", "decline"]);
    expect(store.getState().state!.config.habits.find((h) => h.id === "study")!.target).toBe(60); // not yet
    expect(await resolveProposal(id, true)).toBe(true);
    expect(store.getState().state!.config.habits.find((h) => h.id === "study")!.target).toBe(75); // 60 * 1.25
    expect(await resolveProposal(id, true)).toBe(false); // only once
  });

  it("DECLINE leaves the config alone", async () => {
    const { store } = await setupAgentStore();
    const r = await run("propose_targets", { changes: [{ habit_id: "eat", target: 2 }], reason: "x" }, "mcp");
    await resolveProposal((r.data as { proposal_id: string }).proposal_id, false);
    expect(store.getState().state!.config.habits.find((h) => h.id === "eat")!.target).toBe(3);
  });
});

describe("log_text", () => {
  it("regex fallback parses the canonical sentence", () => {
    const p = regexParse("gym done, 40 min study, 2 meals, slept 7", DEFAULT_CONFIG.habits);
    expect(p.unmatched).toEqual([]);
    const by = Object.fromEntries(p.entries.map((e) => [e.habit_id, e]));
    expect(by.gym).toMatchObject({ value: 1 });
    expect(by.study).toMatchObject({ delta: 40 });
    expect(by.eat).toMatchObject({ delta: 2 });
    expect(by.sleep).toMatchObject({ value: 7 });
  });

  it("handles hours→minutes, other measures and unmatched phrases", () => {
    const p = regexParse("1.5h reading and walked the dog; ran 5k", DEFAULT_CONFIG.habits);
    expect(p.entries.find((e) => e.habit_id === "study")).toMatchObject({ delta: 90 });
    expect(p.entries.find((e) => e.habit_id === "gym")).toMatchObject({ delta: 1 });
    expect(p.unmatched).toEqual(["walked the dog"]);
  });

  it("apply:false from the UI opens a confirmation window; ACCEPT logs (offline, no API key)", async () => {
    const { goal, shown } = await setupAgentStore();
    const r = await run("log_text", { text: "40 min study, 2 meals, bought milk" }, "ui");
    expect(r.ok).toBe(true);
    expect((r.data as { parser: string }).parser).toBe("regex");
    expect(goal("study").current).toBe(25); // nothing applied yet
    expect(shown).toHaveLength(1);
    const text = JSON.stringify(shown[0].blocks);
    expect(text).toContain("bought milk");
    await resolveProposal(shown[0].actions![0].arg!, true);
    expect(goal("study").current).toBe(60); // the engine caps progress at the target
    expect(goal("eat").current).toBe(2);
  });

  it("apply:true logs immediately and the [LOGGED] window's UNDO reverts every entry", async () => {
    const { goal, shown } = await setupAgentStore();
    const r = await run("log_text", { text: "40 min study, 2 meals", apply: true }, "mcp");
    expect(r.ok && r.windowShown).toBe(true);
    expect(goal("study").current).toBe(60); // the engine caps progress at the target
    expect(shown[0].title).toBe("LOGGED");
    const undo = shown[0].actions!.find((a) => a.label === "UNDO")!;
    await resolveProposal(undo.arg!, false);
    expect(goal("study").current).toBe(25);
    expect(goal("eat").current).toBe(0);
  });
});

describe("re-evaluation", () => {
  it("falls back to a heuristic proposal offline, shown as one approval window", async () => {
    const { shown, store } = await setupAgentStore();
    const h = heuristicProposal(store.getState().state!);
    expect(h.verdict.split("\n").length).toBeGreaterThanOrEqual(3);
    const r = await runReevaluation();
    expect(r.ok).toBe(true);
    expect(r.via).toBe("heuristic");
    expect(shown).toHaveLength(1);
    expect(shown[0].title).toBe("WEEKLY RE-EVALUATION");
    expect(JSON.stringify(shown[0].blocks)).toContain("NEXT GATE");
  });

  it("offers on Sunday after 18:00, once per ISO week", () => {
    const sun = new Date(2026, 10, 22, 18, 30);
    expect(shouldOfferReevaluation(sun, null)).toBe(true);
    expect(shouldOfferReevaluation(sun, "2026-W47")).toBe(false);
    expect(shouldOfferReevaluation(new Date(2026, 10, 22, 17, 0), null)).toBe(false);
    expect(shouldOfferReevaluation(new Date(2026, 10, 21, 20, 0), null)).toBe(false);
  });
});
