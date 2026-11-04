import { describe, expect, it } from "vitest";
import { createGameStore, setGameStore } from "../game";
import { createMemoryPersistence } from "../persist";
import { handleAction } from "../actions";

describe("handleAction goal logging", () => {
  it("applies progress:goal for ids that contain colons, and sets lower values", async () => {
    const store = createGameStore({ persistence: createMemoryPersistence(), runEffects: () => {} });
    setGameStore(store);
    await store.getState().init();
    store.getState().dispatch({ type: "PLAYER_ACCEPTED", name: "T" });
    store.getState().dispatch({ type: "TICK" });
    const goals = () => store.getState().state!.today!.goals;
    const study = goals().find((g) => g.habitId === "study")!;
    expect(study.id).toContain(":");
    handleAction({ label: "+30", kind: "progress:goal", arg: `${study.id}:30` });
    expect(goals().find((g) => g.id === study.id)!.current).toBe(30);
    handleAction({ label: "-10", kind: "progress:goal", arg: `${study.id}:-10` });
    expect(goals().find((g) => g.id === study.id)!.current).toBe(20);
  });
});
