/**
 * The engine reducer: (state, event) -> (state, effects). Pure and deterministic: no Date.now(), all
 * time comes from `event.at`. Every call works on a private draft copy of the state.
 */
import { rollBox } from "./boxes";
import { bump, count, flushQueued, popup, type Ctx } from "./ctx";
import { canPurchase, goalGold, rewardGoldPrice } from "./economy";
import { makeItem, MAX_SHIELDS } from "./items";
import { clearPenalty, isPenaltyActive, penaltyGoals as penaltyViews, progressPenalty, startPenalty } from "./penalty";
import { BACKFILL_DAYS, buildDailyQuest, habitOf, isFullClear, setGoalValue } from "./quests";
import { rankForLevel, rankIndex } from "./rank";
import { useSkill } from "./skills";
import { shadowGold, shadowRankFor, updateStreaks } from "./streaks";
import { addDays, daysBetween, inQuietHours, isoWeek, localDate, monthOf } from "./time";
import { titleGoldBonus, titleXpBonus } from "./titles";
import { checkUnlocks } from "./unlocks";
import { addHp, addMp, goalVitals, missedHpLoss } from "./vitals";
import { applyXp, goalStatPoints, STAT_XP_PER_POINT, xpToNext } from "./xp";
import { migrate, STATE_REV, withHydration } from "./migrate";
import { canRest, canUndoRest, restsUsed } from "./rest";
import { hoursUntilDayEnd } from "./selectors";
import * as W from "./windows";
import { GATE_XP, STRIKE_XP_MULT, strikeGoalsFor } from "./projects";
import type { Config, Event, Goal, HunterRank, Project, ProjectStatus, ProjectStrike, ReduceResult, State, StatId, YMD , DailyQuest } from "./types";

const STATS: StatId[] = ["STR", "VIT", "AGI", "INT", "SENSE", "HYD"];
const HISTORY_CAP = 800;

export function createInitialState(config: Config): State {
  const stats = {} as State["stats"], streaks = {} as State["streaks"];
  for (const id of STATS) { stats[id] = { value: 10, xp: 0, allocated: 0 }; streaks[id] = { stat: id, current: 0, best: 0 }; }
  return {
    version: 1, rev: STATE_REV, config,
    player: { accepted: false, name: config.player.name, level: 1, xp: 0, xpToNext: xpToNext(1, config.curves), abilityPoints: 0, rank: "E" },
    stats, vitals: { hp: 100, mp: 50, fatigue: 0 }, gold: 0, history: [], streaks, inventory: [], boxes: 0, rewards: [],
    spentThisMonthUsd: 0, titles: [], skills: [], shadows: [], dungeonsCleared: 0, gatesCleared: 0,
  };
}

/** Private working copy: everything mutable is copied, `config` and closed history entries are shared. */
function draft(s: State): State {
  const stats = {} as State["stats"], streaks = {} as State["streaks"];
  // Defaults cover stats added after the save was made (e.g. HYD).
  for (const id of STATS) {
    const st = s.stats[id] as State["stats"][StatId] | undefined, sk = s.streaks[id] as State["streaks"][StatId] | undefined;
    stats[id] = st ? { ...st } : { value: 10, xp: 0, allocated: 0 };
    streaks[id] = sk ? { ...sk } : { stat: id, current: 0, best: 0 };
  }
  return {
    ...s, player: { ...s.player }, stats, streaks, vitals: { ...s.vitals },
    today: s.today && { ...s.today, goals: s.today.goals.map((g) => ({ ...g })) },
    history: s.history.slice(), penalty: s.penalty && { ...s.penalty }, inventory: s.inventory.slice(),
    rewards: s.rewards.map((r) => ({ ...r })), titles: s.titles.slice(), skills: s.skills.slice(), shadows: s.shadows.slice(),
    pendingExtractions: s.pendingExtractions?.slice(), counters: s.counters && { ...s.counters },
    warned: s.warned && { ...s.warned, hours: s.warned.hours.slice() }, queuedPopups: s.queuedPopups?.slice(),
    projects: s.projects?.map((p) => ({ ...p, milestones: p.milestones.map((m) => ({ ...m })), strikes: { ...p.strikes } })),
  };
}

const recalcStat = (s: State, id: StatId) => { s.stats[id].value = 10 + Math.floor(s.stats[id].xp / STAT_XP_PER_POINT) + s.stats[id].allocated; };

