import { describe, expect, it, vi } from "vitest";
import type { Effect, Event, ReduceResult, State } from "../../engine";
import { makeFixtureState } from "../fixtures";
import { createGameStore, shouldLog } from "../game";
import { routeEffects, type EffectDeps } from "../effects";
import {
  createLocalStoragePersistence, createMemoryPersistence, createSqlPersistence, LS_EVENTS, LS_SNAPSHOT, type SqlLike,
} from "../persist";
import type { SystemWindowSpec } from "../../system/spec";
import { parseSpec } from "../../system/spec";

const spec = (over: Partial<SystemWindowSpec> = {}): SystemWindowSpec =>
  parseSpec({ variant: "info", title: "Hi", blocks: [], ...over }).data!;

type Spied = { [K in keyof EffectDeps]: ReturnType<typeof vi.fn> } & EffectDeps;
const deps = (tauri: boolean): Spied => ({
  isTauri: () => tauri,
  showSystemWindow: vi.fn(),
  pushOverlay: vi.fn(),
  notify: vi.fn(),
  playSound: vi.fn(),
  oracle: vi.fn(),
}) as unknown as Spied;

describe("effect routing", () => {
  const effects: Effect[] = [
    { kind: "popup", spec: spec({ sound: "levelup" }) },
    { kind: "notify", title: "T", body: "B" },
    { kind: "sound", sound: "levelup" },
    { kind: "sound", sound: "alarm" },
    { kind: "oracle", request: "dayStart", context: {} },
  ];

  it("browser: popups go to the overlay, not the Tauri window", () => {
    const d = deps(false);
    routeEffects(effects, d);
    expect(d.pushOverlay).toHaveBeenCalledTimes(1);
    expect(d.pushOverlay.mock.calls[0][0].id).toBeTruthy();
    expect(d.showSystemWindow).not.toHaveBeenCalled();
    expect(d.notify).toHaveBeenCalledWith("T", "B");
    expect(d.oracle).toHaveBeenCalledTimes(1);
  });

  it("tauri: popups go to the system window; duplicate sound covered by the popup is skipped", () => {
    const d = deps(true);
    routeEffects(effects, d);
    expect(d.showSystemWindow).toHaveBeenCalledTimes(1);
    expect(d.pushOverlay).not.toHaveBeenCalled();
    expect(d.playSound).toHaveBeenCalledTimes(1);
    expect(d.playSound).toHaveBeenCalledWith("alarm");
  });

  it("drops invalid popup specs", () => {
    const d = deps(false);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    routeEffects([{ kind: "popup", spec: { variant: "nope" } as never }], d);
    expect(d.pushOverlay).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("game store", () => {
  const fake = (state: State, e: Event): ReduceResult =>
    e.type === "GOAL_PROGRESS"
      ? { state: { ...state, gold: state.gold + 1 }, effects: [{ kind: "sound", sound: "ding" }] }
      : { state, effects: [] };

  it("dispatch reduces, persists the event + snapshot and runs effects", async () => {
    const mem = createMemoryPersistence();
    const runEffects = vi.fn();
    const store = createGameStore({ reduce: fake, persistence: mem, runEffects, createInitialState: () => makeFixtureState(), replay: () => makeFixtureState(), now: () => new Date("2026-11-04T10:00:00Z") });
    await store.getState().init();
    const gold = store.getState().state!.gold;
    store.getState().dispatch({ type: "GOAL_PROGRESS", goalId: "g-gym", delta: 1 });
    await vi.waitFor(() => expect(mem.events.some((e) => e.type === "GOAL_PROGRESS")).toBe(true));
    expect(store.getState().state!.gold).toBe(gold + 1);
    expect(mem.events.find((e) => e.type === "GOAL_PROGRESS")!.at).toBe("2026-11-04T10:00:00.000Z");
    expect(mem.snapshot?.gold).toBe(gold + 1);
    expect(runEffects).toHaveBeenCalledWith([{ kind: "sound", sound: "ding" }]);
    // quiet ticks are not logged
    expect(mem.events.some((e) => e.type === "TICK")).toBe(false);
  });

  it("replays events when there is no snapshot, and export/import round-trips", async () => {
    const mem = createMemoryPersistence();
    mem.events.push({ type: "TICK", at: "2026-11-04T09:00:00Z" });
    const replay = vi.fn(() => makeFixtureState());
    const store = createGameStore({ reduce: fake, persistence: mem, runEffects: () => {}, createInitialState: () => makeFixtureState(), replay });
    await store.getState().init();
    expect(replay).toHaveBeenCalled();
    const json = await store.getState().exportEvents();
    expect(JSON.parse(json).events).toHaveLength(1);
    expect(await store.getState().importEvents(json)).toBe(1);
    await expect(store.getState().importEvents('{"events":[{"nope":1}]}')).rejects.toThrow();
  });

  it("shouldLog keeps meaningful ticks only", () => {
    const a = makeFixtureState();
    const tick: Event = { type: "TICK", at: "x" };
    expect(shouldLog(tick, a, a, [])).toBe(false);
    expect(shouldLog(tick, a, a, [{ kind: "sound", sound: "ding" }])).toBe(true);
    expect(shouldLog(tick, a, { ...a, history: [...a.history, a.history[0]] }, [])).toBe(true);
    expect(shouldLog({ type: "TITLE_EQUIPPED", titleId: "t", at: "x" }, a, a, [])).toBe(true);
  });
});

describe("persistence adapters", () => {
  it("localStorage adapter stores events and snapshot", async () => {
    const data = new Map<string, string>();
    const p = createLocalStoragePersistence({ getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) });
    const e: Event = { type: "TICK", at: "2026-11-04T00:00:00Z" };
    await p.appendEvent(e);
    await p.saveSnapshot(makeFixtureState());
    expect(await p.loadEvents()).toEqual([e]);
    expect((await p.loadSnapshot())?.player.name).toBe("JINWOO");
    await p.clear();
    expect(data.has(LS_EVENTS) || data.has(LS_SNAPSHOT)).toBe(false);
  });

  it("sql adapter creates the schema and uses events/snapshot tables", async () => {
    const calls: { q: string; b?: unknown[] }[] = [];
    const db: SqlLike = {
      async execute(q, b) { calls.push({ q, b }); return {}; },
      async select<T>(q: string) { return (q.includes("FROM events") ? [{ payload: JSON.stringify({ type: "TICK", at: "t" }) }] : [{ state: JSON.stringify({ gold: 5 }) }]) as T; },
    };
    const p = await createSqlPersistence(db);
    expect(calls.map((c) => c.q).join("\n")).toMatch(/CREATE TABLE IF NOT EXISTS events[\s\S]*CREATE TABLE IF NOT EXISTS snapshot.*CHECK \(id = 1\)/);
    await p.appendEvent({ type: "TICK", at: "t" });
    expect(calls.at(-1)!.q).toMatch(/INSERT INTO events/);
    await p.saveSnapshot({ gold: 5 } as State);
    expect(calls.at(-1)!.q).toMatch(/ON CONFLICT\(id\)/);
    expect(await p.loadEvents()).toEqual([{ type: "TICK", at: "t" }]);
    expect(((await p.loadSnapshot()) as unknown as { gold: number }).gold).toBe(5);
  });
});
