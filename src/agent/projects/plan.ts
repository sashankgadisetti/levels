/**
 * Project planning ("boss fights"). Claude breaks a real goal with a deadline into 3–7 milestones and a daily
 * "strike" for the next 7 days, via structured outputs (output_config.format) re-validated with zod.
 * Spend is added to the Oracle's daily spend key so planning counts toward the same daily budget.
 * With no API key, the Oracle switched off, the budget spent, or any failure, a deterministic fallback plan
 * is returned instead (never throws).
 */
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { DEFAULT_CONFIG } from "../../engine/config";
import { addDays, daysBetween, weekdayOf } from "../../engine/time";
import type { Config, Project, ProjectStrike, StatId, Weekday, YMD } from "../../engine/types";
import { LocalStorageOracleCache, type OracleCache } from "../../oracle/cache";
import { costOf, describeError, type OracleUsage } from "../../oracle/client";
import { getOracleApiKey } from "../../store/settings";
import { agentClaudeEnabled } from "../budget";

export const PLAN_MODEL = "claude-opus-5-5";
export const DEFAULT_MINUTES = 45;
export const MIN_MINUTES = 15;
export const MAX_MINUTES = 120;
export const WORKDAYS: Weekday[] = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const HORIZON_DAYS = 7;

export interface PlanContext {
  today: YMD;
  /** Weekdays the player can work on the project (rest days are left out). Default Mon–Fri. */
  weekdays?: Weekday[];
  minutesPerDay?: number;
  existingStrikes?: Record<YMD, ProjectStrike>;
}
export interface PlanInput { title: string; deadline: YMD; stat: StatId; context: PlanContext }

export interface PlannedMilestone { id: string; title: string; done?: boolean }
export interface ProjectPlan {
  bossName: string;
  milestones: PlannedMilestone[];
  strikes: Record<YMD, ProjectStrike>;
  verdict: string;
  source: "claude" | "fallback";
  costUsd: number;
  /** Why the fallback was used (no key, budget, error), for the UI. */
  note?: string;
}

/** Minimal SDK slice used here; tests inject a mock. */
export interface PlanResponse { content: { type: string; text?: string }[]; stop_reason: string | null; usage: OracleUsage; model?: string }
export interface PlanClientLike { beta: { messages: { create(params: Anthropic.Beta.MessageCreateParamsNonStreaming): Promise<PlanResponse> } } }

export interface PlanDeps {
  /** Agent "Use Claude" switch (default: the Settings → Agent toggle). */
  useClaude?: () => boolean;
  getApiKey?: () => string | null | undefined | Promise<string | null | undefined>;
  /** Oracle settings (enabled + dailyBudgetUsd are honoured). Default: DEFAULT_CONFIG.oracle. */
  oracle?: Config["oracle"];
  cache?: OracleCache;
  now?: () => Date;
  client?: (apiKey: string) => PlanClientLike;
  log?: (msg: string, err?: unknown) => void;
}

// --- schema ---------------------------------------------------------------------------------------

/** JSON schema for structured outputs (no length/range keywords; zod enforces those afterwards). */
const PLAN_JSON_SCHEMA = {
  type: "object",
  properties: {
    bossName: { type: "string", description: "A Solo Leveling style boss name for this goal, 2-5 words." },
    milestones: { type: "array", items: { type: "object", properties: { title: { type: "string" } }, required: ["title"], additionalProperties: false } },
    strikes: {
      type: "array",
      items: {
        type: "object",
        properties: { date: { type: "string", description: "YYYY-MM-DD" }, title: { type: "string" }, minutes: { type: "integer" } },
        required: ["date", "title", "minutes"], additionalProperties: false,
      },
    },
    verdict: { type: "string", description: "One or two deadpan System-voice sentences on feasibility." },
  },
  required: ["bossName", "milestones", "strikes", "verdict"],
  additionalProperties: false,
} as const;

