import type { ProfileData } from "../types";
import { PAYMENT_SOURCES, simulateHouseholdDrawdown, type DrawdownYear } from "./drawdown";
import {
  averageMonthlyCoverCost,
  buildHousehold,
  resolveRetirementTiming,
  retirementTimingAtAge,
  type Household,
  type RetirementTiming,
} from "./household";
import { memberTaxDetail, type YearDraw } from "./memberTax";
import { recordNetIncomeTrace, type NetYearDetail } from "./netIncomeTrace";
import { estimateHouseholdRetirementIncome } from "./retirementIncome";
import { isTracing } from "./trace";
import type { RetirementScenario } from "./types";

/** One retirement year's income before and after tax, per month in today's money. */
export interface NetIncomeYear {
  /** The primary user's age. */
  age: number;
  grossMonthly: number;
  taxMonthly: number;
  netMonthly: number;
  /**
   * The larger of the members' taxable incomes this year, per month: what the brackets and the
   * surtax threshold apply to (see `MemberTaxDetail`). Not rounded.
   */
  taxableMonthly: number;
}

export interface NetIncomeEstimate {
  /** Gross income in the year with the lowest net income. */
  grossMonthlyIncome: number;
  /** Tax in that year (income tax, health tax, capital gains tax and surtax, summed over both spouses). */
  taxMonthly: number;
  /**
   * The lowest net monthly income of any retirement year: what the household
   * can count on every year. Equals the gross income when nothing is taxed.
   */
  netMonthlyIncome: number;
  /** `taxMonthly / grossMonthlyIncome`; 0 when there is no income. */
  effectiveTaxRate: number;
  /** The primary user's age in the year with the lowest net income; null when there is no income. */
  lowestNetAge: number | null;
  /** Every year from the household's retirement to the planning horizon. */
  years: NetIncomeYear[];
  /** The calendar year the plan counts from; the tax rules of that year apply to year zero. */
  baseYear: number;
}

/** One retirement year of the plan: the fixed payments, the draw from savings and which holdings it comes out of. */
export interface PlanYear {
  row: DrawdownYear;
  /** Fixed monthly payments (state pension and account annuities), in today's money. */
  streamsTotal: number;
  /** What the household pays for survivors' cover this year, as a monthly average; paid out of savings on top of the planned income. */
  coverCostMonthly: number;
  /** The monthly draw from savings that tops the payments up to the planned income plus the cover cost. */
  fromSavings: number;
  draws: YearDraw[];
}

/**
 * Every year from the household's retirement to the planning horizon, with the draw split over
 * the holdings. When the last capital is used up, the previous year's split is kept.
 */
export function retirementPlanYears(
  household: Household,
  monthlyIncome: number,
  rows: DrawdownYear[],
): PlanYear[] {
  const years: PlanYear[] = [];
  let drawHoldings = rows[0].holdings;
  for (let index = Math.ceil(household.retirementYears); index < rows.length; index += 1) {
    const row = rows[index];
    if (row.holdings.some((holding) => holding.capitalShare > 0)) {
      drawHoldings = row.holdings;
    }
    const streamsTotal = PAYMENT_SOURCES.reduce((sum, band) => sum + row.streams[band], 0);
    const coverCostMonthly = averageMonthlyCoverCost(household, row.yearsFromNow);
    const fromSavings = Math.max(monthlyIncome + coverCostMonthly - streamsTotal, 0);
    years.push({
      row,
      streamsTotal,
      coverCostMonthly,
      fromSavings,
      draws: drawHoldings.map((holding) => ({
        holding,
        amount: fromSavings * holding.capitalShare,
      })),
    });
  }
  return years;
}