/** The day of `stat`'s streak that `date` becomes if the stat clears today. */
const streakDayFor = (s: State, stat: StatId, date: YMD) => {
  const st = s.streaks[stat];
  return (st.lastDate === addDays(date, -1) ? st.current : 0) + 1;
};
/** Credit (or take back) the stat points `g` is worth now, so stats move as goals are logged. */
function settleStat(s: State, g: Goal, date: YMD): void {
  const want = goalStatPoints(g, streakDayFor(s, g.stat, date), s.config.curves);
  const delta = want - (g.statPaid ?? 0);
  if (!delta) return;
  s.stats[g.stat].xp = Math.max(0, s.stats[g.stat].xp + delta * STAT_XP_PER_POINT);
  g.statPaid = want;
  recalcStat(s, g.stat);
}

interface LevelInfo { from: number; to: number; points: number; prevRank: HunterRank }
/** Add XP to the player, handling carry, level-ups, point grants, HP/MP restore and rank. */
function awardXp(c: Ctx, amount: number): LevelInfo | undefined {
  const s = c.s, p = s.player, prevRank = p.rank;
  const g = applyXp(p.level, p.xp, amount, s.config.curves);
  p.level = g.level; p.xp = g.xp; p.xpToNext = xpToNext(g.level, s.config.curves);
  if (!g.levelsGained) return undefined;
  p.abilityPoints += g.pointsGained;
  s.vitals.hp = 100; s.vitals.mp = 100;
  const r = rankForLevel(g.level);
  if (rankIndex(r) > rankIndex(p.rank)) p.rank = r;
  return { from: g.fromLevel, to: g.level, points: g.pointsGained, prevRank };
}
function announceLevel(c: Ctx, info?: LevelInfo): void {
  if (!info) return;
  popup(c, W.levelUp(info.to, info.from, info.points));
  if (c.s.player.rank !== info.prevRank) popup(c, W.rankUp(info.prevRank, c.s.player.rank, info.to));
}

function monthRoll(c: Ctx): void {
  const s = c.s, key = monthOf(localDate(c.at, s.config.player.dayEndsAt));
  if (s.monthKey && s.monthKey !== key) {
    if (s.spentThisMonthUsd > 0 && s.spentThisMonthUsd <= s.config.economy.monthlyBudgetUsd) bump(s, "frugalMonths");
    s.spentThisMonthUsd = 0;
  }
  s.monthKey = key;
}

function startDay(c: Ctx, date: YMD): void {
  const s = c.s;
  if (!s.player.accepted || s.today?.date === date) return;
  if (s.today && s.today.date < date) closeDay(c, s.today.date);
  if (s.today) return;
  const last = s.history[s.history.length - 1];
  if (last && last.date >= date) return; // that day is already closed
  if (last && daysBetween(last.date, date) >= 8) s.counters = { ...(s.counters ?? {}), comebackPending: 1 };
  s.today = buildDailyQuest(s.config, date, s.player.level, c.at, (id) => restsUsed(s, id, date));
  // Project strikes: the boss's daily strike joins the quest like any other goal.
  for (const g of strikeGoalsFor(s.projects, date)) if (!s.today.goals.some((x) => x.id === g.id)) s.today.goals.push(g);
  s.warned = undefined;
  popup(c, W.dailyQuest(s));
  if (s.config.oracle.enabled) {
    c.fx.push({
      kind: "oracle", request: "dayStart",
      context: {
        date, level: s.player.level, rank: s.player.rank, vitals: s.vitals, yesterday: last?.result,
        streaks: Object.fromEntries(STATS.map((id) => [id, s.streaks[id].current])),
        goals: s.today.goals.map((g) => ({ label: g.label, target: g.target, unit: g.unit, rest: !!g.rest })),
      },
    });
  }
}

