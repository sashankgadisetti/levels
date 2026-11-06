import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../config";
import { TEST_CONFIG } from "./helpers";
import { buildDailyQuest } from "../quests";
import { selectors } from "../index";
import { applyXp } from "../xp";
import { complete, feed, lastResult, MON, nextDay, popups, started, T, titles } from "./helpers";
import type { Event, Item } from "../types";

const item = (defId: string, id = defId): Item => ({ id, defId, name: defId, rarity: "rare", description: "", consumable: true, obtainedAt: "" });
const tenacity = { id: "tenacity", name: "Tenacity", kind: "passive" as const, effect: "", mpCost: 0, cooldownHours: 168, unlockedAt: "" };

describe("quests", () => {
  it("rest day pre-clears STR; scaling applies", () => {
    const q = buildDailyQuest(TEST_CONFIG, "2026-11-01", 1); // Sunday
    const gym = q.goals.find((g) => g.habitId === "gym")!;
    expect(gym).toMatchObject({ rest: true, done: true });
    expect(q.goals.filter((g) => g.done)).toHaveLength(1);
    const mon = buildDailyQuest({ ...TEST_CONFIG, habits: TEST_CONFIG.habits.map((h) => (h.id === "study" ? { ...h, scalePerLevel: 2 } : h)) }, MON, 11);
    expect(mon.goals.find((g) => g.habitId === "study")!.target).toBe(80);
    expect(mon.goals.find((g) => g.habitId === "gym")!.rest).toBeUndefined();
  });
  it("progress clamps and GOAL_SET works", () => {
    let r = started();
    const study = r.s.today!.goals.find((g) => g.habitId === "study")!;
    r = feed(r, { type: "GOAL_PROGRESS", goalId: study.id, delta: 45, at: T(MON, "10:00") });
    expect(r.s.today!.goals.find((g) => g.id === study.id)).toMatchObject({ current: 45, done: false });
    r = feed(r, { type: "GOAL_PROGRESS", goalId: study.id, delta: 999, at: T(MON, "11:00") });
    expect(r.s.today!.goals.find((g) => g.id === study.id)).toMatchObject({ current: 60, done: true });
    r = feed(r, { type: "GOAL_PROGRESS", goalId: study.id, delta: -999, at: T(MON, "11:05") });
    expect(r.s.today!.goals.find((g) => g.id === study.id)).toMatchObject({ current: 0, done: false });
    r = feed(r, { type: "GOAL_SET", goalId: study.id, value: 60, at: T(MON, "11:10") });
    expect(r.s.today!.goals.find((g) => g.id === study.id)!.done).toBe(true);
    expect(feed(r, { type: "GOAL_SET", goalId: "nope", value: 1, at: T(MON, "11:11") }).s.today).toEqual(r.s.today);
  });
  it("is idempotent and immutable", () => {
    const r = started();
    const snap = JSON.stringify(r.s);
    const r2 = feed(r, { type: "DAY_STARTED", date: MON, at: T(MON, "09:00") });
    expect(r2.fx).toHaveLength(r.fx.length);
    feed(r, { type: "TICK", at: T(MON, "20:00") });
    expect(JSON.stringify(r.s)).toBe(snap);
  });
});

