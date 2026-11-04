import { rankForLevel } from "./rank";
import type { Item, Rarity } from "./types";

export interface ItemDef { defId: string; name: string; rarity: Rarity; description: string; consumable: boolean }

export const ITEM_DEFS: Record<string, ItemDef> = {
  "potion-recovery": { defId: "potion-recovery", name: "Potion of Recovery", rarity: "common", description: "Restores 20 HP.", consumable: true },
  "potion-mana": { defId: "potion-mana", name: "Mana Potion", rarity: "common", description: "Restores 30 MP.", consumable: true },
  "streak-shield": { defId: "streak-shield", name: "Streak Shield", rarity: "rare", description: "Absorbs one broken streak. Consumed automatically. Max 2 held.", consumable: true },
  "dungeon-key": { defId: "dungeon-key", name: "Dungeon Key", rarity: "rare", description: "Opens an Instant Dungeon.", consumable: true },
  "xp-boost": { defId: "xp-boost", name: "XP Boost", rarity: "epic", description: "+50% XP for the next day.", consumable: true },
  "elixir-of-life": { defId: "elixir-of-life", name: "Elixir of Life", rarity: "legendary", description: "Clears Penalty Mode and restores HP to full.", consumable: true },
};
export const MAX_SHIELDS = 2;

export function makeItem(defId: string, id: string, at: string, level: number): Item {
  const d = ITEM_DEFS[defId];
  if (defId === "dungeon-key") {
    const r = rankForLevel(level) === "NATIONAL" ? "S" : rankForLevel(level);
    return { id, defId, name: `Dungeon Key (${r})`, rarity: d.rarity, description: `Opens an Instant Dungeon of rank ${r}.`, consumable: true, obtainedAt: at };
  }
  return { id, defId, name: d.name, rarity: d.rarity, description: d.description, consumable: d.consumable, obtainedAt: at };
}