function closeDay(c: Ctx, date: YMD): void {
  const s = c.s, q = s.today;
  if (!q || q.date !== date) return;
  const cfg = s.config, n = q.goals.length;
  q.closedAt = c.at;
  if (n === 0) { finishDay(s, q); resolveProjects(c, date); return; }

  const missed = q.goals.filter((g) => !g.done);
  const prev = s.history[s.history.length - 1]?.result;
  const week = isoWeek(date);
  const tenacity = missed.length === 1 && s.skills.some((k) => k.id === "tenacity") && s.tenacityUsedWeek !== week;
  const forgiven = tenacity ? missed[0] : undefined;
  if (tenacity) s.tenacityUsedWeek = week;
  const doneN = n - missed.length;
  const cleared = missed.length === (tenacity ? 1 : 0);
  const result: "clear" | "partial" | "fail" = cleared ? "clear" : doneN <= Math.floor(n / 4) || prev === "partial" || prev === "fail" ? "fail" : "partial";

  // --- rewards (already paid if the quest was fully cleared earlier) ---
  let hpLost = 0;
  const rewarded = !!q.rewardedAt;
  const pay = rewarded ? { xp: q.xpEarned ?? 0, gold: q.goldEarned ?? 0, points: 0, lvl: undefined as LevelInfo | undefined } : payGoals(c, q, cleared);
  let gold = pay.gold;
  for (const sh of s.shadows) { gold += shadowGold(sh); s.gold += shadowGold(sh); }
  const { xp, points, lvl } = pay;

  // --- vitals ---
  for (const g of missed) if (g !== forgiven) { const l = missedHpLoss(g.stat); hpLost += l; addHp(s, -l); }
  const gym = q.goals.find((g) => g.stat === "STR");
  if (gym) {
    if (gym.rest) s.vitals.fatigue = Math.max(0, s.vitals.fatigue - 40);
    else if (gym.done) {
      s.vitals.fatigue = Math.min(100, s.vitals.fatigue + (s.lastGymDate === addDays(date, -1) ? 25 : 10));
      s.lastGymDate = date; bump(s, "gymSessions");
    } else s.vitals.fatigue = Math.max(0, s.vitals.fatigue - 10);
  }
  const mins = intMinutes(cfg, q.goals);
  if (mins) bump(s, "intMinutes", mins);

  // --- streaks ---
  const statClear: Partial<Record<StatId, boolean>> = {};
  for (const g of q.goals) statClear[g.stat] = (statClear[g.stat] ?? true) && (g.done || g === forgiven);
  const so = updateStreaks(c, date, statClear, cleared);
  const overall = cleared ? count(s, "overall") + 1 : 0;
  s.counters = { ...(s.counters ?? {}), overall, bestOverall: Math.max(count(s, "bestOverall"), overall) };
  if (cleared && count(s, "comebackPending")) s.counters = { ...s.counters, comebackPending: 0, comeback: 1 };

  if (s.xpBoostFor && s.xpBoostFor <= date) s.xpBoostFor = undefined;
  s.sprintArmed = false;
  if (result === "fail") hpLost += cfg.penalty.hpLoss;

  q.result = result; q.xpEarned = xp; q.goldEarned = gold;
  finishDay(s, q);

  // --- ceremony, in order: result -> penalty -> level up(s) -> rank -> title/skill -> shadow offer ---
  if (!rewarded) popup(c, W.questComplete(q, { xp, gold, box: cleared, points, overallStreak: overall, shielded: so.shielded, broken: so.broken, tenacity, hpLost }));
  if (result === "fail") startPenalty(c, q, missed);
  announceLevel(c, lvl);
  checkUnlocks(c);
  for (const o of so.offers) popup(c, W.shadowOffer(o.stat, o.milestone));
  resolveProjects(c, date);
}

// --- Project quests (boss fights) ---------------------------------------------------------------

/** At the close of `date`, resolve every active project whose deadline is `date` or earlier. */
function resolveProjects(c: Ctx, date: YMD): void {
  for (const p of c.s.projects ?? []) {
    if (p.status !== "active" || p.deadline > date) continue;
    if (p.milestones.length > 0 && p.milestones.every((m) => m.done)) clearGate(c, p);
    else failGate(c, p);
  }
}

function clearGate(c: Ctx, p: Project): void {
  const s = c.s;
  p.status = "cleared"; p.resolvedAt = c.at;
  const gold = s.config.economy.goldGate, xp = p.xpBonus || GATE_XP;
  s.gatesCleared += 1; s.gold += gold; s.boxes += 1;
  bump(s, "projectsCleared");
  const lvl = awardXp(c, xp);
  popup(c, W.gateCleared(p, { gold, xp }));
  announceLevel(c, lvl);
}

function failGate(c: Ctx, p: Project): void {
  p.status = "failed"; p.resolvedAt = c.at;
  popup(c, W.gateFailed(p));
}

/** Remove a project's unfinished strike from the open day (abandoned / resolved early). */
function dropStrike(c: Ctx, projectId: string): void {
  const q = c.s.today;
  if (!q) return;
  const before = q.goals.length;
  q.goals = q.goals.filter((g) => g.projectId !== projectId || g.done);
  if (q.goals.length !== before && !q.rewardedAt && isFullClear(q)) rewardClear(c, q);
}

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES: ProjectStatus[] = ["active", "cleared", "failed", "abandoned"];

function cleanStrikes(p: Project, strikes: Record<YMD, ProjectStrike>): Record<YMD, ProjectStrike> {
  const out: Record<YMD, ProjectStrike> = {};
  for (const [d, st] of Object.entries(strikes ?? {})) {
    if (!YMD_RE.test(d) || d > p.deadline || !st?.title?.trim()) continue;
    const minutes = st.minutes && st.minutes > 0 ? Math.min(600, Math.round(st.minutes)) : undefined;
    out[d] = { title: st.title.trim().slice(0, 44), ...(minutes ? { minutes } : {}), ...(st.milestoneId ? { milestoneId: st.milestoneId } : {}) };
  }
  return out;
}

