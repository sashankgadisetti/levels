import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../config";
import { addDays } from "../time";
import { createInitialState, reduce } from "../reducer";
import { STATE_REV } from "../migrate";
import * as selectors from "../selectors";
import type { State } from "../types";
import { MON, T, complete, feed, nextDay, started } from "./helpers";

describe("stat points", () => {
  it("a completed goal adds +1 to its stat as soon as it is logged, and undo takes it back", () => {
    let r = started();
    const study = r.s.today!.goals.find((g) => g.stat === "INT")!;
    r = feed(r, { type: "GOAL_SET", goalId: study.id, value: study.target, at: T(MON, "10:00") });
    expect(r.s.stats.INT.value).toBe(11);
    r = feed(r, { type: "GOAL_SET", goalId: study.id, value: 0, at: T(MON, "10:05") });
    expect(r.s.stats.INT.value).toBe(10);
  });

  it("every 7th day in a row pays +2, so a week of one habit is +8", () => {
    let r = started();
    for (let d = 0; d < 7; d++) r = nextDay(complete(r, ["INT"], T(addDays(MON, d), "12:00")));
    expect(r.s.streaks.INT.current).toBe(7);
    expect(r.s.stats.INT.value).toBe(10 + 6 + 2);
  });

  it("daily consistency reaches 100 in about 11 weeks, not sooner", () => {
    let r = started();
    let day = 0;
    while (r.s.stats.INT.value < 100 && day < 200) { r = nextDay(complete(r, ["INT"], T(addDays(MON, day), "12:00"))); day++; }
    expect(day).toBeGreaterThanOrEqual(75);
    expect(day).toBeLessThanOrEqual(90);
  });

  it("a full clear pays no extra ability point; level-ups pay 1", () => {
    const r = nextDay(complete(started(), "all", T(MON, "12:00")));
    expect(r.s.player.level).toBe(2);
    expect(r.s.player.abilityPoints).toBe(1);
  });
});

describe("hydration stat", () => {
  it("water check-ins feed HYD, not VIT", () => {
    let r = started(DEFAULT_CONFIG);
    const water = r.s.today!.goals.find((g) => g.habitId === "water")!;
    expect(water.stat).toBe("HYD");
    expect(water.mode).toBe("yesno");
    for (let i = 0; i < water.target; i++) r = feed(r, { type: "CHECKIN_ANSWERED", habitId: "water", yes: true, at: T(MON, `1${i}:00`) });
    expect(r.s.stats.HYD.value).toBe(11);
    expect(r.s.stats.VIT.value).toBe(10);
  });

  it("migrates a rev-1 save: adds HYD, moves water off VIT, adopts the slower curves", () => {
    const old = createInitialState(DEFAULT_CONFIG) as State & Record<string, unknown>;
    delete old.rev;
    delete (old.stats as Partial<State["stats"]>).HYD;
    delete (old.streaks as Partial<State["streaks"]>).HYD;
    old.config = {
      ...DEFAULT_CONFIG,
      stats: DEFAULT_CONFIG.stats.filter((d) => d.id !== "HYD"),
      habits: DEFAULT_CONFIG.habits.map((h) => (h.id === "water" ? { ...h, stat: "VIT" as const } : h)),
      curves: { xpPerGoal: 30, fullClearBonus: 120, levelExponent: 1.3, levelBase: 30, pointsPerLevel: 3 },
    };
    const s = reduce(old, { type: "TICK", at: T(MON, "08:00") }).state;
    expect(s.rev).toBe(STATE_REV);
    expect(s.config.stats.map((d) => d.id)).toContain("HYD");
    expect(s.config.habits.find((h) => h.id === "water")!.stat).toBe("HYD");
    expect(s.config.curves).toEqual(DEFAULT_CONFIG.curves);
    expect(s.stats.HYD).toEqual({ value: 10, xp: 0, allocated: 0 });
    expect(s.streaks.HYD).toMatchObject({ current: 0, best: 0 });
  });

  it("keeps HYD when a settings save replaces the stat list", () => {
    let r = started();
    r = feed(r, { type: "CONFIG_CHANGED", patch: { stats: DEFAULT_CONFIG.stats.filter((d) => d.id !== "HYD") }, at: T(MON, "09:00") });
    expect(r.s.config.stats.map((d) => d.id)).toContain("HYD");
  });
});

