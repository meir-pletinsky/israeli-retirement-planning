/**
 * Access (liquidity) rules for Israeli savings products: when each product's
 * money can be used for retirement spending. Same pattern as
 * `bituachLeumiRates.ts` — everything a person could verify or a later year
 * could change lives here, with the as-of date and a verification caveat.
 *
 * Verification status (as of 2026-10-26): the primary sources (gov.il,
 * kolzchut.org.il) could not be fetched when these rules were validated, so
 * they are cross-checked from secondary sources only (Bizportal, btl.gov.il,
 * nevo.co.il). Confidence is High for the rules modelled below. Rules that
 * could NOT be verified, and are therefore deliberately not modelled:
 * - the minimum-pension threshold for pension funds (reported as 32.5% of the
 *   average wage; the regulation text was not verified);
 * - the study-fund 3-year exception for retirement age (the exact age was not
 *   verified);
 * - official annuity conversion factor tables (no defaults are hard-coded;
 *   only a factor the user enters is used);
 * - the early-withdrawal penalty tax (a Phase 3 tax-module matter).
 */
export const ACCESS_RULES = {
  /** The date the rules below were last validated. */
  asOf: "2026-10-26",
  /**
   * Earliest age money in a pension fund, managers insurance policy or
   * provident fund (kitzba) can be drawn without an unlawful-withdrawal
   * penalty. The same for men and women.
   */
  earliestAnnuityAge: 60,
  /**
   * Earliest age an investment provident fund (gemel le-hashkaa) can be moved into a paying fund
   * and taken as a tax-free life annuity (rule U, `docs/constants-to-verify.md`). Taking the
   * money as a lump sum at any age stays possible and is taxed on its real gain. The legal basis
   * is not confirmed: the rule comes from secondary sources.
   */
  investmentGemelAnnuityAge: 60,
  /** Years from the first deposit until a study fund (keren hishtalmut) is liquid. */
  studyFundLiquidityYears: 6,
  /**
   * Investment provident funds (gemel le-hashkaa) are withdrawable at any
   * time, so their unlock age is 0 (always accessible).
   */
  alwaysAccessibleAge: 0,
} as const;

/**
 * How long the risk cover of a pension fund or managers insurance lasts after
 * the deposits stop (rule V, `docs/constants-to-verify.md`). Secondary sources
 * only, Medium confidence: the exact periods are policy-specific (a managers
 * insurance may give 3 months, not 5), so the user's own fund bylaws win.
 */
export const COVER_RULES = {
  /** Months after the last deposit in which the cover goes on at no charge. */
  freeExtensionMonths: 5,
  /** Months after the last deposit to which an insurance arrangement (hesder bituach) can extend it, at a cost. */
  arrangementMonths: 24,
} as const;
