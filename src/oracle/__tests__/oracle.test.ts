import { describe, expect, it, vi } from "vitest";
import { createOracle, costOf, handleOracleEffect, MemoryOracleCache } from "../index";
import { goodDayStart, makeState, mockClient, NOW, reply, USAGE } from "./helpers";

const setup = (replies: Parameters<typeof mockClient>[0], state = makeState(), cache = new MemoryOracleCache()) => {
  const m = mockClient(replies);
  const log = vi.fn();
  const oracle = createOracle({
    getApiKey: () => "sk-test", config: state.config.oracle, cache, now: () => NOW, client: m.factory, log,
  });
  return { ...m, oracle, state, cache, log };
};

describe("oracle client", () => {
  it("returns a generated spec for a valid dayStart reply", async () => {
    const state = makeState();
    const t = setup([reply(goodDayStart(state))], state);
    const r = await t.oracle.dayStart(state);
    expect(r?.spec.generated).toBe(true);
    expect(r?.spec.title).toBe("DAILY QUEST: PREPARATION TO BECOME POWERFUL"); // brackets stripped
    expect(r?.spec.blocks.filter((b) => b.type === "goalRow")).toHaveLength(4);
    expect(t.calls).toHaveLength(1);
  });

  it("sends documented request shape", async () => {
    const state = makeState();
    const t = setup([reply(goodDayStart(state))], state);
    await t.oracle.dayStart(state);
    const p = t.calls[0] as any;
    expect(p.model).toBe("claude-opus-5-5");
    expect(p.thinking).toEqual({ type: "adaptive" });
    expect(p.output_config.format.type).toBe("json_schema");
    expect(p.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(p.budget_tokens).toBeUndefined();
    expect(p.messages).toHaveLength(1);
    expect(p.messages[0].role).toBe("user");
  });

  it("uses the flavor model for commentary and shadowName", async () => {
    const state = makeState();
    const info = { variant: "info", title: "NOTICE", blocks: [{ type: "text", text: "Acceptable." }], actions: [], sound: "none" };
    const shadow = { variant: "shadow", title: "SHADOW EXTRACTION", blocks: [{ type: "shadow", name: "Veyr", rank: "Normal Soldier", epithet: "Keeper." }], actions: [], sound: "arise" };
    const t = setup([reply(info), reply(shadow)], state);
    expect((await t.oracle.commentary(state, "quest complete"))?.spec.actions[0].kind).toBe("dismiss");
    expect((await t.oracle.shadowName(state, "SENSE"))?.spec.blocks[0].type).toBe("shadow");
    expect(t.calls.map((c) => c.model)).toEqual(["claude-haiku-5-5", "claude-haiku-5-5"]);
  });

  it("returns null on invalid JSON", async () => {
    const t = setup([reply("not json {")]);
    expect(await t.oracle.ask(t.state, "why is VIT low")).toBeNull();
    expect(t.log).toHaveBeenCalledTimes(1);
  });

  it("returns null when a disallowed action kind is used (zod)", async () => {
    const state = makeState();
    const bad = { ...goodDayStart(state), actions: [{ label: "WIPE", kind: "delete:save" }] };
    expect(await setup([reply(bad)], state).oracle.dayStart(state)).toBeNull();
  });

  it("strips valid-but-mutating actions outside the Oracle allow-list", async () => {
    const state = makeState();
    const spec = { ...goodDayStart(state), actions: [{ label: "DONE", kind: "complete:goal", arg: "g-gym" }] };
    const r = await setup([reply(spec)], state).oracle.dayStart(state);
    expect(r?.spec.actions.map((a) => a.kind)).toEqual(["dismiss"]);
  });

  it("rejects dayStart with unknown goal ids or changed targets", async () => {
    const state = makeState();
    const bad = goodDayStart(state);
    (bad.blocks[1] as any).goalId = "g-invented";
    expect(await setup([reply(bad)], state).oracle.dayStart(state)).toBeNull();
    const bad2 = goodDayStart(state);
    (bad2.blocks[2] as any).target = 999;
    expect(await setup([reply(bad2)], state).oracle.dayStart(state)).toBeNull();
  });

  it("rejects penalty variant", async () => {
    const state = makeState();
    const bad = { ...goodDayStart(state), variant: "penalty" };
    expect(await setup([reply(bad)], state).oracle.dayStart(state)).toBeNull();
  });

  it("returns null on refusal, truncation and network errors", async () => {
    const state = makeState();
    expect(await setup([reply("{}", { stop_reason: "refusal" })], state).oracle.ask(state, "q")).toBeNull();
    expect(await setup([reply("{}", { stop_reason: "max_tokens" })], state).oracle.ask(state, "q")).toBeNull();
    expect(await setup([new Error("network down")], state).oracle.ask(state, "q")).toBeNull();
  });

  it("makes no call when the daily budget is exhausted", async () => {
    const state = makeState();
    const cache = new MemoryOracleCache();
    cache.set("oracle:spend:2026-11-04", state.config.oracle.dailyBudgetUsd);
    const t = setup([reply(goodDayStart(state))], state, cache);
    expect(await t.oracle.dayStart(state)).toBeNull();
    expect(t.calls).toHaveLength(0);
  });

  it("makes no call when disabled or keyless", async () => {
    const state = makeState();
    state.config.oracle.enabled = false;
    const t = setup([reply(goodDayStart(state))], state);
    expect(t.oracle.enabled()).toBe(false);
    expect(await t.oracle.dayStart(state)).toBeNull();
    expect(t.calls).toHaveLength(0);
    const m = mockClient([reply("{}")]);
    const o = createOracle({ getApiKey: () => null, config: makeState().config, client: m.factory });
    expect(o.enabled()).toBe(false);
    expect(await o.ask(makeState(), "q")).toBeNull();
    expect(m.calls).toHaveLength(0);
  });

  it("serves dayStart from cache on the second call", async () => {
    const state = makeState();
    const t = setup([reply(goodDayStart(state))], state);
    const a = await t.oracle.dayStart(state);
    const b = await t.oracle.dayStart(state);
    expect(t.calls).toHaveLength(1);
    expect(b?.cached).toBe(true);
    expect(b?.costUsd).toBe(0);
    expect(b?.spec).toEqual(a?.spec);
  });

  it("accounts cost from usage and accumulates spend", async () => {
    const state = makeState();
    const usage = { input_tokens: 1000, output_tokens: 1000, cache_read_input_tokens: 10000, cache_creation_input_tokens: 2000 };
    const expected = (1000 * 4 + 2000 * 5 + 10000 * 0.2 + 1000 * 20) / 1e6;
    expect(costOf("claude-opus-5-5", usage)).toBeCloseTo(expected, 8);
    expect(costOf("claude-haiku-5-5", USAGE)).toBeCloseTo((2000 * 0.1 + 500 * 0.5) / 1e6, 8);
    const t = setup([reply(goodDayStart(state), { usage })], state);
    const r = await t.oracle.dayStart(state);
    expect(r?.costUsd).toBeCloseTo(expected, 8);
    expect(t.oracle.spentTodayUsd()).toBeCloseTo(expected, 8);
  });

  it("caps ask answers at 8 blocks", async () => {
    const state = makeState();
    const blocks = Array.from({ length: 12 }, (_, i) => ({ type: "text", text: `line ${i}` }));
    const r = await setup([reply({ variant: "info", title: "ANSWER", blocks, actions: [], sound: "ding" })], state).oracle.ask(state, "plan my week");
    expect(r?.spec.blocks).toHaveLength(8);
  });

  it("handleOracleEffect returns spec or null and never throws", async () => {
    const state = makeState();
    const t = setup([reply(goodDayStart(state))], state);
    const spec = await handleOracleEffect({ kind: "oracle", request: "dayStart", context: {} }, state, t.oracle);
    expect(spec?.generated).toBe(true);
    const t2 = setup([new Error("x")], state);
    expect(await handleOracleEffect({ kind: "oracle", request: "gate", context: {} }, state, t2.oracle)).toBeNull();
  });
});
