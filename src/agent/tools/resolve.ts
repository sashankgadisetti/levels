/** Fuzzy lookup of habits / goals / rewards by id or loose name. */
import type { Goal, HabitDef, RewardDef, State } from "../../engine";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const STOP = new Set(["the", "for", "and", "my", "a", "of", "to", "done", "did", "min", "mins", "times", "time", "session", "sessions"]);
const words = (s: string) => norm(s).split(" ").filter((w) => w.length >= 3 && !STOP.has(w));
const stem = (w: string) => w.replace(/(ing|ed|es|s)$/, "");

/** Words that point at a habit by its stat / kind, so default names work ("slept" → sleep, "ate" → meals). */
export const SYNONYMS: { test: (h: HabitDef) => boolean; words: string[] }[] = [
  { test: (h) => h.stat === "STR", words: ["gym", "workout", "work out", "worked out", "lift", "lifted", "lifting", "train", "trained", "training", "exercise", "exercised", "run", "ran", "pushups", "push ups", "strength"] },
  { test: (h) => h.stat === "INT", words: ["study", "studied", "studying", "learn", "learned", "learning", "course", "coded", "coding", "read", "reading", "career"] },
  { test: (h) => h.stat === "SENSE" && h.kind === "hours", words: ["sleep", "slept", "bed", "nap"] },
  { test: (h) => h.stat === "VIT", words: ["meal", "meals", "ate", "eat", "eating", "food", "cooked", "breakfast", "lunch", "dinner", "clean"] },
  { test: (h) => h.stat === "HYD", words: ["water", "drank", "drink", "drinking", "glass", "glasses", "hydrate", "hydrated", "bottle"] },
];

/** Score how well `phrase` names habit `h` (0 = no match). */
export function habitScore(h: HabitDef, phrase: string): number {
  const p = ` ${norm(phrase)} `;
  const pw = new Set(words(phrase).map(stem));
  let score = 0;
  if (p.includes(` ${norm(h.id)} `)) score += 5;
  if (norm(h.label) && p.includes(norm(h.label))) score += 5;
  for (const w of words(h.label)) if (pw.has(stem(w))) score += 2;
  const unit = norm(h.unit);
  if (unit.length >= 3 && !STOP.has(unit) && (pw.has(stem(unit)) || p.includes(` ${unit} `))) score += 2;
  for (const syn of SYNONYMS) if (syn.test(h) && syn.words.some((w) => p.includes(` ${w} `))) { score += 3; break; }
  return score;
}

export function findHabit(habits: HabitDef[], phrase: string): HabitDef | undefined {
  let best: HabitDef | undefined, bestScore = 0;
  for (const h of habits) {
    const s = habitScore(h, phrase);
    if (s > bestScore) { best = h; bestScore = s; }
  }
  return best;
}

export type GoalRef = { goal_id?: string; habit_id?: string; label?: string };

/** Resolve a goal of today's quest by exact id, habit id, or fuzzy label. */
export function resolveGoal(state: State, ref: GoalRef): { goal?: Goal; error?: string } {
  const goals = state.today?.goals ?? [];
  if (!state.today) return { error: "No quest is open today." };
  if (ref.goal_id) {
    const g = goals.find((x) => x.id === ref.goal_id);
    return g ? { goal: g } : { error: `No goal "${ref.goal_id}" today. Known: ${goals.map((x) => x.id).join(", ")}` };
  }
  if (ref.habit_id) {
    const g = goals.find((x) => x.habitId === ref.habit_id) ?? goals.find((x) => norm(x.habitId) === norm(ref.habit_id!));
    if (g) return { goal: g };
  }
  const phrase = ref.label ?? ref.habit_id;
  if (!phrase) return { error: "Give goal_id, habit_id or label." };
  const habits = state.config.habits.filter((h) => goals.some((g) => g.habitId === h.id));
  const h = findHabit(habits, phrase);
  let g = h && goals.find((x) => x.habitId === h.id);
  // Goals without a habit (e.g. project strikes): match on the goal label.
  if (!g) g = goals.find((x) => norm(x.label).includes(norm(phrase)) || norm(phrase).includes(norm(x.label)));
  return g ? { goal: g } : { error: `No goal matches "${phrase}". Today: ${goals.map((x) => `${x.habitId} (${x.label})`).join(", ")}` };
}

export function resolveReward(state: State, ref: { reward_id?: string; name?: string }): RewardDef | undefined {
  if (ref.reward_id) return state.rewards.find((r) => r.id === ref.reward_id);
  if (!ref.name) return undefined;
  const n = norm(ref.name);
  const open = state.rewards.filter((r) => !r.purchasedAt);
  return open.find((r) => norm(r.name) === n) ?? open.find((r) => norm(r.name).includes(n) || n.includes(norm(r.name)))
    ?? open.find((r) => words(r.name).some((w) => words(n).map(stem).includes(stem(w))));
}
