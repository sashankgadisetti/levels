import { describe, expect, it } from "vitest";
import { addDays } from "../time";
import { pastDays } from "../selectors";
import { complete, feed, MON, nextDay, started, T, titles, type Run } from "./helpers";

const TUE = addDays(MON, 1), WED = addDays(MON, 2), THU = addDays(MON, 3);
const allHabits = (r: Run) => r.s.config.habits.map((h) => h.id);
/** Mon cleared and closed; the app is then not opened again until Thursday morning. */
function awayUntilThursday(): Run {
  const r = nextDay(complete(started(), "all", T(MON, "20:00"))); // Tue is open, untouched
  return feed(r, { type: "TICK", at: T(THU, "09:00") });
}

describe("PAST_DAY_LOGGED", () => {
  it("offers the unfinished days and creates a day the app never saw", () => {
    let r = awayUntilThursday();
    expect(r.s.today!.date).toBe(THU);
    expect(pastDays(r.s, T(THU, "09:01")).map((d) => [d.date, d.recorded])).toEqual([[WED, false], [TUE, true]]);
    const before = { xp: r.s.player.xp, level: r.s.player.level, gold: r.s.gold, boxes: r.s.boxes };
    r = feed({ s: r.s, fx: [] }, { type: "PAST_DAY_LOGGED", date: WED, habitIds: allHabits(r), at: T(THU, "09:02") });
    expect(r.s.history.map((d) => d.date)).toEqual([MON, TUE, WED]);
    expect(r.s.history[2].result).toBe("clear");
    expect(r.s.gold).toBeGreaterThan(before.gold);
    expect(r.s.boxes).toBe(before.boxes + 1);
    expect(r.s.player.level > before.level || r.s.player.xp > before.xp).toBe(true);
    expect(titles(r.fx)).toContain("PAST DAY LOGGED");
    expect(r.s.today!.date).toBe(THU);
  });

  it("amends a failed day: streaks come back and the penalty is lifted", () => {
    let r = awayUntilThursday();
    expect(r.s.history[1].result).toBe("fail");
    expect(r.s.penalty?.cleared).toBe(false);
    expect(r.s.streaks.INT.current).toBe(0);
    const hp = r.s.vitals.hp;
    r = feed(r, { type: "PAST_DAY_LOGGED", date: TUE, habitIds: allHabits(r), at: T(THU, "09:02") });
    expect(r.s.history[1].result).toBe("clear");
    expect(r.s.penalty?.cleared).toBe(true);
    expect(r.s.vitals.hp).toBeGreaterThan(hp);
    expect(r.s.streaks.INT.current).toBe(2);
    r = feed(r, { type: "PAST_DAY_LOGGED", date: WED, habitIds: allHabits(r), at: T(THU, "09:03") });
    expect(r.s.streaks.INT.current).toBe(3);
    expect(r.s.counters?.overall).toBe(3);
    expect(pastDays(r.s, T(THU, "09:04"))).toEqual([]);
    // today continues the repaired streak
    r = nextDay(complete(r, "all", T(THU, "20:00")));
    expect(r.s.streaks.INT.current).toBe(4);
  });

  it("pays each goal once and logs partial days", () => {
    let r = awayUntilThursday();
    const one = [r.s.config.habits.find((h) => h.stat === "INT")!.id];
    r = feed(r, { type: "PAST_DAY_LOGGED", date: WED, habitIds: one, at: T(THU, "09:02") });
    const q = r.s.history.find((d) => d.date === WED)!;
    expect(q.goals.filter((g) => g.done && !g.rest).map((g) => g.habitId)).toEqual(one);
    expect(q.result).not.toBe("clear");
    const snap = JSON.stringify(r.s);
    r = feed(r, { type: "PAST_DAY_LOGGED", date: WED, habitIds: one, at: T(THU, "09:03") });
    expect(JSON.stringify(r.s)).toBe(snap);
  });

  it("ignores today, future days and days too far back", () => {
    const r = awayUntilThursday();
    const snap = JSON.stringify(r.s);
    for (const date of [THU, addDays(THU, 1), addDays(THU, -8)]) {
      expect(JSON.stringify(feed(r, { type: "PAST_DAY_LOGGED", date, habitIds: allHabits(r), at: T(THU, "09:02") }).s)).toBe(snap);
    }
  });
});
