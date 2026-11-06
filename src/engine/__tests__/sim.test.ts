import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../config";
import { createInitialState, reduce, replay } from "../reducer";
import { mulberry32 } from "../boxes";
import { rankForLevel, rankIndex } from "../rank";
import { addDays } from "../time";
import { parseSpec } from "../../system/spec";
import * as W from "../windows";
import { penaltyGoals } from "../penalty";
import { ITEM_DEFS, makeItem } from "../items";
import { TITLE_DEFS } from "../titles";
import { SKILL_DEFS } from "../skills";
import { T } from "./helpers";
import type { Effect, Event, State, StatId } from "../types";

describe("simulate 400 days", () => {
  it("90% clear / 7% partial / 3% fail", () => {
    const rnd = mulberry32(2026);
    const events: Event[] = [];
    let s = createInitialState(DEFAULT_CONFIG);
    const fx: Effect[] = [];
    let seed = 1, lastXpTotal = 0, minLevelSeen = 1;
    const totalXp = (st: State) => { let t = st.player.xp; for (let l = 1; l < st.player.level; l++) t += Math.round(100 * l ** 1.5); return t; };
    const push = (e: Event) => {
      events.push(e);
      const o = reduce(s, e); s = o.state; fx.push(...o.effects);
      const tx = totalXp(s);
      expect(tx).toBeGreaterThanOrEqual(lastXpTotal);
      lastXpTotal = tx;
      expect(s.player.level).toBeGreaterThanOrEqual(minLevelSeen);
      minLevelSeen = s.player.level;
      expect(s.player.rank).toBe(rankForLevel(s.player.level));
    };
    push({ type: "PLAYER_ACCEPTED", name: "Sim", at: T("2026-01-05", "08:00") });
    push({ type: "TICK", at: T("2026-01-05", "08:01") });
    for (let d = 0; d < 400; d++) {
      const date = addDays("2026-01-05", d);
      for (let h = 8; h < 24; h += 4) push({ type: "TICK", at: T(date, `${String(h).padStart(2, "0")}:00`) });
      const roll = rnd();
      const kind = roll < 0.9 ? "clear" : roll < 0.97 ? "partial" : "fail";
      const goals = s.today!.goals;
      const doneN = kind === "clear" ? goals.length : kind === "partial" ? 2 + Math.floor(rnd() * 2) : Math.floor(rnd() * 2);
      const order = [...goals].sort(() => rnd() - 0.5);
      order.slice(0, doneN).forEach((g, i) => push({ type: "GOAL_PROGRESS", goalId: g.id, delta: g.target, at: T(date, `1${i}:00`) }));
      // spend points, open boxes, use items, extract shadows
      const allocStat: StatId[] = ["STR", "INT", "VIT", "SENSE"];
      if (s.player.abilityPoints > 0) push({ type: "POINTS_ALLOCATED", stat: allocStat[d % 4], points: s.player.abilityPoints, at: T(date, "18:00") });
      while (s.boxes > 0) push({ type: "BOX_OPENED", seed: seed++, at: T(date, "18:05") });
      for (const it of s.inventory) if (it.defId !== "streak-shield" && it.defId !== "dungeon-key") push({ type: "ITEM_USED", itemId: it.id, at: T(date, "18:10") });
      for (const o of s.pendingExtractions ?? []) push({ type: "SHADOW_EXTRACTED", stat: o.stat, name: `Shade${seed++}`, at: T(date, "18:15") });
      for (const sk of s.skills) if (sk.kind === "active") push({ type: "SKILL_USED", skillId: sk.id, at: T(date, "18:20") });
      if (s.penalty && !s.penalty.cleared) for (const v of penaltyGoals(s)) push({ type: "PENALTY_PROGRESS", goalId: v.goalId, delta: v.target, at: T(date, "19:00") });
      for (const h of [20, 22, 23]) push({ type: "TICK", at: T(date, `${h}:30`) });
      for (const h of [0, 1, 2]) push({ type: "TICK", at: T(addDays(date, 1), `0${h}:30`) });
      push({ type: "TICK", at: T(addDays(date, 1), "03:00") });
    }
    // every popup validates
    for (const e of fx) if (e.kind === "popup") expect(parseSpec(e.spec).success).toBe(true);
    expect(s.history.length).toBe(400);
    // Slow curve (levelBase 80, exponent 1.45): ~Lv 15 at 3 months, mid-20s after 400 days.
    expect(s.player.level).toBeGreaterThanOrEqual(20);
    expect(s.player.level).toBeLessThanOrEqual(35);
    expect(rankIndex(s.player.rank)).toBeGreaterThanOrEqual(2);
    expect(s.stats.STR.value).toBeGreaterThan(10);
    expect(replay(DEFAULT_CONFIG, events)).toEqual(s);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  }, 60_000);
});

