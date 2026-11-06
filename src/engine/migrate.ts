/**
 * Snapshot upgrades. Saves keep their own copy of the config, so a change to DEFAULT_CONFIG reaches an
 * existing player only through a migration here. `reduce` runs `migrate` on every draft; it is a no-op once
 * `state.rev` is current.
 */
import { DEFAULT_CONFIG, HYD_STAT } from "./config";
import { goalStatPoints, xpToNext } from "./xp";
import type { State } from "./types";

export const STATE_REV = 2;

export function migrate(s: State): void {
  if ((s.rev ?? 1) >= STATE_REV) return;
  // rev 2: water gets its own HYDRATION stat; slower leveling and stat-point curves.
  const cfg = s.config;
  s.config = {
    ...cfg,
    stats: cfg.stats.some((d) => d.id === "HYD") ? cfg.stats : [...cfg.stats, HYD_STAT],
    habits: cfg.habits.map((h) => (h.id === "water" && h.stat === "VIT" ? { ...h, stat: "HYD" } : h)),
    curves: { ...DEFAULT_CONFIG.curves },
  };
  if (s.today) {
    for (const g of s.today.goals) {
      if (g.habitId === "water" && g.stat === "VIT") g.stat = "HYD";
      // A day already rewarded under rev 1 paid its stat XP; don't pay it again at close.
      if (s.today.rewardedAt) g.statPaid = goalStatPoints(g, 1, s.config.curves);
    }
  }
  s.player.xpToNext = xpToNext(s.player.level, s.config.curves);
  s.rev = STATE_REV;
}

/** Keep the HYDRATION stat in a config patch that replaces the stat list. */
export function withHydration<T extends { stats?: State["config"]["stats"] }>(patch: T): T {
  if (!patch.stats || patch.stats.some((d) => d.id === "HYD")) return patch;
  return { ...patch, stats: [...patch.stats, HYD_STAT] };
}
