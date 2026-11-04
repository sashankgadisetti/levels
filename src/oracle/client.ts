/**
 * The Oracle client. Builds a digest, asks Claude for a SystemWindowSpec using
 * structured outputs, re-validates with zod, post-validates per request kind,
 * and returns null on ANY failure so callers fall back to engine templates.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { Config, State } from "../engine/types";
import type { SystemWindowSpec } from "../system/spec";
import { OracleCache, MemoryOracleCache, cacheKey, isoWeek } from "./cache";
import { buildDigest, gameDate } from "./digest";
import { ORACLE_ACTION_KINDS, oracleJsonSchema, parseSpec } from "./schema";
import {
  SYSTEM_PROMPT, askPrompt, commentaryPrompt, dayStartPrompt, gatePrompt, shadowNamePrompt, type OracleKind,
} from "./prompts";

export type OracleConfig = Config["oracle"];

/** Minimal slice of the SDK the Oracle uses; tests inject a mock of this. */
export interface OracleUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}
export interface OracleResponse {
  content: { type: string; text?: string }[];
  stop_reason: string | null;
  usage: OracleUsage;
}
export interface OracleClientLike {
  messages: { create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<OracleResponse> };
}

export interface OracleResult { spec: SystemWindowSpec; costUsd: number; cached?: boolean }

export interface OracleOptions {
  getApiKey: () => string | null | undefined | Promise<string | null | undefined>;
  /** Oracle config (or full Config); pass a getter to track live settings changes. */
  config: OracleConfig | Config | (() => OracleConfig | Config);
  cache?: OracleCache;
  now?: () => Date;
  /** Test seam. Default: real Anthropic SDK. */
  client?: (apiKey: string) => OracleClientLike;
  log?: (msg: string, err?: unknown) => void;
}

export interface Oracle {
  dayStart(state: State): Promise<OracleResult | null>;
  gate(state: State): Promise<OracleResult | null>;
  commentary(state: State, eventSummary: string): Promise<OracleResult | null>;
  shadowName(state: State, stat: string): Promise<OracleResult | null>;
  ask(state: State, question: string): Promise<OracleResult | null>;
  spentTodayUsd(): number;
  enabled(): boolean;
}

// $/MTok. Cache reads ~ 0.05x (Opus) / 0.1x (Haiku); cache writes 1.25x input. Approximate.
interface Price { in: number; out: number; cacheRead: number }
const OPUS: Price = { in: 4, out: 20, cacheRead: 0.2 };
const HAIKU: Price = { in: 0.1, out: 0.5, cacheRead: 0.01 };
export function priceFor(model: string): Price {
  return /haiku/i.test(model) ? HAIKU : OPUS; // unknown models priced as Opus (conservative)
}
export function costOf(model: string, u: OracleUsage): number {
  const p = priceFor(model);
  const cw = u.cache_creation_input_tokens ?? 0;
  const cr = u.cache_read_input_tokens ?? 0;
  return (u.input_tokens * p.in + cw * p.in * 1.25 + cr * p.cacheRead + u.output_tokens * p.out) / 1_000_000;
}

const MAX_ASK_BLOCKS = 8;
const FLAVOR_KINDS: OracleKind[] = ["commentary", "shadowName"];

function defaultClient(apiKey: string): OracleClientLike {
  // Runs inside a Tauri webview. dangerouslyAllowBrowser is acceptable here: this is a
  // single-user local app and the key is the user's own, stored on their machine.
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 }) as unknown as OracleClientLike;
}

