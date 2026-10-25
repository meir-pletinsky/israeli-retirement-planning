import type { Assumptions, ProfileData } from "../types";
import {
  DEFAULT_CURRENT_AGE,
  DEFAULT_RETIREMENT_AGE,
  DELAYED_RETIREMENT_OFFSET_YEARS,
  EARLY_RETIREMENT_OFFSET_YEARS,
  FALLBACK_USD_TO_ILS_RATE,
  MAX_PLANNING_AGE,
  MIN_RETIREMENT_AGE,
} from "./constants";
import type { NetWorthPoint, RetirementScenario } from "./types";

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

/**
 * Sums all balances currently known for the profile into a single "today"
 * net worth figure, in ILS:
 * - Pension/savings accounts: `totalAccumulatedBalance` (missing treated as 0).
 * - `otherAssets` catch-all (cash, bonds, real estate, etc.).
 * - Equity holdings: `quantity * currentMarketPriceUSD`, converted at
 *   `FALLBACK_USD_TO_ILS_RATE` (see constants.ts — no live FX feed yet).
 */
export function aggregateCurrentNetWorth(profile: ProfileData): number {
  const pensionTotal = profile.pensionSavings.accounts.reduce(
    (sum, account) => sum + (account.totalAccumulatedBalance ?? 0),
    0,
  );
  const otherAssets = profile.pensionSavings.otherAssets ?? 0;
  const equityTotal = profile.equity.holdings.reduce((sum, holding) => {
    const marketValueUSD = (holding.quantity ?? 0) * (holding.currentMarketPriceUSD ?? 0);
    return sum + marketValueUSD * FALLBACK_USD_TO_ILS_RATE;
  }, 0);
  return pensionTotal + otherAssets + equityTotal;
}

/**
 * Projects net worth year-by-year from the user's current age through
 * `MAX_PLANNING_AGE`, entirely in today's money (real terms):
 * - Before retirement: balance grows at the real return rate (Phase 1 does
 *   not model ongoing contributions — there's no salary/contribution input
 *   in the current data model, only point-in-time balances).
 * - From retirement age onward: balance grows, then the desired retirement
 *   monthly expense (annualized) is withdrawn.
 * - Balance is floored at 0 (no borrowing/negative-net-worth modeling yet).
 */
export function projectNetWorth(
  profile: ProfileData,
  scenario: RetirementScenario = "standard",
): NetWorthPoint[] {
  const currentAge = resolveCurrentAge(profile);
  const retirementAge = resolveRetirementAge(profile, scenario);
  const rate = realAnnualReturnRate(profile.assumptions);
  const annualWithdrawal = (profile.expenses.retirementMonthly ?? 0) * 12;

  let balance = aggregateCurrentNetWorth(profile);
  const points: NetWorthPoint[] = [{ age: currentAge, netWorth: Math.round(balance) }];

  for (let age = currentAge + 1; age <= MAX_PLANNING_AGE; age += 1) {
    balance *= 1 + rate;
    if (age >= retirementAge) {
      balance -= annualWithdrawal;
    }
    balance = Math.max(balance, 0);
    points.push({ age, netWorth: Math.round(balance) });
  }

  return points;
}
