import type { ProfileData } from "../types";
import { MAX_RETIREMENT_SEARCH_AGE } from "./constants";
import { buildHousehold, retirementTimingShiftedTo } from "./household";
import { estimateNetIncomeForHousehold } from "./netIncome";
import { resolveCurrentAge, resolveRetirementAge } from "./profileBasics";
import { estimateHouseholdRetirementIncome } from "./retirementIncome";

/** Same bounds as the retirement-age field in the Personal step. */
export const COMPARISON_MIN_AGE = 50;
export const COMPARISON_MAX_AGE = MAX_RETIREMENT_SEARCH_AGE;

/** `noTarget`: no desired retirement expenses entered, so there is no gap to report. */
export type ComparisonStatus = "onTrack" | "shortfall" | "noTarget";

/** What retiring at one age means for the household's income and savings. */
export interface RetirementAgeOutcome {
  /** The primary user's retirement age. */
  retirementAge: number;
  /** The spouse's retirement age, for a couple. */
  spouseRetirementAge: number | null;
  /** Years from now until the primary user retires (0 when they already could). */
  yearsFromNow: number;
  /** The primary user's age when the household starts drawing: the later spouse's retirement for a couple. */
  householdRetirementAge: number;
  /** Savings when the household starts drawing, in today's money. */
  netWorthAtRetirement: number;
  /** The lowest after-tax year, with the gross and tax of that same year (see `netIncome.ts`). */
  grossMonthlyIncome: number;
  taxMonthly: number;
  netMonthlyIncome: number;
  effectiveTaxRate: number;
  desiredMonthlyExpenses: number;
  /** Net income minus desired expenses; null when there is no target. */
  monthlyGap: number | null;
  status: ComparisonStatus;
}

/** Whether `age` is a usable comparison age: not in the past and within the field's bounds. */
export function isValidComparisonAge(profile: ProfileData, age: number | null): age is number {
  return (
    age !== null &&
    Number.isFinite(age) &&
    age >= Math.max(COMPARISON_MIN_AGE, resolveCurrentAge(profile)) &&
    age <= COMPARISON_MAX_AGE
  );
}

/**
 * The three ages shown at first: the Early, Standard and Delayed scenarios'
 * ages for the primary user, never before today and never after the standard
 * age for the early one.
 */
export function defaultComparisonAges(profile: ProfileData): [number, number, number] {
  const standard = resolveRetirementAge(profile, "standard");
  const early = Math.min(
    standard,
    Math.max(resolveRetirementAge(profile, "early"), Math.ceil(resolveCurrentAge(profile))),
  );
  return [early, standard, resolveRetirementAge(profile, "delayed")];
}

/**
 * Income after tax, savings and the gap to the desired expenses for the
 * primary user retiring at `age`. A spouse's retirement moves by the same
 * number of years from the age they entered, so the user's own entered age
 * reproduces the Dashboard's plan.
 */
export function compareRetirementAge(profile: ProfileData, age: number): RetirementAgeOutcome {
  const timing = retirementTimingShiftedTo(profile, age);
  const household = buildHousehold(profile, timing);
  const income = estimateHouseholdRetirementIncome(household);
  const net = estimateNetIncomeForHousehold(household);
  const desiredMonthlyExpenses = profile.expenses.retirementMonthly ?? 0;
  const hasTarget = desiredMonthlyExpenses > 0;
  const monthlyGap = hasTarget ? Math.round(net.netMonthlyIncome - desiredMonthlyExpenses) : null;

  return {
    retirementAge: age,
    spouseRetirementAge: timing.spouseAge,
    yearsFromNow: Math.max(age - resolveCurrentAge(profile), 0),
    householdRetirementAge: income.householdRetirementAge,
    netWorthAtRetirement: Math.round(income.netWorthAtRetirement),
    grossMonthlyIncome: net.grossMonthlyIncome,
    taxMonthly: net.taxMonthly,
    netMonthlyIncome: net.netMonthlyIncome,
    effectiveTaxRate: net.effectiveTaxRate,
    desiredMonthlyExpenses,
    monthlyGap,
    status: monthlyGap === null ? "noTarget" : monthlyGap >= 0 ? "onTrack" : "shortfall",
  };
}

/** `compareRetirementAge` for each age, in the order given. */
export function compareRetirementAges(profile: ProfileData, ages: number[]): RetirementAgeOutcome[] {
  return ages.map((age) => compareRetirementAge(profile, age));
}
