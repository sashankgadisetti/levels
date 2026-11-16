import { describe, expect, it, vi } from "vitest";
import { MemoryOracleCache } from "../../../oracle/cache";
import { DEFAULT_CONFIG } from "../../../engine/config";
import type { Project } from "../../../engine/types";
import { availableDates, fallbackPlan, planProject, replanProject, type PlanClientLike, type PlanInput } from "../plan";

const TODAY = "2026-11-16"; // Monday
const input: PlanInput = { title: "Ship my portfolio site", deadline: "2026-12-15", stat: "INT", context: { today: TODAY } };
const ORACLE_ON = { ...DEFAULT_CONFIG.oracle, enabled: true, dailyBudgetUsd: 1 };
const NOW = () => new Date(2026, 10, 16, 9, 0);

function mockClient(payload: unknown, usage = { input_tokens: 1000, output_tokens: 500 }) {
  const create = vi.fn(async () => ({ content: [{ type: "text", text: JSON.stringify(payload) }], stop_reason: "end_turn", usage, model: "claude-opus-5-5" }));
  return { create, factory: () => ({ beta: { messages: { create } } }) as unknown as PlanClientLike };
}

describe("planProject", () => {
  it("falls back deterministically with no API key", async () => {
    const a = await planProject(input, { getApiKey: () => undefined, oracle: ORACLE_ON, cache: new MemoryOracleCache(), now: NOW });
    const b = await planProject(input, { getApiKey: () => undefined, oracle: ORACLE_ON, cache: new MemoryOracleCache(), now: NOW });
    expect(a).toEqual(b);
    expect(a.source).toBe("fallback");
    expect(a.note).toMatch(/No API key/);
    expect(a.milestones.map((m) => m.title.split(":")[0])).toEqual(["Plan", "Build", "Polish", "Ship"]);
    // one strike per weekday in the next 7 days, starting tomorrow
    expect(Object.keys(a.strikes)).toEqual(["2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-23"]);
    for (const s of Object.values(a.strikes)) { expect(s.minutes).toBe(45); expect(s.title.length).toBeLessThanOrEqual(40); expect(a.milestones.some((m) => m.id === s.milestoneId)).toBe(true); }
    expect(a.bossName.length).toBeGreaterThan(0);
  });

  it("skips rest days and never plans past the deadline", () => {
    expect(availableDates(TODAY, "2026-11-19", ["Mon", "Wed", "Thu"])).toEqual(["2026-11-18", "2026-11-19"]);
    const p = fallbackPlan({ ...input, deadline: "2026-11-18", context: { today: TODAY, minutesPerDay: 500 } });
    expect(Object.keys(p.strikes)).toEqual(["2026-11-17", "2026-11-18"]);
    expect(Object.values(p.strikes)[0].minutes).toBe(120);
  });

  it("uses Claude's structured output, clamps minutes, filters dates, and adds spend to the Oracle budget key", async () => {
    const { create, factory } = mockClient({
      bossName: "[The Unshipped Portfolio]", verdict: "Feasible.",
      milestones: [{ title: "Pick a stack" }, { title: "Build pages" }, { title: "Write case studies" }, { title: "Deploy" }],
      strikes: [
        { date: "2026-11-16", title: "today is not allowed", minutes: 30 },
        { date: "2026-11-17", title: "Pick a framework", minutes: 5 },
        { date: "2026-11-18", title: "Scaffold", minutes: 500 },
        { date: "2026-11-18", title: "duplicate date", minutes: 30 },
        { date: "2026-11-22", title: "Sunday is a rest day", minutes: 30 },
        { date: "2027-01-01", title: "after the deadline", minutes: 30 },
      ],
    });
    const cache = new MemoryOracleCache();
    const plan = await planProject(input, { getApiKey: () => "sk-test", oracle: ORACLE_ON, cache, now: NOW, client: factory });
    expect(create).toHaveBeenCalledOnce();
    const params = (create.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(params.model).toBe("claude-opus-5-5");
    expect(params.thinking).toEqual({ type: "adaptive" });
    expect((params.output_config as { format: { type: string } }).format.type).toBe("json_schema");
    expect(plan.source).toBe("claude");
    expect(plan.bossName).toBe("The Unshipped Portfolio");
    expect(plan.milestones).toHaveLength(4);
    expect(plan.strikes).toEqual({
      "2026-11-17": expect.objectContaining({ title: "Pick a framework", minutes: 15 }),
      "2026-11-18": expect.objectContaining({ title: "Scaffold", minutes: 120 }),
    });
    expect(plan.costUsd).toBeCloseTo((1000 * 4 + 500 * 20) / 1e6);
    expect(cache.get<number>("oracle:spend:2026-11-16")).toBeCloseTo(plan.costUsd);
  });

  it("respects the daily budget and invalid output", async () => {
    const cache = new MemoryOracleCache();
    cache.set("oracle:spend:2026-11-16", 5);
    const { create, factory } = mockClient({});
    const p = await planProject(input, { getApiKey: () => "sk", oracle: ORACLE_ON, cache, now: NOW, client: factory });
    expect(create).not.toHaveBeenCalled();
    expect(p.source).toBe("fallback");
    const bad = mockClient({ bossName: "X", verdict: "", milestones: [{ title: "only one" }], strikes: [] });
    const q = await planProject(input, { getApiKey: () => "sk", oracle: ORACLE_ON, cache: new MemoryOracleCache(), now: NOW, client: bad.factory });
    expect(q.source).toBe("fallback");
  });

  it("replanProject keeps done milestones and the boss name", async () => {
    const project: Project = {
      id: "p1", title: "Ship my portfolio site", bossName: "The Deadline Wraith", stat: "INT", deadline: "2026-12-15", createdAt: "2026-11-01T00:00:00Z", status: "active",
      milestones: [{ id: "m1", title: "Plan: x", done: true, doneAt: "2026-11-05T00:00:00Z" }, { id: "m2", title: "Build: x", done: false }],
      strikes: { "2026-11-10": { title: "old" } }, xpBonus: 400,
    };
    const fb = await replanProject(project, { today: TODAY }, { getApiKey: () => undefined, oracle: ORACLE_ON, cache: new MemoryOracleCache(), now: NOW });
    expect(fb.bossName).toBe("The Deadline Wraith");
    expect(fb.milestones[0]).toEqual({ id: "m1", title: "Plan: x", done: true });
    expect(new Set(fb.milestones.map((m) => m.id)).size).toBe(fb.milestones.length);
    const { factory } = mockClient({ bossName: "Other", verdict: "ok", milestones: [{ title: "Build: x" }, { title: "Deploy" }], strikes: [{ date: "2026-11-17", title: "Build nav", minutes: 60 }] });
    const cl = await replanProject(project, { today: TODAY }, { getApiKey: () => "sk", oracle: ORACLE_ON, cache: new MemoryOracleCache(), now: NOW, client: factory });
    expect(cl.source).toBe("claude");
    expect(cl.bossName).toBe("The Deadline Wraith");
    expect(cl.milestones.map((m) => [m.id, m.done ?? false])).toEqual([["m1", true], ["m2", false], ["m3", false]]);
  });
});
