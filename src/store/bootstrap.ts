import { createGameStore, setGameStore } from "./game";
import { makeFixtureState, fakeReduce } from "./fixtures";
import { createMemoryPersistence } from "./persist";
import { DEFAULT_CONFIG } from "../engine";

/** `?fixture=1` (mid-game) or `?fixture=new` (fresh player) → in-memory store with a fake reducer. */
export function bootstrapStore(search: string = window.location.search): void {
  const fx = new URLSearchParams(search).get("fixture");
  if (!fx) return;
  const accepted = fx !== "new";
  const mem = createMemoryPersistence();
  mem.snapshot = makeFixtureState({ accepted });
  setGameStore(createGameStore({
    reduce: fakeReduce,
    createInitialState: () => makeFixtureState({ accepted: false }),
    replay: () => makeFixtureState({ accepted }),
    baseConfig: DEFAULT_CONFIG,
    persistence: mem,
  }));
}
