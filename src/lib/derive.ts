/**
 * Small derived-value helpers the UI needs. They mirror docs/02-features.md and
 * the Config; anything the engine's `selectors` exports should win over these once it lands.
 */
import type { Config, DailyQuest, HunterRank, RewardDef, State, StatId } from "../engine";

export const goldPriceOf = (r: Pick<RewardDef, "usd">, config: Config) => Math.max(1, Math.ceil(r.usd * config.economy.usdToGold));

export const statValue = (s: State, id: StatId) => s.stats[id]?.value ?? 0;

/** The engine keeps HP, MP and Fatigue on a 0–100 scale (docs/04-architecture.md §5). */
export function vitalMax(_s: State) {
  return { hp: 100, mp: 100, fatigue: 100 };
}

/** Next local day boundary (dayEndsAt) strictly after `now`. */
export function nextDayEnd(config: Config, now: Date): Date {
  const [h, m] = config.player.dayEndsAt.split(":").map(Number);
  const d = new Date(now);
  d.setHours(h || 0, m || 0, 0, 0);
  if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
  return d;
}

export function questProgress(q?: DailyQuest) {
  const goals = q?.goals ?? [];
  const done = goals.filter((g) => g.done).length;
  return { done, total: goals.length, ratio: goals.length ? done / goals.length : 0 };
}

/** E (worst) .. S (all clear) letter grade for a closed day. */
export function gradeOf(q: DailyQuest): "S" | "A" | "B" | "C" | "D" | "E" {
  const { ratio, total } = questProgress(q);
  if (!total) return "E";
  if (q.result === "clear" || ratio >= 1) return "S";
  if (ratio >= 0.85) return "A";
  if (ratio >= 0.7) return "B";
  if (ratio >= 0.5) return "C";
  if (ratio >= 0.25) return "D";
  return "E";
}
export const GRADE_COLOR: Record<string, string> = {
  S: "var(--sl-gold)", A: "var(--sl-gold)", B: "var(--sl-cyan)", C: "var(--sl-cyan)", D: "var(--sl-muted)", E: "var(--sl-red)",
};

export const RANK_COLOR: Record<HunterRank, string> = {
  E: "var(--sl-muted)", D: "var(--sl-cyan)", C: "var(--sl-cyan)", B: "var(--sl-purple)", A: "var(--sl-gold)", S: "var(--sl-gold)", NATIONAL: "var(--sl-red)",
};
export const rankLabel = (r: HunterRank) => (r === "NATIONAL" ? "NAT" : r);

export const statLabel = (config: Config, id: string) => config.stats.find((s) => s.id === id)?.label ?? id;
export const statShort = (config: Config, id: string) => config.stats.find((s) => s.id === id)?.short ?? id;
