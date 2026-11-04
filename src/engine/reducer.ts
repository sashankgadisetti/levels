/**
 * The engine reducer: (state, event) -> (state, effects). Pure and deterministic: no Date.now(), all
 * time comes from `event.at`. Every call works on a private draft copy of the state.
 */
import { rollBox } from "./boxes";
import { bump, count, flushQueued, popup, type Ctx } from "./ctx";
import { canPurchase, goalGold, rewardGoldPrice } from "./economy";
import { makeItem, MAX_SHIELDS } from "./items";
import { clearPenalty, isPenaltyActive, penaltyGoals as penaltyViews, progressPenalty, startPenalty } from "./penalty";
import { buildDailyQuest, habitOf, isFullClear, setGoalValue } from "./quests";
import { rankForLevel, rankIndex } from "./rank";
import { useSkill } from "./skills";
import { shadowGold, shadowRankFor, updateStreaks } from "./streaks";
import { addDays, daysBetween, isoWeek, localDate, monthOf } from "./time";
import { titleGoldBonus, titleXpBonus } from "./titles";
import { checkUnlocks } from "./unlocks";
import { addHp, addMp, goalVitals, missedHpLoss } from "./vitals";
import { applyXp, xpToNext } from "./xp";
import { hoursUntilDayEnd } from "./selectors";
import * as W from "./windows";
import type { Config, Event, HunterRank, ReduceResult, State, StatId, YMD } from "./types";

const STATS: StatId[] = ["STR", "VIT", "AGI", "INT", "SENSE"];
const HISTORY_CAP = 800;

export function createInitialState(config: Config): State {
  const stats = {} as State["stats"], streaks = {} as State["streaks"];
  for (const id of STATS) { stats[id] = { value: 10, xp: 0, allocated: 0 }; streaks[id] = { stat: id, current: 0, best: 0 }; }
  return {
    version: 1, config,
    player: { accepted: false, name: config.player.name, level: 1, xp: 0, xpToNext: xpToNext(1, config.curves), abilityPoints: 0, rank: "E" },
    stats, vitals: { hp: 100, mp: 50, fatigue: 0 }, gold: 0, history: [], streaks, inventory: [], boxes: 0, rewards: [],
    spentThisMonthUsd: 0, titles: [], skills: [], shadows: [], dungeonsCleared: 0, gatesCleared: 0,
  };
}

/** Private working copy: everything mutable is copied, `config` and closed history entries are shared. */
function draft(s: State): State {
  const stats = {} as State["stats"], streaks = {} as State["streaks"];
  for (const id of STATS) { stats[id] = { ...s.stats[id] }; streaks[id] = { ...s.streaks[id] }; }
  return {
    ...s, player: { ...s.player }, stats, streaks, vitals: { ...s.vitals },
    today: s.today && { ...s.today, goals: s.today.goals.map((g) => ({ ...g })) },
    history: s.history.slice(), penalty: s.penalty && { ...s.penalty }, inventory: s.inventory.slice(),
    rewards: s.rewards.map((r) => ({ ...r })), titles: s.titles.slice(), skills: s.skills.slice(), shadows: s.shadows.slice(),
    pendingExtractions: s.pendingExtractions?.slice(), counters: s.counters && { ...s.counters },
    warned: s.warned && { ...s.warned, hours: s.warned.hours.slice() }, queuedPopups: s.queuedPopups?.slice(),
  };
}

const recalcStat = (s: State, id: StatId) => { s.stats[id].value = 10 + Math.floor(s.stats[id].xp / 100) + s.stats[id].allocated; };

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
  s.today = buildDailyQuest(s.config, date, s.player.level, c.at);
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
  if (n === 0) { finishDay(s, q); return; }

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
  for (const g of q.goals) {
    if (g.stat !== "INT") continue;
    const kind = habitOf(cfg, g)?.kind;
    const mins = kind === "hours" ? g.current * 60 : kind === "minutes" ? g.current : 0;
    if (mins) bump(s, "intMinutes", Math.round(mins));
  }

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
}

/** Pay goal XP/gold/vitals (+ full-clear bonus, box, point when `cleared`) and apply level-ups. Shadow gold is paid at close. */
function payGoals(c: Ctx, q: NonNullable<State["today"]>, cleared: boolean) {
  const s = c.s, cfg = s.config, date = q.date;
  const boost = s.xpBoostFor === date ? 0.5 : 0;
  let xp = 0, gold = 0, points = 0;
  const statXp: Partial<Record<StatId, number>> = {};
  for (const g of q.goals) {
    if (!g.done) continue;
    const h = habitOf(cfg, g);
    const diff = h && h.kind !== "check" && h.target > 0 ? Math.max(1, g.target / h.target) : 1;
    const mult = Math.min(3, Math.min(3, 1 + titleXpBonus(s, g.stat) + boost) * (g.xpMult ?? 1));
    const gx = Math.round(cfg.curves.xpPerGoal * diff * (g.rest ? 0.5 : 1) * mult);
    xp += gx; statXp[g.stat] = (statXp[g.stat] ?? 0) + gx;
    gold += goalGold(s, !!g.rest);
    const v = goalVitals(g.stat);
    addHp(s, v.hp); addMp(s, v.mp);
  }
  if (cleared) {
    xp += Math.round(cfg.curves.fullClearBonus * Math.min(3, 1 + titleXpBonus(s, "ALL") + boost));
    gold += cfg.economy.goldFullClear;
    s.boxes += 1; points = 1; s.player.abilityPoints += 1;
  }
  gold = Math.round(gold * (1 + titleGoldBonus(s)));
  s.gold += gold;
  for (const id of Object.keys(statXp) as StatId[]) { s.stats[id].xp += statXp[id]!; recalcStat(s, id); }
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
  if (!was && g.done && !g.rest && s.sprintArmed) { g.xpMult = 2; s.sprintArmed = false; }
  else if (was && !g.done && g.xpMult) { delete g.xpMult; s.sprintArmed = true; }
  const q = s.today!;
  if (!q.rewardedAt && isFullClear(q)) rewardClear(c, q);
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
    case "GOAL_PROGRESS": touchGoal(c, ev.goalId, (v) => v + ev.delta); return;
    case "GOAL_SET": touchGoal(c, ev.goalId, () => ev.value); return;
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
    case "TICK": tick(c); return;
    case "CONFIG_CHANGED":
      s.config = { ...s.config, ...ev.patch };
      s.player.xpToNext = xpToNext(s.player.level, s.config.curves);
      return;
  }
}

export function reduce(state: State, event: Event): ReduceResult {
  const c: Ctx = { s: draft(state), fx: [], at: event.at };
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

