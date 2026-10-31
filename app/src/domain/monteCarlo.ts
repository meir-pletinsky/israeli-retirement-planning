import { DEFAULT_VOLATILITY_PCT, MAX_VOLATILITY_PCT, type ProfileData } from "../types";
import { simulateHouseholdDrawdown } from "./drawdown";
import { desiredRetirementMonthly } from "./expenses";
import { buildHousehold, resolveRetirementTiming, type Household } from "./household";
import { estimateNetIncomeForHousehold } from "./netIncome";
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

/** Unfunded spending below this (shekels a year, today's money) is rounding, not a shortfall. */
const UNMET_TOLERANCE = 1;

const BISECTION_STEPS = 14;
const MAX_DOUBLINGS = 8;
const MIN_SEARCH_CEILING = 1000;
/** The search stops once the bracket is this narrow (0.5%, or ₪10 a month). */
const SEARCH_PRECISION = 0.005;
const MIN_SEARCH_GAP = 10;

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

interface Evaluation {
  successes: number;
  /** The primary user's age at each failing path's first shortfall. */
  shortfallAges: number[];
  /** Net worth by year, then by path; only when asked for. */
  netWorth: Float64Array[] | null;
}

/**
 * Replays the plan at `grossMonthly` on every path. With `maxFailures` it
 * stops as soon as more paths than that have failed, so the counts are then
 * partial; only the search uses that, and only to compare against the limit.
 */
function evaluate(
  household: Household,
  grossMonthly: number,
  ratesByPath: readonly (readonly number[])[],
  keepNetWorth: boolean,
  maxFailures = Number.POSITIVE_INFINITY,
): Evaluation {
  const years = Math.floor(household.horizonYears) + 1;
  const netWorth = keepNetWorth
    ? Array.from({ length: years }, () => new Float64Array(ratesByPath.length))
    : null;
  const shortfallAges: number[] = [];
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
    else shortfallAges.push(shortfallAge);
  }

  return { successes, shortfallAges, netWorth };
}

/**
 * The largest gross monthly spending that succeeds on at least
 * `MONTE_CARLO_CONFIDENCE` of the paths. Success only falls as spending
 * rises, so the search halves a bracket around it.
 */
function findConfidentGrossSpending(
  household: Household,
  ratesByPath: readonly (readonly number[])[],
  startingCeiling: number,
): number {
  const paths = ratesByPath.length;
  let maxFailures = paths;
  while (maxFailures > 0 && (paths - maxFailures) / paths < MONTE_CARLO_CONFIDENCE) maxFailures -= 1;

  const confident = (gross: number) =>
    evaluate(household, gross, ratesByPath, false, maxFailures).shortfallAges.length <= maxFailures;

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

/**
 * Runs the Monte Carlo for the household that retires as `scenario` says.
 * Returns null when there is nothing to test: no desired retirement spending
 * entered, or no drawing years before the planning horizon.
 */
export function runMonteCarlo(
  profile: ProfileData,
  scenario: RetirementScenario = "standard",
  options: MonteCarloOptions = {},
): MonteCarloResult | null {
  const { paths = MONTE_CARLO_PATHS, seed = MONTE_CARLO_SEED, findConfidentSpending = true } = options;
  const targetNetMonthly = desiredRetirementMonthly(profile.expenses);
  if (targetNetMonthly === null || targetNetMonthly <= 0) return null;

  const household = buildHousehold(profile, resolveRetirementTiming(profile, scenario));
  const horizonYears = Math.floor(household.horizonYears);
  if (household.retirementYears >= horizonYears) return null;

  const net = estimateNetIncomeForHousehold(household);
  const taxShare = Math.min(Math.max(net.effectiveTaxRate, 0), 0.9);
  const targetGrossMonthly = targetNetMonthly / (1 - taxShare);

  const volatility = resolveVolatility(profile.assumptions.volatilityPct);
  const shocks = standardNormalShocks(paths, horizonYears, seed);
  const ratesByPath = shocks.map((row) => yearlyRatesFromShocks(row, household.rate, volatility));

  const { successes, shortfallAges, netWorth } = evaluate(household, targetGrossMonthly, ratesByPath, true);

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
    const gross = findConfidentGrossSpending(
      household,
      ratesByPath,
      Math.max(targetGrossMonthly, net.grossMonthlyIncome) * 2,
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