/**
 * Turns the gross retirement plan of a household into net income by taxing
 * each spouse separately, year by year. The plan itself (see
 * `retirementIncome.ts` and `drawdown.ts`) is unchanged: the household draws
 * the same gross amount, and tax comes out of it.
 *
 * Each year's income is the fixed streams plus the draw from savings, which
 * is split over the unlocked sources in proportion to their balances, as in
 * the income breakdown. The cost of survivors' cover is part of the draw (it
 * is taxed as one) but is then paid out, so it is not in the gross income.
 * Per owner:
 * - Bituach Leumi pensions and study-fund money are tax-free.
 * - Account annuities and withdrawals from pension-like accounts are pension
 *   income: brackets and credit points. From the statutory retirement age the
 *   Section 9A exemption applies, at the share set for that calendar year
 *   (`household.baseYear` plus the years from now); before it, the pension
 *   bears health tax instead. The exception is an investment provident fund
 *   the owner chose to take as a life annuity from 60: that annuity is
 *   tax-free (rule U) and adds no taxable income.
 * - Withdrawals from investment provident funds and other investments are
 *   taxed only on their real gain, at a flat rate.
 * - Employer shares follow their tax route (see `employerStockRoute`): under
 *   Section 102 the grant-date value of the shares sold is ordinary income
 *   at the brackets, stacked on the pension, and the growth above it is a
 *   flat-rate gain; an ordinary-income route is taxed at the brackets in
 *   full. The ordinary part also bears health tax and, before the statutory
 *   age, Bituach Leumi contributions.
 *
 * Spouses are taxed on their own income; the draw is not shifted between
 * them to save tax. When the last capital is used up, the previous year's mix
 * is kept, like the income breakdown does.
 */
export function estimateNetIncomeForHousehold(household: Household): NetIncomeEstimate {
  const { monthlyIncomeTodayMoney } = estimateHouseholdRetirementIncome(household);
  const rows = simulateHouseholdDrawdown(household, monthlyIncomeTodayMoney);

  const details: NetYearDetail[] | null = isTracing() ? [] : null;
  const years: NetIncomeYear[] = [];
  for (const { row, draws, streamsTotal, coverCostMonthly, fromSavings } of retirementPlanYears(
    household,
    monthlyIncomeTodayMoney,
    rows,
  )) {
    const memberDetails = household.members.map((_member, memberIndex) =>
      memberTaxDetail(household, memberIndex, row.yearsFromNow, row.holdings, draws),
    );
    const memberTaxes = memberDetails.map(({ tax }) => tax.totalMonthly);
    const taxMonthly = Math.round(memberTaxes.reduce((sum, tax) => sum + tax, 0));
    // The cover cost is drawn and taxed like the rest of the draw, but it is not income to live on.
    const grossMonthly = Math.round(streamsTotal + fromSavings - coverCostMonthly);
    years.push({
      age: row.age,
      grossMonthly,
      taxMonthly,
      netMonthly: grossMonthly - taxMonthly,
      taxableMonthly: Math.max(...memberDetails.map(({ taxableMonthly }) => taxableMonthly)),
    });
    details?.push({ row, draws, streamsTotal, coverCostMonthly, fromSavings, memberTaxes });
  }

  const lowest = years.reduce<NetIncomeYear | null>(
    (best, year) => (best === null || year.netMonthly < best.netMonthly ? year : best),
    null,
  );
  const estimate: NetIncomeEstimate =
    lowest === null || lowest.grossMonthly <= 0
      ? {
          grossMonthlyIncome: 0,
          taxMonthly: 0,
          netMonthlyIncome: 0,
          effectiveTaxRate: 0,
          lowestNetAge: null,
          years,
          baseYear: household.baseYear,
        }
      : {
          grossMonthlyIncome: lowest.grossMonthly,
          taxMonthly: lowest.taxMonthly,
          netMonthlyIncome: lowest.netMonthly,
          effectiveTaxRate: lowest.taxMonthly / lowest.grossMonthly,
          lowestNetAge: lowest.age,
          years,
          baseYear: household.baseYear,
        };
  if (details) {
    recordNetIncomeTrace(household, monthlyIncomeTodayMoney, years, details, estimate);
  }
  return estimate;
}

/** `estimateNetIncomeForHousehold` for the given retirement ages. */
export function estimateNetIncomeForTiming(
  profile: ProfileData,
  timing: RetirementTiming,
): NetIncomeEstimate {
  return estimateNetIncomeForHousehold(buildHousehold(profile, timing));
}

/** `estimateNetIncomeForTiming` with the primary user retiring at `retirementAge` (a spouse retires at the same moment). */
export function estimateNetIncomeAtAge(
  profile: ProfileData,
  retirementAge: number,
): NetIncomeEstimate {
  return estimateNetIncomeForTiming(profile, retirementTimingAtAge(profile, retirementAge));
}

/** `estimateNetIncomeForTiming` at the retirement ages implied by `scenario`. */
export function estimateNetIncome(
  profile: ProfileData,
  scenario: RetirementScenario = "standard",
): NetIncomeEstimate {
  return estimateNetIncomeForTiming(profile, resolveRetirementTiming(profile, scenario));
}
