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
  bituachLeumi: number;
}

/**
 * Splits the estimated sustainable monthly retirement income (see
 * `retirementIncome.ts`) by source and age. The Bituach Leumi pension is its
 * own band from its claim age on; the rest is paid from savings, split into
 * "pension" vs "other investments" proportional to each bucket's projected
 * balance at retirement (current balances grown at the real return, with all
 * ongoing contributions going to the pension/savings accounts). There is no
 * per-account drawdown modelling yet (annuity conversion, withdrawal
 * ordering and tax are later phases — see docs/plan.md), so the savings
 * split is flat across the retirement period.
 */
export function estimateIncomeBreakdown(
  profile: ProfileData,
  scenario: RetirementScenario = "standard",
): IncomeBreakdownPoint[] {
  const { monthlyIncomeTodayMoney, bituachLeumi } = estimateRetirementIncome(profile, scenario);
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

  const points: IncomeBreakdownPoint[] = [];
  for (let age = retirementAge; age <= MAX_PLANNING_AGE; age += 1) {
    const statePension = age >= bituachLeumi.claimAge ? bituachLeumi.monthlyPension : 0;
    const fromSavings = Math.max(monthlyIncomeTodayMoney - statePension, 0);
    const pensionFund = Math.round(fromSavings * pensionShare);
    points.push({
      age,
      pensionFund,
      investments: fromSavings - pensionFund,
      bituachLeumi: statePension,
    });
  }
  return points;
}
