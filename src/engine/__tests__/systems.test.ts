import { describe, expect, it } from "vitest";
import { DROP_TABLE, mulberry32, rollBox } from "../boxes";
import { canPurchase, rewardGoldPrice } from "../economy";
import { selectors } from "../index";
import { complete, feed, MON, nextDay, popups, started, T } from "./helpers";
import { dayBounds } from "../time";
import { addDays } from "../time";
import type { Shadow } from "../types";

const reward = (id: string, usd: number) => ({ id, name: id, usd, stat: "STR" as const });

describe("economy", () => {
  it("scarcity pricing", () => {
    const r = started(undefined, (s) => { s.spentThisMonthUsd = 100; });
    expect(rewardGoldPrice({ usd: 10 }, r.s)).toBe(200); // 100+10 <= 150
    expect(rewardGoldPrice({ usd: 50 }, r.s)).toBe(1000); // exactly on budget
    expect(rewardGoldPrice({ usd: 100 }, r.s)).toBe(2667); // 1.3333x
    expect(selectors.goldPriceOf({ ...reward("x", 100), createdAt: "" }, r.s)).toBe(2667);
  });
  it("purchase flow, budget lock, shop lock, monthly reset", () => {
    let r = started(undefined, (s) => { s.gold = 5000; });
    r = feed(r, { type: "REWARD_ADDED", reward: reward("book", 30), at: T(MON, "09:00") }, { type: "REWARD_ADDED", reward: reward("desk", 140), at: T(MON, "09:00") });
    r = feed(r, { type: "REWARD_PURCHASED", rewardId: "book", at: T(MON, "10:00") });
    expect(r.s.gold).toBe(5000 - 600);
    expect(r.s.spentThisMonthUsd).toBe(30);
    expect(r.s.rewards[0]).toMatchObject({ goldPaid: 600 });
    expect(canPurchase(r.s.rewards[1], r.s)).toMatchObject({ ok: false, reason: "over-budget" });
    const before = r.s.gold;
    r = feed(r, { type: "REWARD_PURCHASED", rewardId: "desk", at: T(MON, "10:05") });
    expect(r.s.gold).toBe(before);
    expect(r.fx.some((e) => e.kind === "notify")).toBe(true);
    // new month: reset on the first event
    r = feed(r, { type: "TICK", at: T("2026-12-02", "09:00") });
    expect(r.s.spentThisMonthUsd).toBe(0);
    expect(canPurchase(r.s.rewards[1], r.s)).not.toMatchObject({ reason: "over-budget" });
    expect(r.s.counters!.frugalMonths).toBe(1);
    // shop lock during penalty
    const p = nextDay(started(undefined, (s) => { s.gold = 5000; s.rewards.push({ ...reward("a", 10), createdAt: "" }); }));
    expect(canPurchase(p.s.rewards[0], p.s)).toMatchObject({ ok: false, reason: "shop-locked" });
    expect(canPurchase({ ...reward("a", 10), createdAt: "" }, started().s)).toMatchObject({ ok: false, reason: "insufficient-gold" });
  });
});

