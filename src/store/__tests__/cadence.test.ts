import { describe, expect, it, vi } from "vitest";
import { MORE_PREFIX, shapePopups, type Spec } from "../cadence";
import { isSnoozeAction } from "../snooze";
import { routeEffects, type EffectDeps } from "../effects";
import { parseSpec } from "../../system/spec";

const mk = (id: string, title: string, over: Record<string, unknown> = {}): Spec =>
  ({ ...parseSpec({ variant: "info", title, blocks: [{ type: "text", text: title }], ...over }).data!, id }) as Spec;

describe("popup cadence", () => {
  it("collapses registered + awakened + first daily quest into one welcome window", () => {
    const reg = mk("r1", "PLAYER REGISTERED", { blocks: [{ type: "text", text: "Welcome, Jin." }] });
    const title = mk("title-awakened", "TITLE ACQUIRED");
    const daily = mk("daily-2026-11-04", "DAILY QUEST", { variant: "quest", blocks: [{ type: "goalRow", goalId: "g", label: "Lift", current: 0, target: 1, unit: "x" }], actions: [{ label: "ACCEPT", kind: "accept", primary: true }] });
    const out = shapePopups([reg, title, daily], () => "x");
    expect(out.show).toHaveLength(1);
    expect(out.show[0].id).toBe("welcome");
    expect(out.show[0].blocks.map((b) => b.type)).toEqual(["text", "goalRow"]);
    expect(out.show[0].actions[0].label).toBe("ACCEPT");
  });

  it("leaves up to three windows alone", () => {
    const specs = [mk("a", "A"), mk("b", "B"), mk("c", "C")];
    expect(shapePopups(specs, () => "x").show).toEqual(specs);
  });

  it("folds the rest behind a '[N MORE NOTIFICATIONS]' window but never hides the penalty", () => {
    const specs = [mk("a", "A"), mk("b", "B"), mk("p", "PENALTY", { variant: "penalty" }), mk("c", "C"), mk("d", "D")];
    const out = shapePopups(specs, () => "zz");
    expect(out.show.map((s) => s.id)).toEqual(["a", "p", `${MORE_PREFIX}zz`]);
    expect(out.summary?.title).toBe("3 MORE NOTIFICATIONS");
    expect(out.folded.map((s) => s.id)).toEqual(["b", "c", "d"]);
    expect(out.summary?.actions[0]).toMatchObject({ label: "View", arg: `${MORE_PREFIX}zz` });
  });

  it("routeEffects sends the shaped set to the overlay", () => {
    const d = { isTauri: () => false, showSystemWindow: vi.fn(), pushOverlay: vi.fn(), notify: vi.fn(), playSound: vi.fn(), oracle: vi.fn() } as unknown as EffectDeps;
    const effects = ["A", "B", "C", "D", "E"].map((t) => ({ kind: "popup" as const, spec: mk(t, t) }));
    routeEffects(effects, d);
    expect(d.pushOverlay).toHaveBeenCalledTimes(2); // first + the "N more" summary
  });

  it("onboarding: windows from separate events within a moment become one welcome window", () => {
    vi.useFakeTimers();
    const d = { isTauri: () => false, showSystemWindow: vi.fn(), pushOverlay: vi.fn(), notify: vi.fn(), playSound: vi.fn(), oracle: vi.fn() } as unknown as EffectDeps;
    routeEffects([{ kind: "popup", spec: mk("", "PLAYER REGISTERED", { id: undefined }) }], d);
    routeEffects([{ kind: "popup", spec: mk("daily-2026-11-04", "DAILY QUEST", { variant: "quest" }) }], d);
    expect(d.pushOverlay).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(d.pushOverlay).toHaveBeenCalledTimes(1);
    expect((d.pushOverlay as ReturnType<typeof vi.fn>).mock.calls[0][0].id).toBe("welcome");
    vi.useRealTimers();
  });

  it("treats a LATER dismiss as a snooze", () => {
    expect(isSnoozeAction({ kind: "dismiss", label: "LATER" })).toBe(true);
    expect(isSnoozeAction({ kind: "dismiss", label: "Close" })).toBe(false);
    expect(isSnoozeAction({ kind: "dismiss", label: "x", arg: "snooze" })).toBe(true);
  });
});