function applyProject(c: Ctx, ev: Extract<Event, { type: `PROJECT_${string}` }>): void {
  const s = c.s;
  if (ev.type === "PROJECT_CREATED") {
    const src = ev.project;
    if (!src?.id || !src.title?.trim() || !YMD_RE.test(src.deadline) || !STATS.includes(src.stat)) return;
    if (s.projects?.some((p) => p.id === src.id)) return;
    const p: Project = {
      id: src.id, title: src.title.trim().slice(0, 120), bossName: (src.bossName || "Unnamed Boss").trim().slice(0, 60), stat: src.stat,
      deadline: src.deadline, createdAt: ev.at, status: "active",
      milestones: (src.milestones ?? []).map((m) => ({ id: m.id, title: m.title.slice(0, 120), done: !!m.done, ...(m.done ? { doneAt: m.doneAt ?? ev.at } : {}) })),
      strikes: {}, xpBonus: src.xpBonus && src.xpBonus > 0 ? src.xpBonus : GATE_XP,
    };
    p.strikes = cleanStrikes(p, src.strikes ?? {});
    s.projects = [...(s.projects ?? []), p];
    popup(c, W.projectCreated(p));
    return;
  }
  const p = s.projects?.find((x) => x.id === ev.projectId);
  if (!p || p.status !== "active") return;
  switch (ev.type) {
    case "PROJECT_PLANNED": {
      const prev = new Map(p.milestones.map((m) => [m.id, m]));
      p.milestones = ev.milestones.filter((m) => m.id && m.title?.trim()).slice(0, 12).map((m) => {
        const old = prev.get(m.id);
        const done = m.done ?? old?.done ?? false;
        return { id: m.id, title: m.title.trim().slice(0, 120), done, ...(done ? { doneAt: old?.doneAt ?? ev.at } : {}) };
      });
      // Replace the plan from the open day on; strikes already behind us stay as the record.
      const cutoff = s.today?.date ?? localDate(ev.at, s.config.player.dayEndsAt);
      const kept = Object.fromEntries(Object.entries(p.strikes).filter(([d]) => d < cutoff));
      const fresh = Object.fromEntries(Object.entries(cleanStrikes(p, ev.strikes)).filter(([d]) => d >= cutoff));
      p.strikes = { ...kept, ...fresh };
      return;
    }
    case "PROJECT_MILESTONE_SET": {
      const m = p.milestones.find((x) => x.id === ev.milestoneId);
      if (!m || m.done === ev.done) return;
      m.done = ev.done;
      if (ev.done) m.doneAt = ev.at; else delete m.doneAt;
      return;
    }
    case "PROJECT_STATUS": {
      if (!STATUSES.includes(ev.status) || ev.status === "active") return;
      if (ev.status === "cleared") {
        if (!(p.milestones.length > 0 && p.milestones.every((m) => m.done))) return; // the boss is not dead yet
        clearGate(c, p);
      } else if (ev.status === "failed") failGate(c, p);
      else { p.status = "abandoned"; p.resolvedAt = ev.at; }
      dropStrike(c, p.id);
      return;
    }
  }
}

/** Pay goal XP/gold/vitals and stat points (+ full-clear bonus and box when `cleared`) and apply level-ups. Shadow gold is paid at close. */
function payGoals(c: Ctx, q: NonNullable<State["today"]>, cleared: boolean) {
  const s = c.s, cfg = s.config, date = q.date;
  const boost = s.xpBoostFor === date ? 0.5 : 0;
  let xp = 0, gold = 0;
  const points = 0; // ability points now come only from level-ups
  for (const g of q.goals) {
    settleStat(s, g, date);
    if (!g.done) continue;
    const h = habitOf(cfg, g);
    const diff = h && h.kind !== "check" && h.target > 0 ? Math.max(1, g.target / h.target) : 1;
    const mult = Math.min(3, Math.min(3, 1 + titleXpBonus(s, g.stat) + boost) * (g.xpMult ?? 1));
    const gx = Math.round(cfg.curves.xpPerGoal * diff * (g.rest ? 0.5 : 1) * mult * (g.projectId ? STRIKE_XP_MULT : 1));
    xp += gx;
    gold += goalGold(s, !!g.rest);
    const v = goalVitals(g.stat);
    addHp(s, v.hp); addMp(s, v.mp);
  }
  if (cleared) {
    xp += Math.round(cfg.curves.fullClearBonus * Math.min(3, 1 + titleXpBonus(s, "ALL") + boost));
    gold += cfg.economy.goldFullClear;
    s.boxes += 1;
  }
  gold = Math.round(gold * (1 + titleGoldBonus(s)));
  s.gold += gold;
  const lvl = awardXp(c, xp);
  return { xp, gold, points, lvl };
}

