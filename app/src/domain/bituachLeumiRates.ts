/**
 * Bituach Leumi (National Insurance) old-age pension parameters. These
 * change periodically, so every value here is tied to an effective date and
 * a source that the UI displays next to any estimate that uses them (see
 * docs/plan.md "Open Items to Validate").
 *
 * Amounts are monthly ILS for a single claimant. They are updated each
 * 1 January, mainly in line with the average wage; the engine works in
 * today's money, so the current amounts are used as-is for future years.
 *
 * Verified directly against btl.gov.il on 2026-10-26:
 * - Basic amounts: https://www.btl.gov.il/benefits/old_age/Shum/Pages/Shum.aspx
 * - Supplements:   https://www.btl.gov.il/benefits/old_age/Shum/Pages/Tosafot.aspx
 * - Ages:          https://www.btl.gov.il/benefits/old_age/Conditions_of_eligibility/gilMezake/Pages/gilPrisha.aspx
 * - Deferral:      https://www.btl.gov.il/benefits/old_age/Pages/t-dchiyatkitsba.aspx
 */
export const BITUACH_LEUMI_RATES = {
  /** Date the monetary amounts below took effect. */
  effectiveDate: "2026-01-01",
  sourceUrl: "https://www.btl.gov.il/benefits/old_age/Shum/Pages/Shum.aspx",

  /** Basic monthly old-age pension for a single person. */
  basicMonthlyPensionSingle: 1838,

  /** Seniority supplement: 2% of the basic pension per full insured year, capped at 50%. */
  seniorityRatePerYear: 0.02,
  seniorityMaxRate: 0.5,

  /** Deferral supplement: 5% of the full pension per year deferred because of work income. */
  deferralRatePerYear: 0.05,

  /** Statutory retirement age for men. Women's age depends on birth year (see `womenRetirementAge`). */
  maleRetirementAge: 67,
  /** From this age the pension is paid regardless of income, so it cannot be deferred further. */
  universalEligibilityAge: 70,

  /** Qualifying period: 144 insured months in total, or 60 months within the last 10 years. */
  qualifyingLifetimeMonths: 144,
  qualifyingRecentMonths: 60,
  qualifyingRecentWindowMonths: 120,

  /** Age from which insurance is assumed to start when the user has not entered insured years. */
  defaultInsuranceStartAge: 21,

  /**
   * Guaranteed minimum total monthly income (basic pension + supplements +
   * income supplement) for a single person under 70 with low other income.
   * Entitlement itself is means-tested, so this is only used as a hint.
   */
  incomeSupplementGuaranteeSingleUnder70: 4375,
} as const;

/** Women's statutory retirement age for those born in 1960-1969, in years (e.g. 62y 4m = 62.333). */
const WOMEN_RETIREMENT_AGE_BY_BIRTH_YEAR: Record<number, number> = {
  1960: 62 + 4 / 12,
  1961: 62 + 8 / 12,
  1962: 63,
  1963: 63 + 3 / 12,
  1964: 63 + 6 / 12,
  1965: 63 + 9 / 12,
  1966: 64,
  1967: 64 + 3 / 12,
  1968: 64 + 6 / 12,
  1969: 64 + 9 / 12,
};

/**
 * Women's retirement age by birth year. Born up to 1959 is treated as 62
 * and 1970 onward as 65. The official table is by birth month; every
 * change from 1960 on falls on a calendar-year boundary, so birth year is
 * exact for that range. Cohorts born before mid-1947 (aged 79+) had a
 * lower age and are not modelled.
 */
export function womenRetirementAge(birthYear: number): number {
  if (birthYear <= 1959) return 62;
  if (birthYear >= 1970) return 65;
  return WOMEN_RETIREMENT_AGE_BY_BIRTH_YEAR[birthYear];
}