describe("immediate full-clear reward", () => {
  it("pays on the completing event, not again at close, and clamps afterwards", () => {
    let r = started(undefined, (s) => { s.player.level = 10; });
    const goals = r.s.today!.goals;
    r = feed(r, ...goals.slice(0, 3).map((g) => ({ type: "GOAL_SET" as const, goalId: g.id, value: g.target, at: T(MON, "12:00") })));
    expect(r.s.boxes).toBe(0);
    expect(r.s.today!.rewardedAt).toBeUndefined();
    const n = r.fx.length;
    r = feed(r, { type: "GOAL_SET", goalId: goals[3].id, value: goals[3].target, at: T(MON, "13:00") });
    expect(r.s.today).toMatchObject({ rewardedAt: T(MON, "13:00"), result: "clear", xpEarned: 240, goldEarned: 90 });
    expect(r.s.boxes).toBe(1);
    expect(r.s.gold).toBe(90);
    expect(r.s.player).toMatchObject({ xp: 240, abilityPoints: 0 });
    expect(popups(r.fx.slice(n)).map((p) => p.title)[0]).toBe("DAILY QUEST COMPLETE");
    // no clawback / un-clearing
    r = feed(r, { type: "GOAL_SET", goalId: goals[3].id, value: 0, at: T(MON, "13:05") }, { type: "GOAL_PROGRESS", goalId: goals[0].id, delta: -5, at: T(MON, "13:06") });
    expect(r.s.today!.goals.every((g) => g.done && g.current === g.target)).toBe(true);
    expect(r.s.gold).toBe(90);
    const m = r.fx.length;
    r = nextDay(r);
    expect(r.s.gold).toBe(90);
    expect(r.s.boxes).toBe(1);
    expect(r.s.player).toMatchObject({ xp: 240, abilityPoints: 0 });
    expect(lastResult(r.s)).toMatchObject({ result: "clear", xpEarned: 240, goldEarned: 90 });
    expect(r.s.streaks.STR.current).toBe(1);
    expect(titles(r.fx.slice(m))).not.toContain("DAILY QUEST COMPLETE");
  });
  it("level-up popups follow the result popup immediately; shadow gold still paid at close", () => {
    let r = started(undefined, (s) => { s.shadows.push({ id: "x", name: "x", stat: "STR", rank: "Normal Soldier", extractedAt: "", streakAtExtraction: 1 }); });
    const n = r.fx.length;
    r = complete(r, "all", T(MON, "12:00"));
    const t = titles(r.fx.slice(n));
    expect(t.indexOf("DAILY QUEST COMPLETE")).toBeLessThan(t.indexOf("LEVEL UP"));
    const gold = r.s.gold;
    r = nextDay(r);
    expect(r.s.gold - gold).toBe(2);
  });
});

