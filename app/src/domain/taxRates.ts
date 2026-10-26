/**
 * Israeli income-tax parameters used by the retirement tax estimate (see
 * `tax.ts`). Like the Bituach Leumi rates, every value is tied to an
 * effective date and a source that the UI shows next to the estimate (see
 * docs/plan.md, "Open Items to Validate").
 *
 * The engine works in today's money. Brackets, credit points and the
 * exemption ceiling are CPI-indexed each January, so the 2026 amounts are
 * used as-is for future years. The surtax threshold is frozen by law through
 * 2027, and the retirement-income exemption rate rises after 2026 (see
 * `qualifyingAnnuityExemptionRate`); that schedule is not modelled.
 *
 * Cross-checked against secondary sources (MSL, Ovdimly, Efraty, ig-tax,
 * israeltax.org). The Tax Authority's own pages (gov.il, taxes.gov.il) refuse
 * automated requests, so confirm against
 * https://www.gov.il/he/departments/israel_tax_authority before relying on
 * the figures:
 * - Brackets 2026: widened by legislation published in March 2026, retroactive
 *   to 1 January. The 35% bracket ends at 46,690 per month (the 53,970 seen in
 *   older material is the 2022-23 value).
 * - Surtax: +3% above 721,560 a year; since 2025 a further +2% applies to the
 *   part of capital income above the threshold.
 * - Qualifying annuity (Section 9A): ceiling 9,430 a month; exemption 57.5% in
 *   2026 (22.5% fixed + 35% conditional), rising to 62.5% in 2027 and 67% in 2028.
 */
export const TAX_RATES = {
  /** Date the monetary amounts below took effect. */
  effectiveDate: "2026-01-01",
  sourceUrl: "https://www.gov.il/he/departments/israel_tax_authority",

  /**
   * Progressive brackets for income from personal effort, as monthly upper
   * limits; the last bracket is open-ended. Applied to income / 12 so every
   * monthly figure in the engine is taxed on the same scale.
   */
  monthlyBrackets: [
    { upTo: 7010, rate: 0.1 },
    { upTo: 10060, rate: 0.14 },
    { upTo: 19000, rate: 0.2 },
    { upTo: 25100, rate: 0.31 },
    { upTo: 46690, rate: 0.35 },
    { upTo: Number.POSITIVE_INFINITY, rate: 0.47 },
  ],

  /** Value of one credit point, per month. A resident man gets 2.25 points, a woman 2.75. */
  creditPointMonthlyValue: 242,
  defaultCreditPointsMan: 2.25,
  defaultCreditPointsWoman: 2.75,

  /** Surtax: +3% on all income above this annual amount. */
  surtaxAnnualThreshold: 721560,
  surtaxRate: 0.03,
  /** From 2025, a further +2% on the part of capital income above the threshold. */
  surtaxCapitalIncomeExtraRate: 0.02,

  /** Flat tax on the real (inflation-adjusted) gain of securities and investment provident funds. */
  capitalGainsRate: 0.25,

  /**
   * Qualifying annuity (kitzva mezuka, Section 9A). From the statutory
   * retirement age, up to `qualifyingAnnuityMonthlyCeiling` of a person's
   * monthly pension is partly exempt: the fixed share always, the
   * conditional share reduced by tax-free severance already withdrawn.
   * Before that age the pension is fully taxable.
   */
  qualifyingAnnuityMonthlyCeiling: 9430,
  qualifyingAnnuityFixedExemptionRate: 0.225,
  qualifyingAnnuityConditionalExemptionRate: 0.35,
  /** Each tax-free severance shekel withdrawn cuts the conditional exemption by 1.35 / 180 a month. */
  severanceExemptionFactor: 1.35,
  severanceExemptionMonths: 180,
} as const;
