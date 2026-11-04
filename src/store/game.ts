/**
 * The game store. State is only ever changed by dispatch(event) -> engine.reduce -> effects -> persist.
 * `createGameStore(deps)` takes its collaborators as parameters so tests (and ?fixture mode) can inject a
 * fake reducer, an in-memory persistence adapter and a spy effect router.
 */
import { createStore, type StoreApi } from "zustand/vanilla";
import { useStore } from "zustand";
import * as engine from "../engine";
import type { Effect, Event, ISO, ReduceResult, State } from "../engine";
import { createPersistence, type Persistence } from "./persist";
import { routeEffects } from "./effects";

/** Event as accepted by dispatch: `at` is optional and defaults to now. */
export type EventInput = Event extends infer E ? (E extends { at: ISO } ? Omit<E, "at"> & { at?: ISO } : never) : never;

export interface GameDeps {
  reduce(state: State, event: Event): ReduceResult;
  createInitialState(config: engine.Config): State;
  replay(config: engine.Config, events: Event[]): State;
  baseConfig: engine.Config;
  persistence: Persistence | (() => Promise<Persistence>);
  runEffects(effects: Effect[]): void;
  now(): Date;
}

export interface GameStore {
  state?: State;
  ready: boolean;
  error?: string;
  init(): Promise<void>;
  dispatch(event: EventInput): Effect[];
  reset(): Promise<void>;
  exportEvents(): Promise<string>;
  importEvents(json: string): Promise<number>;
}

/** TICKs fire every minute; only persist the ones that changed something that matters for replay. */
export function shouldLog(event: Event, prev: State, next: State, effects: Effect[]): boolean {
  if (event.type !== "TICK") return true;
  return (
    effects.length > 0 ||
    prev.today?.date !== next.today?.date ||
    prev.history.length !== next.history.length ||
    !!prev.penalty !== !!next.penalty ||
    prev.penalty?.cleared !== next.penalty?.cleared
  );
}

const defaultDeps = (): GameDeps => ({
  reduce: engine.reduce,
  createInitialState: engine.createInitialState,
  replay: engine.replay,
  baseConfig: engine.DEFAULT_CONFIG,
  persistence: createPersistence,
  runEffects: (e) => routeEffects(e),
  now: () => new Date(),
});

export function createGameStore(overrides: Partial<GameDeps> = {}): StoreApi<GameStore> {
  const deps: GameDeps = { ...defaultDeps(), ...overrides };
  let persistence: Persistence | undefined;
  let chain: Promise<unknown> = Promise.resolve();
  const enqueue = (fn: () => Promise<unknown>) => {
    chain = chain.then(fn).catch((err) => console.error("[levels] persistence error", err));
    return chain;
  };
  const stamp = (e: EventInput): Event => ({ ...e, at: e.at ?? deps.now().toISOString() }) as Event;

  return createStore<GameStore>((set, get) => ({
    state: undefined,
    ready: false,

    async init() {
      try {
        persistence = typeof deps.persistence === "function" ? await deps.persistence() : deps.persistence;
        let state = await persistence.loadSnapshot();
        if (!state) {
          const events = await persistence.loadEvents();
          state = events.length ? deps.replay(deps.baseConfig, events) : deps.createInitialState(deps.baseConfig);
        }
        set({ state, ready: true, error: undefined });
        get().dispatch({ type: "TICK" });
      } catch (err) {
        console.error("[levels] init failed", err);
        set({ ready: true, error: String(err instanceof Error ? err.message : err) });
      }
    },

    dispatch(input) {
      const prev = get().state;
      if (!prev) return [];
      const event = stamp(input);
      let result: ReduceResult;
      try {
        result = deps.reduce(prev, event);
      } catch (err) {
        console.error("[levels] reduce failed", event, err);
        return [];
      }
      set({ state: result.state });
      const p = persistence;
      if (p) {
        const log = shouldLog(event, prev, result.state, result.effects);
        void enqueue(async () => {
          if (log) await p.appendEvent(event);
          await p.saveSnapshot(result.state);
        });
      }
      deps.runEffects(result.effects);
      return result.effects;
    },

    async reset() {
      await enqueue(async () => persistence?.clear());
      set({ state: deps.createInitialState(deps.baseConfig) });
      get().dispatch({ type: "TICK" });
    },

    async exportEvents() {
      await chain;
      const events = (await persistence?.loadEvents()) ?? [];
      return JSON.stringify({ app: "levels", version: 1, exportedAt: deps.now().toISOString(), events }, null, 2);
    },

    async importEvents(json) {
      const parsed = JSON.parse(json) as unknown;
      const list = Array.isArray(parsed) ? parsed : (parsed as { events?: unknown }).events;
      if (!Array.isArray(list) || !list.every((e) => e && typeof e === "object" && typeof (e as Event).type === "string" && typeof (e as Event).at === "string")) {
        throw new Error("Not a Levels event export");
      }
      const events = list as Event[];
      const state = deps.replay(deps.baseConfig, events);
      await enqueue(async () => {
        await persistence?.clear();
        await persistence?.appendEvents(events);
        await persistence?.saveSnapshot(state);
      });
      set({ state });
      get().dispatch({ type: "TICK" });
      return events.length;
    },
  }));
}

/** The app-wide store. `?fixture=` swaps in fake deps (see bootstrap.ts). */
export let gameStore: StoreApi<GameStore> = createGameStore();
export const setGameStore = (s: StoreApi<GameStore>) => { gameStore = s; };

export function useGame<T>(selector: (s: GameStore) => T): T {
  return useStore(gameStore, selector);
}
/** The current State; only call inside screens rendered after `ready` with a state. */
export const useGameState = (): State => useGame((s) => s.state) as State;
export const dispatch = (e: EventInput) => gameStore.getState().dispatch(e);
