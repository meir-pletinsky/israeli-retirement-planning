import type { Gender, ProfileData } from "../types";
import { BITUACH_LEUMI_RATES as RATES, womenRetirementAge } from "./bituachLeumiRates";
import { DEFAULT_CURRENT_AGE } from "./constants";
import type { BituachLeumiEstimate } from "./types";

/**
 * Statutory retirement age (gil prisha). Men: 67. Women: 62-65 by birth
 * year. Unknown gender falls back to the men's age, the later and so more
 * conservative of the two.
 */
export function statutoryRetirementAge(gender: Gender | null, birthYear: number): number {
  return gender === "female" ? womenRetirementAge(birthYear) : RATES.maleRetirementAge;
}

/**
 * Estimates the Bituach Leumi old-age pension for someone who stops working
 * at `retirementAge`, in today's money.
 *
 * - Claim age: the statutory retirement age, or `retirementAge` when later
 *   (the pension is then assumed deferred because of work income), capped at
 *   the universal eligibility age of 70.
 * - Seniority supplement: 2% per full insured year, up to 50%.
 * - Deferral supplement: 5% per full year between the statutory age and the
 *   claim age.
 * - Insurance accrues until the earlier of retirement and claim. Without an
 *   entered figure, insurance is assumed continuous since age 21.
 * - Eligibility: 144 insured months in total, or 60 months in the last 10
 *   years before the claim age.
 *
 * Not modelled: the earnings test between the statutory age and 70, child
 * supplements, and the means-tested income supplement. The spouse supplement
 * is added by the household layer (see `household.ts`).
 *
 * `referenceYear` is injectable so tests do not depend on the clock.
 */
export function estimateBituachLeumiPension(
  profile: ProfileData,
  retirementAge: number,
  referenceYear: number = new Date().getFullYear(),
): BituachLeumiEstimate {
  const { bituachLeumi, personal } = profile;
  const currentAge = personal.age ?? DEFAULT_CURRENT_AGE;
  const birthYear = referenceYear - Math.floor(currentAge);
  const statutoryAge = statutoryRetirementAge(personal.gender, birthYear);
  const claimAge = Math.min(
    Math.max(statutoryAge, retirementAge),
    RATES.universalEligibilityAge,
  );

  const insuredYearsToDate =
    bituachLeumi.insuredYearsToDate ?? Math.max(currentAge - RATES.defaultInsuranceStartAge, 0);
  const insuranceEndAge = Math.min(retirementAge, claimAge);
  const insuredYearsAtClaim =
    insuredYearsToDate + Math.max(insuranceEndAge - currentAge, 0);

  const insuredMonths = Math.floor(insuredYearsAtClaim * 12);
  const monthsSinceInsuranceEnded = Math.max(claimAge - insuranceEndAge, 0) * 12;
  const recentMonths = Math.min(
    insuredMonths,
    Math.max(RATES.qualifyingRecentWindowMonths - monthsSinceInsuranceEnded, 0),
  );
  const eligible =
    insuredMonths >= RATES.qualifyingLifetimeMonths ||
    recentMonths >= RATES.qualifyingRecentMonths;

  const seniorityRate = Math.min(
    RATES.seniorityRatePerYear * Math.floor(insuredYearsAtClaim),
    RATES.seniorityMaxRate,
  );
  const deferralRate = RATES.deferralRatePerYear * Math.floor(Math.max(claimAge - statutoryAge, 0));

  const overrideAmount =
    bituachLeumi.monthlyPensionOverride !== null && bituachLeumi.monthlyPensionOverride > 0
      ? bituachLeumi.monthlyPensionOverride
      : null;
  const calculatedPension = eligible
    ? RATES.basicMonthlyPensionSingle * (1 + seniorityRate) * (1 + deferralRate)
    : 0;

  const monthlyPension = !bituachLeumi.includeInProjection
    ? 0
    : Math.round(overrideAmount ?? calculatedPension);

  return {
    included: bituachLeumi.includeInProjection,
    eligible: overrideAmount !== null || eligible,
    source: overrideAmount !== null ? "override" : "calculated",
    statutoryRetirementAge: statutoryAge,
    claimAge,
    insuredYearsAtClaim: Math.floor(insuredYearsAtClaim),
    seniorityRate,
    deferralRate,
    monthlyPension,
    spouseSupplement: null,
  };
}

/**
 * The income-supplement guarantee is a minimum total income for people with
 * low other income. Returns true when the projected total retirement income
 * is below it, i.e. they may qualify (subject to a means test). A couple is
 * compared against the couple guarantee.
 */
export function mayQualifyForIncomeSupplement(
  totalMonthlyIncome: number,
  isCouple: boolean = false,
): boolean {
  return (
    totalMonthlyIncome <
    (isCouple
      ? RATES.incomeSupplementGuaranteeCouple
      : RATES.incomeSupplementGuaranteeSingleUnder70)
  );
}
