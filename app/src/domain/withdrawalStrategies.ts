import { WITHDRAWAL_STRATEGIES, type ProfileData, type WithdrawalStrategy } from "../types";
import { desiredRetirementMonthly } from "./expenses";
import { buildHousehold, resolveRetirementTiming } from "./household";
import { estimateNetIncomeForHousehold, type NetIncomeYear } from "./netIncome";
import { TAX_RATES } from "./taxRates";
import type { RetirementScenario } from "./types";

/** What one withdrawal order does to the household's tax and net income. All amounts are today's money. */
export interface WithdrawalStrategyResult {
  strategy: WithdrawalStrategy;
  /** Tax over every retirement year, summed over both spouses. */
  totalTax: number;
  /** The net monthly income, averaged over the retirement years. */
  averageNetMonthly: number;
  /** The lowest net monthly income of any year: the figure the plan and the Dashboard count on. */
  lowestNetMonthly: number;
  /** The primary user's age in that year; null when there is no income. */
  lowestNetAge: number | null;
  /** The first age at which net income falls below the desired spending; null when it never does or none is set. */
  firstShortfallAge: number | null;
  /** The highest taxable income of one person in one year, per year. */
  peakTaxableAnnual: number;
  /** How many retirement years that taxable income is above the surtax threshold. */
  surtaxYears: number;
  years: NetIncomeYear[];
}

export interface WithdrawalStrategyComparison {
  /** The order the plan uses now (from the assumptions). */
  current: WithdrawalStrategy;
  /** The desired monthly spending in retirement, or null when none is entered. */
  desiredMonthly: number | null;
  /** The annual taxable income above which the surtax applies. */
  surtaxThresholdAnnual: number;
  /** One result per strategy, in the order of `WITHDRAWAL_STRATEGIES`. */
  results: WithdrawalStrategyResult[];
  /** True when every order gives the same tax every year, so the choice does not matter for this plan. */
  identical: boolean;
}

function summarise(
  strategy: WithdrawalStrategy,
  years: NetIncomeYear[],
  desiredMonthly: number | null,
): WithdrawalStrategyResult {
  const thresholdMonthly = TAX_RATES.surtaxAnnualThreshold / 12;
  let totalTax = 0;
  let netSum = 0;
  let lowest: NetIncomeYear | null = null;
  let peakTaxableMonthly = 0;
  let surtaxYears = 0;
  let firstShortfallAge: number | null = null;
  for (const year of years) {
    totalTax += year.taxMonthly * 12;
    netSum += year.netMonthly;
    if (lowest === null || year.netMonthly < lowest.netMonthly) lowest = year;
    peakTaxableMonthly = Math.max(peakTaxableMonthly, year.taxableMonthly);
    if (year.taxableMonthly > thresholdMonthly) surtaxYears += 1;
    if (
      firstShortfallAge === null &&
      desiredMonthly !== null &&
      desiredMonthly > 0 &&
      year.netMonthly < desiredMonthly
    ) {
      firstShortfallAge = year.age;
    }
  }
  const worst = lowest !== null && lowest.grossMonthly > 0 ? lowest : null;
  return {
    strategy,
    totalTax,
    averageNetMonthly: years.length > 0 ? netSum / years.length : 0,
    lowestNetMonthly: worst?.netMonthly ?? 0,
    lowestNetAge: worst?.age ?? null,
    firstShortfallAge,
    peakTaxableAnnual: peakTaxableMonthly * 12,
    surtaxYears,
    years,
  };
}

/**
 * Runs the plan once per withdrawal order and reports what each does to the tax.
 *
 * The gross amount drawn is the same in every order: all the capital earns the same return, so the
 * unlocked total does not depend on which source is used first. Only the tax each year differs,
 * and so the net income. The comparison therefore shows tax and net income, not net worth.
 *
 * No order is the best for everyone. Using the taxable money first leaves the tax-free study fund
 * for last but can push one year's taxable income up; the lowest net income, the average and the
 * total tax can each point to a different order.
 */
export function compareWithdrawalStrategies(
  profile: ProfileData,
  scenario: RetirementScenario = "standard",
): WithdrawalStrategyComparison {
  const household = buildHousehold(profile, resolveRetirementTiming(profile, scenario));
  const desiredMonthly = desiredRetirementMonthly(profile.expenses);
  const results = WITHDRAWAL_STRATEGIES.map((strategy) =>
    summarise(
      strategy,
      estimateNetIncomeForHousehold({ ...household, withdrawalStrategy: strategy }).years,
      desiredMonthly,
    ),
  );
  const [base, ...others] = results;
  const identical = others.every(
    (result) =>
      result.years.length === base.years.length &&
      result.years.every((year, index) => year.taxMonthly === base.years[index].taxMonthly),
  );
  return {
    current: household.withdrawalStrategy,
    desiredMonthly,
    surtaxThresholdAnnual: TAX_RATES.surtaxAnnualThreshold,
    results,
    identical,
  };
}
