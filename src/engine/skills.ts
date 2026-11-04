import { popup, type Ctx } from "./ctx";
import { addHours } from "./time";
import { addMp, clamp } from "./vitals";
import { notice, skillAcquired } from "./windows";
import type { ISO, Skill, State } from "./types";

export interface SkillDef {
  id: string; name: string; kind: "passive" | "active"; effect: string; mpCost: number; cooldownHours: number;
  requirement: string; test: (s: State) => boolean;
}
const stat = (s: State, id: "STR" | "SENSE" | "INT") => s.stats[id].value;

export const SKILL_DEFS: SkillDef[] = [
  { id: "tenacity", name: "Tenacity", kind: "passive", effect: "One missed goal per week will not break the day.", mpCost: 0, cooldownHours: 168, requirement: "Lv 5", test: (s) => s.player.level >= 5 },
  { id: "sprint", name: "Sprint", kind: "active", effect: "The next goal you complete today pays double XP.", mpCost: 15, cooldownHours: 24, requirement: "Lv 10, STR 20", test: (s) => s.player.level >= 10 && stat(s, "STR") >= 20 },
  { id: "vital-strike", name: "Vital Strike", kind: "passive", effect: "+25% XP on the first goal cleared each day if it is your hardest. (TODO)", mpCost: 0, cooldownHours: 24, requirement: "Lv 12", test: (s) => s.player.level >= 12 },
  { id: "stealth", name: "Stealth", kind: "active", effect: "Suppress all pop-ups for 1-8 hours.", mpCost: 10, cooldownHours: 12, requirement: "Lv 15, SENSE 25", test: (s) => s.player.level >= 15 && stat(s, "SENSE") >= 25 },
  { id: "bloodlust", name: "Bloodlust", kind: "active", effect: "Start Focus: +15% INT XP for the session. (TODO)", mpCost: 20, cooldownHours: 6, requirement: "Lv 20, INT 30", test: (s) => s.player.level >= 20 && stat(s, "INT") >= 30 },
  { id: "rulers-authority", name: "Ruler's Authority", kind: "active", effect: "Swap one of today's goals without penalty. (TODO)", mpCost: 30, cooldownHours: 168, requirement: "Lv 30", test: (s) => s.player.level >= 30 },
  { id: "shadow-extraction", name: "Shadow Extraction", kind: "active", effect: "Perform an Arise at a streak milestone.", mpCost: 25, cooldownHours: 0, requirement: "Lv 25, first milestone", test: (s) => s.player.level >= 25 && (s.shadows.length > 0 || !!s.pendingExtractions?.length) },
  { id: "shadow-exchange", name: "Shadow Exchange", kind: "active", effect: "A shadow covers one sick day and ranks down. (TODO)", mpCost: 50, cooldownHours: 720, requirement: "Lv 40, 2 shadows", test: (s) => s.player.level >= 40 && s.shadows.length >= 2 },
  { id: "domain-expansion", name: "Domain Expansion", kind: "active", effect: "All XP x1.5 for 24 hours. (TODO)", mpCost: 60, cooldownHours: 336, requirement: "Lv 60", test: (s) => s.player.level >= 60 },
  { id: "detection", name: "Detection", kind: "passive", effect: "Reveals upcoming quests. (TODO)", mpCost: 0, cooldownHours: 0, requirement: "SENSE 50", test: (s) => stat(s, "SENSE") >= 50 },
];

export function checkSkills(c: Ctx): void {
  for (const d of SKILL_DEFS) {
    if (c.s.skills.some((k) => k.id === d.id) || !d.test(c.s)) continue;
    const k: Skill = { id: d.id, name: d.name, kind: d.kind, effect: d.effect, mpCost: d.mpCost, cooldownHours: d.cooldownHours, unlockedAt: c.at };
    c.s.skills.push(k);
    popup(c, skillAcquired(k));
  }
}

export const cooldownEndsAt = (k: Skill): ISO | undefined => (k.lastUsedAt ? addHours(k.lastUsedAt, k.cooldownHours) : undefined);
export function skillReady(s: State, k: Skill, now: ISO): boolean {
  if (k.kind !== "active" || s.vitals.mp < k.mpCost) return false;
  const e = cooldownEndsAt(k);
  return !e || e <= now;
}

export function useSkill(c: Ctx, skillId: string, hours?: number): void {
  const s = c.s;
  const i = s.skills.findIndex((k) => k.id === skillId);
  const k = s.skills[i];
  if (!k || k.kind !== "active") return;
  if (s.vitals.mp < k.mpCost) { popup(c, notice("SKILL UNAVAILABLE", `${k.name}: insufficient MP. Short by ${k.mpCost - s.vitals.mp}.`, "red"), { droppable: true }); return; }
  const e = cooldownEndsAt(k);
  if (e && e > c.at) { popup(c, notice("SKILL UNAVAILABLE", `${k.name} is on cooldown.`, "red"), { droppable: true }); return; }
  addMp(s, -k.mpCost);
  s.skills[i] = { ...k, lastUsedAt: c.at };
  if (skillId === "sprint") s.sprintArmed = true;
  else if (skillId === "stealth") s.quietUntil = addHours(c.at, clamp(hours ?? 4, 1, 8));
  // other active skills: MP + cooldown only (TODO effects)
}
