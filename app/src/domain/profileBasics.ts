import type { Assumptions, ProfileData } from "../types";
import {
  DEFAULT_CURRENT_AGE,
  DEFAULT_RETIREMENT_AGE,
  DELAYED_RETIREMENT_OFFSET_YEARS,
  EARLY_RETIREMENT_OFFSET_YEARS,
  FALLBACK_USD_TO_ILS_RATE,
  MIN_RETIREMENT_AGE,
} from "./constants";
import type { RetirementScenario } from "./types";

/** `personal.age`, falling back to a reasonable default when not yet entered. */
export function resolveCurrentAge(profile: ProfileData): number {
  return profile.personal.age ?? DEFAULT_CURRENT_AGE;
}

/**
 * The retirement age to use for a given scenario. "Standard" is whatever the
 * user entered (or the default); "early"/"delayed" shift it by a fixed
 * number of years — see docs/implementation-progress.md for why these
 * offsets (no canonical source defines them for Phase 1).
 */
export function resolveRetirementAge(
  profile: ProfileData,
  scenario: RetirementScenario,
): number {
  const standard = profile.personal.retirementAge ?? DEFAULT_RETIREMENT_AGE;
  switch (scenario) {
    case "early":
      return Math.max(MIN_RETIREMENT_AGE, standard - EARLY_RETIREMENT_OFFSET_YEARS);
    case "delayed":
      return standard + DELAYED_RETIREMENT_OFFSET_YEARS;
    case "standard":
    default:
      return standard;
  }
}

/** Whole years remaining until retirement under the given scenario (floored at 0). */
export function yearsToRetirement(
  profile: ProfileData,
  scenario: RetirementScenario = "standard",
): number {
  return Math.max(resolveRetirementAge(profile, scenario) - resolveCurrentAge(profile), 0);
}

/**
 * Real (inflation-adjusted) annual rate of return, derived from the
 * nominal assumption set. Projecting in real terms means every output is
 * already "in today's money" (per docs/plan.md's Phase 1 output spec)
 * without a separate inflation-adjustment step.
 */
export function realAnnualReturnRate(assumptions: Assumptions): number {
  return (
    (1 + assumptions.investmentReturnPct / 100) /
      (1 + assumptions.inflationPct / 100) -
    1
  );
}

/** Sum of all pension/savings account balances (missing treated as 0), in ILS. */
export function aggregatePensionBalance(profile: ProfileData): number {
  return profile.pensionSavings.accounts.reduce(
    (sum, account) => sum + (account.totalAccumulatedBalance ?? 0),
    0,
  );
}

/**
 * Non-pension assets in ILS: the `otherAssets` catch-all (cash, bonds, real
 * estate, etc.) plus equity holdings (`quantity * currentMarketPriceUSD`,
 * converted at `FALLBACK_USD_TO_ILS_RATE` — see constants.ts, no live FX
 * feed yet).
 */
export function aggregateOtherBalance(profile: ProfileData): number {
  const otherAssets = profile.pensionSavings.otherAssets ?? 0;
  const equityTotal = profile.equity.holdings.reduce((sum, holding) => {
    const marketValueUSD = (holding.quantity ?? 0) * (holding.currentMarketPriceUSD ?? 0);
    return sum + marketValueUSD * FALLBACK_USD_TO_ILS_RATE;
  }, 0);
  return otherAssets + equityTotal;
}

/** Sums all balances currently known for the profile into a single "today" net worth figure, in ILS. */
export function aggregateCurrentNetWorth(profile: ProfileData): number {
  return aggregatePensionBalance(profile) + aggregateOtherBalance(profile);
}
