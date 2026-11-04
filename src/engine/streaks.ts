import { addDays } from "./time";
import type { Ctx } from "./ctx";
import type { PendingExtraction, Shadow, ShadowRank, StatId } from "./types";

export const MILESTONES = [7, 30, 100, 365] as const;
export const SHADOW_RANKS: ShadowRank[] = ["Normal Soldier", "Elite Knight", "Knight", "Commander", "Marshal", "Grand Marshal"];
const RANK_FOR_MILESTONE: Record<number, ShadowRank> = { 7: "Normal Soldier", 30: "Elite Knight", 100: "Commander", 365: "Marshal" };

export const shadowRankFor = (milestone: number): ShadowRank => RANK_FOR_MILESTONE[milestone] ?? "Normal Soldier";
export const shadowRankIndex = (r: ShadowRank) => SHADOW_RANKS.indexOf(r);
/** Gold per day: (rankIndex + 1) x 2 */
export const shadowGold = (sh: Shadow) => (shadowRankIndex(sh.rank) + 1) * 2;

/** Demote the stat's highest shadow one rank (floor: Normal Soldier). Never deletes. */
export function demoteShadow(c: Ctx, stat: StatId): void {
  let best = -1, bi = -1;
  c.s.shadows.forEach((sh, i) => {
    if (sh.stat !== stat) return;
    const r = shadowRankIndex(sh.rank);
    if (r > best) { best = r; bi = i; }
  });
  if (bi >= 0 && best > 0) c.s.shadows[bi] = { ...c.s.shadows[bi], rank: SHADOW_RANKS[best - 1] };
}

export interface StreakOutcome { shielded: StatId[]; broken: StatId[]; offers: PendingExtraction[] }

/**
 * Update per-stat streaks at day close. `statClear[stat]` is true when every goal of that stat was done
 * (or forgiven by Tenacity); stats without goals today are absent and untouched.
 */
export function updateStreaks(c: Ctx, date: string, statClear: Partial<Record<StatId, boolean>>, dayCleared: boolean): StreakOutcome {
  const s = c.s, mode = s.config.penalty.resetStreakOf;
  const out: StreakOutcome = { shielded: [], broken: [], offers: [] };
  for (const stat of Object.keys(statClear) as StatId[]) {
    const st = s.streaks[stat];
    if (st.lastDate === date) continue;
    if (st.lastDate && st.lastDate !== addDays(date, -1)) st.current = 0; // gap: app was not run
    const cleared = !!statClear[stat] && !(mode === "all" && !dayCleared);
    if (cleared) {
      st.current++;
      st.best = Math.max(st.best, st.current);
      st.lastDate = date;
      if ((MILESTONES as readonly number[]).includes(st.current)) {
        const prefix = `shadow-${stat}-${st.current}`;
        const have = s.shadows.findIndex((sh) => sh.id.startsWith(prefix));
        if (have >= 0) { // tier already extracted once: climb back instead of a second shadow
          const want = shadowRankIndex(shadowRankFor(st.current));
          if (shadowRankIndex(s.shadows[have].rank) < want) s.shadows[have] = { ...s.shadows[have], rank: SHADOW_RANKS[want] };
          continue;
        }
        const offer = { stat, milestone: st.current, offeredAt: c.at };
        (s.pendingExtractions ??= []).push(offer);
        out.offers.push(offer);
      }
      continue;
    }
    st.lastDate = date;
    if (mode === "none" || st.current === 0) continue;
    const shield = s.inventory.findIndex((i) => i.defId === "streak-shield");
    if (shield >= 0) {
      s.inventory.splice(shield, 1);
      out.shielded.push(stat);
    } else {
      st.current = 0;
      out.broken.push(stat);
      demoteShadow(c, stat);
    }
  }
  return out;
}
