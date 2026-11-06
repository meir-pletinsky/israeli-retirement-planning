import {
  ASSUMPTION_PRESET_KEYS,
  ASSUMPTION_PRESETS,
  type Assumptions,
  type AssumptionPreset,
  type PensionAccount,
  type ProfileData,
  type StockHolding,
} from "../types";
import { aggregateBankDepositsBalance } from "./bankDeposits";
import {
  DEFAULT_CURRENT_AGE,
  DEFAULT_RETIREMENT_AGE,
  DELAYED_RETIREMENT_OFFSET_YEARS,
  EARLY_RETIREMENT_OFFSET_YEARS,
  FALLBACK_USD_TO_ILS_RATE,
  MIN_RETIREMENT_AGE,
} from "./constants";
import { engineNowMs } from "./trace";
import type { RetirementScenario } from "./types";
import { quantityAtRetirement, vestedQuantityAt } from "./vesting";

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
      // Never later than the entered age itself, even when that is below the floor.
      return Math.min(standard, Math.max(MIN_RETIREMENT_AGE, standard - EARLY_RETIREMENT_OFFSET_YEARS));
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

/** When one person retires: the age, and the whole years from now (floored at 0). */
export interface PersonRetirementTiming {
  retirementAge: number;
  yearsToGo: number;
}

export interface RetirementWhen {
  self: PersonRetirementTiming;
  /** Null unless the plan covers a spouse (see `isHouseholdActive`). */
  spouse: PersonRetirementTiming | null;
  /** Until the later of the two retires; the years `yearsToRetirement` reports. */
  householdYears: number;
}

/** When each person retires under the given scenario, and when the household as a whole does. */
export function retirementWhen(
  profile: ProfileData,
  scenario: RetirementScenario = "standard",
): RetirementWhen {
  const retirementAge = resolveRetirementAge(profile, scenario);
  const self = {
    retirementAge,
    yearsToGo: Math.max(retirementAge - resolveCurrentAge(profile), 0),
  };
  if (!isHouseholdActive(profile)) return { self, spouse: null, householdYears: self.yearsToGo };
  const spouseRetirementAge = resolveSpouseRetirementAge(profile, scenario);
  const spouse = {
    retirementAge: spouseRetirementAge,
    yearsToGo: Math.max(spouseRetirementAge - resolveSpouseCurrentAge(profile), 0),
  };
  return { self, spouse, householdYears: Math.max(self.yearsToGo, spouse.yearsToGo) };
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
  return retirementWhen(profile, scenario).householdYears;
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
 * The preset whose return and inflation the plan currently uses, or "custom" once either was
 * changed by hand. Volatility is not part of a preset, so changing it never leaves "Base".
 * Derived from the values, so a hand-edit, an inflation figure picked from the Bureau of
 * Statistics list or an imported file can never leave a preset wrongly marked.
 */
export function matchingPreset(assumptions: Assumptions): AssumptionPreset | "custom" {
  const same = (a: number, b: number) => Math.abs(a - b) < 1e-9;
  return (
    ASSUMPTION_PRESET_KEYS.find(
      (key) =>
        same(assumptions.investmentReturnPct, ASSUMPTION_PRESETS[key].investmentReturnPct) &&
        same(assumptions.inflationPct, ASSUMPTION_PRESETS[key].inflationPct),
    ) ?? "custom"
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
 * converted at the profile's USD to ILS rate, see `usdToIlsRate`) plus bank
 * deposits (see `bankDepositValueIls`).
 *
 * Employer-granted shares count only the batches the owner has. Without
 * `retirementMs` those are the batches vested by now; with it, the batches
 * counted for an owner retiring then (vested by then, or kept by a grant that
 * keeps vesting after leaving). Unvested shares that would be lost are left out.
 */
export function aggregateOtherBalance(
  profile: ProfileData,
  retirementMs: number | null = null,
): number {
  const otherAssets = profile.pensionSavings.otherAssets ?? 0;
  const rate = usdToIlsRate(profile);
  const nowMs = engineNowMs();
  const equityTotal = profile.equity.holdings.reduce(
    (sum, holding) =>
      sum +
      holdingValueIls(
        holding,
        rate,
        retirementMs === null
          ? vestedQuantityAt(holding, nowMs)
          : quantityAtRetirement(holding, retirementMs),
      ),
    0,
  );
  const bankDepositsTotal = aggregateBankDepositsBalance(
    profile.bankDeposits,
    profile.assumptions.inflationPct,
    nowMs,
  );
  return otherAssets + equityTotal + bankDepositsTotal;
}

/**
 * Shekels per US dollar for valuing the equity holdings: the profile's rate
 * (the Bank of Israel's, or one the user typed), else the built-in fallback.
 */
export function usdToIlsRate(profile: ProfileData): number {
  const rate = profile.equity.usdToIlsRate;
  return typeof rate === "number" && Number.isFinite(rate) && rate > 0
    ? rate
    : FALLBACK_USD_TO_ILS_RATE;
}

/** Market value in ILS of `quantity` shares of a holding (all of it by default) at `rate` shekels per dollar. */
export function holdingValueIls(
  holding: StockHolding,
  rate: number,
  quantity: number = holding.quantity ?? 0,
): number {
  return quantity * (holding.currentMarketPriceUSD ?? 0) * rate;
}

/** Sums all balances currently known for the profile into a single "today" net worth figure, in ILS. Unvested employer shares are not counted. */
export function aggregateCurrentNetWorth(profile: ProfileData): number {
  return aggregatePensionBalance(profile) + aggregateOtherBalance(profile);
}