/** Immediate full-clear reward, fired by the goal event that completes the quest. */
function rewardClear(c: Ctx, q: NonNullable<State["today"]>): void {
  const s = c.s;
  const pay = payGoals(c, q, true);
  q.rewardedAt = c.at; q.result = "clear"; q.xpEarned = pay.xp; q.goldEarned = pay.gold;
  s.sprintArmed = false;
  popup(c, W.questComplete(q, { xp: pay.xp, gold: pay.gold, box: true, points: pay.points, overallStreak: count(s, "overall") + 1, shielded: [], broken: [], tenacity: false, hpLost: 0 }));
  announceLevel(c, pay.lvl);
  checkUnlocks(c);
}

const statCleared = (q: DailyQuest, stat: StatId, mode: Config["penalty"]["resetStreakOf"]) => {
  const goals = q.goals.filter((g) => g.stat === stat);
  // a "clear" day with a missed goal means Tenacity forgave it
  return goals.length > 0 && (goals.every((g) => g.done) || q.result === "clear") && !(mode === "all" && q.result !== "clear");
};
/** Consecutive days ending at `end` on which `stat` was cleared, read from closed history. */
function streakRun(s: State, stat: StatId, end: YMD): number {
  const byDate = new Map(s.history.map((d) => [d.date, d]));
  let n = 0;
  for (let d = end; ; d = addDays(d, -1)) {
    const q = byDate.get(d);
    if (!q || !statCleared(q, stat, s.config.penalty.resetStreakOf)) return n;
    n++;
  }
}
const intMinutes = (cfg: Config, goals: Goal[]) => goals.reduce((sum, g) => {
  if (g.stat !== "INT") return sum;
  const kind = habitOf(cfg, g)?.kind;
  return sum + Math.round(kind === "hours" ? g.current * 60 : kind === "minutes" ? g.current : 0);
}, 0);

/**
 * Log goals for a day that already ended. The day is created if the app was never opened on it, otherwise
 * the closed day is amended. Newly completed goals pay their normal rewards, streaks are repaired and a
 * penalty caused by those goals is lifted. Nothing is ever taken away.
 */
function logPastDay(c: Ctx, date: YMD, habitIds: string[]): void {
  const s = c.s, cfg = s.config;
  if (!s.player.accepted) return;
  const cur = localDate(c.at, cfg.player.dayEndsAt);
  if (date >= (s.today?.date ?? cur) || date >= cur || daysBetween(date, cur) > BACKFILL_DAYS) return;

  let i = s.history.findIndex((d) => d.date === date);
  const existed = i >= 0;
  const q: DailyQuest = existed
    ? { ...s.history[i], goals: s.history[i].goals.map((g) => ({ ...g })) }
    : { ...buildDailyQuest(cfg, date, s.player.level, undefined, (id) => restsUsed(s, id, date)), closedAt: c.at };
  const picked = q.goals.filter((g) => !g.done && habitIds.includes(g.habitId));
  if (!picked.length) return;
  const wasDone = new Set(existed ? q.goals.filter((g) => g.done).map((g) => g.id) : []);
  const wasClear = existed && q.result === "clear";
  const intBefore = existed ? intMinutes(cfg, q.goals) : 0;
  for (const g of picked) setGoalValue(g, g.target);
  const fresh = q.goals.filter((g) => g.done && !wasDone.has(g.id));

  if (existed) s.history[i] = q;
  else {
    i = s.history.findIndex((d) => d.date > date);
    if (i < 0) i = s.history.length;
    s.history.splice(i, 0, q);
  }

  // --- rewards for the goals that are newly done ---
  const cleared = isFullClear(q);
  const pay = payGoals(c, { ...q, goals: fresh }, cleared && !wasClear);
  let gold = pay.gold;
  if (!existed) for (const sh of s.shadows) { gold += shadowGold(sh); s.gold += shadowGold(sh); }
  if (existed) for (const g of fresh) addHp(s, missedHpLoss(g.stat)); // give back what the miss cost
  const n = q.goals.length, doneN = q.goals.filter((g) => g.done).length;
  const prev = s.history[i - 1]?.result;
  q.result = cleared || wasClear ? "clear" : doneN <= Math.floor(n / 4) || prev === "partial" || prev === "fail" ? "fail" : "partial";
  q.xpEarned = (q.xpEarned ?? 0) + pay.xp; q.goldEarned = (q.goldEarned ?? 0) + gold;

  // --- counters ---
  if (fresh.some((g) => g.stat === "STR" && !g.rest)) {
    bump(s, "gymSessions");
    if (!s.lastGymDate || s.lastGymDate < date) s.lastGymDate = date;
  }
  const mins = intMinutes(cfg, q.goals) - intBefore;
  if (mins > 0) bump(s, "intMinutes", mins);

  // --- streaks ---
  const step: Partial<Record<StatId, boolean>> = {};
  for (const stat of new Set(q.goals.map((g) => g.stat))) {
    const st = s.streaks[stat];
    if (!st.lastDate || st.lastDate < date) step[stat] = q.goals.every((g) => g.stat !== stat || g.done); // the newest day streaks have seen: a normal close step
    else { st.current = Math.max(st.current, streakRun(s, stat, st.lastDate)); st.best = Math.max(st.best, st.current); }
  }
  const so = updateStreaks(c, date, step, cleared);
  let overall = 0;
  for (let k = s.history.length - 1; k >= 0 && s.history[k].result === "clear"; k--) overall++;
  s.counters = { ...(s.counters ?? {}), overall, bestOverall: Math.max(count(s, "bestOverall"), overall) };
  if (s.today) for (const g of s.today.goals) settleStat(s, g, s.today.date); // today's streak day may have changed

  // --- penalty: goals that are now done no longer need a makeup ---
  const p = s.penalty;
  if (p && !p.cleared) {
    const left = p.missedGoalIds.filter((id) => !fresh.some((g) => g.id === id));
    if (left.length === 0) { s.penalty = { ...p, missedGoalIds: left, cleared: true }; addHp(s, cfg.penalty.hpLoss); }
    else if (left.length !== p.missedGoalIds.length) s.penalty = { ...p, missedGoalIds: left };
  }

  const lifted = !!p && !p.cleared && !!s.penalty?.cleared;
  popup(c, W.notice("PAST DAY LOGGED", `${date}: ${doneN}/${n} goals done. XP +${pay.xp}  GOLD +${gold}.${cleared && !wasClear ? " Full clear: random box x1." : ""}${lifted ? " Penalty lifted." : ""}`, "gold"));
  announceLevel(c, pay.lvl);
  for (const o of so.offers) popup(c, W.shadowOffer(o.stat, o.milestone));
}