const RawPlan = z.object({
  bossName: z.string().trim().min(1).max(80),
  milestones: z.array(z.object({ title: z.string().trim().min(1).max(160) })).min(1).max(12),
  strikes: z.array(z.object({ date: z.string(), title: z.string().trim().min(1).max(160), minutes: z.number() })).max(30),
  verdict: z.string().trim().max(600),
});
type RawPlan = z.infer<typeof RawPlan>;

const SYSTEM_PROMPT = `You are THE SYSTEM from Solo Leveling, planning a "Gate" for a real person. A Gate is a real-world project with a hard deadline; the boss is the project itself.
Break the project into concrete milestones (each a verifiable outcome, short imperative title, under 60 characters) and schedule one daily "strike": a single focused work session for that day, a concrete action of at most 40 characters that moves the current milestone forward, with a duration in minutes.
Rules:
- Only schedule strikes on the dates listed as available. One strike per date at most. Never schedule after the deadline.
- Respect the minutes-per-day budget; keep each strike between 15 and 120 minutes.
- Early strikes serve early milestones. The final milestone is shipping or delivering the thing.
- Be realistic. If the deadline is too tight, say so in the verdict and plan the minimum viable version.
- Voice: deadpan, terse, second person. No emoji. No brackets in titles.`;

// --- helpers --------------------------------------------------------------------------------------

const clampMinutes = (m: number | undefined) => Math.max(MIN_MINUTES, Math.min(MAX_MINUTES, Math.round(m ?? DEFAULT_MINUTES)));
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

function localYmd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Dates the planner may use: tomorrow .. min(deadline, today+7) on available weekdays. Today's quest is already set. */
export function availableDates(today: YMD, deadline: YMD, weekdays: Weekday[] = WORKDAYS): YMD[] {
  const out: YMD[] = [];
  for (let i = 1; i <= HORIZON_DAYS; i++) {
    const d = addDays(today, i);
    if (d > deadline) break;
    if (weekdays.includes(weekdayOf(d))) out.push(d);
  }
  return out;
}

function freshIds(n: number, taken: Set<string>): string[] {
  const out: string[] = [];
  for (let k = 1; out.length < n; k++) { const id = `m${k}`; if (!taken.has(id)) out.push(id); }
  return out;
}

const BOSSES = ["The Deadline Wraith", "Procrastination Knight", "Scope Creep Hydra", "Lord of Unfinished Work", "The Blank-Page Golem", "Perfectionism Lich", "The Someday Revenant"];
function hash(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }

/** Strike title for a fallback day: the milestone phase the date falls in. */
function phaseIndex(today: YMD, deadline: YMD, date: YMD, n: number): number {
  const span = Math.max(1, daysBetween(today, deadline));
  return Math.min(n - 1, Math.floor(((daysBetween(today, date) - 1) / span) * n));
}

// --- fallback -------------------------------------------------------------------------------------

const PHASES = ["Plan", "Build", "Polish", "Ship"];

/** Deterministic plan: Plan / Build / Polish / Ship milestones and one strike per available day. */
export function fallbackPlan(input: PlanInput, keep: PlannedMilestone[] = [], note?: string): ProjectPlan {
  const { title, deadline, context } = input;
  const short = clip(title.trim(), 30);
  const done = keep.filter((m) => m.done);
  const remainingPhases = PHASES.slice(Math.min(PHASES.length - 1, done.length));
  const ids = freshIds(remainingPhases.length, new Set(keep.map((m) => m.id)));
  const fresh: PlannedMilestone[] = remainingPhases.map((ph, i) => ({ id: ids[i], title: `${ph}: ${clip(title.trim(), 60)}` }));
  const milestones = [...done.map((m) => ({ id: m.id, title: m.title, done: true })), ...fresh];
  const minutes = clampMinutes(context.minutesPerDay);
  const strikes: Record<YMD, ProjectStrike> = {};
  for (const d of availableDates(context.today, deadline, context.weekdays)) {
    const m = fresh[phaseIndex(context.today, deadline, d, fresh.length)];
    strikes[d] = { title: clip(`${m.title.split(":")[0]} - ${short}`, 40), minutes, milestoneId: m.id };
  }
  const days = daysBetween(context.today, deadline);
  return {
    bossName: BOSSES[hash(title.trim().toLowerCase()) % BOSSES.length],
    milestones, strikes, source: "fallback", costUsd: 0, ...(note ? { note } : {}),
    verdict: days <= 0 ? "The deadline is today. Only one strike remains." : `${days} day${days === 1 ? "" : "s"} remain. ${Object.keys(strikes).length} strikes scheduled this week. Begin.`,
  };
}

