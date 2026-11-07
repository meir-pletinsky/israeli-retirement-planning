import { DEFAULT_VOLATILITY_PCT, MAX_VOLATILITY_PCT, type ProfileData } from "../types";
import type { RetirementTiming } from "./household";
import { evaluatePaths, findLargestGrossSpending, maxFailuresForConfidence, prepareSpendingTest } from "./spendingTest";
import type { RetirementScenario } from "./types";

/**
 * Monte Carlo risk analysis. The deterministic plan assumes the same real
 * return every year; here the yearly return is random, and the same plan is
 * replayed on many random return sequences ("paths") to see how often the
 * household's desired spending is funded all the way to the planning horizon.
 *
 * Choices (see docs/implementation-progress.md, Phase V):
 * - Only the market return is random. Each year's real return is
 *   `exp(ln(1 + r) + volatility × z) - 1` with `z` a standard normal draw and
 *   `r` the plan's real return, so the median path is the deterministic
 *   projection. The return is shared by every source, which is the cautious
 *   assumption; Bituach Leumi, annuities and the other fixed streams do not
 *   vary.
 * - A path succeeds when, in every drawing year, the fixed streams and the
 *   unlocked capital cover the spending.
 * - The desired spending is after tax, the simulation draws gross amounts,
 *   so the target is grossed up by the plan's effective tax rate (the one of
 *   its lowest net-income year). Tax is not recomputed on each path.
 * - The random draws come from a fixed seed, so the same profile always gives
 *   the same answer, and every spending level is tested on the same paths.
 */

export const MONTE_CARLO_PATHS = 2000;
export const MONTE_CARLO_SEED = 20_260_101;
/** The share of paths that must succeed for a spending level to count as dependable. */
export const MONTE_CARLO_CONFIDENCE = 0.9;
/** Below this share of successful paths the plan is flagged as at risk. */
export const MONTE_CARLO_FAIR_THRESHOLD = 0.7;

export type SuccessBand = "strong" | "fair" | "weak";

/** How much to trust a success probability: strong at 90% and above, weak under 70%. */
export function successBand(probability: number): SuccessBand {
  if (probability >= MONTE_CARLO_CONFIDENCE) return "strong";
  if (probability >= MONTE_CARLO_FAIR_THRESHOLD) return "fair";
  return "weak";
}

/** The probability as a whole percent, rounded down so 99.9% is never shown as certain. */
export function successPercent(probability: number): number {
  return Math.floor(Math.min(Math.max(probability, 0), 1) * 100 + 1e-9);
}

/** Mulberry32: a small, fast seeded generator of numbers in [0, 1). */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** `paths` rows of `years` standard normal draws (Box-Muller), the same for the same seed. */
export function standardNormalShocks(paths: number, years: number, seed: number): Float64Array[] {
  const random = createRandom(seed);
  let spare: number | null = null;
  const next = (): number => {
    if (spare !== null) {
      const value = spare;
      spare = null;
      return value;
    }
    const radius = Math.sqrt(-2 * Math.log(1 - random()));
    const angle = 2 * Math.PI * random();
    spare = radius * Math.sin(angle);
    return radius * Math.cos(angle);
  };
  return Array.from({ length: paths }, () => {
    const row = new Float64Array(years);
    for (let year = 0; year < years; year += 1) row[year] = next();
    return row;
  });
}

