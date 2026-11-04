import { popup, type Ctx } from "./ctx";
import { count } from "./ctx";
import { rankIndex } from "./rank";
import { shadowRankIndex } from "./streaks";
import { titleAcquired } from "./windows";
import type { StatId, State, Title } from "./types";

export interface TitleDef {
  id: string; name: string; condition: string; effect: string;
  test: (s: State) => boolean;
  /** passive XP bonus (fraction) for one stat, or all */
  xp?: { stat: StatId | "ALL"; pct: number };
  goldPct?: number;
}

const best = (s: State, stat: StatId) => s.streaks[stat].best;

/** Catalog from docs/02-features.md §3.4 (18 titles). Only XP% and gold% passives are active. */
export const TITLE_DEFS: TitleDef[] = [
  { id: "awakened", name: "Awakened", condition: "Accept Player status", effect: "None (cosmetic)", test: (s) => s.player.accepted },
  { id: "wolf-assassin", name: "Wolf Assassin", condition: "30-day STRENGTH streak", effect: "STR XP +5%", xp: { stat: "STR", pct: 0.05 }, test: (s) => best(s, "STR") >= 30 },
  { id: "iron-body", name: "Iron Body", condition: "100 gym sessions", effect: "Max HP +10% (TODO)", test: (s) => count(s, "gymSessions") >= 100 },
  { id: "scholar", name: "Scholar", condition: "100 hours of INT work", effect: "INT XP +5%", xp: { stat: "INT", pct: 0.05 }, test: (s) => count(s, "intMinutes") >= 6000 },
  // TODO: needs a wake-time log; a 14-day SENSE streak is the proxy.
  { id: "early-riser", name: "Early Riser", condition: "14-day SENSE streak", effect: "SENSE XP +3%", xp: { stat: "SENSE", pct: 0.03 }, test: (s) => best(s, "SENSE") >= 14 },
  { id: "night-watch", name: "Night Watch", condition: "30-day SENSE streak", effect: "Fatigue recovery +5/day (TODO)", test: (s) => best(s, "SENSE") >= 30 },
  { id: "clean-slate", name: "Clean Slate", condition: "30-day VITALITY streak", effect: "VIT XP +5%", xp: { stat: "VIT", pct: 0.05 }, test: (s) => best(s, "VIT") >= 30 },
  { id: "overcame-adversity", name: "The Player Who Has Overcome Adversity", condition: "Escape the Penalty Zone", effect: "Survive timer -30 min (TODO)", test: (s) => count(s, "penaltyCleared") >= 1 },
  { id: "demon-hunter", name: "Demon Hunter", condition: "Clear 10 Gates", effect: "Gate gold +10%", test: (s) => s.gatesCleared >= 10 },
  { id: "gate-breaker", name: "Gate Breaker", condition: "Clear a Red Gate", effect: "Box drop quality +10% (TODO)", test: () => false /* TODO: Red Gates not implemented */ },
  { id: "dungeon-diver", name: "Dungeon Diver", condition: "50 Instant Dungeon sessions", effect: "Dungeon XP +10%", test: (s) => s.dungeonsCleared >= 50 },
  { id: "shadow-sovereign", name: "Shadow Sovereign", condition: "Hold 5 shadows at Knight or above", effect: "Shadow gold +20% (TODO)", test: (s) => s.shadows.filter((x) => shadowRankIndex(x.rank) >= 2).length >= 5 },
  { id: "unbroken", name: "Unbroken", condition: "100-day overall streak", effect: "+1 Tenacity grace per week (TODO)", test: (s) => count(s, "bestOverall") >= 100 },
  { id: "comeback-kid", name: "Comeback Kid", condition: "Clear a day after a 7+ day gap", effect: "XP +10% for 7 days (TODO)", test: (s) => count(s, "comeback") >= 1 },
  { id: "treasure-hunter", name: "Treasure Hunter", condition: "Open 50 Random Boxes", effect: "Gold +5%", goldPct: 0.05, test: (s) => count(s, "boxesOpened") >= 50 },
  { id: "frugal-hunter", name: "Frugal Hunter", condition: "Finish a month under reward budget", effect: "Unspent carryover (TODO)", test: (s) => count(s, "frugalMonths") >= 1 },
  { id: "well-equipped", name: "Well-Equipped", condition: "Redeem 5 real-world rewards", effect: "+3% stat XP (TODO)", test: (s) => s.rewards.filter((r) => r.purchasedAt).length >= 5 },
  { id: "national-level", name: "National Level", condition: "Reach National Level", effect: "All XP +5%", xp: { stat: "ALL", pct: 0.05 }, test: (s) => rankIndex(s.player.rank) >= 6 },
];

export const equippedTitleDef = (s: State) => TITLE_DEFS.find((d) => d.id === s.player.equippedTitleId);

/** Passive XP fraction from the equipped title for goals of `stat`. */
export function titleXpBonus(s: State, stat: StatId | "ALL"): number {
  const x = equippedTitleDef(s)?.xp;
  return x && (x.stat === "ALL" || x.stat === stat) ? x.pct : 0;
}
export const titleGoldBonus = (s: State): number => equippedTitleDef(s)?.goldPct ?? 0;

export function checkTitles(c: Ctx): void {
  const s = c.s;
  for (const d of TITLE_DEFS) {
    if (s.titles.some((t) => t.id === d.id) || !d.test(s)) continue;
    const t: Title = { id: d.id, name: d.name, effect: d.effect, unlockedAt: c.at };
    s.titles.push(t);
    if (!s.player.equippedTitleId) s.player.equippedTitleId = t.id;
    popup(c, titleAcquired(t, d.condition));
  }
}