// --- validation of Claude's output ----------------------------------------------------------------

/** Turn a validated raw plan into a ProjectPlan: milestone ids, date window, weekday filter, minute clamp. */
export function finalizePlan(raw: RawPlan, input: PlanInput, keep: PlannedMilestone[] = []): ProjectPlan | null {
  const done = keep.filter((m) => m.done);
  const min = done.length ? 1 : 3;
  const titles = raw.milestones.map((m) => clip(m.title, 100)).filter((t) => !done.some((d) => d.title.toLowerCase() === t.toLowerCase()));
  const fresh = titles.slice(0, Math.max(1, 7 - done.length));
  if (fresh.length < min) return null;
  // keep ids of open milestones whose title survived a re-plan
  const openByTitle = new Map(keep.filter((m) => !m.done).map((m) => [m.title.toLowerCase(), m.id]));
  const taken = new Set(keep.map((m) => m.id));
  const reused = fresh.map((t) => openByTitle.get(t.toLowerCase()));
  const ids = freshIds(reused.filter((x) => !x).length, taken);
  let next = 0;
  const freshMs = fresh.map((t, i) => ({ id: reused[i] ?? ids[next++], title: t }));
  const allowed = new Set(availableDates(input.context.today, input.deadline, input.context.weekdays));
  const strikes: Record<YMD, ProjectStrike> = {};
  for (const s of raw.strikes) {
    if (!YMD_RE.test(s.date) || !allowed.has(s.date) || strikes[s.date]) continue;
    const idx = phaseIndex(input.context.today, input.deadline, s.date, freshMs.length);
    strikes[s.date] = { title: clip(s.title, 40), minutes: clampMinutes(s.minutes), milestoneId: freshMs[idx].id };
  }
  return {
    bossName: clip(raw.bossName.replace(/^\s*\[|\]\s*$/g, ""), 60),
    milestones: [...done.map((m) => ({ id: m.id, title: m.title, done: true })), ...freshMs],
    strikes, verdict: clip(raw.verdict, 400), source: "claude", costUsd: 0,
  };
}

// --- Claude call ----------------------------------------------------------------------------------

function defaultClient(apiKey: string): PlanClientLike {
  // Runs inside the Tauri webview; single-user local app with the user's own key (same as src/oracle/client.ts).
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 }) as unknown as PlanClientLike;
}

function userPrompt(input: PlanInput, extra?: { done: PlannedMilestone[]; open: PlannedMilestone[]; landed?: number; missed?: number }): string {
  const c = input.context;
  const dates = availableDates(c.today, input.deadline, c.weekdays);
  const ctx = {
    project: input.title, deadline: input.deadline, today: c.today, todayWeekday: weekdayOf(c.today),
    daysUntilDeadline: daysBetween(c.today, input.deadline), stat: input.stat,
    minutesPerDay: clampMinutes(c.minutesPerDay), availableDates: dates.map((d) => `${d} (${weekdayOf(d)})`),
    existingStrikes: c.existingStrikes ?? {},
    ...(extra ? { milestonesDone: extra.done.map((m) => m.title), milestonesOpen: extra.open.map((m) => m.title), strikesLanded: extra.landed ?? 0, strikesMissed: extra.missed ?? 0 } : {}),
  };
  const task = extra
    ? "Weekly re-plan. The done milestones are kept as they are: return ONLY the remaining milestones (1-7, revise them if needed), and strikes for the available dates. Keep the boss name unless it no longer fits."
    : "New Gate. Return 3-7 milestones and one strike per available date.";
  return `${task}\n\n${JSON.stringify(ctx, null, 2)}`;
}

