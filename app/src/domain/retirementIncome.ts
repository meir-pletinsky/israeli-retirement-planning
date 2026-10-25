import type { ProfileData } from "../types";
import { MAX_PLANNING_AGE } from "./constants";
import { aggregateCurrentNetWorth, realAnnualReturnRate, resolveCurrentAge, resolveRetirementAge } from "./netWorth";
import type { RetirementIncomeEstimate, RetirementScenario } from "./types";

/** Grows a balance at a fixed annual rate from one age to another (no withdrawals). */
function growBalance(balance: number, annualRate: number, fromAge: number, toAge: number): number {
  const years = Math.max(toAge - fromAge, 0);
  return balance * Math.pow(1 + annualRate, years);
}

/**
 * Estimates the sustainable monthly retirement income (in today's money)
 * that the projected net worth at retirement can provide, fully amortized
 * from retirement age through `MAX_PLANNING_AGE`. This is independent of
 * the user's desired expenses — see `fundingGap.ts` for the comparison
 * against `expenses.retirementMonthly`.
 *
 * Uses the standard annuity/amortization formula so the balance reaches
 * (approximately) zero at the end of the planning horizon, rather than a
 * naive balance-divided-by-months estimate that ignores ongoing growth.
 */
export function estimateRetirementIncome(
  profile: ProfileData,
  scenario: RetirementScenario = "standard",
): RetirementIncomeEstimate {
  const currentAge = resolveCurrentAge(profile);
  const retirementAge = resolveRetirementAge(profile, scenario);
  const annualRate = realAnnualReturnRate(profile.assumptions);

  const netWorthAtRetirement = growBalance(
    aggregateCurrentNetWorth(profile),
    annualRate,
    currentAge,
    retirementAge,
  );

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
