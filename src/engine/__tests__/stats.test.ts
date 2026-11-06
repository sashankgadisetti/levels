import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../config";
import { addDays } from "../time";
import { createInitialState, reduce } from "../reducer";
import { STATE_REV } from "../migrate";
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