describe("rest day button", () => {
  const gymOf = (r: ReturnType<typeof started>) => r.s.today!.goals.find((g) => g.habitId === "gym")!;

  it("rests the workout early in the week; Sunday then becomes a normal workout day", () => {
    let r = started(); // Mon 2026-11-02
    expect(selectors.canRest(r.s, gymOf(r))).toBe(true);
    r = feed(r, { type: "GOAL_RESTED", goalId: gymOf(r).id, at: T(MON, "10:00") });
    const g = gymOf(r);
    expect(g).toMatchObject({ rest: true, restManual: true, done: true, label: "Workout (rest day)", statPaid: 0.5 });
    expect(r.s.stats.STR.xp).toBe(50);
    // the week's one rest is used: no second rest on Tuesday, and Sunday is not auto-rested
    r = nextDay(complete(r, "all", T(MON, "12:00")));
    expect(selectors.canRest(r.s, gymOf(r))).toBe(false);
    for (let d = 1; d < 6; d++) r = nextDay(complete(r, "all", T(addDays(MON, d), "12:00")));
    expect(r.s.today!.date).toBe("2026-11-08"); // Sunday
    expect(gymOf(r).rest).toBeUndefined();
    expect(gymOf(r).done).toBe(false);
  });

  it("without an early rest, Sunday still rests automatically", () => {
    let r = started();
    for (let d = 0; d < 6; d++) r = nextDay(complete(r, "all", T(addDays(MON, d), "12:00")));
    expect(r.s.today!.date).toBe("2026-11-08");
    expect(gymOf(r)).toMatchObject({ rest: true, done: true });
    expect(gymOf(r).restManual).toBeUndefined();
  });

  it("high fatigue allows an extra STR rest; habits without rest days get no button", () => {
    let r = started();
    r = feed(r, { type: "GOAL_RESTED", goalId: gymOf(r).id, at: T(MON, "10:00") });
    r = nextDay(complete(r, "all", T(MON, "12:00")));
    r.s.vitals.fatigue = 80;
    expect(selectors.canRest(r.s, gymOf(r))).toBe(true);
    const study = r.s.today!.goals.find((g) => g.habitId === "study")!;
    expect(selectors.canRest(r.s, study)).toBe(false);
    r = feed(r, { type: "GOAL_RESTED", goalId: study.id, at: T("2026-11-03", "10:00") });
    expect(r.s.today!.goals.find((g) => g.habitId === "study")!.rest).toBeUndefined();
  });

  it("undo restores the goal until the day's rewards are paid", () => {
    let r = started();
    r = feed(r, { type: "GOAL_RESTED", goalId: gymOf(r).id, at: T(MON, "10:00") });
    r = feed(r, { type: "GOAL_REST_UNDONE", goalId: gymOf(r).id, at: T(MON, "10:01") });
    expect(gymOf(r)).toMatchObject({ done: false, current: 0, label: "Workout" });
    expect(gymOf(r).rest).toBeUndefined();
    expect(r.s.stats.STR.xp).toBe(0);
    // rest the last open goal: the clear pays out, and the rest can no longer be undone
    r = complete(r, ["INT", "SENSE", "VIT"], T(MON, "11:00"));
    r = feed(r, { type: "GOAL_RESTED", goalId: gymOf(r).id, at: T(MON, "12:00") });
    expect(r.s.today!.rewardedAt).toBe(T(MON, "12:00"));
    r = feed(r, { type: "GOAL_REST_UNDONE", goalId: gymOf(r).id, at: T(MON, "12:01") });
    expect(gymOf(r).rest).toBe(true);
  });
});
