/** Read tools: state digests for the model (text) and programmatic consumers (data). */
import { dayBounds, isPenaltyActive, selectors, type DailyQuest, type Goal, type State } from "../../engine";
import { agentEnv } from "../env";
import { SCHEMAS } from "./schemas";
import { defineTool, fail, ok, type ToolSpec } from "./types";

export const getState = (): State | undefined => agentEnv.store().getState().state;
export const noState = () => fail("The System is not ready (no game state loaded).");

const goalData = (g: Goal) => ({
  id: g.id, habit_id: g.habitId, label: g.label, stat: g.stat, current: g.current, target: g.target, unit: g.unit, done: g.done,
  ...(g.rest ? { rest: true } : {}), ...(g.mode ? { mode: g.mode } : {}), ...(g.projectId ? { project_id: g.projectId } : {}),
});
const goalLine = (g: Goal) => `${g.done ? "[x]" : "[ ]"} ${g.label}: ${g.current}/${g.target} ${g.unit}${g.rest ? " (rest)" : ""}  {goal_id: ${g.id}, habit_id: ${g.habitId}}`;

function timeLeft(s: State): { endsAt?: string; minutesLeft?: number } {
  if (!s.today) return {};
  const end = dayBounds(s.today.date, s.config.player.dayEndsAt).end;
  return { endsAt: end, minutesLeft: Math.max(0, Math.round((new Date(end).getTime() - agentEnv.now().getTime()) / 60_000)) };
}
const hm = (min?: number) => (min === undefined ? "?" : `${Math.floor(min / 60)}h ${min % 60}m`);

function penaltyData(s: State) {
  const p = s.penalty;
  if (!p || p.cleared) return { active: false };
  return { active: isPenaltyActive(s), endsAt: p.endsAt, missed_goal_ids: p.missedGoalIds, makeup: p.makeup ?? {} };
}

export function todayData(s: State) {
  const q = s.today;
  return {
    date: q?.date, goals: (q?.goals ?? []).map(goalData),
    done: q?.goals.filter((g) => g.done).length ?? 0, total: q?.goals.length ?? 0,
    ...timeLeft(s), penalty: penaltyData(s),
  };
}

export function statusData(s: State) {
  const equipped = s.titles.find((t) => t.id === s.player.equippedTitleId);
  return {
    name: s.player.name, level: s.player.level, rank: s.player.rank, xp: s.player.xp, xp_to_next: s.player.xpToNext,
    ability_points: s.player.abilityPoints, title: equipped?.name ?? null, gold: s.gold,
    stats: Object.fromEntries(s.config.stats.map((d) => [d.id, { label: d.label, value: s.stats[d.id]?.value ?? 0, locked: d.locked }])),
    vitals: s.vitals,
    streaks: Object.fromEntries(Object.values(s.streaks).map((st) => [st.stat, { current: st.current, best: st.best }])),
    boxes: s.boxes, shadows: s.shadows.length,
    today: todayData(s),
  };
}

export function historyData(s: State, days: number) {
  const list: DailyQuest[] = s.history.slice(-days);
  const perHabit: Record<string, { done: number; days: number; avg: number; target: number }> = {};
  for (const q of list) for (const g of q.goals) {
    const h = (perHabit[g.habitId] ??= { done: 0, days: 0, avg: 0, target: g.target });
    h.days++; h.avg += g.current; h.target = g.target;
    if (g.done) h.done++;
  }
  for (const h of Object.values(perHabit)) h.avg = h.days ? Math.round((h.avg / h.days) * 10) / 10 : 0;
  return {
    days: list.map((q) => ({ date: q.date, result: q.result ?? null, xp: q.xpEarned ?? 0, goals: q.goals.map((g) => [g.habitId, g.current, g.target, g.done ? 1 : 0, g.rest ? "rest" : ""]) })),
    goal_columns: ["habit_id", "current", "target", "done", "rest"],
    per_habit: perHabit,
  };
}

