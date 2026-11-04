import { isPenaltyActive } from "./penalty";
import type { RewardDef, State } from "./types";

export const goalGold = (s: State, rest: boolean) => Math.round(s.config.economy.goldPerGoal * (rest ? 0.5 : 1));

export function scarcity(reward: Pick<RewardDef, "usd">, s: State): number {
  const b = s.config.economy.monthlyBudgetUsd;
  if (b <= 0) return 1;
  return 1 + Math.max(0, (s.spentThisMonthUsd + reward.usd - b) / b);
}
/** ceil(usd x usdToGold x scarcity) */
export function rewardGoldPrice(reward: Pick<RewardDef, "usd">, s: State): number {
  return Math.ceil(Math.round(reward.usd * s.config.economy.usdToGold * scarcity(reward, s) * 1e6) / 1e6);
}
export type PurchaseCheck = { ok: true; price: number } | { ok: false; reason: "shop-locked" | "over-budget" | "insufficient-gold" | "already-purchased" | "unknown-reward"; price: number };

export function canPurchase(reward: RewardDef | undefined, s: State): PurchaseCheck {
  if (!reward) return { ok: false, reason: "unknown-reward", price: 0 };
  const price = rewardGoldPrice(reward, s);
  if (reward.purchasedAt) return { ok: false, reason: "already-purchased", price };
  if (s.config.penalty.lockShop && isPenaltyActive(s)) return { ok: false, reason: "shop-locked", price };
  if (s.spentThisMonthUsd + reward.usd > s.config.economy.monthlyBudgetUsd) return { ok: false, reason: "over-budget", price };
  if (s.gold < price) return { ok: false, reason: "insufficient-gold", price };
  return { ok: true, price };
}
