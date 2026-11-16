import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { agentSpentTodayUsd, sharedSpentTodayUsd } from "../budget";
import { configureAgentEnv } from "../env";
import { MAX_TOOL_TURNS, runAgent } from "../runner";
import { runReevaluation } from "../reevaluate";
import { toolHost } from "../tools";
import { message, mockFetch, setupAgentStore } from "./helpers";

const useClient = (f: ReturnType<typeof mockFetch>) =>
  configureAgentEnv({ getApiKey: () => "sk-test", client: (apiKey) => new Anthropic({ apiKey, fetch: f.fetch, maxRetries: 0 }) });

const toolUse = (name: string, input: unknown, id = `tu_${Math.random().toString(36).slice(2)}`) => ({ type: "tool_use", id, name, input });

describe("runAgent (beta tool runner, mocked transport)", () => {
  it("executes a tool call through the tool host, then stops at end_turn", async () => {
    await setupAgentStore();
    const f = mockFetch([
      message([{ type: "text", text: "Checking." }, toolUse("get_status", {})], "tool_use"),
      message([{ type: "text", text: "Status reviewed." }], "end_turn"),
    ]);
    useClient(f);
    const r = await runAgent({ task: "Report status.", tools: ["get_status", "get_today"] });
    expect(r.ok).toBe(true);
    expect(r.stopped).toBe("done");
    expect(r.text).toBe("Status reviewed.");
    expect(r.turns).toBe(2);
    expect(r.toolCalls.map((c) => c.name)).toEqual(["get_status"]);
    expect(r.toolCalls[0].result.ok).toBe(true);

    const first = f.requests[0].body;
    expect(first.model).toBe("claude-opus-5-5");
    expect((first.tools as { name: string }[]).map((t) => t.name)).toEqual(["get_status", "get_today"]);
    expect((first.system as { cache_control?: unknown }[])[0].cache_control).toEqual({ type: "ephemeral" });
    expect(first.thinking).toBeUndefined(); // adaptive by default on Opus 5.5
    // the second request carries the tool result back
    const second = f.requests[1].body.messages as { role: string; content: { type: string; content?: unknown }[] }[];
    const result = second.at(-1)!.content.find((b) => b.type === "tool_result")!;
    expect(JSON.stringify(result.content)).toContain("[STATUS]");
    // spend is shared with the Oracle's daily budget counter
    expect(r.costUsd).toBeGreaterThan(0);
    expect(sharedSpentTodayUsd()).toBeCloseTo(r.costUsd);
    expect(agentSpentTodayUsd()).toBeCloseTo(r.costUsd);
  });

  it("returns tool errors to the model as is_error results", async () => {
    await setupAgentStore();
    const f = mockFetch([
      message([toolUse("log_progress", { label: "basket weaving", delta: 1 })], "tool_use"),
      message([{ type: "text", text: "Unknown goal." }], "end_turn"),
    ]);
    useClient(f);
    const r = await runAgent({ task: "Log basket weaving.", tools: ["log_progress"] });
    expect(r.toolCalls[0].result.ok).toBe(false);
    const msgs = f.requests[1].body.messages as { content: { type: string; is_error?: boolean }[] }[];
    expect(msgs.at(-1)!.content.find((b) => b.type === "tool_result")!.is_error).toBe(true);
  });

  it("stops at the turn cap when the model keeps calling tools", async () => {
    await setupAgentStore();
    const f = mockFetch(() => message([toolUse("get_today", {})], "tool_use"));
    useClient(f);
    const r = await runAgent({ task: "Loop.", tools: ["get_today"], maxTurns: 3 });
    expect(r.stopped).toBe("turn_cap");
    expect(r.turns).toBe(3);
    expect(f.requests).toHaveLength(3);

    const g = mockFetch(() => message([toolUse("get_today", {})], "tool_use"));
    useClient(g);
    const capped = await runAgent({ task: "Loop.", tools: ["get_today"], maxTurns: 99 });
    expect(capped.turns).toBe(MAX_TOOL_TURNS);
    expect(g.requests).toHaveLength(12);
  });

  it("does not call Claude without an API key or over budget", async () => {
    await setupAgentStore();
    expect((await runAgent({ task: "x" })).stopped).toBe("no_key");
    const f = mockFetch([message([{ type: "text", text: "hi" }], "end_turn")]);
    const { store } = await setupAgentStore({ apiKey: "sk-test" });
    configureAgentEnv({ client: (apiKey) => new Anthropic({ apiKey, fetch: f.fetch, maxRetries: 0 }) });
    const cfg = store.getState().state!.config;
    store.getState().dispatch({ type: "CONFIG_CHANGED", patch: { oracle: { ...cfg.oracle, dailyBudgetUsd: 0 } } });
    expect((await runAgent({ task: "x" })).stopped).toBe("budget");
    expect(f.requests).toHaveLength(0);
  });

  it("re-evaluation via Claude ends in one approval window from propose_targets", async () => {
    const { shown } = await setupAgentStore();
    const f = mockFetch([
      message([toolUse("get_history", { days: 14 })], "tool_use"),
      message([toolUse("propose_targets", { changes: [{ habit_id: "study", target: 70 }], reason: "Study held.", verdict: "Line one.\nLine two.\nLine three.", next_gate: "Seven days of study. Boss: Kargalgan." })], "tool_use"),
      message([{ type: "text", text: "Proposal shown." }], "end_turn"),
    ]);
    useClient(f);
    const r = await runReevaluation();
    expect(r.via).toBe("claude");
    expect(r.proposalId).toBeTruthy();
    expect(shown).toHaveLength(1);
    expect(shown[0].title).toBe("WEEKLY RE-EVALUATION");
    expect((f.requests[0].body.tools as { name: string }[]).map((t) => t.name).sort()).toEqual(["get_config", "get_history", "get_status", "propose_targets"]);
  });

  it("log_text parses with Claude Haiku structured output when a key is set", async () => {
    const { goal } = await setupAgentStore();
    const parsed = { entries: [{ habit_id: "study", delta: 30, value: null, unit: "min", phrase: "half an hour of study" }], unmatched: ["walked"] };
    const f = mockFetch([message([{ type: "text", text: JSON.stringify(parsed) }], "end_turn", "claude-haiku-5-5")]);
    useClient(f);
    const r = await toolHost.execute({ name: "log_text", args: { text: "half an hour of study, walked", apply: true }, source: "mcp" });
    expect(r.ok).toBe(true);
    expect((r.data as { parser: string }).parser).toBe("claude");
    expect(goal("study").current).toBe(55);
    const body = f.requests[0].body as { model: string; output_config: { format: { type: string } } };
    expect(body.model).toBe("claude-haiku-5-5");
    expect(body.output_config.format.type).toBe("json_schema");
  });
});
