import type { ProfileData } from "../types";
import { FALLBACK_USD_TO_ILS_RATE, MAX_PLANNING_AGE } from "./constants";
import { resolveRetirementAge } from "./netWorth";
import { estimateRetirementIncome } from "./retirementIncome";
import type { RetirementScenario } from "./types";

export interface IncomeBreakdownPoint {
  age: number;
  pensionFund: number;
  investments: number;
}

/**
 * Splits the estimated sustainable monthly retirement income (see
 * `retirementIncome.ts`) into a "pension" vs "other investments" breakdown,
 * proportional to each bucket's share of current balances. Phase 1 has no
 * per-source income modeling yet (Bituach Leumi, annuity conversion, etc.
 * are Phase 2 — see docs/plan.md), so this is a simplified, flat split
 * across the whole retirement period rather than a true per-source model.
 */
export function estimateIncomeBreakdown(
  profile: ProfileData,
  scenario: RetirementScenario = "standard",
): IncomeBreakdownPoint[] {
  const { monthlyIncomeTodayMoney } = estimateRetirementIncome(profile, scenario);
  const retirementAge = resolveRetirementAge(profile, scenario);

  const pensionBalance = profile.pensionSavings.accounts.reduce(
    (sum, account) => sum + (account.totalAccumulatedBalance ?? 0),
    0,
  );
  const otherBalance =
    (profile.pensionSavings.otherAssets ?? 0) +
    profile.equity.holdings.reduce((sum, holding) => {
      const marketValueUSD = (holding.quantity ?? 0) * (holding.currentMarketPriceUSD ?? 0);
      return sum + marketValueUSD * FALLBACK_USD_TO_ILS_RATE;
    }, 0);

  const totalBalance = pensionBalance + otherBalance;
  const pensionShare = totalBalance > 0 ? pensionBalance / totalBalance : 0;
  const pensionFund = Math.round(monthlyIncomeTodayMoney * pensionShare);
  const investments = monthlyIncomeTodayMoney - pensionFund;

  const points: IncomeBreakdownPoint[] = [];
  for (let age = retirementAge; age <= MAX_PLANNING_AGE; age += 1) {
    points.push({ age, pensionFund, investments });
  }
  return points;
}
