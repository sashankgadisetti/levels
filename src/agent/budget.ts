/**
 * Agent spend accounting. The agent shares the Oracle's daily budget
 * (`config.oracle.dailyBudgetUsd`) and its spend counter (the same
 * `oracle:spend:<local date>` key in localStorage), so the Settings meter shows
 * the total and either side stops when the shared budget is spent.
 * A second counter tracks the agent's own share for display.
 */
import { DEFAULT_CONFIG } from "../engine";
import { LocalStorageOracleCache, type OracleCache } from "../oracle/cache";
import { costOf, type OracleUsage } from "../oracle/client";
import { agentEnv } from "./env";

let cache: OracleCache = new LocalStorageOracleCache();
/** Test seam. */
export const setBudgetCache = (c: OracleCache) => { cache = c; };

function localYmd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
// Same key and clock as the Oracle's counter (src/oracle/client.ts uses `new Date()`).
const sharedKey = () => `oracle:spend:${localYmd(new Date())}`;
const agentKey = () => `agent:spend:${localYmd(new Date())}`;

export const sharedSpentTodayUsd = () => cache.get<number>(sharedKey()) ?? 0;
export const agentSpentTodayUsd = () => cache.get<number>(agentKey()) ?? 0;

export function dailyBudgetUsd(): number {
  return (agentEnv.store().getState().state?.config ?? DEFAULT_CONFIG).oracle.dailyBudgetUsd;
}
export const budgetLeftUsd = () => Math.max(0, dailyBudgetUsd() - sharedSpentTodayUsd());

/** Record a response's cost against the shared budget. Returns the cost in USD. */
export function recordUsage(model: string, usage: OracleUsage): number {
  const usd = costOf(model, usage);
  cache.set(sharedKey(), sharedSpentTodayUsd() + usd);
  cache.set(agentKey(), agentSpentTodayUsd() + usd);
  return usd;
}

/* ---------- "use Claude for agent features" (device-local toggle, default on) ---------- */
const USE_KEY = "levels.agent.useClaude";
export function agentClaudeEnabled(): boolean {
  try { return localStorage.getItem(USE_KEY) !== "0"; } catch { return true; }
}
export function setAgentClaudeEnabled(on: boolean): void {
  try { localStorage.setItem(USE_KEY, on ? "1" : "0"); } catch { /* ignore */ }
}

export type ClaudeUnavailable = "disabled" | "no_key" | "budget";

/** A client when Claude may be called right now, otherwise the reason it may not. */
export async function claudeClient(): Promise<{ client: import("@anthropic-ai/sdk").default } | { unavailable: ClaudeUnavailable }> {
  if (!agentClaudeEnabled()) return { unavailable: "disabled" };
  const key = await agentEnv.getApiKey();
  if (!key) return { unavailable: "no_key" };
  if (budgetLeftUsd() <= 0) return { unavailable: "budget" };
  return { client: agentEnv.client(key) };
}

/** Models: the Oracle's configured main model, and Haiku for cheap parsing. */
export function agentModels(): { main: string; cheap: string } {
  const o = (agentEnv.store().getState().state?.config ?? DEFAULT_CONFIG).oracle;
  return { main: o.model || "claude-opus-5-5", cheap: o.flavorModel || "claude-haiku-5-5" };
}
