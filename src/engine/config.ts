import type { Config, StatDef } from "./types";

export const HYD_STAT: StatDef = { id: "HYD", label: "HYDRATION", short: "HYD", locked: false, description: "Drinking water (pop-up check-ins)" };
export const DEFAULT_CONFIG: Config = {
  player: { name: "PLAYER", dayEndsAt: "03:00" },
  stats: [
    { id: "STR", label: "STRENGTH", short: "STR", locked: false, description: "Gym / working out" },
    { id: "VIT", label: "VITALITY", short: "VIT", locked: false, description: "Eating healthy (feeds HP)" },
    { id: "AGI", label: "AGILITY", short: "AGI", locked: true, description: "Cardio / mobility (optional)" },
    { id: "INT", label: "INTELLIGENCE", short: "INT", locked: false, description: "Learning for your career" },
    { id: "SENSE", label: "SENSE", short: "SEN", locked: false, description: "Sleeping every night" },
    HYD_STAT,
  ],
  habits: [
    { id: "gym", stat: "STR", label: "Workout", kind: "count", target: 1, unit: "session", restDays: ["Sun"] },
    { id: "study", stat: "INT", label: "Study for career", kind: "minutes", target: 60, unit: "min" },
    { id: "sleep", stat: "SENSE", label: "Sleep", kind: "hours", target: 7, unit: "h", logPrevNight: true },
    { id: "eat", stat: "VIT", label: "Clean meals", kind: "count", target: 3, unit: "meals" },
    { id: "water", stat: "HYD", label: "Drink water", kind: "count", target: 5, unit: "check-ins",
      checkIn: { everyMinutes: 90, from: "09:00", to: "21:00", question: "Have you had water since the last check?" } },
  ],
  // Pacing: a completed goal adds +1 to its stat, +2 on every 7th day in a row, so a habit done daily takes
  // its stat from 10 to 100 in about 11 weeks. Player level reaches ~15 after 3 months of daily full clears.
  curves: { xpPerGoal: 30, fullClearBonus: 120, levelExponent: 1.45, levelBase: 80, pointsPerLevel: 1, statPointsPerGoal: 1, statBonusEvery: 7 },
  economy: { goldPerGoal: 10, goldFullClear: 50, goldGate: 300, monthlyBudgetUsd: 150, usdToGold: 20 },
  penalty: { surviveHours: 4, hpLoss: 20, lockShop: true, resetStreakOf: "missedStatsOnly" },
  popups: { warnHoursBefore: [3, 1] },
  oracle: { enabled: false, model: "claude-opus-5-5", flavorModel: "claude-haiku-5-5", dailyBudgetUsd: 0.25 },
};
