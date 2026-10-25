/**
 * Shared constants for the domain/calculation engine. Kept in one place so
 * Phase 1's simplifications are easy to find and revisit in later phases.
 */

/** Used when `personal.retirementAge` hasn't been entered yet. */
export const DEFAULT_RETIREMENT_AGE = 67;

/** Used when `personal.age` hasn't been entered yet. */
export const DEFAULT_CURRENT_AGE = 30;

/** "Early" scenario = retirement age minus this many years (see Projections page). */
export const EARLY_RETIREMENT_OFFSET_YEARS = 5;

/** "Delayed" scenario = retirement age plus this many years. */
export const DELAYED_RETIREMENT_OFFSET_YEARS = 3;

/** Floor so the "early" scenario can't produce an unrealistic retirement age. */
export const MIN_RETIREMENT_AGE = 60;

/**
 * Deterministic planning horizon (not an actuarial/mortality-based life
 * expectancy — that's Phase 4/Monte Carlo scope per docs/plan.md).
 */
export const MAX_PLANNING_AGE = 90;

/**
 * Phase 1 has no live/bundled FX data feed yet (that's Phase 4 "External
 * Data" scope per docs/architecture.md), but the data model already allows
 * USD-denominated equity holdings (Section 102 / ESPP / brokerage). Rather
 * than silently dropping equity from net worth, convert at this fixed
 * placeholder rate and call it out everywhere it's used.
 *
 * TODO(Phase 4): replace with the live/bundled FX dataset.
 */
export const FALLBACK_USD_TO_ILS_RATE = 3.7;
