import type { ProfileData } from "../types";
import { MAX_PLANNING_AGE } from "./constants";
import { futureValueOfMonthlyContributions, totalMonthlyContribution } from "./contributions";
import {
  aggregateOtherBalance,
  aggregatePensionBalance,
  realAnnualReturnRate,
  resolveCurrentAge,
  resolveRetirementAge,
} from "./netWorth";
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
 * proportional to each bucket's projected balance at retirement (current
 * balances grown at the real return, with all ongoing contributions going to
 * the pension/savings accounts). Phase 1 has no per-source income modeling
 * yet (Bituach Leumi, annuity conversion, etc. are Phase 2 — see
 * docs/plan.md), so this is a simplified, flat split across the whole
 * retirement period rather than a true per-source model.
 */
export function estimateIncomeBreakdown(
  profile: ProfileData,
  scenario: RetirementScenario = "standard",
): IncomeBreakdownPoint[] {
  const { monthlyIncomeTodayMoney } = estimateRetirementIncome(profile, scenario);
  const retirementAge = resolveRetirementAge(profile, scenario);

  const rate = realAnnualReturnRate(profile.assumptions);
  const yearsToRetire = Math.max(retirementAge - resolveCurrentAge(profile), 0);
  const growth = Math.pow(1 + rate, yearsToRetire);
  const pensionBalance =
    aggregatePensionBalance(profile) * growth +
    futureValueOfMonthlyContributions(totalMonthlyContribution(profile), rate, yearsToRetire);
  const otherBalance = aggregateOtherBalance(profile) * growth;

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