describe("day close", () => {
  it("clear: bonus, box, level-up ceremony order (no ability point for the clear)", () => {
    let r = complete(started(), "all", T(MON, "12:00"));
    r = nextDay(r);
    expect(lastResult(r.s)).toMatchObject({ date: MON, result: "clear", xpEarned: 240, goldEarned: 90 });
    expect(r.s.boxes).toBe(1);
    const g = applyXp(1, 0, 240, DEFAULT_CONFIG.curves);
    expect(g.levelsGained).toBeGreaterThan(0);
    expect(r.s.player).toMatchObject({ level: g.level, xp: g.xp, abilityPoints: g.pointsGained });
    expect(r.s.gold).toBe(90);
    expect(r.s.streaks.STR.current).toBe(1);
    expect(r.s.today!.date).toBe("2026-11-03");
    const t = titles(r.fx);
    expect(t.indexOf("DAILY QUEST COMPLETE")).toBeLessThan(t.indexOf("LEVEL UP"));
    expect(t.indexOf("LEVEL UP")).toBeLessThan(t.lastIndexOf("DAILY QUEST: PREPARATION TO BECOME POWERFUL"));
    expect(t).toContain("TITLE ACQUIRED");
  });
  it("partial: no bonus, missed stat streak broken, HP -5, no penalty", () => {
    let r = complete(started(), ["STR", "INT", "SENSE"], T(MON, "12:00"));
    r = nextDay(r);
    expect(lastResult(r.s)).toMatchObject({ result: "partial", xpEarned: 90 });
    expect(r.s.boxes).toBe(0);
    expect(r.s.penalty).toBeUndefined();
    expect(r.s.streaks.VIT.current).toBe(0);
    expect(r.s.streaks.STR.current).toBe(1);
    expect(r.s.vitals.hp).toBeLessThanOrEqual(100);
    expect(selectors.shopLocked(r.s)).toBe(false);
  });
  it("partial after partial becomes fail -> penalty", () => {
    let r = complete(started(), ["STR", "INT", "SENSE"], T(MON, "12:00"));
    r = nextDay(r);
    r = complete(r, ["STR", "INT", "SENSE"], T("2026-11-03", "12:00"));
    r = nextDay(r);
    expect(lastResult(r.s).result).toBe("fail");
    expect(r.s.penalty).toMatchObject({ cleared: false, missedGoalIds: ["2026-11-03:eat"] });
    expect(selectors.shopLocked(r.s)).toBe(true);
  });
  it("fail (0/4): penalty window, HP loss, timer, shop lock, alarm", () => {
    let r = nextDay(started());
    const q = lastResult(r.s);
    expect(q.result).toBe("fail");
    expect(r.s.penalty!.missedGoalIds).toHaveLength(4);
    expect(new Date(r.s.penalty!.endsAt).getTime() - new Date(r.s.penalty!.startedAt).getTime()).toBe(4 * 3_600_000);
    expect(r.s.vitals.hp).toBe(100 - 20 - 10);
    const pen = popups(r.fx).find((p) => p.title === "PENALTY QUEST: SURVIVE")!;
    expect(pen.sound).toBe("alarm");
    expect(pen.variant).toBe("penalty");
    r = nextDay(r);
    expect(r.s.penalty!.cleared).toBe(false); // persists
  });
  it("fail: 1/4 done", () => {
    const r = nextDay(complete(started(), ["STR"], T(MON, "12:00")));
    expect(lastResult(r.s).result).toBe("fail");
  });
  it("penalty makeup: half targets, clears, +10 HP, title", () => {
    let r = nextDay(started());
    const views = selectors.penaltyGoals(r.s);
    expect(views.map((v) => v.target)).toEqual([1, 30, 4, 2]);
    const hp = r.s.vitals.hp;
    for (const v of views.slice(0, 3)) r = feed(r, { type: "PENALTY_PROGRESS", goalId: v.goalId, delta: v.target, at: T("2026-11-03", "05:00") });
    expect(r.s.penalty!.cleared).toBe(false);
    r = feed(r, { type: "PENALTY_PROGRESS", goalId: views[3].goalId, delta: 99, at: T("2026-11-03", "05:30") });
    expect(r.s.penalty!.cleared).toBe(true);
    expect(r.s.vitals.hp).toBe(hp + 10);
    expect(selectors.shopLocked(r.s)).toBe(false);
    expect(titles(r.fx)).toContain("PENALTY CLEARED");
    expect(r.s.titles.some((t) => t.id === "overcame-adversity")).toBe(true);
  });
  it("penalty reminder after expiry, at most once per day", () => {
    let r = nextDay(started());
    const n0 = popups(r.fx).length;
    r = feed(r, { type: "TICK", at: T("2026-11-03", "09:00") }, { type: "TICK", at: T("2026-11-03", "10:00") });
    const w = popups(r.fx).slice(n0).filter((p) => p.variant === "warning" && p.blocks.some((b) => b.type === "text" && b.text.includes("Penalty Zone")));
    expect(w).toHaveLength(1);
  });
  it("Tenacity forgives one miss per week", () => {
    let r = started(undefined, (s) => { s.skills.push(tenacity); });
    r = nextDay(complete(r, ["STR", "INT", "SENSE"], T(MON, "12:00")));
    expect(lastResult(r.s).result).toBe("clear");
    expect(r.s.tenacityUsedWeek).toBe("2026-W45");
    expect(r.s.streaks.VIT.current).toBe(1);
    expect(r.s.boxes).toBe(1);
    r = nextDay(complete(r, ["STR", "INT", "SENSE"], T("2026-11-03", "12:00")));
    expect(lastResult(r.s).result).toBe("partial"); // already used this week
  });
  it("Streak Shield is consumed instead of breaking a streak", () => {
    let r = started(undefined, (s) => { s.streaks.VIT.current = 5; s.streaks.VIT.best = 5; s.streaks.VIT.lastDate = "2026-11-01"; s.inventory.push(item("streak-shield", "sh1")); });
    r = nextDay(complete(r, ["STR", "INT", "SENSE"], T(MON, "12:00")));
    expect(r.s.streaks.VIT.current).toBe(5);
    expect(r.s.inventory).toHaveLength(0);
    expect(titles(r.fx)).toContain("DAILY QUEST ENDED");
    // without a shield it breaks
    let r2 = started(undefined, (s) => { s.streaks.VIT.current = 5; s.streaks.VIT.lastDate = "2026-11-01"; });
    r2 = nextDay(complete(r2, ["STR", "INT", "SENSE"], T(MON, "12:00")));
    expect(r2.s.streaks.VIT.current).toBe(0);
  });
  it("vitals: HP/MP gains, fatigue", () => {
    let r = started(undefined, (s) => { s.vitals.hp = 50; s.vitals.mp = 0; });
    r = nextDay(complete(r, "all", T(MON, "12:00")));
    expect(r.s.vitals.hp).toBe(100); // level up restores
    r = started(undefined, (s) => { s.player.level = 10; s.vitals.hp = 50; s.vitals.mp = 0; });
    r = nextDay(complete(r, ["VIT", "SENSE"], T(MON, "12:00")));
    expect(r.s.vitals.mp).toBe(15);
    expect(r.s.vitals.fatigue).toBe(0);
    r = started();
    r = nextDay(complete(r, ["STR"], T(MON, "12:00")));
    expect(r.s.vitals.fatigue).toBe(10);
    let f = started(undefined, (s) => { s.vitals.fatigue = 80; });
    expect(selectors.restRecommended(f.s)).toBe(true);
    f = nextDay(f);
    expect(f.s.vitals.fatigue).toBe(70);
  });
  it("Sprint doubles the next completion; XP boost +50%", () => {
    let r = started(undefined, (s) => {
      s.skills.push({ id: "sprint", name: "Sprint", kind: "active", effect: "", mpCost: 15, cooldownHours: 24, unlockedAt: "" });
      s.player.level = 10; s.vitals.mp = 50; s.xpBoostFor = MON;
    });
    r = feed(r, { type: "SKILL_USED", skillId: "sprint", at: T(MON, "09:00") });
    expect(r.s.vitals.mp).toBe(35);
    const eat = r.s.today!.goals.find((g) => g.habitId === "eat")!;
    r = feed(r, { type: "GOAL_SET", goalId: eat.id, value: 3, at: T(MON, "10:00") });
    expect(r.s.today!.goals.find((g) => g.id === eat.id)!.xpMult).toBe(2);
    r = nextDay(r);
    // 30 * (1 + 0.5 boost) * 2 = 90
    expect(lastResult(r.s).xpEarned).toBe(90);
    r = feed(r, { type: "SKILL_USED", skillId: "sprint", at: T("2026-11-03", "08:00") });
    expect(r.s.vitals.mp).toBe(35); // on cooldown, no MP spent
  });
  it("Stealth suppresses popups (queued) until it ends", () => {
    let r = started(undefined, (s) => {
      s.skills.push({ id: "stealth", name: "Stealth", kind: "active", effect: "", mpCost: 10, cooldownHours: 12, unlockedAt: "" });
    });
    r = feed(r, { type: "SKILL_USED", skillId: "stealth", at: T(MON, "09:00"), hours: 2 });
    expect(r.s.quietUntil).toBe(T(MON, "11:00"));
    const n = r.fx.length;
    r = nextDay(r); // day 1 fails at 03:05 next day, outside stealth
    expect(popups(r.fx.slice(n)).some((p) => p.variant === "penalty")).toBe(true);
    // popups fired while quiet go to the queue and are released later; penalty passes through
    let q = started({ ...TEST_CONFIG, popups: { warnHoursBefore: [3, 1], quietHours: { from: "02:00", to: "04:00" } } });
    const m = q.fx.length;
    q = nextDay(q);
    const got = popups(q.fx.slice(m)).map((p) => p.title);
    expect(got).toContain("PENALTY QUEST: SURVIVE");
    expect(got).not.toContain("DAILY QUEST COMPLETE");
    expect(q.s.queuedPopups!.length).toBeGreaterThan(0);
    q = feed(q, { type: "TICK", at: T("2026-11-03", "05:00") });
    expect(titles(q.fx.slice(m))).toContain("DAILY QUEST FAILED");
    expect(q.s.queuedPopups).toBeUndefined();
  });
  it("warnings fire once per threshold, only if not clear", () => {
    let r = started();
    const n = r.fx.length;
    r = feed(r, { type: "TICK", at: T("2026-11-03", "00:30") }, { type: "TICK", at: T("2026-11-03", "00:40") }, { type: "TICK", at: T("2026-11-03", "01:30") }, { type: "TICK", at: T("2026-11-03", "02:10") });
    expect(popups(r.fx.slice(n)).filter((p) => p.title === "WARNING")).toHaveLength(2);
    let c = complete(started(), "all", T(MON, "12:00"));
    const m = c.fx.length;
    c = feed(c, { type: "TICK", at: T("2026-11-03", "01:30") });
    expect(popups(c.fx.slice(m)).filter((p) => p.title === "WARNING")).toHaveLength(0);
  });
  it("oracle effect on day start when enabled", () => {
    const r = started({ ...TEST_CONFIG, oracle: { ...DEFAULT_CONFIG.oracle, enabled: true } });
    expect(r.fx.some((e) => e.kind === "oracle" && e.request === "dayStart")).toBe(true);
    expect(started().fx.some((e) => e.kind === "oracle")).toBe(false);
  });
  it("points allocation, title equip, config change", () => {
    let r = nextDay(complete(started(), "all", T(MON, "12:00")));
    const ap0 = r.s.player.abilityPoints;
    expect(ap0).toBeGreaterThan(0);
    r = feed(r, { type: "POINTS_ALLOCATED", stat: "STR", points: ap0, at: T("2026-11-03", "09:00") });
    expect(r.s.stats.STR.allocated).toBe(ap0);
    expect(r.s.player.abilityPoints).toBe(0);
    r = feed(r, { type: "POINTS_ALLOCATED", stat: "STR", points: 500, at: T("2026-11-03", "09:01") }, { type: "POINTS_ALLOCATED", stat: "AGI", points: 1, at: T("2026-11-03", "09:02") });
    expect(r.s.player.abilityPoints).toBe(0);
    expect(r.s.player.equippedTitleId).toBe("awakened");
    r = feed(r, { type: "CONFIG_CHANGED", patch: { economy: { ...DEFAULT_CONFIG.economy, goldPerGoal: 99 } }, at: T("2026-11-03", "09:03") });
    expect(r.s.config.economy.goldPerGoal).toBe(99);
  });
  it("dungeon & gate", () => {
    let r = started();
    r = feed(r, { type: "DUNGEON_CLEARED", rank: "D", minutes: 25, bossName: "Goblin", at: T(MON, "10:00") }, { type: "GATE_RESULT", week: "2026-W45", cleared: true, at: T(MON, "11:00") });
    expect(r.s.dungeonsCleared).toBe(1);
    expect(r.s.gatesCleared).toBe(1);
    expect(r.s.boxes).toBe(1);
    expect(r.s.gold).toBe(30 + 300);
    expect(r.s.player.xp + 0).toBeGreaterThan(0);
  });
});
export type _E = Event;


