import type { ProfileData } from "../types";
import { MAX_PLANNING_AGE } from "./constants";
import { projectBalanceAtAge, realAnnualReturnRate, resolveRetirementAge } from "./netWorth";
import type { RetirementIncomeEstimate, RetirementScenario } from "./types";

/**
 * Estimates the sustainable monthly retirement income (in today's money)
 * that the projected net worth at `retirementAge` can provide, fully
 * amortized from that age through `MAX_PLANNING_AGE`. This is independent
 * of the user's desired expenses — see `fundingGap.ts` for the comparison
 * against `expenses.retirementMonthly`.
 *
 * Uses the standard annuity/amortization formula so the balance reaches
 * (approximately) zero at the end of the planning horizon, rather than a
 * naive balance-divided-by-months estimate that ignores ongoing growth.
 */
export function estimateRetirementIncomeAtAge(
  profile: ProfileData,
  retirementAge: number,
): RetirementIncomeEstimate {
  const annualRate = realAnnualReturnRate(profile.assumptions);
  const netWorthAtRetirement = projectBalanceAtAge(profile, retirementAge);

  const monthsInRetirement = Math.round((MAX_PLANNING_AGE - retirementAge) * 12);
  if (monthsInRetirement <= 0) {
    return {
      monthlyIncomeTodayMoney: 0,
      retirementAge,
      netWorthAtRetirement: Math.round(netWorthAtRetirement),
    };
  }

  const monthlyRate = Math.pow(1 + annualRate, 1 / 12) - 1;
  const monthlyIncomeTodayMoney =
    Math.abs(monthlyRate) < 1e-9
      ? netWorthAtRetirement / monthsInRetirement
      : (netWorthAtRetirement * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -monthsInRetirement));

  return {
    monthlyIncomeTodayMoney: Math.round(monthlyIncomeTodayMoney),
    retirementAge,
    netWorthAtRetirement: Math.round(netWorthAtRetirement),
  };
}

/** Same as `estimateRetirementIncomeAtAge`, at the retirement age implied by `scenario`. */
export function estimateRetirementIncome(
  profile: ProfileData,
  scenario: RetirementScenario = "standard",
): RetirementIncomeEstimate {
  return estimateRetirementIncomeAtAge(profile, resolveRetirementAge(profile, scenario));
}
