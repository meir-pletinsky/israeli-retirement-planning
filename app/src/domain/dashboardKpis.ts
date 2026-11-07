import type { ProfileData } from "../types";
import { simulateHouseholdDrawdown } from "./drawdown";
import { desiredRetirementMonthly } from "./expenses";
import { calculateFundingGapAtAge } from "./fundingGap";
import { buildHousehold, resolveRetirementTiming, spouseAgeAt } from "./household";
import { estimateIncomeBreakdownForTiming, recurringAmount, type IncomeBreakdownPoint } from "./incomeBreakdown";
import { isHouseholdActive, resolveCurrentAge } from "./profileBasics";
import { estimateHouseholdRetirementIncome } from "./retirementIncome";
import type { ReadinessStatus, RetirementAccessSummary, RetirementScenario } from "./types";

/** A monthly amount (today's money) and the primary user's age at which it first appears. */
export interface IncomeFromAge {
  monthly: number;
  /** Null when the amount is 0, so there is no start. */
  fromAge: number | null;
}

/** The retirement KPIs of the functional spec (Section 13) that the Dashboard's top row does not show. */
export interface RetirementKpis {
  /** What the user wants to spend each month in retirement; null when none is entered. */
  plannedMonthlySpending: number | null;
  /**
   * What the planned spending asks of the savings in the first drawing year: the draw, before
   * tax, as a share of the savings that can be spent then. Pension and state income that have
   * started reduce it; it passes 100% when the spending is more than the spendable savings can
   * pay. Null when no spending is planned or no savings are spendable then.
   */
  withdrawalRate: number | null;
  /**
   * Monthly income paid for life by the pension, provident and managers-insurance accounts that
   * have a usable conversion factor or monthly estimate. Zero for accounts that are drawn down as
   * capital instead: those are in `pensionWithdrawals`.
   */
  lifelongPension: IncomeFromAge;
  /**
   * Monthly income taken out of those same accounts as capital, in the first year it is. It is not
   * a lifelong pension: the plan sizes it so the savings last to the end of the planning horizon.
   */
  pensionWithdrawals: IncomeFromAge;
  /** The largest monthly Bituach Leumi payment (with any spouse supplement) over retirement. */
  stateBenefits: IncomeFromAge;
  /** How much of the savings can be spent at retirement, and how much opens later. */
  access: RetirementAccessSummary;
}

const PENSION_BAND_KEYS = ["pensionFund", "providentFund", "managersInsurance"] as const;

const pensionPayments = (point: IncomeBreakdownPoint): number =>
  PENSION_BAND_KEYS.reduce((sum, band) => sum + recurringAmount(point, band), 0);

const pensionWithdrawn = (point: IncomeBreakdownPoint): number =>
  PENSION_BAND_KEYS.reduce((sum, band) => sum + point.withdrawn[band], 0);

/**
 * The retirement KPIs for `scenario`, from the same income estimate, drawdown and income
 * breakdown as the Projections page, so the numbers agree with its charts.
 */
export function calculateRetirementKpis(
  profile: ProfileData,
  scenario: RetirementScenario = "standard",
): RetirementKpis {
  const timing = resolveRetirementTiming(profile, scenario);
  const household = buildHousehold(profile, timing);
  const income = estimateHouseholdRetirementIncome(household);

  // Drawing starts in the first year at or after retirement, and never in year 0 (today).
  const firstDrawingIndex = Math.max(1, Math.ceil(household.retirementYears));
  const desiredSpending = desiredRetirementMonthly(profile.expenses);
  const plannedMonthlySpending = desiredSpending !== null && desiredSpending > 0 ? desiredSpending : null;
  const plannedRow =
    plannedMonthlySpending === null
      ? undefined
      : simulateHouseholdDrawdown(household, plannedMonthlySpending, { lean: true })[firstDrawingIndex];
  // What the spending asks for, not what the savings can pay: the unmet part counts too.
  const withdrawalRate =
    plannedRow && plannedRow.spendable > 0
      ? (plannedRow.drawn + plannedRow.unmet) / plannedRow.spendable
      : null;

  const points = estimateIncomeBreakdownForTiming(profile, timing);
  const firstWithdrawal = points.find((point) => pensionWithdrawn(point) > 0);
  const firstStateBenefit = points.find((point) => point.bituachLeumi > 0);
  // Annuities start at different ages, so the pension is what is paid once they all have.
  const lifelongMonthly = Math.max(0, ...points.map(pensionPayments));
  const firstFullPension = points.find((point) => pensionPayments(point) === lifelongMonthly);

  return {
    plannedMonthlySpending,
    withdrawalRate,
    lifelongPension: {
      monthly: lifelongMonthly,
      fromAge: lifelongMonthly > 0 ? (firstFullPension?.age ?? null) : null,
    },
    pensionWithdrawals: {
      monthly: firstWithdrawal ? pensionWithdrawn(firstWithdrawal) : 0,
      fromAge: firstWithdrawal?.age ?? null,
    },
    stateBenefits: {
      monthly: Math.max(0, ...points.map((point) => point.bituachLeumi)),
      fromAge: firstStateBenefit?.age ?? null,
    },
    access: income.access,
  };
}

/** Retirement ages besides "now" that the Dashboard checks. */
export const EARLY_RETIREMENT_CHECK_AGES = [55, 60, 65] as const;

export interface RetirementAgeCheck {
  /** The primary user's retirement age in this check. */
  age: number;
  /** True for the first check, which is the soonest whole age (retiring today). */
  isNow: boolean;
  /** The spouse's age at that moment; null for a single person. */
  spouseAge: number | null;
  status: ReadinessStatus;
  /** Net monthly income minus the planned spending; negative is a shortfall. */
  monthlyGap: number;
}

/**
 * Whether the plan covers the planned spending if the primary user retires now, and at each of
 * `EARLY_RETIREMENT_CHECK_AGES` they have not reached yet (a spouse retires at the same moment).
 * "Now" is the soonest whole age, the same one `findEarliestFeasibleRetirementAge` starts from,
 * so the two never disagree. Null when no retirement spending is entered: there is nothing to
 * test against.
 */
export function checkRetirementAges(profile: ProfileData): RetirementAgeCheck[] | null {
  const desiredSpending = desiredRetirementMonthly(profile.expenses);
  if (desiredSpending === null || desiredSpending <= 0) {
    return null;
  }

  const nowAge = Math.ceil(resolveCurrentAge(profile));
  const ages = [nowAge, ...EARLY_RETIREMENT_CHECK_AGES.filter((age) => age > nowAge)];
  const isCouple = isHouseholdActive(profile);

  return ages.map((age, index) => {
    const gap = calculateFundingGapAtAge(profile, age);
    return {
      age,
      isNow: index === 0,
      spouseAge: isCouple ? spouseAgeAt(profile, age) : null,
      status: gap.status,
      monthlyGap: gap.monthlyGap,
    };
  });
}
