/**
 * The agent's collaborators, behind one mutable object so tests (and future hosts)
 * can swap them: the game store, the clock, how System windows are shown, the
 * Oracle, the API key and the Anthropic client factory.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { StoreApi } from "zustand/vanilla";
import { focusMainWindow } from "../lib/tauri";
import { getOracle } from "../oracle/wire";
import { routeEffects } from "../store/effects";
import { gameStore, nowMs, type GameStore } from "../store/game";
import { getOracleApiKey } from "../store/settings";
import { useUi, type Screen } from "../store/ui";
import { SystemWindowSpec, type SystemWindowInput } from "../system/spec";

export interface AgentEnv {
  store(): StoreApi<GameStore>;
  /** App clock (honours the dev time offset). */
  now(): Date;
  /** Show a System window through the normal popup path. */
  show(spec: SystemWindowInput): void;
  openScreen(screen: Screen): void;
  /** "Ask the System": the Oracle's answer as plain text, or null when unavailable. */
  ask(question: string): Promise<string | null>;
  getApiKey(): Promise<string | undefined> | string | undefined;
  /** Anthropic client factory (tests inject one with a mocked fetch). */
  client(apiKey: string): Anthropic;
}

const clients = new Map<string, Anthropic>();

export const defaultAgentEnv: AgentEnv = {
  store: () => gameStore,
  now: () => new Date(nowMs()),
  show: (spec) => routeEffects([{ kind: "popup", spec: SystemWindowSpec.parse(spec) }]),
  openScreen: (screen) => { useUi.getState().setScreen(screen); void focusMainWindow(); },
  async ask(question) {
    const state = gameStore.getState().state;
    if (!state) return null;
    const r = await getOracle().ask(state, question);
    return r ? specToText(r.spec) : null;
  },
  getApiKey: getOracleApiKey,
  client(apiKey) {
    let c = clients.get(apiKey);
    if (!c) {
      // Runs in the Tauri webview: single-user local app, the key is the user's own (same as the Oracle).
      c = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 });
      clients.set(apiKey, c);
    }
    return c;
  },
};

export const agentEnv: AgentEnv = { ...defaultAgentEnv };

export function configureAgentEnv(patch: Partial<AgentEnv>): void { Object.assign(agentEnv, patch); }
export function resetAgentEnv(): void { Object.assign(agentEnv, defaultAgentEnv); }

/** Flatten a SystemWindowSpec into readable text (for ask_system results). */
export function specToText(spec: SystemWindowSpec | SystemWindowInput): string {
  const out: string[] = [`[${spec.title}]`];
  for (const b of spec.blocks) {
    switch (b.type) {
      case "text": out.push(b.text); break;
      case "list": out.push(...b.items.map((i) => `- ${i}`)); break;
      case "kv": out.push(...b.rows.map(([k, v]) => `${k}: ${v}`)); break;
      case "goalRow": out.push(`${b.label}: ${b.current}/${b.target} ${b.unit}`); break;
      case "statRow": out.push(`${b.stat}: ${b.value}${b.delta ? ` (${b.delta > 0 ? "+" : ""}${b.delta})` : ""}`); break;
      case "bar": out.push(`${b.label}: ${b.value}/${b.max}`); break;
      case "itemCard": out.push(`${b.name} (${b.rarity}): ${b.description}`); break;
      case "shadow": out.push(`${b.name} — ${b.rank}${b.epithet ? `, ${b.epithet}` : ""}`); break;
      default: break;
    }
  }
  if (spec.footer) out.push(spec.footer);
  return out.join("\n");
}
