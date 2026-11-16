import { describe, expect, it } from "vitest";
import { replay } from "../reducer";
import { parseSpec } from "../../system/spec";
import { activeProjects, projectProgress, strikesInRange, todayStrike, GATE_XP } from "../projects";
import * as W from "../windows";
import { MON, T, TEST_CONFIG, complete, feed, lastResult, nextDay, popups, started, titles, type Run } from "./helpers";
import type { Event } from "../types";

const TUE = "2026-11-03", WED = "2026-11-04", THU = "2026-11-05";

/** Events that open a Gate on Monday with a strike Tue..Thu and deadline `deadline`. */
function gateEvents(deadline = WED): Event[] {
  return [
    { type: "PROJECT_CREATED", at: T(MON, "09:00"), project: { id: "p1", title: "Ship my portfolio site", bossName: "The Unfinished Portfolio", stat: "INT", deadline } },
    {
      type: "PROJECT_PLANNED", projectId: "p1", at: T(MON, "09:01"),
      milestones: [{ id: "m1", title: "Plan" }, { id: "m2", title: "Ship" }],
      strikes: { [TUE]: { title: "Wireframe the home page", minutes: 45, milestoneId: "m1" }, [WED]: { title: "Deploy" }, [THU]: { title: "Past deadline" } },
    },
  ];
}
function withGate(deadline = WED): { r: Run; events: Event[] } {
  const events = gateEvents(deadline);
  return { r: feed(started(), ...events), events };
}

