import {
  geometricMean,
  rebaseReturns,
  realReturnsForMix,
  US_HISTORY_FIRST_YEAR,
  US_HISTORY_LAST_YEAR,
} from "../history/returns";
import type { ProfileData } from "../types";
import { evaluatePaths, findLargestGrossSpending, prepareSpendingTest } from "./spendingTest";
import type { RetirementScenario } from "./types";

/**
 * Historical backtest. Instead of random returns (see monteCarlo.ts), the same
 * plan is replayed on what US stocks and bonds actually did: the plan's first
 * year gets the real return of 1928, its second year 1929, and so on; then the
 * same again starting in 1929, 1930, … for as long as the history lasts.
 *
 * Choices (see docs/implementation-progress.md, Phase Y):
 * - Returns are the real (after inflation) return of a stock and bond mix
 *   rebalanced yearly, from the bundled Damodaran series (src/history). The
 *   plan is in today's shekels, so real returns plug straight in.
 * - Only windows that cover the whole planning horizon count. Adjacent
 *   windows share most of their years, so they are not independent samples:
 *   "funded in 80 of 90 windows" is not the same as a 90% chance.
 * - Two ways to use the returns: as they happened, or shifted so their long-run
 *   average equals the plan's own real return while keeping every year's ups and
 *   downs ("matched"). The second isolates sequence-of-returns risk.
 * - Success, the tax gross-up and the spending test are the Monte Carlo's
 *   (spendingTest.ts).
 */

/** Fewer windows than this are too few to say anything about. */
export const MIN_BACKTEST_WINDOWS = 10;
export const DEFAULT_BACKTEST_STOCK_SHARE_PCT = 60;

export type BacktestBasis = "asHappened" | "matchedToPlan";

export interface BacktestOptions {
  /** Share of the portfolio in US stocks, in percent (0 to 100); the rest is 10-year US bonds. Default 60. */
  stockSharePct?: number;
  /** Default "asHappened". */
  basis?: BacktestBasis;
  /** Also find the spending funded in every window. Default true. */
  findSurvivableSpending?: boolean;
}

export interface BacktestWindow {
  /** The calendar year whose return the plan's first year gets. */
  startYear: number;
  /** The calendar year whose return the plan's last year gets. */
  endYear: number;
  /** True when the desired spending is funded in every drawing year. */
  funded: boolean;
  /** The primary user's age at the first unfunded year; null when funded. */
  shortfallAge: number | null;
  /** Net worth at the planning horizon, today's money. */
  finalNetWorth: number;
  /** Net worth for every year from now to the planning horizon, today's money. */
  netWorth: number[];
}

export interface HistoricalBacktestResult {
  stockSharePct: number;
  basis: BacktestBasis;
  firstYear: number;
  lastYear: number;
  windows: BacktestWindow[];
  fundedCount: number;
  /** Share (0 to 1) of windows that fund the target in every drawing year. */
  successProbability: number;
  /** Start years of the windows that ran short, ascending. */
  failedStartYears: number[];
  /** The window that went worst: the earliest shortfall, or if none ran short, the lowest final net worth. */
  worstWindow: BacktestWindow;
  /**
   * The largest monthly spending after tax that would have been funded in
   * every window, rounded down to ₪10; null when not searched for.
   */
  survivableNetMonthly: number | null;
  /** Desired monthly spending after tax, today's money. */
  targetNetMonthly: number;
  /** The same spending before tax: what the simulation draws each month. */
  targetGrossMonthly: number;
  /** The plan's effective tax rate used to gross the target up. */
  taxShare: number;
  /** The plan's own real return, a fraction. */
  planRealReturn: number;
  /** The mix's long-run (geometric) real return over all the history, a fraction. */
  historyRealReturn: number;
  /** The average real return the windows were replayed with: the history's as it happened, the plan's when matched. */
  replayedRealReturn: number;
  /** Whole years replayed in each window. */
  horizonYears: number;
  /** The primary user's age today: the first point of every window's net worth line. */
  currentAge: number;
  /** The primary user's age when household drawing starts. */
  drawdownStartAge: number;
}

/**
 * Replays the plan for the household that retires as `scenario` says on every
 * historical window. Returns null when there is nothing to test: no desired
 * retirement spending entered, no drawing years before the planning horizon,
 * or fewer than `MIN_BACKTEST_WINDOWS` windows of history.
 */