function finishDay(s: State, q: NonNullable<State["today"]>): void {
  s.history.push(q);
  if (s.history.length > HISTORY_CAP) s.history.splice(0, s.history.length - HISTORY_CAP);
  s.today = undefined;
}

function touchGoal(c: Ctx, goalId: string, fn: (v: number) => number): void {
  const s = c.s, g = s.today?.goals.find((x) => x.id === goalId);
  if (!g) return;
  const was = g.done;
  setGoalValue(g, s.today!.rewardedAt ? Math.max(g.target, fn(g.current)) : fn(g.current));
  settleStat(s, g, s.today!.date);
  if (!was && g.done && !g.rest && s.sprintArmed) { g.xpMult = 2; s.sprintArmed = false; }
  else if (was && !g.done && g.xpMult) { delete g.xpMult; s.sprintArmed = true; }
  const q = s.today!;
  if (!q.rewardedAt && isFullClear(q)) rewardClear(c, q);
}

const REST_SUFFIX = " (rest day)";
/** Rest day button: the goal counts as a rest (done, half rewards, streak kept) and uses the week's allowance. */
function restGoal(c: Ctx, goalId: string): void {
  const s = c.s, q = s.today, g = q?.goals.find((x) => x.id === goalId);
  if (!q || !g || !canRest(s, g)) return;
  g.rest = true; g.restManual = true;
  if (!g.label.endsWith(REST_SUFFIX)) g.label += REST_SUFFIX;
  setGoalValue(g, g.target);
  settleStat(s, g, q.date);
  if (!q.rewardedAt && isFullClear(q)) rewardClear(c, q);
}
function undoRest(c: Ctx, goalId: string): void {
  const s = c.s, q = s.today, g = q?.goals.find((x) => x.id === goalId);
  if (!q || !g || !canUndoRest(s, g)) return;
  delete g.rest; delete g.restManual;
  if (g.label.endsWith(REST_SUFFIX)) g.label = g.label.slice(0, -REST_SUFFIX.length);
  setGoalValue(g, 0);
  settleStat(s, g, q.date);
}

/** Yes/no prompts (e.g. water): ask every `everyMinutes` inside the habit's window until today's goal is met. */
function runCheckIns(c: Ctx, q: DailyQuest): void {
  const s = c.s;
  const now = new Date(c.at).getTime();
  for (const h of s.config.habits) {
    if (!h.checkIn) continue;
    const g = q.goals.find((x) => x.habitId === h.id);
    if (!g || g.done || g.rest) continue;
    if (!inQuietHours(c.at, { from: h.checkIn.from, to: h.checkIn.to })) continue; // outside the active window
    const last = s.checkIns?.[h.id];
    if (last && now - new Date(last).getTime() < h.checkIn.everyMinutes * 60_000) continue;
    (s.checkIns ??= {})[h.id] = c.at;
    popup(c, W.checkIn(h, g, Math.round(now / 60_000)), { droppable: true });
  }
}

