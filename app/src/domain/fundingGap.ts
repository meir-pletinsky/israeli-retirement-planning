import type { ProfileData } from "../types";
import { resolveRetirementAge } from "./netWorth";
import { estimateRetirementIncomeAtAge } from "./retirementIncome";
import type { FundingGapResult, RetirementScenario } from "./types";

/**
 * Compares the estimated sustainable retirement income, if retiring at
 * `retirementAge`, against the user's desired retirement monthly expenses.
 * A non-negative gap means the projected balance can cover (or exceed) the
 * desired spending; negative means a shortfall. This is deterministic/
 * Phase 1-level — no probability of success (that's the Phase 4 Monte
 * Carlo scope per docs/plan.md).
 */
export function calculateFundingGapAtAge(
  profile: ProfileData,
  retirementAge: number,
): FundingGapResult {
  const { monthlyIncomeTodayMoney } = estimateRetirementIncomeAtAge(profile, retirementAge);
  const desiredMonthlyExpenses = profile.expenses.retirementMonthly ?? 0;
  const monthlyGap = Math.round(monthlyIncomeTodayMoney - desiredMonthlyExpenses);

  return {
    monthlyGap,
    status: monthlyGap >= 0 ? "onTrack" : "shortfall",
    estimatedMonthlyIncome: monthlyIncomeTodayMoney,
    desiredMonthlyExpenses,
  };
}

/** Same as `calculateFundingGapAtAge`, at the retirement age implied by `scenario`. */
export function calculateFundingGap(
  profile: ProfileData,
  scenario: RetirementScenario = "standard",
): FundingGapResult {
  return calculateFundingGapAtAge(profile, resolveRetirementAge(profile, scenario));
}
