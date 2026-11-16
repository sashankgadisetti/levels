import { vi } from "vitest";
import { createGameStore } from "../../store/game";
import { createMemoryPersistence } from "../../store/persist";
import { makeFixtureState } from "../../store/fixtures";
import { MemoryOracleCache } from "../../oracle/cache";
import { configureAgentEnv, resetAgentEnv } from "../env";
import { setBudgetCache } from "../budget";
import { clearProposals } from "../proposals";
import { clearLogRing } from "../tools/log";
import type { SystemWindowInput } from "../../system/spec";

export const NOW = new Date(2026, 10, 18, 12, 0); // Wed 2026-11-18, noon local

/** A real-engine store seeded with the fixture state (gym 1/1, study 25/60, 14 days of history). */
export async function setupAgentStore(opts: { apiKey?: string } = {}) {
  resetAgentEnv();
  clearProposals();
  clearLogRing();
  setBudgetCache(new MemoryOracleCache());
  const persistence = createMemoryPersistence();
  persistence.snapshot = makeFixtureState({ now: NOW });
  const store = createGameStore({ persistence, runEffects: () => {}, now: () => NOW });
  await store.getState().init();
  const shown: SystemWindowInput[] = [];
  const show = vi.fn((spec: SystemWindowInput) => { shown.push(spec); });
  const openScreen = vi.fn();
  configureAgentEnv({ store: () => store, now: () => NOW, show, openScreen, getApiKey: () => opts.apiKey, ask: async (q) => `[ANSWER] ${q}` });
  const goal = (habitId: string) => store.getState().state!.today!.goals.find((g) => g.habitId === habitId)!;
  return { store, shown, show, openScreen, goal };
}

/** Minimal Messages API response body. */
export function message(content: unknown[], stop_reason: string, model = "claude-opus-5-5") {
  return {
    id: `msg_${Math.random().toString(36).slice(2)}`, type: "message", role: "assistant", model, content,
    stop_reason, stop_sequence: null, usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  };
}

/** A fetch that answers each POST with the next canned body (repeating the last), recording request bodies. */
export function mockFetch(bodies: unknown[] | ((i: number) => unknown)) {
  const requests: { url: string; body: Record<string, unknown>; headers: Headers }[] = [];
  const fn = async (url: RequestInfo | URL, init?: RequestInit) => {
    const i = requests.length;
    requests.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")), headers: new Headers(init?.headers) });
    const body = typeof bodies === "function" ? bodies(i) : bodies[Math.min(i, bodies.length - 1)];
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json", "request-id": `req_${i}` } });
  };
  return { fetch: fn as unknown as typeof fetch, requests };
}