/** The value below which the share `q` of `sorted` (ascending) lies, interpolating between neighbours. */
export function quantile(sorted: ArrayLike<number>, q: number): number {
  if (sorted.length === 0) return 0;
  const position = Math.min(Math.max(q, 0), 1) * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

/** The volatility to simulate with: the saved value as a fraction, kept within what is credible. */
export function resolveVolatility(volatilityPct: number | null | undefined): number {
  const pct =
    typeof volatilityPct === "number" && Number.isFinite(volatilityPct)
      ? volatilityPct
      : DEFAULT_VOLATILITY_PCT;
  return Math.min(Math.max(pct, 0), MAX_VOLATILITY_PCT) / 100;
}

/** One path's real return for each year, with `medianRate` as the median and `volatility` the spread of the log return. */
export function yearlyRatesFromShocks(
  shocks: ArrayLike<number>,
  medianRate: number,
  volatility: number,
): number[] {
  const drift = Math.log(1 + medianRate);
  return Array.from(shocks, (z) => Math.exp(drift + volatility * z) - 1);
}

export interface MonteCarloFanPoint {
  /** The primary user's age. */
  age: number;
  yearsFromNow: number;
  /** Net worth in today's money: 10 in 100 paths end the year below this. */
  p10: number;
  p50: number;
  p90: number;
}

export interface MonteCarloResult {
  paths: number;
  /** The volatility simulated, in percent. */
  volatilityPct: number;
  /** Desired monthly spending after tax, today's money. */
  targetNetMonthly: number;
  /** The same spending before tax: what the simulation draws each month. */
  targetGrossMonthly: number;
  /** The plan's effective tax rate used to gross the target up. */
  taxShare: number;
  /** Share (0 to 1) of paths that fund the target in every drawing year. */
  successProbability: number;
  /**
   * The largest monthly spending after tax that is funded in at least
   * `MONTE_CARLO_CONFIDENCE` of the paths, rounded down to ₪10; null when not searched for.
   */
  confidentNetMonthly: number | null;
  /** In the paths that fail: the median primary-user age at which the spending is first unfunded. */
  medianShortfallAge: number | null;
  /** Net worth percentiles for every year from now to the planning horizon. */
  fan: MonteCarloFanPoint[];
  /** The primary user's age when household drawing starts. */
  drawdownStartAge: number;
}

export interface MonteCarloOptions {
  paths?: number;
  seed?: number;
  /** Also find the spending funded in `MONTE_CARLO_CONFIDENCE` of the paths; costs about a dozen more runs. Default true. */
  findConfidentSpending?: boolean;
}

/**
 * Runs the Monte Carlo for the household that retires as `retiring` says: a scenario, or the
 * exact retirement age of each spouse.
 * Returns null when there is nothing to test: no desired retirement spending
 * entered, or no drawing years before the planning horizon.
 */
export function runMonteCarlo(
  profile: ProfileData,
  retiring: RetirementScenario | RetirementTiming = "standard",
  options: MonteCarloOptions = {},
): MonteCarloResult | null {
  const { paths = MONTE_CARLO_PATHS, seed = MONTE_CARLO_SEED, findConfidentSpending = true } = options;
  const test = prepareSpendingTest(profile, retiring);
  if (!test) return null;
  const { household, horizonYears, targetNetMonthly, targetGrossMonthly, taxShare } = test;

  const volatility = resolveVolatility(profile.assumptions.volatilityPct);
  const shocks = standardNormalShocks(paths, horizonYears, seed);
  const ratesByPath = shocks.map((row) => yearlyRatesFromShocks(row, household.rate, volatility));

  const { successes, shortfallAges, netWorth } = evaluatePaths(household, targetGrossMonthly, ratesByPath, true);

  const primaryAge = household.members[0].currentAge;
  const fan = (netWorth ?? []).map((column, yearsFromNow): MonteCarloFanPoint => {
    column.sort();
    return {
      age: primaryAge + yearsFromNow,
      yearsFromNow,
      p10: Math.round(quantile(column, 0.1)),
      p50: Math.round(quantile(column, 0.5)),
      p90: Math.round(quantile(column, 0.9)),
    };
  });

  let confidentNetMonthly: number | null = null;
  if (findConfidentSpending) {
    const gross = findLargestGrossSpending(
      household,
      ratesByPath,
      test.searchCeiling,
      MONTE_CARLO_CONFIDENCE,
    );
    confidentNetMonthly = Math.floor((gross * (1 - taxShare)) / 10) * 10;
  }

  const sortedShortfalls = Float64Array.from(shortfallAges).sort();
  return {
    paths,
    volatilityPct: volatility * 100,
    targetNetMonthly,
    targetGrossMonthly: Math.round(targetGrossMonthly),
    taxShare,
    successProbability: successes / paths,
    confidentNetMonthly,
    medianShortfallAge: sortedShortfalls.length > 0 ? quantile(sortedShortfalls, 0.5) : null,
    fan,
    drawdownStartAge: household.drawdownStartAge,
  };
}

/**
 * Only the share of paths that fund the desired spending, for the household that retires as
 * `retiring` says. It draws the same paths as `runMonteCarlo`, so the figures agree, but skips the
 * fan and the dependable-spending search. Null when there is nothing to test.
 */
export function monteCarloSuccessProbability(
  profile: ProfileData,
  retiring: RetirementScenario | RetirementTiming,
  options: Pick<MonteCarloOptions, "paths" | "seed"> = {},
): number | null {
  const { paths = MONTE_CARLO_PATHS, seed = MONTE_CARLO_SEED } = options;
  const test = prepareSpendingTest(profile, retiring);
  if (!test) return null;
  const { household, horizonYears, targetGrossMonthly } = test;

  const volatility = resolveVolatility(profile.assumptions.volatilityPct);
  const shocks = standardNormalShocks(paths, horizonYears, seed);
  const ratesByPath = shocks.map((row) => yearlyRatesFromShocks(row, household.rate, volatility));
  const { successes } = evaluatePaths(household, targetGrossMonthly, ratesByPath, false);
  return successes / paths;
}

/**
 * Whether the household that retires as `retiring` says has its desired spending funded in at
 * least `confidence` of the paths. The same paths as `runMonteCarlo`, but it stops simulating as
 * soon as too many paths have failed, so it is much faster than the probability for a plan that
 * falls short. Null when there is nothing to test.
 */
export function meetsMonteCarloConfidence(
  profile: ProfileData,
  retiring: RetirementScenario | RetirementTiming,
  confidence: number = MONTE_CARLO_CONFIDENCE,
  options: Pick<MonteCarloOptions, "paths" | "seed"> = {},
): boolean | null {
  const { paths = MONTE_CARLO_PATHS, seed = MONTE_CARLO_SEED } = options;
  const test = prepareSpendingTest(profile, retiring);
  if (!test) return null;
  const { household, horizonYears, targetGrossMonthly } = test;

  const volatility = resolveVolatility(profile.assumptions.volatilityPct);
  const shocks = standardNormalShocks(paths, horizonYears, seed);
  const ratesByPath = shocks.map((row) => yearlyRatesFromShocks(row, household.rate, volatility));
  const maxFailures = maxFailuresForConfidence(paths, confidence);
  const { shortfallAges } = evaluatePaths(household, targetGrossMonthly, ratesByPath, false, maxFailures);
  return shortfallAges.length <= maxFailures;
}
