import { describe, expect, it } from "vitest";
import { createGameStore, setGameStore } from "../game";
import { createMemoryPersistence } from "../persist";
import { handleAction } from "../actions";
import { useUi } from "../ui";

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

describe("handleAction dungeons", () => {
  it("start:dungeon opens the dialog with the key from \"<rank>:<itemId>\"; claim/abandon dispatch", async () => {
    let now = new Date(2026, 10, 18, 12, 0);
    const store = createGameStore({ persistence: createMemoryPersistence(), runEffects: () => {}, now: () => now });
    setGameStore(store);
    await store.getState().init();
    store.getState().dispatch({ type: "PLAYER_ACCEPTED", name: "T" });
    store.getState().dispatch({ type: "TICK" });
    const st = store.getState().state!;
    store.setState({ state: { ...st, inventory: [{ id: "item-7", defId: "dungeon-key", name: "Dungeon Key (D)", rarity: "rare", description: "", consumable: true, obtainedAt: "" }] } });
    handleAction({ label: "ENTER", kind: "start:dungeon", arg: "D:item-7" });
    expect(useUi.getState().dungeonDialog).toEqual({ keyId: "item-7" });
    useUi.getState().closeDungeonDialog();
    store.getState().dispatch({ type: "DUNGEON_STARTED", rank: "D", bossName: "Boss", minutes: 25, keyItemId: "item-7" });
    now = new Date(2026, 10, 18, 12, 26);
    handleAction({ label: "CLAIM VICTORY", kind: "dungeon:claim" });
    expect(store.getState().state!.dungeon).toBeUndefined();
    expect(store.getState().state!.dungeonsCleared).toBe(1);
    store.getState().dispatch({ type: "DUNGEON_STARTED", rank: "E", bossName: "Boss", minutes: 25 });
    handleAction({ label: "FLED", kind: "dungeon:abandon" });
    expect(store.getState().state!.dungeon).toBeUndefined();
    expect(store.getState().state!.dungeonsCleared).toBe(1);
  });
});