export function runHistoricalBacktest(
  profile: ProfileData,
  scenario: RetirementScenario = "standard",
  options: BacktestOptions = {},
): HistoricalBacktestResult | null {
  const {
    stockSharePct = DEFAULT_BACKTEST_STOCK_SHARE_PCT,
    basis = "asHappened",
    findSurvivableSpending = true,
  } = options;
  const test = prepareSpendingTest(profile, scenario);
  if (!test) return null;
  const { household, horizonYears, targetNetMonthly, targetGrossMonthly, taxShare } = test;

  const history = realReturnsForMix(stockSharePct / 100);
  const windowCount = history.length - horizonYears + 1;
  if (windowCount < MIN_BACKTEST_WINDOWS) return null;

  const historyRealReturn = geometricMean(history.map((entry) => entry.realReturn));
  const returns =
    basis === "matchedToPlan"
      ? rebaseReturns(
          history.map((entry) => entry.realReturn),
          household.rate,
        )
      : history.map((entry) => entry.realReturn);

  const ratesByPath = Array.from({ length: windowCount }, (_, start) =>
    returns.slice(start, start + horizonYears),
  );

  const { shortfallAges, failedPaths, netWorth } = evaluatePaths(
    household,
    targetGrossMonthly,
    ratesByPath,
    true,
  );
  const shortfallByWindow = new Map(failedPaths.map((path, index) => [path, shortfallAges[index]]));

  const windows = ratesByPath.map((_, index): BacktestWindow => {
    const series = (netWorth ?? []).map((column) => Math.round(column[index]));
    const shortfallAge = shortfallByWindow.get(index) ?? null;
    return {
      startYear: history[index].year,
      endYear: history[index + horizonYears - 1].year,
      funded: shortfallAge === null,
      shortfallAge,
      finalNetWorth: series[series.length - 1] ?? 0,
      netWorth: series,
    };
  });

  const failed = windows.filter((window) => !window.funded);
  const worstWindow = failed.length > 0 ? earliestShortfall(failed) : lowestFinalNetWorth(windows);

  let survivableNetMonthly: number | null = null;
  if (findSurvivableSpending) {
    const gross = findLargestGrossSpending(household, ratesByPath, test.searchCeiling, 1);
    survivableNetMonthly = Math.floor((gross * (1 - taxShare)) / 10) * 10;
  }

  return {
    stockSharePct,
    basis,
    firstYear: US_HISTORY_FIRST_YEAR,
    lastYear: US_HISTORY_LAST_YEAR,
    windows,
    fundedCount: windows.length - failed.length,
    successProbability: (windows.length - failed.length) / windows.length,
    failedStartYears: failed.map((window) => window.startYear),
    worstWindow,
    survivableNetMonthly,
    targetNetMonthly,
    targetGrossMonthly: Math.round(targetGrossMonthly),
    taxShare,
    planRealReturn: household.rate,
    historyRealReturn,
    replayedRealReturn: basis === "matchedToPlan" ? household.rate : historyRealReturn,
    horizonYears,
    currentAge: household.members[0].currentAge,
    drawdownStartAge: household.drawdownStartAge,
  };
}

function earliestShortfall(failed: BacktestWindow[]): BacktestWindow {
  return failed.reduce((worst, window) => {
    const age = window.shortfallAge ?? Number.POSITIVE_INFINITY;
    const worstAge = worst.shortfallAge ?? Number.POSITIVE_INFINITY;
    if (age !== worstAge) return age < worstAge ? window : worst;
    return window.finalNetWorth < worst.finalNetWorth ? window : worst;
  });
}

function lowestFinalNetWorth(windows: BacktestWindow[]): BacktestWindow {
  return windows.reduce((worst, window) => (window.finalNetWorth < worst.finalNetWorth ? window : worst));
}

/**
 * Groups ascending years into runs of consecutive ones: [1929, 1930, 1931, 1965] becomes
 * [[1929, 1931], [1965, 1965]].
 */
export function groupConsecutiveYears(years: readonly number[]): [number, number][] {
  const runs: [number, number][] = [];
  for (const year of years) {
    const last = runs[runs.length - 1];
    if (last && year === last[1] + 1) last[1] = year;
    else runs.push([year, year]);
  }
  return runs;
}
