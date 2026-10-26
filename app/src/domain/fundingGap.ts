import type { ProfileData } from "../types";
import { resolveRetirementTiming, retirementTimingAtAge, type RetirementTiming } from "./household";
import { estimateRetirementIncomeForTiming } from "./retirementIncome";
import type { FundingGapResult, RetirementScenario } from "./types";

/**
 * Compares the estimated sustainable retirement income, if retiring at the
 * given ages, against the household's desired retirement monthly expenses.
 * A non-negative gap means the projected balance can cover (or exceed) the
 * desired spending; negative means a shortfall. This is deterministic/
 * Phase 1-level — no probability of success (that's the Phase 4 Monte
 * Carlo scope per docs/plan.md).
 */
export function calculateFundingGapForTiming(
  profile: ProfileData,
  timing: RetirementTiming,
): FundingGapResult {
  const { monthlyIncomeTodayMoney } = estimateRetirementIncomeForTiming(profile, timing);
  const desiredMonthlyExpenses = profile.expenses.retirementMonthly ?? 0;
  const monthlyGap = Math.round(monthlyIncomeTodayMoney - desiredMonthlyExpenses);

  return {
    monthlyGap,
    status: monthlyGap >= 0 ? "onTrack" : "shortfall",
    estimatedMonthlyIncome: monthlyIncomeTodayMoney,
    desiredMonthlyExpenses,
  };
}

/** `calculateFundingGapForTiming` with the primary user retiring at `retirementAge` (a spouse retires at the same moment). */
export function calculateFundingGapAtAge(
  profile: ProfileData,
  retirementAge: number,
): FundingGapResult {
  return calculateFundingGapForTiming(profile, retirementTimingAtAge(profile, retirementAge));
}

/** Same as `calculateFundingGapForTiming`, at the retirement ages implied by `scenario`. */
export function calculateFundingGap(
  profile: ProfileData,
  scenario: RetirementScenario = "standard",
): FundingGapResult {
  return calculateFundingGapForTiming(profile, resolveRetirementTiming(profile, scenario));
}