function answerCheckIn(c: Ctx, habitId: string, yes: boolean): void {
  const s = c.s, h = s.config.habits.find((x) => x.id === habitId);
  if (!h) return;
  const g = s.today?.goals.find((x) => x.habitId === habitId);
  const every = h.checkIn?.everyMinutes ?? 90;
  // YES: log one; next prompt after the normal interval. NO: ask again in 15 minutes.
  const backoffMin = yes ? 0 : Math.max(0, every - 15);
  (s.checkIns ??= {})[habitId] = new Date(new Date(c.at).getTime() - backoffMin * 60_000).toISOString();
  if (yes && g && !g.done) touchGoal(c, g.id, (v) => v + 1);
}

function tick(c: Ctx): void {
  const s = c.s;
  s.lastTickAt = c.at;
  if (!s.player.accepted) return;
  const cur = localDate(c.at, s.config.player.dayEndsAt);
  if (s.today && s.today.date < cur) closeDay(c, s.today.date);
  if (!s.today) startDay(c, cur);

  const q = s.today;
  if (q && !isFullClear(q)) {
    const left = hoursUntilDayEnd(s, c.at);
    const w = s.warned?.date === q.date ? s.warned : { date: q.date, hours: [] as number[] };
    const crossed = s.config.popups.warnHoursBefore.filter((h) => left <= h && !w.hours.includes(h));
    if (crossed.length) {
      s.warned = { date: q.date, hours: [...w.hours, ...crossed] };
      popup(c, W.warning(left, q.goals), { droppable: true });
    }
  }
  if (q) runCheckIns(c, q);
  const p = s.penalty;
  if (p && !p.cleared && c.at >= p.endsAt && p.warnedDate !== cur) {
    s.penalty = { ...p, warnedDate: cur };
    popup(c, W.penaltyPersists(s.penalty, penaltyViews(s)), { droppable: true });
  }
}

function useItem(c: Ctx, itemId: string): void {
  const s = c.s, i = s.inventory.findIndex((x) => x.id === itemId);
  if (i < 0) return;
  const it = s.inventory[i];
  const consume = () => s.inventory.splice(i, 1);
  switch (it.defId) {
    case "potion-recovery": addHp(s, 20); consume(); break;
    case "potion-mana": addMp(s, 30); consume(); break;
    case "xp-boost": {
      const day = addDays(s.today?.date ?? localDate(c.at, s.config.player.dayEndsAt), 1);
      if (s.xpBoostFor === day) return;
      s.xpBoostFor = day; consume();
      popup(c, W.notice("XP BOOST", `XP +50% for ${day}.`, "gold"));
      break;
    }
    case "elixir-of-life":
      if (!isPenaltyActive(s) && s.vitals.hp >= 100) return;
      consume(); clearPenalty(c, "elixir"); s.vitals.hp = 100;
      break;
    case "dungeon-key": {
      consume();
      const r = rankForLevel(s.player.level);
      popup(c, W.dungeonKey(r === "NATIONAL" ? "S" : r));
      break;
    }
    default: break; // streak-shield: auto-consumed at streak break
  }
}

function openBox(c: Ctx, seed: number): void {
  const s = c.s;
  if (s.boxes <= 0) return;
  s.boxes -= 1;
  let defId = rollBox(seed);
  if (defId === "streak-shield" && s.inventory.filter((i) => i.defId === "streak-shield").length >= MAX_SHIELDS) defId = "potion-recovery";
  const seq = count(s, "itemSeq") + 1;
  bump(s, "itemSeq"); bump(s, "boxesOpened");
  const item = makeItem(defId, `item-${seq}`, c.at, s.player.level);
  s.inventory.push(item);
  popup(c, W.boxOpened(item));
}

const GATE_MULT: Record<HunterRank, number> = { E: 1, D: 1.5, C: 2, B: 3, A: 4, S: 6, NATIONAL: 6 };

