/** Hand-built State used for visual development, tests and `?fixture=` mode. Does not call the engine. */
import { DEFAULT_CONFIG, type Config, type DailyQuest, type Goal, type HunterRank, type State, type StatId } from "../engine";

const iso = (d: Date) => d.toISOString();
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function goalsFor(config: Config, progress: Record<string, number> = {}): Goal[] {
  return config.habits.map((h) => {
    const current = progress[h.id] ?? 0;
    return { id: `g-${h.id}`, habitId: h.id, stat: h.stat, label: h.label, target: h.target, unit: h.unit, current, done: current >= h.target };
  });
}

export function makeFixtureState(opts: { accepted?: boolean; now?: Date; config?: Config } = {}): State {
  const now = opts.now ?? new Date();
  const config = opts.config ?? DEFAULT_CONFIG;
  const accepted = opts.accepted ?? true;
  const stats = { STR: 14, VIT: 12, AGI: 10, INT: 16, SENSE: 11 } satisfies Record<StatId, number>;
  const mk = (id: StatId) => ({ value: accepted ? stats[id] : 10, xp: 12, allocated: 0 });
  const streak = (stat: StatId, current: number) => ({ stat, current, best: Math.max(current, 9), lastDate: ymd(now) });

  const history: DailyQuest[] = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(now); d.setDate(d.getDate() - (14 - i));
    const doneCount = [4, 4, 3, 4, 2, 4, 4, 1, 4, 3, 4, 4, 0, 4][i];
    const goals = goalsFor(config).map((g, gi) => ({ ...g, current: gi < doneCount ? g.target : 0, done: gi < doneCount }));
    return { date: ymd(d), goals, startedAt: iso(d), closedAt: iso(d), result: doneCount === 4 ? "clear" : doneCount >= 2 ? "partial" : "fail", xpEarned: doneCount * 30, goldEarned: doneCount * 10 } as DailyQuest;
  });

  return {
    version: 1,
    config,
    player: { accepted, name: accepted ? "JINWOO" : "", level: accepted ? 6 : 1, xp: 148, xpToNext: 260, abilityPoints: accepted ? 3 : 0, job: accepted ? "NONE" : undefined, rank: "E" as HunterRank },
    stats: { STR: mk("STR"), VIT: mk("VIT"), AGI: mk("AGI"), INT: mk("INT"), SENSE: mk("SENSE") },
    vitals: { hp: 178, mp: 66, fatigue: 20 },
    gold: 245,
    today: accepted ? { date: ymd(now), goals: goalsFor(config, { gym: 1, study: 25 }), startedAt: iso(now) } : undefined,
    history: accepted ? history : [],
    streaks: { STR: streak("STR", 4), VIT: streak("VIT", 12), AGI: streak("AGI", 0), INT: streak("INT", 7), SENSE: streak("SENSE", 3) },
    inventory: accepted ? [
      { id: "i1", defId: "potion", name: "Potion of Recovery", rarity: "common", description: "Restores 50 HP.", consumable: true, obtainedAt: iso(now) },
      { id: "i2", defId: "xp-boost", name: "XP Boost", rarity: "rare", description: "+25% XP for 24 hours.", consumable: true, obtainedAt: iso(now) },
    ] : [],
    boxes: accepted ? 2 : 0,
    rewards: accepted ? [
      { id: "r1", name: "New headphones", usd: 80, url: "https://example.com/headphones", stat: "INT", createdAt: iso(now) },
      { id: "r2", name: "Movie night", usd: 15, createdAt: iso(now) },
      { id: "r3", name: "Pizza dinner", usd: 22, stat: "VIT", createdAt: iso(now), purchasedAt: iso(now), goldPaid: 440 },
    ] : [],
    spentThisMonthUsd: accepted ? 22 : 0,
    titles: accepted ? [{ id: "t1", name: "Wolf Assassin", effect: "STR XP +5%", unlockedAt: iso(now) }] : [],
    skills: accepted ? [{ id: "s1", name: "Tenacity", kind: "passive", effect: "One missed goal per week will not break its streak.", mpCost: 0, cooldownHours: 168, unlockedAt: iso(now) }] : [],
    shadows: accepted ? [{ id: "sh1", name: "Iron", stat: "SENSE", rank: "Normal Soldier", epithet: "First of the fallen", extractedAt: iso(now), streakAtExtraction: 7 }] : [],
    dungeonsCleared: 2,
    gatesCleared: 0,
    lastTickAt: iso(now),
  };
}

/**
 * A deliberately dumb reducer for `?fixture=` mode: just enough behaviour to click around the screens.
 * (Real behaviour comes from src/engine.)
 */
export function fakeReduce(state: State, event: import("../engine").Event): import("../engine").ReduceResult {
  const s: State = structuredClone(state);
  switch (event.type) {
    case "PLAYER_ACCEPTED":
      return { state: { ...makeFixtureState({ accepted: true, config: s.config }), player: { ...makeFixtureState().player, name: event.name } }, effects: [] };
    case "CONFIG_CHANGED": s.config = { ...s.config, ...event.patch }; break;
    case "GOAL_PROGRESS": case "GOAL_SET": {
      const g = s.today?.goals.find((x) => x.id === event.goalId);
      if (g) { g.current = event.type === "GOAL_SET" ? event.value : g.current + event.delta; g.done = g.current >= g.target; }
      break;
    }
    case "POINTS_ALLOCATED":
      if (s.player.abilityPoints >= event.points) { s.player.abilityPoints -= event.points; s.stats[event.stat].value += event.points; s.stats[event.stat].allocated += event.points; }
      break;
    case "REWARD_ADDED": s.rewards.push({ ...event.reward, createdAt: event.at }); break;
    case "REWARD_REMOVED": s.rewards = s.rewards.filter((r) => r.id !== event.rewardId); break;
    case "REWARD_PURCHASED": {
      const r = s.rewards.find((x) => x.id === event.rewardId);
      if (r) { r.purchasedAt = event.at; r.goldPaid = Math.ceil(r.usd * s.config.economy.usdToGold); s.gold -= r.goldPaid; s.spentThisMonthUsd += r.usd; }
      break;
    }
    case "BOX_OPENED": if (s.boxes > 0) { s.boxes--; s.inventory.push({ id: `i${event.seed}`, defId: "potion", name: "Potion of Recovery", rarity: "common", description: "Restores 50 HP.", consumable: true, obtainedAt: event.at }); } break;
    case "ITEM_USED": s.inventory = s.inventory.filter((i) => i.id !== event.itemId); break;
    case "TITLE_EQUIPPED": s.player.equippedTitleId = event.titleId; break;
    default: break;
  }
  return { state: s, effects: [] };
}