export const READ_TOOLS: ToolSpec[] = [
  defineTool({
    name: "get_status", mutating: false, schema: SCHEMAS.get_status,
    description: "The player's full status: level, hunter rank, XP, ability points, stats, HP/MP/fatigue, streaks per stat, gold, and today's goals with progress. Call this first when you need context.",
    run() {
      const s = getState(); if (!s) return noState();
      const d = statusData(s);
      const stats = Object.entries(d.stats).filter(([, v]) => !v.locked).map(([k, v]) => `${k} ${v.value}`).join(" · ");
      const streaks = Object.entries(d.streaks).filter(([, v]) => v.current > 0).map(([k, v]) => `${k} ${v.current}d`).join(" · ") || "none";
      const content = [
        `[STATUS] ${d.name} · LV ${d.level} · ${d.rank}-RANK · XP ${d.xp}/${d.xp_to_next} · ${d.gold} G${d.ability_points ? ` · ${d.ability_points} ability points` : ""}`,
        `Stats: ${stats}`,
        `HP ${s.vitals.hp} · MP ${s.vitals.mp} · Fatigue ${s.vitals.fatigue}`,
        `Streaks: ${streaks}`,
        `Today ${d.today.done}/${d.today.total} done, ${hm(d.today.minutesLeft)} left${d.today.penalty.active ? " · PENALTY ACTIVE" : ""}:`,
        ...(s.today?.goals ?? []).map(goalLine),
      ].join("\n");
      return ok(content, d);
    },
  }),
  defineTool({
    name: "get_today", mutating: false, schema: SCHEMAS.get_today,
    description: "Today's Daily Quest only: each goal with id, habit id, current/target and unit, done flag; minutes left before the day closes; penalty state. Use the goal ids it returns with log_progress / complete_goal.",
    run() {
      const s = getState(); if (!s) return noState();
      const d = todayData(s);
      if (!s.today) return ok("[DAILY QUEST] No quest is open yet.", d);
      const lines = [`[DAILY QUEST ${d.date}] ${d.done}/${d.total} done · ${hm(d.minutesLeft)} left`, ...s.today.goals.map(goalLine)];
      if (d.penalty.active) lines.push(`PENALTY ACTIVE until ${s.penalty?.endsAt}. Missed: ${s.penalty?.missedGoalIds.join(", ")}`);
      return ok(lines.join("\n"), d);
    },
  }),
  defineTool({
    name: "get_history", mutating: false, schema: SCHEMAS.get_history,
    description: "The last N closed days (default 14, max 90), oldest first: date, result (clear/partial/fail), and per goal [habit_id, current, target, done, rest]. Also a per-habit summary (days done, average amount). Use for weekly reviews and target tuning.",
    run(args) {
      const s = getState(); if (!s) return noState();
      const d = historyData(s, args.days ?? 14);
      const lines = [`[HISTORY] ${d.days.length} day(s)`];
      for (const [id, h] of Object.entries(d.per_habit)) lines.push(`${id}: done ${h.done}/${h.days} days, avg ${h.avg} (target ${h.target})`);
      if (d.days.length) lines.push(d.days.map((x) => `${x.date.slice(5)} ${x.result?.[0]?.toUpperCase() ?? "-"}`).join(" "));
      return ok(lines.join("\n"), d);
    },
  }),
  defineTool({
    name: "get_config", mutating: false, schema: SCHEMAS.get_config,
    description: "Read-only configuration: habits (id, label, stat, kind, daily target, unit, rest days, check-in schedule), when the day ends, and the economy (gold per goal, monthly reward budget in USD). Use habit ids from here in propose_targets.",
    run() {
      const s = getState(); if (!s) return noState();
      const c = s.config;
      const data = {
        player: { name: c.player.name, day_ends_at: c.player.dayEndsAt },
        habits: c.habits.map((h) => ({ id: h.id, label: h.label, stat: h.stat, kind: h.kind, target: h.target, unit: h.unit, rest_days: h.restDays ?? [], check_in: h.checkIn ?? null })),
        economy: c.economy,
        penalty: c.penalty,
        oracle_daily_budget_usd: c.oracle.dailyBudgetUsd,
      };
      const lines = [`[CONFIG] Day ends at ${c.player.dayEndsAt}`, ...c.habits.map((h) => `${h.id}: "${h.label}" ${h.stat} ${h.kind} target ${h.target} ${h.unit}${h.restDays?.length ? ` rest ${h.restDays.join("/")}` : ""}${h.checkIn ? " (yes/no check-ins)" : ""}`)];
      return ok(lines.join("\n"), data);
    },
  }),
  defineTool({
    name: "list_rewards", mutating: false, schema: SCHEMAS.list_rewards,
    description: "The real-world reward catalog: id, name, USD price, current gold price (includes monthly scarcity), whether the player can buy it now and why not; plus purchased rewards and the month's spend vs budget.",
    run() {
      const s = getState(); if (!s) return noState();
      const rows = s.rewards.map((r) => {
        const chk = selectors.canPurchase(r, s);
        return { id: r.id, name: r.name, usd: r.usd, gold_price: chk.price, purchased: !!r.purchasedAt, can_buy: chk.ok, reason: chk.ok ? null : chk.reason ?? null, url: r.url ?? null, stat: r.stat ?? null };
      });
      const data = { gold: s.gold, spent_this_month_usd: s.spentThisMonthUsd, monthly_budget_usd: s.config.economy.monthlyBudgetUsd, rewards: rows };
      const open = rows.filter((r) => !r.purchased);
      const lines = [`[SHOP] ${s.gold} G · spent $${s.spentThisMonthUsd}/$${s.config.economy.monthlyBudgetUsd} this month`,
        ...(open.length ? open.map((r) => `${r.name} — ${r.gold_price} G ($${r.usd})${r.can_buy ? "" : ` · ${r.reason}`}  {reward_id: ${r.id}}`) : ["No rewards listed."])];
      return ok(lines.join("\n"), data);
    },
  }),
];