describe("project quests", () => {
  it("create + plan -> next day's quest contains the strike goal", () => {
    const { r } = withGate();
    expect(titles(r.fx)).toContain("A GATE HAS OPENED");
    // today's (Monday) quest is untouched
    expect(r.s.today!.goals.some((g) => g.projectId)).toBe(false);
    const p = r.s.projects![0];
    expect(p.status).toBe("active");
    expect(p.xpBonus).toBe(GATE_XP);
    expect(Object.keys(p.strikes)).toEqual([TUE, WED]); // strike after the deadline dropped
    const t = nextDay(r);
    const g = t.s.today!.goals.find((x) => x.projectId === "p1")!;
    expect(g).toMatchObject({ id: `${TUE}:proj:p1`, habitId: "proj:p1", stat: "INT", label: "⚔ Wireframe the home page", target: 45, unit: "min", current: 0, done: false });
    expect(todayStrike(t.s, "p1")?.title).toBe("Wireframe the home page");
    // check-kind strike on Wednesday
    const w = nextDay(t);
    expect(w.s.today!.goals.find((x) => x.projectId)).toMatchObject({ target: 1, unit: "strike", label: "⚔ Deploy" });
    // the Daily Quest window shows the strike row
    const dq = popups(w.fx).filter((s) => s.id === `daily-${WED}`)[0];
    expect(dq.blocks.some((b) => b.type === "goalRow" && b.label.startsWith("⚔"))).toBe(true);
  });

  it("completing a strike pays normal goal XP x1.5 and it counts toward full clear", () => {
    const base = nextDay(withGate().r);
    const strike = base.s.today!.goals.find((g) => g.projectId)!;
    const gym = base.s.today!.goals.find((g) => g.habitId === "gym")!;
    const a = nextDay(feed(base, { type: "GOAL_SET", goalId: strike.id, value: strike.target, at: T(TUE, "10:00") }));
    const b = nextDay(feed(base, { type: "GOAL_SET", goalId: gym.id, value: gym.target, at: T(TUE, "10:00") }));
    expect(lastResult(b.s).xpEarned).toBe(TEST_CONFIG.curves.xpPerGoal);
    expect(lastResult(a.s).xpEarned).toBe(Math.round(TEST_CONFIG.curves.xpPerGoal * 1.5));
    // full clear requires the strike too
    const others = base.s.today!.goals.filter((g) => !g.projectId);
    const partial = feed(base, ...others.map((g) => ({ type: "GOAL_SET" as const, goalId: g.id, value: g.target, at: T(TUE, "11:00") })));
    expect(partial.s.today!.rewardedAt).toBeUndefined();
    const full = complete(base, "all", T(TUE, "11:00"));
    expect(full.s.today!.rewardedAt).toBeDefined();
  });

  it("milestone toggle", () => {
    let { r } = withGate();
    r = feed(r, { type: "PROJECT_MILESTONE_SET", projectId: "p1", milestoneId: "m1", done: true, at: T(MON, "12:00") });
    expect(r.s.projects![0].milestones[0]).toMatchObject({ done: true, doneAt: T(MON, "12:00") });
    expect(projectProgress(r.s.projects![0], MON)).toMatchObject({ done: 1, total: 2, pct: 0.5, daysLeft: 2, allDone: false });
    r = feed(r, { type: "PROJECT_MILESTONE_SET", projectId: "p1", milestoneId: "m1", done: false, at: T(MON, "12:05") });
    expect(r.s.projects![0].milestones[0].done).toBe(false);
    expect(r.s.projects![0].milestones[0].doneAt).toBeUndefined();
  });

  it("deadline with every milestone done -> GATE CLEARED with gold, XP and a box", () => {
    let { r } = withGate();
    r = feed(r, ...["m1", "m2"].map((id) => ({ type: "PROJECT_MILESTONE_SET" as const, projectId: "p1", milestoneId: id, done: true, at: T(MON, "12:00") })));
    r = nextDay(r); // Tue
    const beforeClose = nextDay(r); // closes Tue, opens Wed (deadline day)
    expect(beforeClose.s.projects![0].status).toBe("active");
    const gold0 = beforeClose.s.gold, boxes0 = beforeClose.s.boxes, gates0 = beforeClose.s.gatesCleared;
    const after = nextDay({ s: beforeClose.s, fx: [] }); // closes Wed
    const p = after.s.projects![0];
    expect(p.status).toBe("cleared");
    const spec = popups(after.fx).find((s) => s.title === "GATE CLEARED")!;
    expect(spec).toBeDefined();
    expect(parseSpec(spec).success).toBe(true);
    expect(JSON.stringify(spec.blocks)).toContain("The Unfinished Portfolio defeated");
    expect(after.s.gatesCleared).toBe(gates0 + 1);
    expect(after.s.gold - gold0).toBeGreaterThanOrEqual(TEST_CONFIG.economy.goldGate);
    expect(after.s.boxes).toBeGreaterThanOrEqual(boxes0 + 1);
    expect(activeProjects(after.s)).toHaveLength(0);
    // Thursday has no strike any more
    expect(after.s.today!.goals.some((g) => g.projectId)).toBe(false);
  });

  it("deadline with milestones open -> GATE FAILED (deadpan, no reward)", () => {
    let { r } = withGate(TUE);
    r = nextDay(r);
    const gates0 = r.s.gatesCleared;
    const after = nextDay({ s: r.s, fx: [] });
    expect(after.s.projects![0].status).toBe("failed");
    const spec = popups(after.fx).find((s) => s.title === "GATE FAILED")!;
    expect(parseSpec(spec).success).toBe(true);
    expect(after.s.gatesCleared).toBe(gates0);
  });

  it("abandoning drops today's open strike; early clear needs every milestone", () => {
    let r = nextDay(withGate().r);
    expect(r.s.today!.goals.some((g) => g.projectId)).toBe(true);
    r = feed(r, { type: "PROJECT_STATUS", projectId: "p1", status: "cleared", at: T(TUE, "10:00") });
    expect(r.s.projects![0].status).toBe("active"); // boss not dead yet
    r = feed(r, { type: "PROJECT_STATUS", projectId: "p1", status: "abandoned", at: T(TUE, "10:01") });
    expect(r.s.projects![0].status).toBe("abandoned");
    expect(r.s.today!.goals.some((g) => g.projectId)).toBe(false);
  });

  it("re-plan keeps past strikes and done milestones", () => {
    let r = nextDay(withGate(THU).r); // Tue open
    r = feed(r, { type: "PROJECT_MILESTONE_SET", projectId: "p1", milestoneId: "m1", done: true, at: T(TUE, "09:00") });
    r = nextDay(r); // Wed open
    r = feed(r, { type: "PROJECT_PLANNED", projectId: "p1", at: T(WED, "09:00"), milestones: [{ id: "m1", title: "Plan" }, { id: "m3", title: "Polish" }], strikes: { [TUE]: { title: "rewrite history" }, [THU]: { title: "Polish CSS", minutes: 30 } } });
    const p = r.s.projects![0];
    expect(p.strikes[TUE].title).toBe("Wireframe the home page");
    expect(p.strikes[WED]).toBeUndefined();
    expect(p.strikes[THU]).toMatchObject({ title: "Polish CSS", minutes: 30 });
    expect(p.milestones.map((m) => [m.id, m.done])).toEqual([["m1", true], ["m3", false]]);
    expect(strikesInRange(p, WED)).toHaveLength(1);
  });

  it("window builders validate", () => {
    const { r } = withGate();
    const p = r.s.projects![0];
    const specs = [
      W.projectCreated(p),
      W.projectPlanned(p, { milestones: p.milestones, strikes: strikesInRange(p, MON), verdict: "Feasible. Barely." }),
      W.gateCleared(p, { gold: 300, xp: 400 }),
      W.gateFailed(p),
      W.strikeDue(p, nextDay(r).s.today!.goals.find((g) => g.projectId)!),
    ];
    for (const s of specs) {
      expect(parseSpec(s).success).toBe(true);
      expect(s.title.startsWith("[")).toBe(false);
    }
  });

  it("replay is deterministic", () => {
    const events: Event[] = [
      { type: "PLAYER_ACCEPTED", name: "Tester", at: T(MON, "08:00") },
      { type: "TICK", at: T(MON, "08:01") },
      ...gateEvents(WED),
      { type: "PROJECT_MILESTONE_SET", projectId: "p1", milestoneId: "m1", done: true, at: T(MON, "12:00") },
      { type: "TICK", at: T(TUE, "03:05") },
      { type: "GOAL_SET", goalId: `${TUE}:proj:p1`, value: 45, at: T(TUE, "10:00") },
      { type: "PROJECT_MILESTONE_SET", projectId: "p1", milestoneId: "m2", done: true, at: T(TUE, "12:00") },
      { type: "TICK", at: T(WED, "03:05") },
      { type: "TICK", at: T(THU, "03:05") },
    ];
    const a = replay(TEST_CONFIG, events), b = replay(TEST_CONFIG, events);
    expect(a).toEqual(b);
    expect(a.projects![0].status).toBe("cleared");
    const fed = feed(started(), ...events.slice(2));
    expect(fed.s).toEqual(a);
  });
});
