import { describe, expect, it } from "vitest";
import { parseSpec } from "../../system/spec";
import { rollBox } from "../boxes";
import { dungeonBoundsFor, clampDungeonMinutes, dungeonKeys, dungeonSecondsLeft } from "../dungeons";
import { replay } from "../reducer";
import * as W from "../windows";
import type { Event, Item, State } from "../types";
import { feed, MON, popups, started, T, TEST_CONFIG, titles, type Run } from "./helpers";

const key = (id: string, rank: string): Item => ({ id, defId: "dungeon-key", name: `Dungeon Key (${rank})`, rarity: "rare", description: `Opens an Instant Dungeon of rank ${rank}.`, consumable: true, obtainedAt: "2026-11-01T00:00:00.000Z" });
const withKeys = (...keys: Item[]) => started(undefined, (s: State) => { s.inventory.push(...keys); });
const start = (r: Run, at: string, extra: Partial<Extract<Event, { type: "DUNGEON_STARTED" }>> = {}) =>
  feed(r, { type: "DUNGEON_STARTED", rank: "E", bossName: "Goblin Chief", minutes: 25, at, ...extra });
const goal = (r: Run, habitId: string) => r.s.today!.goals.find((g) => g.habitId === habitId)!;

describe("Instant Dungeons", () => {
  it("bounds by rank clamp the duration", () => {
    expect(dungeonBoundsFor("E")).toEqual({ min: 25, max: 25, options: [25] });
    expect(dungeonBoundsFor("D").options).toEqual([25, 50]);
    expect(dungeonBoundsFor("C").options).toEqual([50]);
    expect(dungeonBoundsFor("B").options).toEqual([50, 90]);
    expect(dungeonBoundsFor("S").options).toEqual([90]);
    expect(clampDungeonMinutes("D", 90)).toBe(50);
    expect(clampDungeonMinutes("D", 5)).toBe(25);
    expect(clampDungeonMinutes("B", 70)).toBe(70);
    expect(clampDungeonMinutes("A")).toBe(90);
  });

  it("a key is consumed on start; its rank sets the dungeon and minutes are clamped", () => {
    let r = start(withKeys(key("k1", "C")), T(MON, "09:00"), { keyItemId: "k1", minutes: 25, rank: "S" });
    expect(r.s.inventory.some((i) => i.id === "k1")).toBe(false);
    expect(r.s.dungeon).toMatchObject({ rank: "C", minutes: 50, keyless: false, keyItemId: "k1", bossName: "Goblin Chief" });
    expect(r.s.dungeon!.endsAt).toBe(new Date(new Date(T(MON, "09:00")).getTime() + 50 * 60_000).toISOString());
    expect(titles(r.fx)).toContain("C-RANK INSTANT DUNGEON");
    const win = popups(r.fx).find((p) => p.title === "C-RANK INSTANT DUNGEON")!;
    expect(win.blocks.some((b) => b.type === "timer" && b.endsAt === r.s.dungeon!.endsAt)).toBe(true);
    expect(win.actions.map((a) => a.kind)).toEqual(["dungeon:abandon", "dismiss"]);
    // an unknown / non-key item id is refused
    r = start(withKeys(), T(MON, "09:00"), { keyItemId: "nope" });
    expect(r.s.dungeon).toBeUndefined();
  });

  it("ITEM_USED on a key does not consume it and offers ENTER with \"<rank>:<itemId>\"", () => {
    const r = feed(withKeys(key("k1", "B")), { type: "ITEM_USED", itemId: "k1", at: T(MON, "09:00") });
    expect(r.s.inventory.map((i) => i.id)).toEqual(["k1"]);
    const win = popups(r.fx).find((p) => p.title === "DUNGEON KEY")!;
    expect(win.actions.find((a) => a.kind === "start:dungeon")!.arg).toBe("B:k1");
  });

  it("abandoning within 2 minutes refunds the key; later it does not", () => {
    const base = withKeys(key("k1", "D"));
    let r = start(base, T(MON, "09:00"), { keyItemId: "k1" });
    r = feed(r, { type: "DUNGEON_ABANDONED", at: T(MON, "09:01") });
    expect(r.s.dungeon).toBeUndefined();
    expect(r.s.inventory).toEqual([key("k1", "D")]);
    expect(titles(r.fx)).toContain("DUNGEON ABANDONED");

    let late = start(base, T(MON, "09:00"), { keyItemId: "k1" });
    late = feed(late, { type: "DUNGEON_ABANDONED", at: T(MON, "09:03") });
    expect(late.s.dungeon).toBeUndefined();
    expect(late.s.inventory).toHaveLength(0);
    expect(late.s.dungeonsCleared).toBe(0);
  });

  it("keyless forces E-rank, 25 min and half rewards", () => {
    let r = start(started(), T(MON, "09:00"), { rank: "A", minutes: 90 });
    expect(r.s.dungeon).toMatchObject({ rank: "E", minutes: 25, keyless: true });
    const gold = r.s.gold, xp = r.s.player.xp;
    r = feed(r, { type: "DUNGEON_CLEARED", rank: "E", minutes: 25, bossName: "x", at: T(MON, "09:25") });
    expect(r.s.dungeon).toBeUndefined();
    expect(r.s.dungeonsCleared).toBe(1);
    expect(r.s.gold - gold).toBe(10);       // (10 + 1*10) / 2
    expect(r.s.player.xp - xp).toBe(20);    // 1*40 / 2
  });

  it("a keyed claim pays the full formula", () => {
    let r = start(withKeys(key("k1", "C")), T(MON, "09:00"), { keyItemId: "k1" });
    const gold = r.s.gold;
    r = feed(r, { type: "DUNGEON_CLEARED", rank: "C", minutes: 50, bossName: "x", at: T(MON, "09:50") });
    expect(r.s.gold - gold).toBe(40);
    const win = popups(r.fx).find((p) => p.title === "DUNGEON CLEARED")!;
    expect(JSON.stringify(win)).toContain("XP +120");
  });

  it("a claim before the timer ends is refused", () => {
    let r = start(started(), T(MON, "09:00"));
    r = feed(r, { type: "DUNGEON_CLEARED", rank: "E", minutes: 25, bossName: "x", at: T(MON, "09:10") });
    expect(r.s.dungeon).toBeDefined();
    expect(r.s.dungeonsCleared).toBe(0);
    expect(titles(r.fx)).toContain("THE BOSS STILL STANDS");
  });

  it("the time-up window fires once on TICK", () => {
    let r = start(started(), T(MON, "09:00"));
    r = feed({ s: r.s, fx: [] }, { type: "TICK", at: T(MON, "09:20") });
    expect(titles(r.fx)).not.toContain("BOSS DEFEATED?");
    r = feed(r, { type: "TICK", at: T(MON, "09:25") }, { type: "TICK", at: T(MON, "09:26") }, { type: "TICK", at: T(MON, "10:00") });
    const ups = popups(r.fx).filter((p) => p.title === "BOSS DEFEATED?");
    expect(ups).toHaveLength(1);
    expect(ups[0].sound).toBe("levelup");
    expect(ups[0].actions.map((a) => a.kind)).toEqual(["dungeon:claim", "dungeon:abandon"]);
    expect(JSON.stringify(ups[0])).toContain("Goblin Chief · 25 min. Did you stay in the dungeon?");
    expect(r.s.dungeon!.timeUpShown).toBe(true);
  });

  it("claiming adds the minutes to the linked goal and can trigger the full clear", () => {
    let r = started();
    for (const h of ["gym", "sleep", "eat"]) r = feed(r, { type: "GOAL_SET", goalId: goal(r, h).id, value: goal(r, h).target, at: T(MON, "08:30") });
    r = feed(r, { type: "GOAL_SET", goalId: goal(r, "study").id, value: 10, at: T(MON, "08:30") });
    r = { s: { ...r.s, inventory: [key("k1", "C")] }, fx: [] };
    r = start(r, T(MON, "09:00"), { keyItemId: "k1", linkGoalId: goal(r, "study").id });
    expect(r.s.dungeon!.linkGoalId).toBe(goal(r, "study").id);
    expect(r.s.today!.rewardedAt).toBeUndefined();
    r = feed(r, { type: "DUNGEON_CLEARED", rank: "C", minutes: 50, bossName: "x", at: T(MON, "09:50") });
    expect(goal(r, "study").current).toBe(60);
    expect(goal(r, "study").done).toBe(true);
    expect(r.s.today!.rewardedAt).toBe(T(MON, "09:50"));
    expect(r.s.boxes).toBe(1);
  });

  it("links only to minutes goals", () => {
    const base = started();
    const r = start(base, T(MON, "09:00"), { linkGoalId: goal(base, "gym").id });
    expect(r.s.dungeon!.linkGoalId).toBeUndefined();
  });

  it("only one dungeon can be open", () => {
    let r = start(withKeys(key("k1", "C"), key("k2", "D")), T(MON, "09:00"), { keyItemId: "k1" });
    const first = r.s.dungeon;
    r = start({ s: r.s, fx: [] }, T(MON, "09:05"), { keyItemId: "k2" });
    expect(r.s.dungeon).toBe(first);
    expect(r.s.inventory.map((i) => i.id)).toEqual(["k2"]);
    expect(JSON.stringify(popups(r.fx))).toContain("A dungeon is already open");
  });

  it("selectors: keys sorted by rank, seconds left", () => {
    const r = start(withKeys(key("k1", "D"), key("k2", "B"), key("k3", "E")), T(MON, "09:00"));
    expect(dungeonKeys(r.s).map((k) => [k.item.id, k.rank])).toEqual([["k2", "B"], ["k1", "D"], ["k3", "E"]]);
    expect(dungeonSecondsLeft(r.s, T(MON, "09:10"))).toBe(15 * 60);
    expect(dungeonSecondsLeft(r.s, T(MON, "10:00"))).toBe(0);
  });

  it("every dungeon window passes parseSpec", () => {
    const d = { id: "dungeon-1", rank: "B" as const, bossName: "A".repeat(80), minutes: 90, endsAt: T(MON, "10:30"), keyless: true };
    for (const spec of [
      W.dungeonEntered(d, "Study for career"), W.dungeonEntered({ ...d, keyless: false }), W.dungeonTimeUp(d), W.dungeonAbandoned(d, true), W.dungeonAbandoned(d, false),
      W.dungeonCleared("B", d.bossName, 80, 25, { minutes: 90, keyless: true, goalLabel: "Study for career", goalMinutes: 90 }), W.dungeonKey("C", "item-12"), W.dungeonKey("C"),
    ]) expect(parseSpec(spec).success, spec.title).toBe(true);
  });

  it("replays deterministically", () => {
    const seed = (() => { for (let i = 0; ; i++) if (rollBox(i) === "dungeon-key") return i; })();
    const events: Event[] = [];
    let r: Run = { s: replay(TEST_CONFIG, []), fx: [] };
    const push = (e: Event) => { events.push(e); r = feed(r, e); };
    push({ type: "PLAYER_ACCEPTED", name: "Tester", at: T(MON, "08:00") });
    push({ type: "TICK", at: T(MON, "08:01") });
    for (const h of ["gym", "sleep", "eat"]) push({ type: "GOAL_SET", goalId: goal(r, h).id, value: goal(r, h).target, at: T(MON, "08:30") });
    push({ type: "GOAL_SET", goalId: goal(r, "study").id, value: 35, at: T(MON, "08:30") });
    // keyless dungeon linked to study: its 25 minutes finish the quest and pay the box
    push({ type: "DUNGEON_STARTED", rank: "E", bossName: "Imp", minutes: 25, linkGoalId: goal(r, "study").id, at: T(MON, "09:00") });
    push({ type: "TICK", at: T(MON, "09:26") });
    push({ type: "DUNGEON_CLEARED", rank: "E", minutes: 25, bossName: "Imp", at: T(MON, "09:27") });
    expect(goal(r, "study").done).toBe(true);
    expect(r.s.boxes).toBe(1);
    push({ type: "BOX_OPENED", seed, at: T(MON, "09:30") });
    const keyId = r.s.inventory.find((i) => i.defId === "dungeon-key")!.id;
    push({ type: "DUNGEON_STARTED", rank: "E", bossName: "Orc", minutes: 25, keyItemId: keyId, at: T(MON, "10:00") });
    push({ type: "DUNGEON_ABANDONED", at: T(MON, "10:01") });
    expect(r.s.inventory.some((i) => i.id === keyId)).toBe(true);
    push({ type: "DUNGEON_STARTED", rank: "E", bossName: "Orc", minutes: 25, keyItemId: keyId, at: T(MON, "10:05") });
    expect(replay(TEST_CONFIG, events)).toEqual(r.s);
    expect(replay(TEST_CONFIG, events).dungeon).toMatchObject({ bossName: "Orc", keyless: false });
  });
});
