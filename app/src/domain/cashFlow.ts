import type { ProfileData } from "../types";
import { simulateHouseholdDrawdown } from "./drawdown";
import { budgetBreakdown, desiredRetirementMonthly, irregularCosts } from "./expenses";
import { averageMonthlyCoverCost, buildHousehold, resolveRetirementTiming } from "./household";
import {
  BAND_FOR_KIND,
  INCOME_BAND_KEYS,
  type IncomeBandKey,
  type IncomeBreakdownPoint,
} from "./incomeBreakdown";
import { memberTaxDetail, type YearDraw } from "./memberTax";
import { roundToSum } from "./rounding";
import { SOURCE_KINDS } from "./sources";
import { UNMET_TOLERANCE } from "./spendingTest";
import type { RetirementScenario } from "./types";

/**
 * One retirement year of the plan at the planned spending, per month in today's money (the yearly
 * average). The band fields and `withdrawn` are what the income charts use, so the same year can
 * be drawn and tabulated like the sustainable income; `unfunded` is always present here.
 */
export interface CashFlowYear extends IncomeBreakdownPoint {
  unfunded: number;
  /** The calendar year the household's clock puts this year in. */
  calendarYear: number;
  /** Whether the usable savings fall short of the planned spending this year (the same test as `shortfallAge`). */
  short: boolean;
  /** Everything that comes in before tax: the payments and the withdrawals from savings. */
  income: number;
  /**
   * Estimated tax on the payments and the withdrawals. The planned spending is drawn as it is, as
   * in the net-worth path, so this tax is shown but not added to what has to be funded.
   */
  tax: number;
  /** The planned spending that year, without the cost of survivors' cover. */
  spending: number;
  /** The essential and the other part of `spending`; null when the budget is one typed total. */
  essential: number | null;
  discretionary: number | null;
  /** What survivors' cover costs that year; it is drawn on top of the spending. */
  cover: number;
}

export interface CashFlowPlan {
  /** The planned monthly spending the plan is tested against, today's money. */
  monthlySpending: number;
  /** Every year from the household's retirement to the planning horizon. */
  years: CashFlowYear[];
  /** The primary user's age in the first year the usable savings cannot fund the spending. */
  firstUnfundedAge: number | null;
  /** The sources that bring in money at some age, in display order. */
  bands: IncomeBandKey[];
  /** What large irregular items add to the monthly spending, spread evenly; 0 when there are none. */
  irregularMonthly: number;
  /** Whether any year has survivors' cover to pay for. */
  hasCover: boolean;
}

/**
 * Year by year, at the planned spending (`projectNetWorth` follows the same run): the payments
 * that arrive, what is withdrawn from which kind of savings, the tax on both, the spending and
 * the part nobody pays. Unlike the sustainable income (`incomeBreakdown.ts`), which is sized to
 * last to the horizon, this shows the payments stopping and the shortfall once the usable
 * savings run out.
 *
 * - The spending is a constant monthly amount: the model has no spending phases and no due
 *   years for large irregular items, so those are spread evenly inside it.
 * - Tax follows the plan's own tax layer (`netIncome.ts`), on the actual draw.
 * - Rows are the drawing years: from the household's retirement, when the later spouse retires.
 *
 * Null when no spending is entered or there are no drawing years.
 */
export function projectCashFlow(
  profile: ProfileData,
  scenario: RetirementScenario = "standard",
): CashFlowPlan | null {
  const monthlySpending = desiredRetirementMonthly(profile.expenses) ?? 0;
  if (monthlySpending <= 0) return null;

  const household = buildHousehold(profile, resolveRetirementTiming(profile, scenario));
  const rows = simulateHouseholdDrawdown(household, monthlySpending);
  const budget = budgetBreakdown(profile.expenses);

  const years: CashFlowYear[] = [];
  for (let index = Math.max(Math.ceil(household.retirementYears), 1); index < rows.length; index += 1) {
    const row = rows[index];
    const point: CashFlowYear = {
      age: row.age,
      pensionFund: 0,
      providentFund: 0,
      managersInsurance: 0,
      studyFund: 0,
      investments: 0,
      bituachLeumi: Math.round(row.streams.bituachLeumi),
      withdrawn: {
        pensionFund: 0,
        providentFund: 0,
        managersInsurance: 0,
        studyFund: 0,
        investments: 0,
        bituachLeumi: 0,
      },
      unfunded: Math.round(row.unmet / 12),
      calendarYear: household.baseYear + row.yearsFromNow,
      short: row.unmet > UNMET_TOLERANCE,
      income: 0,
      tax: 0,
      spending: monthlySpending,
      essential: budget ? budget.essential : null,
      discretionary: budget ? budget.discretionary : null,
      cover: Math.round(averageMonthlyCoverCost(household, row.yearsFromNow)),
    };

    for (const kind of SOURCE_KINDS) point[BAND_FOR_KIND[kind]] = Math.round(row.streams[kind]);

    const drawnMonthly = row.drawn / 12;
    if (drawnMonthly > 0) {
      const amounts = roundToSum(
        SOURCE_KINDS.map((kind) => drawnMonthly * row.capitalShare[kind]),
        Math.round(drawnMonthly),
      );
      SOURCE_KINDS.forEach((kind, kindIndex) => {
        const band = BAND_FOR_KIND[kind];
        point[band] += amounts[kindIndex];
        point.withdrawn[band] += amounts[kindIndex];
      });
    }
    point.income = INCOME_BAND_KEYS.reduce((sum, band) => sum + point[band], 0);

    const draws: YearDraw[] = row.holdings.map((holding) => ({
      holding,
      amount: drawnMonthly * holding.capitalShare,
    }));
    point.tax = Math.round(
      household.members.reduce(
        (sum, _member, memberIndex) =>
          sum + memberTaxDetail(household, memberIndex, row.yearsFromNow, row.holdings, draws).tax.totalMonthly,
        0,
      ),
    );
    years.push(point);
  }
  if (years.length === 0) return null;

  const irregular = irregularCosts(profile.expenses);
  return {
    monthlySpending,
    years,
    firstUnfundedAge: years.find((year) => year.short)?.age ?? null,
    bands: INCOME_BAND_KEYS.filter((band) => years.some((year) => year[band] > 0)),
    irregularMonthly: irregular ? irregular.monthly : 0,
    hasCover: years.some((year) => year.cover > 0),
  };
}