export function createOracle(opts: OracleOptions): Oracle {
  const cache = opts.cache ?? new MemoryOracleCache();
  const now = opts.now ?? (() => new Date());
  const factory = opts.client ?? defaultClient;
  const logged = new Set<string>();
  const logOnce = (msg: string, err?: unknown) => {
    if (logged.has(msg)) return;
    logged.add(msg);
    (opts.log ?? ((m, e) => console.warn(`[oracle] ${m}`, e ?? "")))(msg, err);
  };
  const clients = new Map<string, OracleClientLike>();
  const inflight = new Map<string, Promise<OracleResult | null>>();

  const cfg = (): OracleConfig => {
    const c = typeof opts.config === "function" ? opts.config() : opts.config;
    return "oracle" in c ? (c as Config).oracle : (c as OracleConfig);
  };
  const spendKey = () => `oracle:spend:${localYmd(now())}`;
  const spentTodayUsd = () => cache.get<number>(spendKey()) ?? 0;
  const addSpend = (usd: number) => cache.set(spendKey(), spentTodayUsd() + usd);

  const enabled = () => {
    if (!cfg().enabled) return false;
    const k = opts.getApiKey();
    return k instanceof Promise ? true : !!k;
  };

  async function call(kind: OracleKind, state: State, userPrompt: string, check: (s: SystemWindowSpec) => SystemWindowSpec | null): Promise<OracleResult | null> {
    const c = cfg();
    if (!c.enabled) return null;
    if (spentTodayUsd() >= c.dailyBudgetUsd) { logOnce(`daily budget reached ($${c.dailyBudgetUsd}); using templates`); return null; }
    const apiKey = await opts.getApiKey();
    if (!apiKey) return null;
    const model = FLAVOR_KINDS.includes(kind) ? c.flavorModel : c.model;
    try {
      let client = clients.get(apiKey);
      if (!client) { client = factory(apiKey); clients.set(apiKey, client); }
      const res = await client.messages.create({
        model,
        max_tokens: FLAVOR_KINDS.includes(kind) ? 2000 : 3000,
        thinking: { type: "adaptive" },
        output_config: {
          effort: kind === "ask" ? "medium" : "low",
          format: { type: "json_schema", schema: oracleJsonSchema() },
        },
        // Stable, byte-identical system prompt carries the cache breakpoint; the digest
        // lives in the user message after it.
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: userPrompt }],
      });
      const costUsd = costOf(model, res.usage);
      addSpend(costUsd); // billed even if the output is later rejected
      if (res.stop_reason === "refusal") { logOnce(`${kind}: model refused`); return null; }
      if (res.stop_reason === "max_tokens") { logOnce(`${kind}: output truncated (max_tokens)`); return null; }
      const text = res.content.find((b) => b.type === "text")?.text;
      if (!text) { logOnce(`${kind}: empty response`); return null; }
      let raw: unknown;
      try { raw = JSON.parse(text); } catch (e) { logOnce(`${kind}: response was not valid JSON`, e); return null; }
      const parsed = parseSpec(raw);
      if (!parsed.success) { logOnce(`${kind}: spec failed validation`, parsed.error.issues.slice(0, 3)); return null; }
      const spec = check(normalize(parsed.data, kind, state, now()));
      if (!spec) { logOnce(`${kind}: spec failed post-validation`); return null; }
      return { spec: { ...spec, generated: true }, costUsd };
    } catch (e) {
      logOnce(`${kind}: request failed`, e);
      return null;
    }
  }

  /** Cached + de-duplicated wrapper for once-per-period kinds. */
  async function cached(key: string, run: () => Promise<OracleResult | null>): Promise<OracleResult | null> {
    if (!cfg().enabled) return null;
    const hit = cache.get<SystemWindowSpec>(key);
    if (hit) return { spec: hit, costUsd: 0, cached: true };
    const pending = inflight.get(key);
    if (pending) return pending;
    const p = run().then((r) => { if (r) cache.set(key, r.spec); return r; }).finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  }

  const dateOf = (state: State) => state.today?.date ?? gameDate(now(), state.config.player.dayEndsAt);

  return {
    enabled,
    spentTodayUsd,
    dayStart(state) {
      const day = state.today;
      if (!day || day.goals.length === 0) { logOnce("dayStart: no open day / goals"); return Promise.resolve(null); }
      return cached(cacheKey("dayStart", day.date), () =>
        call("dayStart", state, dayStartPrompt(buildDigest(state, now())), (s) => checkDayStart(s, state)));
    },
    gate(state) {
      const week = isoWeek(dateOf(state));
      return cached(cacheKey("gate", week), () =>
        call("gate", state, gatePrompt(buildDigest(state, now()), { goldGate: state.config.economy.goldGate }), checkGate));
    },
    commentary(state, eventSummary) {
      return call("commentary", state, commentaryPrompt(buildDigest(state, now()), eventSummary), (s) =>
        s.blocks.some((b) => b.type === "text") ? { ...s, blocks: s.blocks.filter((b) => b.type === "text").slice(0, 1) } : null);
    },
    shadowName(state, stat) {
      return call("shadowName", state, shadowNamePrompt(buildDigest(state, now()), stat), (s) =>
        s.blocks.some((b) => b.type === "shadow") ? s : null);
    },
    ask(state, question) {
      if (!question.trim()) return Promise.resolve(null);
      return call("ask", state, askPrompt(buildDigest(state, now()), question), (s) =>
        ({ ...s, blocks: s.blocks.slice(0, MAX_ASK_BLOCKS) }));
    },
  };
}

function localYmd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const ALLOWED = new Set<string>(ORACLE_ACTION_KINDS);

/** Structural clean-up applied to every parsed spec. */
function normalize(spec: SystemWindowSpec, kind: OracleKind, state: State, at: Date): SystemWindowSpec {
  let actions = spec.actions.filter((a) => ALLOWED.has(a.kind));
  if (actions.length === 0) actions = [{ label: "CLOSE", kind: "dismiss", primary: true }];
  // Renderer adds the brackets and caps; strip any the model wrote.
  const title = spec.title.replace(/^\s*\[\s*|\s*\]\s*$/g, "").trim().toUpperCase() || "SYSTEM NOTICE";
  const period = state.today?.date ?? gameDate(at, state.config.player.dayEndsAt);
  const id = kind === "dayStart" || kind === "gate" ? `oracle:${kind}:${kind === "gate" ? isoWeek(period) : period}` : undefined;
  return { ...spec, title, actions, id: id ?? spec.id };
}

function checkDayStart(spec: SystemWindowSpec, state: State): SystemWindowSpec | null {
  if (spec.variant === "penalty") return null;
  const goals = new Map((state.today?.goals ?? []).map((g) => [g.id, g]));
  const rows = spec.blocks.filter((b) => b.type === "goalRow");
  if (rows.length === 0) return null;
  const seen = new Set<string>();
  for (const r of rows) {
    const g = goals.get(r.goalId);
    if (!g || g.target !== r.target || seen.has(r.goalId)) return null;
    seen.add(r.goalId);
  }
  return spec;
}

function checkGate(spec: SystemWindowSpec): SystemWindowSpec | null {
  if (spec.variant === "penalty") return null;
  // Gate objectives are not daily goals: no goalRow blocks allowed.
  return spec.blocks.some((b) => b.type === "goalRow") ? null : spec;
}
