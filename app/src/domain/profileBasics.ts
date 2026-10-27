import type { Assumptions, PensionAccount, ProfileData, StockHolding } from "../types";
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
 * Whether the plan covers a spouse: the user is married and has entered the
 * spouse's age. Until then the spouse's data and accounts are ignored, so a
 * half-filled spouse form cannot change a single-person plan.
 */
export function isHouseholdActive(profile: ProfileData): boolean {
  return profile.personal.maritalStatus === "married" && profile.spouse.age !== null;
}

/** The spouse's age; only meaningful while `isHouseholdActive`. */
export function resolveSpouseCurrentAge(profile: ProfileData): number {
  return profile.spouse.age ?? DEFAULT_CURRENT_AGE;
}

/** Applies a scenario's offset to an entered retirement age. */
function shiftRetirementAge(standard: number, scenario: RetirementScenario): number {
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
  return shiftRetirementAge(profile.personal.retirementAge ?? DEFAULT_RETIREMENT_AGE, scenario);
}

/** The spouse's retirement age for a scenario; the same offsets apply as for the primary user. */
export function resolveSpouseRetirementAge(
  profile: ProfileData,
  scenario: RetirementScenario,
): number {
  return shiftRetirementAge(profile.spouse.retirementAge ?? DEFAULT_RETIREMENT_AGE, scenario);
}

/**
 * Whole years remaining until retirement under the given scenario (floored
 * at 0). For a couple this is when the later spouse retires, which is when
 * household spending starts to be drawn from savings.
 */
export function yearsToRetirement(
  profile: ProfileData,
  scenario: RetirementScenario = "standard",
): number {
  const own = Math.max(resolveRetirementAge(profile, scenario) - resolveCurrentAge(profile), 0);
  if (!isHouseholdActive(profile)) return own;
  const spouse = Math.max(
    resolveSpouseRetirementAge(profile, scenario) - resolveSpouseCurrentAge(profile),
    0,
  );
  return Math.max(own, spouse);
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

/** The primary user's own accounts. */
export function ownAccounts(profile: ProfileData): PensionAccount[] {
  return profile.pensionSavings.accounts.filter((account) => account.owner !== "spouse");
}

/** The spouse's accounts; empty unless the plan covers a spouse. */
export function spouseAccounts(profile: ProfileData): PensionAccount[] {
  return isHouseholdActive(profile)
    ? profile.pensionSavings.accounts.filter((account) => account.owner === "spouse")
    : [];
}

/** Every account the plan counts: the user's, plus the spouse's when the plan covers a spouse. */
export function accountsInPlan(profile: ProfileData): PensionAccount[] {
  return [...ownAccounts(profile), ...spouseAccounts(profile)];
}

/** Sum of all counted pension/savings account balances (missing treated as 0), in ILS. */
export function aggregatePensionBalance(profile: ProfileData): number {
  return accountsInPlan(profile).reduce(
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
  const equityTotal = profile.equity.holdings.reduce(
    (sum, holding) => sum + holdingValueIls(holding),
    0,
  );
  return otherAssets + equityTotal;
}

/** Market value of one equity holding in ILS (`quantity * currentMarketPriceUSD` at the fallback rate). */
export function holdingValueIls(holding: StockHolding): number {
  return (holding.quantity ?? 0) * (holding.currentMarketPriceUSD ?? 0) * FALLBACK_USD_TO_ILS_RATE;
}

/** Sums all balances currently known for the profile into a single "today" net worth figure, in ILS. */
export function aggregateCurrentNetWorth(profile: ProfileData): number {
  return aggregatePensionBalance(profile) + aggregateOtherBalance(profile);
}
