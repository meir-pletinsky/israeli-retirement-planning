import type { ProfileData } from "../types";
import { simulateHouseholdDrawdown } from "./drawdown";
import { desiredRetirementMonthly } from "./expenses";
import { buildHousehold, resolveRetirementTiming, type Household, type RetirementTiming } from "./household";
import { estimateNetIncomeForHousehold } from "./netIncome";
import type { RetirementScenario } from "./types";

/**
 * The part the Monte Carlo and the historical backtest share: take the
 * household's desired retirement spending, replay the plan on a list of
 * yearly-return paths, and search for the largest spending a given share of
 * those paths can fund.
 */

/** Unfunded spending below this (shekels a year, today's money) is rounding, not a shortfall. */
export const UNMET_TOLERANCE = 1;

const BISECTION_STEPS = 14;
const MAX_DOUBLINGS = 8;
const MIN_SEARCH_CEILING = 1000;
/** The search stops once the bracket is this narrow (0.5%, or ₪10 a month). */
const SEARCH_PRECISION = 0.005;
const MIN_SEARCH_GAP = 10;

export interface SpendingTest {
  household: Household;
  /** Whole years from now to the planning horizon: one return is needed for each. */
  horizonYears: number;
  /** Desired monthly spending after tax, today's money. */
  targetNetMonthly: number;
  /** The same spending before tax: what the simulation draws each month. */
  targetGrossMonthly: number;
  /** The plan's effective tax rate used to gross the target up. */
  taxShare: number;
  /** A gross monthly spending that is safely above what any path could fund, to start a search from. */
  searchCeiling: number;
}

/**
 * Sets up the test for the household that retires as `retiring` says: a scenario, or the exact
 * ages of each spouse.
 * Returns null when there is nothing to test: no desired retirement spending
 * entered, or no drawing years before the planning horizon.
 *
 * The desired spending is after tax and the simulation draws gross amounts,
 * so the target is grossed up by the plan's effective tax rate (the one of
 * its lowest net-income year). Tax is not recomputed on each path.
 */
export function prepareSpendingTest(
  profile: ProfileData,
  retiring: RetirementScenario | RetirementTiming,
): SpendingTest | null {
  const targetNetMonthly = desiredRetirementMonthly(profile.expenses);
  if (targetNetMonthly === null || targetNetMonthly <= 0) return null;

  const timing = typeof retiring === "string" ? resolveRetirementTiming(profile, retiring) : retiring;
  const household = buildHousehold(profile, timing);
  const horizonYears = Math.floor(household.horizonYears);
  if (household.retirementYears >= horizonYears) return null;

  const net = estimateNetIncomeForHousehold(household);
  const taxShare = Math.min(Math.max(net.effectiveTaxRate, 0), 0.9);
  const targetGrossMonthly = targetNetMonthly / (1 - taxShare);

  return {
    household,
    horizonYears,
    targetNetMonthly,
    targetGrossMonthly,
    taxShare,
    searchCeiling: Math.max(targetGrossMonthly, net.grossMonthlyIncome) * 2,
  };
}

export interface PathEvaluation {
  successes: number;
  /** The primary user's age at each failing path's first shortfall. */
  shortfallAges: number[];
  /** The failing paths' indices, in the same order as `shortfallAges`. */
  failedPaths: number[];
  /** Net worth by year, then by path; only when asked for. */
  netWorth: Float64Array[] | null;
}

/**
 * Replays the plan at `grossMonthly` on every path. With `maxFailures` it
 * stops as soon as more paths than that have failed, so the counts are then
 * partial; only the search uses that, and only to compare against the limit.
 */
export function evaluatePaths(
  household: Household,
  grossMonthly: number,
  ratesByPath: readonly (readonly number[])[],
  keepNetWorth: boolean,
  maxFailures = Number.POSITIVE_INFINITY,
): PathEvaluation {
  const years = Math.floor(household.horizonYears) + 1;
  const netWorth = keepNetWorth
    ? Array.from({ length: years }, () => new Float64Array(ratesByPath.length))
    : null;
  const shortfallAges: number[] = [];
  const failedPaths: number[] = [];
  let successes = 0;

  for (let path = 0; path < ratesByPath.length && shortfallAges.length <= maxFailures; path += 1) {
    const rows = simulateHouseholdDrawdown(household, grossMonthly, {
      yearlyRates: ratesByPath[path],
      lean: true,
    });
    let shortfallAge: number | null = null;
    for (const row of rows) {
      if (shortfallAge === null && row.unmet > UNMET_TOLERANCE) shortfallAge = row.age;
      if (netWorth) netWorth[row.yearsFromNow][path] = row.netWorth;
    }
    if (shortfallAge === null) successes += 1;
    else {
      shortfallAges.push(shortfallAge);
      failedPaths.push(path);
    }
  }

  return { successes, shortfallAges, failedPaths, netWorth };
}

/**
 * The most failing paths that still leave at least `confidence` (0 to 1) of `paths` succeeding.
 */
export function maxFailuresForConfidence(paths: number, confidence: number): number {
  let maxFailures = paths;
  while (maxFailures > 0 && (paths - maxFailures) / paths < confidence) maxFailures -= 1;
  return maxFailures;
}

/**
 * The largest gross monthly spending that succeeds on at least `confidence`
 * (0 to 1) of the paths. Success only falls as spending rises, so the search
 * halves a bracket around it.
 */
export function findLargestGrossSpending(
  household: Household,
  ratesByPath: readonly (readonly number[])[],
  startingCeiling: number,
  confidence: number,
): number {
  const maxFailures = maxFailuresForConfidence(ratesByPath.length, confidence);
  const confident = (gross: number) =>
    evaluatePaths(household, gross, ratesByPath, false, maxFailures).shortfallAges.length <= maxFailures;

  let low = 0;
  let high = Math.max(startingCeiling, MIN_SEARCH_CEILING);
  for (let doublings = 0; doublings < MAX_DOUBLINGS && confident(high); doublings += 1) {
    low = high;
    high *= 2;
  }
  for (
    let step = 0;
    step < BISECTION_STEPS && high - low > Math.max(low * SEARCH_PRECISION, MIN_SEARCH_GAP);
    step += 1
  ) {
    const middle = (low + high) / 2;
    if (confident(middle)) low = middle;
    else high = middle;
  }
  return low;
}
