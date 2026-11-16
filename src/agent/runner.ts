/**
 * The in-app agent: Claude's beta tool runner over the same tool handlers the MCP uses.
 * Each ToolDef's zod schema becomes a betaZodTool whose `run` calls toolHost.execute, so
 * pop-ups, approvals and persistence behave exactly as for any other caller.
 * Spend counts against the Oracle's daily budget (src/agent/budget.ts). Hard cap: 12 tool turns.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { describeError } from "../oracle/client";
import { TOOL_NAMES, type ToolName, type ToolResult, type ToolSource } from "./contract";
import { agentModels, budgetLeftUsd, claudeClient, recordUsage, type ClaudeUnavailable } from "./budget";
import { executeTool, getToolSpec } from "./tools";

export const MAX_TOOL_TURNS = 12;

/** Stable, cacheable system prompt: no dates, names or state (those go in the task). */
export const AGENT_SYSTEM_PROMPT = `You are the System from Solo Leveling, running inside "Levels", the player's life-RPG.
Voice: terse, declarative, deadpan. Short sentences. No emoji, no cheerleading, no exclamation marks. You state facts and issue quests.
You act only through the tools you are given. Every change you make is an engine event the player can see.
Rules:
- Read before you write: use the read tools to ground every claim in the player's actual numbers.
- Never invent progress the player did not report.
- Changes to plans (targets, gates, projects) are proposals: use the propose_* tools; the player approves them in a System window.
- Stay within the limits stated in the task. Do not repeat a tool call that already succeeded.
- When the task is done, reply with a brief final message in the System's voice (at most 5 lines). Do not ask questions; there is no one to answer.`;

export interface AgentToolCall { name: string; args: unknown; result: ToolResult }

export interface RunAgentOptions {
  task: string;
  /** Subset of tools the agent may use (default: all). */
  tools?: ToolName[];
  /** Max tool turns (API requests); clamped to MAX_TOOL_TURNS. */
  maxTurns?: number;
  /** Default: the Oracle's configured main model (claude-opus-5-5). */
  model?: string;
  /** Source tag passed to the tools. Default "agent" (plan changes need approval). */
  source?: ToolSource;
  effort?: "low" | "medium" | "high";
  signal?: AbortSignal;
}

export type AgentStop = "done" | "turn_cap" | "budget" | "refusal" | "max_tokens" | ClaudeUnavailable | "error";

export interface RunAgentResult {
  ok: boolean;
  text: string;
  stopped: AgentStop;
  turns: number;
  toolCalls: AgentToolCall[];
  costUsd: number;
  error?: string;
}

/** Read results also carry their structured data (truncated) so the model can reason over numbers. */
function resultText(r: ToolResult, mutating: boolean): string {
  if (mutating || r.data === undefined) return r.content;
  const json = JSON.stringify(r.data);
  return `${r.content}\n\ndata: ${json.length > 8000 ? `${json.slice(0, 8000)}…` : json}`;
}

export async function runAgent(opts: RunAgentOptions): Promise<RunAgentResult> {
  const calls: AgentToolCall[] = [];
  const base = { turns: 0, toolCalls: calls, costUsd: 0 };
  const c = await claudeClient();
  if (!("client" in c)) return { ...base, ok: false, text: "", stopped: c.unavailable };

  const model = opts.model ?? agentModels().main;
  const source = opts.source ?? "agent";
  const names: readonly ToolName[] = opts.tools ?? TOOL_NAMES;
  const tools = names.map((name) => {
    const spec = getToolSpec(name);
    if (!spec) throw new Error(`[agent] unknown tool ${name}`);
    return betaZodTool({
      name: spec.name,
      description: spec.description,
      inputSchema: spec.schema,
      run: async (args) => {
        const result = await executeTool({ name, args: args as Record<string, unknown>, source });
        calls.push({ name, args, result });
        // Thrown errors become is_error tool results in the runner.
        if (!result.ok) throw new Error(result.error ?? result.content);
        return resultText(result, spec.mutating);
      },
    });
  });

  const maxTurns = Math.max(1, Math.min(opts.maxTurns ?? MAX_TOOL_TURNS, MAX_TOOL_TURNS));
  const isHaiku = /haiku/i.test(model);
  let turns = 0;
  let costUsd = 0;
  let last: Anthropic.Beta.BetaMessage | undefined;
  let stopped: AgentStop = "done";
  try {
    const runner = c.client.beta.messages.toolRunner(
      {
        model,
        max_tokens: 16000,
        max_iterations: maxTurns,
        thread: false,
        output_config: { effort: opts.effort ?? "medium" },
        // Stable system prompt carries the cache breakpoint; the task (with live data) follows it.
        system: [{ type: "text", text: AGENT_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        tools,
        messages: [{ role: "user", content: opts.task }],
        // Server-side refusal fallback (not offered for Haiku).
        ...(isHaiku ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }),
      },
      opts.signal ? { signal: opts.signal } : undefined,
    );
    for await (const message of runner) {
      turns++;
      last = message;
      costUsd += recordUsage(message.model || model, message.usage);
      if (message.stop_reason === "refusal") { stopped = "refusal"; break; }
      if (message.stop_reason === "max_tokens") { stopped = "max_tokens"; break; }
      if (message.stop_reason === "tool_use" && budgetLeftUsd() <= 0) { stopped = "budget"; break; }
    }
    if (stopped === "done" && last?.stop_reason === "tool_use" && turns >= maxTurns) stopped = "turn_cap";
  } catch (err) {
    return { ok: false, text: "", stopped: "error", turns, toolCalls: calls, costUsd, error: describeError(err) };
  }
  const text = (last?.content ?? []).flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();
  return { ok: stopped === "done" || stopped === "turn_cap", text, stopped, turns, toolCalls: calls, costUsd };
}