describe("window builders", () => {
  it("all produce valid specs", () => {
    const base = createInitialState(DEFAULT_CONFIG);
    const s: State = { ...base, today: { date: "2026-11-02", startedAt: "", goals: [{ id: "g", habitId: "study", stat: "INT", label: "Study for career", target: 60, unit: "min", current: 10, done: false }] } };
    const q = s.today!;
    const pen = { startedAt: "", endsAt: new Date().toISOString(), date: "2026-11-02", missedGoalIds: ["g"], cleared: false };
    const view = [{ goalId: "g", label: "Study", stat: "INT" as const, unit: "min", current: 0, target: 30, done: false }];
    const title = { id: "t", name: "Wolf Assassin", effect: "STR XP +5%", unlockedAt: "" };
    const shadow = { id: "x", name: "Igris", stat: "STR" as const, rank: "Knight" as const, epithet: "Loyal", extractedAt: "", streakAtExtraction: 30 };
    const specs = [
      W.dailyQuest(s), W.dailyQuest({ ...s, vitals: { ...s.vitals, fatigue: 90 } }),
      W.questComplete({ ...q, result: "clear" }, { xp: 1, gold: 1, box: true, points: 1, overallStreak: 3, shielded: [], broken: [], tenacity: false, hpLost: 0 }),
      W.questComplete({ ...q, result: "partial" }, { xp: 1, gold: 1, box: false, points: 0, overallStreak: 0, shielded: ["VIT"], broken: ["STR"], tenacity: false, hpLost: 5 }),
      W.questComplete({ ...q, result: "fail" }, { xp: 0, gold: 0, box: false, points: 0, overallStreak: 0, shielded: [], broken: ["STR"], tenacity: false, hpLost: 25 }),
      W.levelUp(12), W.rankUp("E", "D", 10), W.rankUp("S", "NATIONAL"), W.titleAcquired(title, "30-day STR streak"),
      W.skillAcquired({ id: "s", name: "Sprint", kind: "active", effect: "x", mpCost: 15, cooldownHours: 24, unlockedAt: "" }),
      W.warning(2.4, q.goals), W.penaltyQuest(pen, view), W.penaltyPersists(pen, view), W.penaltyEscaped(),
      W.shadowOffer("SENSE", 7), W.shadowExtracted(shadow), W.shadowExtracted({ ...shadow, epithet: undefined }),
      W.boxOpened(makeItem("elixir-of-life", "i1", "", 1)), W.shieldUsed("VIT", 1), W.notice("A", "b"), W.dungeonCleared("D", "Goblin", 80, 30),
      W.dungeonKey("C"), W.gate("C", "2026-W45"), W.gate("C", "2026-W45", true, { gold: 600, xp: 400 }), W.statusWindow(s),
      W.statusWindow({ ...s, titles: [title], player: { ...s.player, equippedTitleId: "t" } }),
    ];
    for (const sp of specs) expect(parseSpec(sp).success).toBe(true);
    for (const d of Object.keys(ITEM_DEFS)) expect(parseSpec(W.boxOpened(makeItem(d, "i", "", 40))).success).toBe(true);
    for (const t of TITLE_DEFS) expect(parseSpec(W.titleAcquired({ id: t.id, name: t.name, effect: t.effect, unlockedAt: "" }, t.condition)).success).toBe(true);
    for (const k of SKILL_DEFS) expect(parseSpec(W.skillAcquired({ id: k.id, name: k.name, kind: k.kind, effect: k.effect, mpCost: k.mpCost, cooldownHours: k.cooldownHours, unlockedAt: "" })).success).toBe(true);
  });
});