describe("yes/no check-ins (water)", () => {
  const WATER = DEFAULT_CONFIG; // includes the water habit with a 90-minute check-in between 09:00 and 21:00
  const water = (r: ReturnType<typeof started>) => r.s.today!.goals.find((g) => g.habitId === "water")!;
  it("asks inside the window, not before, and respects the interval", () => {
    let r = started(WATER);
    expect(water(r).mode).toBe("yesno");
    r = feed(r, { type: "TICK", at: T(MON, "08:30") });
    expect(titles(r.fx).some((t) => /DRINK WATER CHECK/i.test(t))).toBe(false);
    r = { s: r.s, fx: [] };
    r = feed(r, { type: "TICK", at: T(MON, "09:30") });
    expect(titles(r.fx)).toContain("DRINK WATER CHECK");
    r = { s: r.s, fx: [] };
    r = feed(r, { type: "TICK", at: T(MON, "10:00") });
    expect(titles(r.fx)).not.toContain("DRINK WATER CHECK");
    r = { s: r.s, fx: [] };
    r = feed(r, { type: "TICK", at: T(MON, "11:01") });
    expect(titles(r.fx)).toContain("DRINK WATER CHECK");
  });
  it("YES logs one; NO re-asks after 15 minutes; stops when the goal is met", () => {
    let r = started(WATER);
    r = feed(r, { type: "TICK", at: T(MON, "09:30") });
    r = feed(r, { type: "CHECKIN_ANSWERED", habitId: "water", yes: false, at: T(MON, "09:31") });
    r = { s: r.s, fx: [] };
    r = feed(r, { type: "TICK", at: T(MON, "09:40") });
    expect(titles(r.fx)).not.toContain("DRINK WATER CHECK");
    r = feed(r, { type: "TICK", at: T(MON, "09:47") });
    expect(titles(r.fx)).toContain("DRINK WATER CHECK");
    r = feed(r, { type: "CHECKIN_ANSWERED", habitId: "water", yes: true, at: T(MON, "09:48") });
    expect(water(r).current).toBe(1);
    for (let i = 0; i < 4; i++) r = feed(r, { type: "CHECKIN_ANSWERED", habitId: "water", yes: true, at: T(MON, "12:00") });
    expect(water(r).done).toBe(true);
    r = { s: r.s, fx: [] };
    r = feed(r, { type: "TICK", at: T(MON, "15:00") });
    expect(titles(r.fx)).not.toContain("DRINK WATER CHECK");
  });
});
