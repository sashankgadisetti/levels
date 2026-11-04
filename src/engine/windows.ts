/** Template System windows. Voice: bracketed, deadpan, second person. All specs are validated by parseSpec. */
import { parseSpec, type SystemWindowInput, type SystemWindowSpec } from "../system/spec";
import type { DailyQuest, Goal, HunterRank, Item, Penalty, Shadow, Skill, StatId, State, Title } from "./types";

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const isTest = () => !!(globalThis as { process?: { env?: Record<string, string> } }).process?.env?.VITEST;

/** Validate a spec. Throws under vitest; in production falls back to a minimal valid window. */
export function make(input: SystemWindowInput): SystemWindowSpec {
  const r = parseSpec(input);
  if (r.success) return r.data;
  if (isTest()) throw new Error(`Invalid SystemWindowSpec "${input.title}": ${r.error.message}`);
  return { variant: "info", title: clip(String(input.title || "NOTIFICATION"), 80), blocks: [], actions: [], sound: "ding" };
}

const STAT_LABEL: Record<string, string> = { STR: "STRENGTH", VIT: "VITALITY", AGI: "AGILITY", INT: "INTELLIGENCE", SENSE: "SENSE" };
const statLabel = (s: string) => STAT_LABEL[s] ?? s;
const close = { label: "CLOSE", kind: "dismiss" as const };

function goalRow(g: Goal) {
  return { type: "goalRow" as const, goalId: g.id, label: clip(g.label, 48), current: g.current, target: g.target, unit: clip(g.unit, 12), stat: g.stat, done: g.done };
}
export interface PenaltyGoalView { goalId: string; label: string; stat: StatId; unit: string; current: number; target: number; done: boolean }
const penaltyRow = (g: PenaltyGoalView) => ({ type: "goalRow" as const, goalId: g.goalId, label: clip(g.label, 48), current: g.current, target: g.target, unit: clip(g.unit, 12), stat: g.stat, done: g.done });

export interface QuestRewards {
  xp: number; gold: number; box: boolean; points: number; overallStreak: number;
  shielded: StatId[]; broken: StatId[]; tenacity: boolean; hpLost: number;
}

export function dailyQuest(state: State): SystemWindowSpec {
  const q = state.today;
  const goals = q?.goals ?? [];
  const c = state.config;
  const open = goals.filter((g) => !g.rest);
  const xp = open.length * c.curves.xpPerGoal + (goals.length - open.length) * Math.round(c.curves.xpPerGoal / 2) + c.curves.fullClearBonus;
  const gold = open.length * c.economy.goldPerGoal + (goals.length - open.length) * Math.round(c.economy.goldPerGoal / 2) + c.economy.goldFullClear;
  const blocks: SystemWindowInput["blocks"] = [
    { type: "text", text: "GOAL", tone: "dim" },
    ...goals.slice(0, 8).map(goalRow),
    { type: "kv", rows: [["REWARD", `XP +${xp}  GOLD +${gold}  RANDOM BOX x1`]] },
  ];
  if (state.vitals.fatigue >= 75) blocks.push({ type: "text", text: "Fatigue is high. Rest is recommended for STRENGTH.", tone: "gold" });
  blocks.push({ type: "text", text: "WARNING: FAILURE TO COMPLETE THE DAILY QUEST WILL RESULT IN A PENALTY.", tone: "red" });
  return make({
    id: `daily-${q?.date ?? "none"}`, variant: "quest", title: "DAILY QUEST: PREPARATION TO BECOME POWERFUL", glyph: "diamond", blocks,
    actions: [{ label: "ACCEPT", kind: "accept", primary: true }, { label: "LATER", kind: "dismiss" }], sound: "ding", timeoutMs: 0,
  });
}