function apply(c: Ctx, ev: Event): void {
  const s = c.s;
  switch (ev.type) {
    case "PLAYER_ACCEPTED":
      if (s.player.accepted) return;
      s.player.accepted = true; s.player.name = ev.name.slice(0, 40) || s.player.name;
      popup(c, W.notice("PLAYER REGISTERED", `Welcome, ${s.player.name}.`));
      return;
    case "DAY_STARTED": startDay(c, ev.date); return;
    case "DAY_CLOSED": closeDay(c, ev.date); return;
    case "PAST_DAY_LOGGED": logPastDay(c, ev.date, ev.habitIds); return;
    case "GOAL_PROGRESS": touchGoal(c, ev.goalId, (v) => v + ev.delta); return;
    case "GOAL_SET": touchGoal(c, ev.goalId, () => ev.value); return;
    case "GOAL_RESTED": restGoal(c, ev.goalId); return;
    case "GOAL_REST_UNDONE": undoRest(c, ev.goalId); return;
    case "PENALTY_PROGRESS": progressPenalty(c, ev.goalId, ev.delta); return;
    case "PENALTY_CLEARED": clearPenalty(c, "makeup"); return;
    case "POINTS_ALLOCATED": {
      const unlocked = s.config.stats.find((d) => d.id === ev.stat && !d.locked);
      if (!unlocked || !Number.isInteger(ev.points) || ev.points <= 0 || ev.points > s.player.abilityPoints) return;
      s.stats[ev.stat].allocated += ev.points; s.player.abilityPoints -= ev.points; recalcStat(s, ev.stat);
      return;
    }
    case "BOX_OPENED": openBox(c, ev.seed); return;
    case "ITEM_USED": useItem(c, ev.itemId); return;
    case "REWARD_ADDED":
      if (s.rewards.some((r) => r.id === ev.reward.id)) return;
      s.rewards.push({ ...ev.reward, createdAt: ev.at });
      return;
    case "REWARD_REMOVED": s.rewards = s.rewards.filter((r) => r.id !== ev.rewardId || r.purchasedAt); return;
    case "REWARD_PURCHASED": {
      const r = s.rewards.find((x) => x.id === ev.rewardId);
      const chk = canPurchase(r, s);
      if (!r || !chk.ok) {
        if (r) c.fx.push({ kind: "notify", title: "PURCHASE DENIED", body: `${r.name}: ${chk.ok ? "" : chk.reason}` });
        return;
      }
      const price = rewardGoldPrice(r, s);
      s.gold -= price; s.spentThisMonthUsd += r.usd; r.purchasedAt = ev.at; r.goldPaid = price;
      popup(c, W.notice("REWARD ACQUIRED", `${r.name}. Gold -${price}.`, "gold"));
      return;
    }
    case "SHADOW_EXTRACTED": {
      const i = s.pendingExtractions?.findIndex((p) => p.stat === ev.stat) ?? -1;
      if (i < 0) return;
      const [offer] = s.pendingExtractions!.splice(i, 1);
      const shadow = {
        id: `shadow-${ev.stat}-${offer.milestone}-${s.shadows.length + 1}`, name: ev.name.slice(0, 32) || "Shadow", stat: ev.stat,
        rank: shadowRankFor(offer.milestone), ...(ev.epithet ? { epithet: ev.epithet } : {}), extractedAt: ev.at, streakAtExtraction: s.streaks[ev.stat].current,
      };
      s.shadows.push(shadow);
      popup(c, W.shadowExtracted(shadow));
      return;
    }
    case "TITLE_EQUIPPED": if (s.titles.some((t) => t.id === ev.titleId)) s.player.equippedTitleId = ev.titleId; return;
    case "SKILL_USED": useSkill(c, ev.skillId, ev.hours); return;
    case "DUNGEON_CLEARED": {
      const r = rankIndex(ev.rank) + 1;
      const xp = r * 40, gold = Math.min(80, 10 + r * 10);
      s.dungeonsCleared += 1; s.gold += gold; s.stats.INT.xp += xp; recalcStat(s, "INT");
      const lvl = awardXp(c, xp);
      popup(c, W.dungeonCleared(ev.rank, ev.bossName, xp, gold));
      announceLevel(c, lvl);
      return;
    }
    case "GATE_RESULT": {
      if (!ev.cleared) return;
      const rank = s.player.rank, gold = Math.round(s.config.economy.goldGate * GATE_MULT[rank]), xp = 400;
      s.gatesCleared += 1; s.gold += gold; s.boxes += 1;
      const lvl = awardXp(c, xp);
      popup(c, W.gate(rank, ev.week, true, { gold, xp }));
      announceLevel(c, lvl);
      return;
    }
    case "CHECKIN_ANSWERED": answerCheckIn(c, ev.habitId, ev.yes); return;
    case "PROJECT_CREATED": case "PROJECT_PLANNED": case "PROJECT_MILESTONE_SET": case "PROJECT_STATUS": applyProject(c, ev); return;
    case "TICK": tick(c); return;
    case "CONFIG_CHANGED":
      s.config = { ...s.config, ...withHydration(ev.patch) };
      s.player.xpToNext = xpToNext(s.player.level, s.config.curves);
      return;
  }
}

export function reduce(state: State, event: Event): ReduceResult {
  const c: Ctx = { s: draft(state), fx: [], at: event.at };
  migrate(c.s);
  flushQueued(c);
  monthRoll(c);
  apply(c, event);
  checkUnlocks(c);
  return { state: c.s, effects: c.fx };
}

export function replay(config: Config, events: Event[]): State {
  let s = createInitialState(config);
  for (const e of events) s = reduce(s, e).state;
  return s;
}

