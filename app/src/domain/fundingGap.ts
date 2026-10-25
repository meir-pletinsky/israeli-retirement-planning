import type { ProfileData } from "../types";
import { estimateRetirementIncome } from "./retirementIncome";
import type { FundingGapResult, RetirementScenario } from "./types";

/**
 * Compares the estimated sustainable retirement income against the user's
 * desired retirement monthly expenses. A non-negative gap means the
 * projected balance can cover (or exceed) the desired spending; negative
 * means a shortfall. This is deterministic/Phase 1-level — no probability
 * of success (that's the Phase 4 Monte Carlo scope per docs/plan.md).
 */
export function calculateFundingGap(
  profile: ProfileData,
  scenario: RetirementScenario = "standard",
): FundingGapResult {
  const { monthlyIncomeTodayMoney } = estimateRetirementIncome(profile, scenario);
  const desiredMonthlyExpenses = profile.expenses.retirementMonthly ?? 0;
  const monthlyGap = Math.round(monthlyIncomeTodayMoney - desiredMonthlyExpenses);

  return {
    monthlyGap,
    status: monthlyGap >= 0 ? "onTrack" : "shortfall",
    estimatedMonthlyIncome: monthlyIncomeTodayMoney,
    desiredMonthlyExpenses,
  };
}
