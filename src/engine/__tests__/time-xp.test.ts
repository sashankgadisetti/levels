import { describe, expect, it } from "vitest";
import { dayBounds, isoWeek, localDate, weekdayOf } from "../time";
import { applyXp, xpToNext } from "../xp";
import { DEFAULT_CONFIG } from "../config";
import { nextRankAt, rankForLevel } from "../rank";

describe("time", () => {
  it("02:30 belongs to the previous player-day; 03:00 starts the new one", () => {
    expect(localDate(new Date(2026, 10, 4, 2, 30), "03:00")).toBe("2026-11-03");
    expect(localDate(new Date(2026, 10, 4, 2, 59), "03:00")).toBe("2026-11-03");
    expect(localDate(new Date(2026, 10, 4, 3, 0), "03:00")).toBe("2026-11-04");
    expect(localDate(new Date(2026, 10, 4, 0, 0).toISOString(), "00:00")).toBe("2026-11-04");
    expect(localDate(new Date(2026, 0, 1, 1, 0), "03:00")).toBe("2025-12-31");
  });
  it("handles DST-ish dates in March and November", () => {
    expect(localDate(new Date(2026, 2, 8, 2, 59), "03:00")).toBe("2026-03-07");
    expect(localDate(new Date(2026, 2, 8, 3, 30), "03:00")).toBe("2026-03-08");
    expect(localDate(new Date(2026, 10, 1, 2, 30), "03:00")).toBe("2026-10-31");
    expect(localDate(new Date(2026, 10, 1, 3, 0), "03:00")).toBe("2026-11-01");
    for (const d of ["2026-03-08", "2026-11-01", "2026-03-29", "2026-10-25"]) {
      const b = dayBounds(d, "03:00");
      const hours = (new Date(b.end).getTime() - new Date(b.start).getTime()) / 3_600_000;
      expect(hours).toBeGreaterThanOrEqual(23);
      expect(hours).toBeLessThanOrEqual(25);
      expect(localDate(b.start, "03:00")).toBe(d);
      expect(localDate(new Date(new Date(b.end).getTime() - 60_000), "03:00")).toBe(d);
    }
  });
  it("dayBounds, weekday, iso week", () => {
    const b = dayBounds("2026-11-04", "03:00");
    expect(new Date(b.start).getHours()).toBe(3);
    expect(new Date(b.end).getDate()).toBe(5);
    expect(weekdayOf("2026-11-04")).toBe("Wed");
    expect(weekdayOf("2026-11-01")).toBe("Sun");
    expect(isoWeek("2026-01-01")).toBe("2026-W01");
    expect(isoWeek("2025-12-29")).toBe("2026-W01");
    expect(isoWeek("2027-01-01")).toBe("2026-W53");
  });
});

describe("xp & rank", () => {
  it("golden curve", () => {
    expect([1, 2, 3, 4, 5].map((l) => xpToNext(l))).toEqual([30, 74, 125, 182, 243]);
  });
  it("multi-level-up carries overflow and grants points", () => {
    const g = applyXp(1, 0, 30 + 74 + 50, DEFAULT_CONFIG.curves);
    expect(g).toMatchObject({ level: 3, xp: 50, levelsGained: 2, pointsGained: 6 });
    expect(applyXp(1, 29, 1, DEFAULT_CONFIG.curves)).toMatchObject({ level: 2, xp: 0 });
  });
  it("ranks", () => {
    expect([1, 9, 10, 19, 20, 34, 35, 49, 50, 69, 70, 99, 100, 150].map(rankForLevel)).toEqual(
      ["E", "E", "D", "D", "C", "C", "B", "B", "A", "A", "S", "S", "NATIONAL", "NATIONAL"]);
    expect(nextRankAt(5)).toEqual({ rank: "D", level: 10 });
    expect(nextRankAt(100)).toBeUndefined();
  });
});