export function questComplete(result: DailyQuest, r: QuestRewards): SystemWindowSpec {
  const goals = result.goals;
  const done = goals.filter((g) => g.done).length;
  const res = result.result ?? "clear";
  const rewardLine = `XP +${r.xp}   GOLD +${r.gold}${r.points ? `   AP +${r.points}` : ""}${r.box ? "   RANDOM BOX x1" : ""}`;
  const blocks: SystemWindowInput["blocks"] = [];
  if (res === "clear") blocks.push({ type: "text", text: r.tenacity ? "All objectives cleared. Tenacity absorbed one miss." : "All objectives cleared.", tone: "cyan" });
  else blocks.push({ type: "text", text: `${done} / ${goals.length} objectives cleared.`, tone: res === "fail" ? "red" : "dim" });
  blocks.push(...goals.slice(0, 8).map(goalRow));
  blocks.push({ type: "kv", rows: [["REWARD", rewardLine]] });
  const lines: string[] = [];
  if (r.shielded.length) lines.push(`Streak Shield consumed: ${r.shielded.join(", ")} streak preserved.`);
  if (r.broken.length) lines.push(`Streak broken: ${r.broken.join(", ")}.`);
  if (r.hpLost) lines.push(`HP -${r.hpLost}`);
  if (res === "clear") lines.push(`Overall streak: ${r.overallStreak} days.`);
  if (lines.length) blocks.push({ type: "list", items: lines.slice(0, 10), tone: res === "clear" ? "cyan" : "red" });
  const clear = res === "clear";
  return make({
    id: `result-${result.date}`, variant: clear ? "reward" : "warning",
    title: clear ? "DAILY QUEST COMPLETE" : res === "partial" ? "DAILY QUEST ENDED" : "DAILY QUEST FAILED",
    glyph: clear ? "box" : "alert", blocks,
    actions: clear && r.box ? [{ label: "OPEN BOX", kind: "open:box", primary: true }, close] : [close],
    sound: "ding", timeoutMs: 20_000,
  });
}

export function levelUp(level: number, from = level - 1, points = 3): SystemWindowSpec {
  return make({
    id: `levelup-${level}`, variant: "levelup", title: "LEVEL UP", glyph: "crown",
    blocks: [
      { type: "text", text: "You have leveled up.", align: "center" },
      { type: "kv", rows: [["LEVEL", `${from} -> ${level}`], ["ABILITY POINTS", `+${points}`]] },
      { type: "text", text: "HP/MP restored.", tone: "dim" },
    ],
    actions: [{ label: "ALLOCATE", kind: "allocate:points", primary: true }, close], sound: "levelup", timeoutMs: 12_000,
  });
}

export function rankUp(prev: HunterRank, next: HunterRank, level?: number): SystemWindowSpec {
  const national = next === "NATIONAL";
  return make({
    id: `rank-${next}`, variant: "status", title: national ? "NATIONAL LEVEL" : "RANK RE-EVALUATION", glyph: "crown",
    blocks: [
      { type: "text", text: national ? "Your existence is now classified." : "Analysing Player data...", tone: "cyan" },
      { type: "rankBadge", rank: next, previous: prev },
      { type: "kv", rows: [["PREVIOUS RANK", prev], ["CURRENT RANK", next], ...(level ? [["LEVEL", String(level)] as [string, string]] : [])] },
      { type: "text", text: "Hunter licence updated.", tone: "dim" },
    ],
    actions: [{ label: "ACCEPT RANK", kind: "accept", primary: true }], sound: "levelup", timeoutMs: 0,
  });
}

export function titleAcquired(title: Title, condition?: string): SystemWindowSpec {
  return make({
    id: `title-${title.id}`, variant: "reward", title: "TITLE ACQUIRED", glyph: "diamond",
    blocks: [
      { type: "text", text: `[You have acquired a new title: ${clip(title.name, 60)}]`, tone: "gold" },
      ...(condition ? [{ type: "text" as const, text: `Condition: ${clip(condition, 120)}`, tone: "dim" as const }] : []),
      { type: "kv", rows: [["PASSIVE", clip(title.effect, 64)]] },
    ],
    actions: [{ label: "VIEW", kind: "open:status", primary: true }, close], sound: "ding", timeoutMs: 15_000,
  });
}

export function skillAcquired(skill: Skill): SystemWindowSpec {
  return make({
    id: `skill-${skill.id}`, variant: "info", title: "NEW SKILL", glyph: "diamond",
    blocks: [
      { type: "text", text: `${skill.name.toUpperCase()}   (${skill.kind.toUpperCase()})`, tone: "cyan" },
      { type: "text", text: clip(skill.effect, 300) },
      { type: "kv", rows: [["MP COST", skill.mpCost ? String(skill.mpCost) : "--"], ["COOLDOWN", skill.cooldownHours ? `${skill.cooldownHours} H` : "--"]] },
    ],
    actions: [{ label: "VIEW", kind: "open:status", primary: true }, close], sound: "ding", timeoutMs: 15_000,
  });
}