describe("boxes & items", () => {
  it("is deterministic per seed", () => {
    expect(rollBox(42)).toBe(rollBox(42));
    const a = mulberry32(7), b = mulberry32(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it("10k samples match the drop table within 2%", () => {
    const rnd = mulberry32(12345), N = 10_000, counts: Record<string, number> = {};
    for (let i = 0; i < N; i++) { const d = rollBox(Math.floor(rnd() * 2 ** 32)); counts[d] = (counts[d] ?? 0) + 1; }
    for (const e of DROP_TABLE) expect(Math.abs((counts[e.defId] ?? 0) / N - e.weight / 100)).toBeLessThan(0.02);
    expect(DROP_TABLE.reduce((a, e) => a + e.weight, 0)).toBe(100);
  });
  it("BOX_OPENED consumes a box and adds an item; items work", () => {
    let r = started(undefined, (s) => { s.boxes = 6; s.vitals.hp = 40; s.vitals.mp = 10; });
    expect(feed(r, { type: "BOX_OPENED", seed: 1, at: T(MON, "10:00") }).s.boxes).toBe(5);
    expect(feed(started(), { type: "BOX_OPENED", seed: 1, at: T(MON, "10:00") }).s.inventory).toHaveLength(0);
    const seed = (def: string) => { for (let i = 0; ; i++) if (rollBox(i) === def) return i; };
    for (const d of ["potion-recovery", "potion-mana", "xp-boost", "elixir-of-life", "dungeon-key"]) r = feed(r, { type: "BOX_OPENED", seed: seed(d), at: T(MON, "10:00") });
    expect(r.s.inventory.map((i) => i.defId)).toEqual(["potion-recovery", "potion-mana", "xp-boost", "elixir-of-life", "dungeon-key"]);
    const id = (d: string) => r.s.inventory.find((i) => i.defId === d)!.id;
    r = feed(r, { type: "ITEM_USED", itemId: id("potion-recovery"), at: T(MON, "11:00") }, { type: "ITEM_USED", itemId: id("potion-mana"), at: T(MON, "11:00") });
    expect(r.s.vitals).toMatchObject({ hp: 60, mp: 40 });
    r = feed(r, { type: "ITEM_USED", itemId: id("xp-boost"), at: T(MON, "11:00") });
    expect(r.s.xpBoostFor).toBe("2026-11-03");
    r = feed(r, { type: "ITEM_USED", itemId: id("elixir-of-life"), at: T(MON, "11:00") });
    expect(r.s.vitals.hp).toBe(100);
    r = feed(r, { type: "ITEM_USED", itemId: id("dungeon-key"), at: T(MON, "11:00") });
    expect(r.s.inventory).toHaveLength(0);
  });
  it("Elixir clears the penalty and the shield cap holds", () => {
    let r = nextDay(started(undefined, (s) => { s.inventory.push({ id: "e1", defId: "elixir-of-life", name: "E", rarity: "legendary", description: "", consumable: true, obtainedAt: "" }); }));
    expect(r.s.penalty!.cleared).toBe(false);
    r = feed(r, { type: "ITEM_USED", itemId: "e1", at: T("2026-11-03", "04:00") });
    expect(r.s.penalty!.cleared).toBe(true);
    expect(r.s.vitals.hp).toBe(100);
    const seed = (() => { for (let i = 0; ; i++) if (rollBox(i) === "streak-shield") return i; })();
    let h = started(undefined, (s) => { s.boxes = 4; });
    for (let i = 0; i < 4; i++) h = feed(h, { type: "BOX_OPENED", seed, at: T(MON, "10:00") });
    expect(h.s.inventory.filter((i) => i.defId === "streak-shield")).toHaveLength(2);
  });
});

describe("streaks & shadows", () => {
  it("7-day milestone offers extraction; SHADOW_EXTRACTED creates a Normal Soldier", () => {
    let r = started(undefined, (s) => { s.streaks.VIT = { stat: "VIT", current: 6, best: 6, lastDate: "2026-11-01" }; });
    r = nextDay(complete(r, "all", T(MON, "12:00")));
    expect(r.s.streaks.VIT.current).toBe(7);
    const offer = popups(r.fx).find((p) => p.title === "SHADOW EXTRACTION")!;
    expect(offer.actions[0]).toMatchObject({ kind: "extract:shadow", arg: "VIT:7" });
    expect(r.s.pendingExtractions).toHaveLength(1);
    r = feed(r, { type: "SHADOW_EXTRACTED", stat: "VIT", name: "Igris", at: T("2026-11-03", "09:00") });
    expect(r.s.shadows).toHaveLength(1);
    expect(r.s.shadows[0]).toMatchObject({ name: "Igris", rank: "Normal Soldier", stat: "VIT", streakAtExtraction: 7 });
    expect(r.s.pendingExtractions).toHaveLength(0);
    expect(feed(r, { type: "SHADOW_EXTRACTED", stat: "VIT", name: "Dup", at: T("2026-11-03", "09:01") }).s.shadows).toHaveLength(1);
    // shadow pays 2 gold per day at close
    const g = r.s.gold;
    r = nextDay(complete(r, "all", T("2026-11-03", "12:00")));
    expect(r.s.gold - g).toBe(90 + 2);
  });
  it("breaking a streak demotes the highest shadow one rank, never below Normal Soldier", () => {
    const sh = (id: string, rank: Shadow["rank"]): Shadow => ({ id, name: id, stat: "VIT", rank, extractedAt: "", streakAtExtraction: 1 });
    let r = started(undefined, (s) => {
      s.streaks.VIT = { stat: "VIT", current: 40, best: 40, lastDate: "2026-11-01" };
      s.shadows.push(sh("a", "Commander"), sh("b", "Elite Knight"));
    });
    r = nextDay(complete(r, ["STR", "INT", "SENSE"], T(MON, "12:00")));
    expect(r.s.shadows.map((x) => x.rank)).toEqual(["Knight", "Elite Knight"]);
    let f = started(undefined, (s) => { s.streaks.VIT = { stat: "VIT", current: 3, best: 3, lastDate: "2026-11-01" }; s.shadows.push(sh("a", "Normal Soldier")); });
    f = nextDay(complete(f, ["STR", "INT", "SENSE"], T(MON, "12:00")));
    expect(f.s.shadows).toHaveLength(1);
    expect(f.s.shadows[0].rank).toBe("Normal Soldier");
  });
  it("rest days keep the STR streak alive", () => {
    let r = started(undefined, (s) => { s.streaks.STR = { stat: "STR", current: 4, best: 4, lastDate: "2026-11-01" }; });
    // jump to Sunday 2026-11-08 via a quick chain of clear days
    for (let i = 0; i < 6; i++) r = nextDay(complete(r, "all", T(r.s.today!.date, "12:00")));
    expect(r.s.today!.date).toBe("2026-11-08");
    expect(r.s.today!.goals.find((g) => g.habitId === "gym")!.rest).toBe(true);
    r = nextDay(complete(r, ["INT", "SENSE", "VIT"], T("2026-11-08", "12:00")));
    expect(r.s.streaks.STR.current).toBe(4 + 7);
  });
  it("titles & skills unlock with popups; exactly 18 titles and 10 skills", async () => {
    const { TITLE_DEFS } = await import("../titles");
    const { SKILL_DEFS } = await import("../skills");
    expect(TITLE_DEFS).toHaveLength(18);
    expect(SKILL_DEFS).toHaveLength(10);
    let r = started(undefined, (s) => { s.player.level = 4; s.player.xp = 799; });
    r = nextDay(complete(r, "all", T(MON, "12:00"))); // -> level 5+
    expect(r.s.skills.map((k) => k.id)).toContain("tenacity");
    expect(popups(r.fx).map((p) => p.title)).toContain("NEW SKILL");
    expect(selectors.equippedTitle(r.s)?.id).toBe("awakened");
  });
  it("selectors", () => {
    const r = started();
    expect(selectors.todayProgress(r.s)).toMatchObject({ done: 0, total: 4 });
    expect(selectors.statRows(r.s)).toHaveLength(5);
    expect(selectors.statRows(r.s).find((x) => x.stat === "AGI")!.locked).toBe(true);
    expect(selectors.streakFor(r.s, "STR").current).toBe(0);
    expect(selectors.xpToNext(3)).toBe(125);
    const end = dayBounds(MON, "03:00").end;
    expect(selectors.hoursUntilDayEnd(r.s, new Date(new Date(end).getTime() - 5_400_000).toISOString())).toBeCloseTo(1.5);
    expect(addDays(MON, 1)).toBe("2026-11-03");
  });
});
