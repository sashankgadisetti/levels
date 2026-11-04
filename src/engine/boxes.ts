/** Random Box. Deterministic from the event seed. Percentages: docs/04-architecture.md §5. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 60% consumable (30 potion / 30 mana), 25 shield, 10 key, 4 XP boost, 1 elixir. */
export const DROP_TABLE: { defId: string; weight: number }[] = [
  { defId: "potion-recovery", weight: 30 },
  { defId: "potion-mana", weight: 30 },
  { defId: "streak-shield", weight: 25 },
  { defId: "dungeon-key", weight: 10 },
  { defId: "xp-boost", weight: 4 },
  { defId: "elixir-of-life", weight: 1 },
];

export function rollBox(seed: number): string {
  const r = mulberry32(seed)() * 100;
  let acc = 0;
  for (const e of DROP_TABLE) { acc += e.weight; if (r < acc) return e.defId; }
  return DROP_TABLE[0].defId;
}
