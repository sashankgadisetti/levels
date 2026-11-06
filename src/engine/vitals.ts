import type { State } from "./types";

export const FATIGUE_REST_THRESHOLD = 75;
export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
export const addHp = (s: State, n: number) => { s.vitals.hp = clamp(s.vitals.hp + n, 0, 100); };
export const addMp = (s: State, n: number) => { s.vitals.mp = clamp(s.vitals.mp + n, 0, 100); };
export const addFatigue = (s: State, n: number) => { s.vitals.fatigue = clamp(s.vitals.fatigue + n, 0, 100); };
export const restRecommended = (s: State) => s.vitals.fatigue >= FATIGUE_REST_THRESHOLD;

/** HP/MP effects of completing a goal (applied at day close). */
export function goalVitals(stat: string): { hp: number; mp: number } {
  return {
    hp: stat === "VIT" || stat === "SENSE" || stat === "HYD" ? 10 : 0,
    mp: stat === "SENSE" ? 15 : stat === "INT" ? 10 : 0,
  };
}
export const MISSED_HP_LOSS = 5;
export const missedHpLoss = (stat: string) => (stat === "VIT" || stat === "SENSE" || stat === "HYD" ? MISSED_HP_LOSS : 0);