export function warning(hoursLeft: number, goals: Goal[] = []): SystemWindowSpec {
  const open = goals.filter((g) => !g.done);
  const h = Math.max(0, Math.ceil(hoursLeft));
  return make({
    id: `warning-${h}`, variant: "warning", title: "WARNING", glyph: "alert",
    blocks: [
      { type: "text", text: `${h} hour${h === 1 ? "" : "s"} remain. ${open.length} goal${open.length === 1 ? " is" : "s are"} incomplete.`, tone: "gold" },
      ...open.slice(0, 8).map(goalRow),
      { type: "text", text: "Incomplete quests trigger a penalty at the day boundary.", tone: "red" },
    ],
    actions: [{ label: "LOG NOW", kind: "open:quest", primary: true }, { label: "DISMISS", kind: "dismiss" }], sound: "ding", timeoutMs: 30_000,
  });
}

export function penaltyQuest(penalty: Penalty, goals: PenaltyGoalView[]): SystemWindowSpec {
  return make({
    id: `penalty-${penalty.date}`, variant: "penalty", title: "PENALTY QUEST: SURVIVE", glyph: "skull",
    blocks: [
      { type: "text", text: "You failed to clear the Daily Quest.", tone: "red" },
      { type: "timer", endsAt: penalty.endsAt, label: "TIME REMAINING", tone: "red" },
      { type: "kv", rows: [["EFFECTS", "HP DOWN   SHOP LOCKED   STREAKS BROKEN"]] },
      { type: "text", text: "MAKEUP: clear every objective below to escape.", tone: "dim" },
      ...goals.slice(0, 8).map(penaltyRow),
      { type: "text", text: "The timer does not stop for excuses.", tone: "red" },
    ],
    actions: [{ label: "BEGIN", kind: "accept", primary: true }, { label: "OPEN QUEST", kind: "open:quest" }], sound: "alarm", timeoutMs: 0,
  });
}

/** Reminder when the penalty timer has run out but the makeup is still open. */
export function penaltyPersists(penalty: Penalty, goals: PenaltyGoalView[]): SystemWindowSpec {
  return make({
    id: `penalty-remind-${penalty.date}`, variant: "warning", title: "WARNING", glyph: "skull",
    blocks: [
      { type: "text", text: "The Penalty Zone remains. The makeup objectives are still open.", tone: "red" },
      ...goals.filter((g) => !g.done).slice(0, 8).map(penaltyRow),
    ],
    actions: [{ label: "LOG NOW", kind: "open:quest", primary: true }, { label: "DISMISS", kind: "dismiss" }], sound: "ding", timeoutMs: 30_000,
  });
}

export function penaltyEscaped(): SystemWindowSpec {
  return make({
    id: "penalty-cleared", variant: "info", title: "PENALTY CLEARED", glyph: "diamond",
    blocks: [{ type: "text", text: "[You have escaped the Penalty Zone.]", tone: "cyan" }, { type: "text", text: "Survival confirmed. Shop restored. HP +10.", tone: "dim" }],
    actions: [close], sound: "ding", timeoutMs: 15_000,
  });
}

export function shadowOffer(stat: StatId, milestone: number): SystemWindowSpec {
  return make({
    id: `arise-${stat}-${milestone}`, variant: "shadow", title: "SHADOW EXTRACTION", glyph: "skull",
    blocks: [
      { type: "text", text: `${milestone}-day ${statLabel(stat)} streak confirmed.`, tone: "purple" },
      { type: "text", text: "A shadow awaits your command.", tone: "purple" },
    ],
    actions: [{ label: "ARISE", kind: "extract:shadow", arg: `${stat}:${milestone}`, primary: true }, { label: "LATER", kind: "dismiss" }],
    sound: "arise", timeoutMs: 0,
  });
}

export function shadowExtracted(shadow: Shadow): SystemWindowSpec {
  return make({
    id: `shadow-${shadow.id}`, variant: "shadow", title: "ARISE", glyph: "skull",
    blocks: [
      { type: "shadow", name: clip(shadow.name, 32), rank: shadow.rank, ...(shadow.epithet ? { epithet: clip(shadow.epithet, 80) } : {}) },
      { type: "text", text: `${clip(shadow.name, 32)} has joined your army.`, tone: "purple" },
    ],
    actions: [{ label: "OPEN ARMY", kind: "open:shadows", primary: true }, close], sound: "arise", timeoutMs: 15_000,
  });
}

export function boxOpened(item: Item): SystemWindowSpec {
  return make({
    id: `box-${item.id}`, variant: "reward", title: "RANDOM BOX", glyph: "box",
    blocks: [
      { type: "text", text: `Obtained: ${clip(item.name.toUpperCase(), 60)}.`, tone: "gold" },
      { type: "itemCard", name: clip(item.name, 48), rarity: item.rarity, description: clip(item.description, 200) },
    ],
    actions: [{ label: "INVENTORY", kind: "open:inventory", primary: true }, close], sound: item.rarity === "legendary" ? "levelup" : "ding", timeoutMs: 15_000,
  });
}