async function callClaude(input: PlanInput, deps: PlanDeps, prompt: string, keep: PlannedMilestone[]): Promise<{ plan: ProjectPlan | null; note?: string }> {
  const oracle = deps.oracle ?? DEFAULT_CONFIG.oracle;
  const cache = deps.cache ?? new LocalStorageOracleCache();
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? ((m, e) => console.warn(`[projects] ${m}`, e ?? ""));
  const spendKey = `oracle:spend:${localYmd(now())}`; // shared with the Oracle's daily budget
  const spent = cache.get<number>(spendKey) ?? 0;
  if (!(deps.useClaude ?? agentClaudeEnabled)()) return { plan: null, note: "Claude is switched off for agent features: deterministic plan." };
  if (spent >= oracle.dailyBudgetUsd) return { plan: null, note: `Daily Oracle budget reached ($${oracle.dailyBudgetUsd}): deterministic plan.` };
  const apiKey = await (deps.getApiKey ?? getOracleApiKey)();
  if (!apiKey) return { plan: null, note: "No API key: deterministic plan." };
  try {
    const client = (deps.client ?? defaultClient)(apiKey);
    const res = await client.beta.messages.create({
      model: PLAN_MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: { type: "json_schema", schema: PLAN_JSON_SCHEMA as unknown as Record<string, unknown> } },
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: prompt }],
    });
    const cost = costOf(res.model ?? PLAN_MODEL, res.usage);
    cache.set(spendKey, (cache.get<number>(spendKey) ?? 0) + cost); // billed even if rejected below
    if (res.stop_reason === "refusal") return { plan: null, note: "The System declined to plan this Gate: deterministic plan." };
    if (res.stop_reason === "max_tokens") return { plan: null, note: "Plan truncated: deterministic plan." };
    const text = res.content.find((b) => b.type === "text")?.text;
    if (!text) return { plan: null, note: "Empty plan: deterministic plan." };
    const parsed = RawPlan.safeParse(JSON.parse(text));
    if (!parsed.success) { log("plan failed validation", parsed.error.issues.slice(0, 3)); return { plan: null, note: "Plan failed validation: deterministic plan." }; }
    const plan = finalizePlan(parsed.data, input, keep);
    if (!plan) return { plan: null, note: "Plan had too few milestones: deterministic plan." };
    return { plan: { ...plan, costUsd: cost } };
  } catch (e) {
    log("planning request failed", e);
    return { plan: null, note: `Planning failed (${describeError(e)}): deterministic plan.` };
  }
}

/** Plan a new Gate. Never throws; falls back to a deterministic plan. */
export async function planProject(input: PlanInput, deps: PlanDeps = {}): Promise<ProjectPlan> {
  const { plan, note } = await callClaude(input, deps, userPrompt(input), []);
  return plan ?? fallbackPlan(input, [], note);
}

export interface ReplanProgress {
  today: YMD;
  weekdays?: Weekday[];
  minutesPerDay?: number;
  /** Strike goals completed so far / missed (optional context for the model). */
  strikesLanded?: number;
  strikesMissed?: number;
}

/** Weekly (or on-demand) re-plan: keeps done milestones (and their ids) and the boss name. */
export async function replanProject(project: Project, progress: ReplanProgress, deps: PlanDeps = {}): Promise<ProjectPlan> {
  const input: PlanInput = {
    title: project.title, deadline: project.deadline, stat: project.stat,
    context: {
      today: progress.today, weekdays: progress.weekdays, minutesPerDay: progress.minutesPerDay,
      existingStrikes: Object.fromEntries(Object.entries(project.strikes).filter(([d]) => d >= progress.today)),
    },
  };
  const keep = project.milestones.map((m) => ({ id: m.id, title: m.title, done: m.done }));
  const prompt = userPrompt(input, { done: keep.filter((m) => m.done), open: keep.filter((m) => !m.done), landed: progress.strikesLanded, missed: progress.strikesMissed })
    + `\n\nCurrent boss name: ${project.bossName}`;
  const { plan, note } = await callClaude(input, deps, prompt, keep);
  const out = plan ?? fallbackPlan(input, keep, note);
  return { ...out, bossName: project.bossName };
}