export function shieldUsed(stat: StatId, left: number): SystemWindowSpec {
  return make({
    id: `shield-${stat}`, variant: "info", title: "STREAK SHIELD", glyph: "diamond",
    blocks: [{ type: "text", text: `A Streak Shield was consumed. Your ${statLabel(stat)} streak is preserved.`, tone: "cyan" }, { type: "text", text: `Shields remaining: ${left}`, tone: "dim" }],
    actions: [close], sound: "ding", timeoutMs: 12_000,
  });
}

export function notice(title: string, text: string, tone: "cyan" | "red" | "gold" | "dim" = "cyan"): SystemWindowSpec {
  return make({ variant: tone === "red" ? "warning" : "info", title: clip(title, 80), blocks: [{ type: "text", text: clip(text, 400), tone }], actions: [close], sound: "ding", timeoutMs: 12_000 });
}

export function dungeonCleared(rank: HunterRank, boss: string, xp: number, gold: number): SystemWindowSpec {
  return make({
    variant: "reward", title: "DUNGEON CLEARED", glyph: "crown",
    blocks: [{ type: "text", text: `${rank}-rank dungeon cleared. ${clip(boss, 40)} eliminated.`, tone: "cyan" }, { type: "kv", rows: [["REWARD", `XP +${xp}   GOLD +${gold}`]] }],
    actions: [close], sound: "ding", timeoutMs: 15_000,
  });
}

export function dungeonKey(rank: string): SystemWindowSpec {
  return make({
    variant: "gate", title: "DUNGEON KEY", glyph: "diamond",
    blocks: [{ type: "text", text: `The key resonates. A ${clip(rank, 8)}-rank Instant Dungeon is open.`, tone: "gold" }],
    actions: [{ label: "ENTER", kind: "start:dungeon", arg: clip(rank, 8), primary: true }, { label: "LATER", kind: "dismiss" }], sound: "ding", timeoutMs: 0,
  });
}

export function gate(rank: HunterRank, week: string, cleared?: boolean, reward?: { gold: number; xp: number }): SystemWindowSpec {
  return make({
    id: `gate-${week}`, variant: "gate", title: cleared ? "GATE CLEARED" : "GATE DETECTED", glyph: "diamond",
    blocks: [
      { type: "text", text: cleared ? `Rank ${rank} Gate eliminated.` : `${rank}-RANK GATE   Week ${week}`, tone: cleared ? "cyan" : "gold" },
      ...(reward ? [{ type: "kv" as const, rows: [["REWARD", `GOLD +${reward.gold}   XP +${reward.xp}   RANDOM BOX`] as [string, string]] }] : []),
    ],
    actions: [{ label: "OPEN QUEST", kind: "open:quest", primary: true }, close], sound: "ding", timeoutMs: cleared ? 15_000 : 0,
  });
}

export function statusWindow(state: State): SystemWindowSpec {
  const p = state.player;
  const title = state.titles.find((t) => t.id === p.equippedTitleId);
  return make({
    id: "status", variant: "status", title: "STATUS WINDOW", glyph: "none",
    blocks: [
      { type: "kv", rows: [["NAME", clip(p.name, 60)], ["LEVEL", String(p.level)], ["RANK", p.rank], ["JOB", p.job ?? "NONE"], ["TITLE", clip(title?.name ?? "NONE", 60)], ["GOLD", String(state.gold)]] },
      { type: "bar", label: "HP", value: state.vitals.hp, max: 100, tone: state.vitals.hp < 30 ? "red" : "cyan" },
      { type: "bar", label: "MP", value: state.vitals.mp, max: 100, tone: "cyan" },
      { type: "bar", label: "FATIGUE", value: state.vitals.fatigue, max: 100, tone: state.vitals.fatigue >= 75 ? "red" : "dim" },
      { type: "bar", label: "XP", value: p.xp, max: p.xpToNext, tone: "purple" },
      { type: "divider" },
      ...state.config.stats.map((sd) => ({ type: "statRow" as const, stat: sd.label, value: state.stats[sd.id].value, locked: sd.locked })),
      { type: "text", text: `Available ability points: ${p.abilityPoints}`, tone: "dim" },
    ],
    actions: [{ label: "CLOSE", kind: "dismiss", primary: true }], sound: "ding", timeoutMs: 0,
  });
}
