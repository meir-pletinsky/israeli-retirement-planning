/**
 * Israeli income-tax parameters used by the retirement tax estimate (see
 * `tax.ts`). Like the Bituach Leumi rates, every value is tied to an
 * effective date and a source that the UI shows next to the estimate (see
 * docs/plan.md, "Open Items to Validate").
 *
 * The engine works in today's money. Brackets, credit points, the exemption
 * ceiling and the health-tax bracket are CPI-indexed each January, so the
 * 2026 amounts are used as-is for future years. The surtax threshold is
 * frozen by law through 2027. The one thing that does change by calendar
 * year is the qualifying-annuity exemption rate (see
 * `qualifyingAnnuityFixedExemptionSchedule`).
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
 *   2026 (22.5% fixed + 35% conditional), 62.5% in 2027 and 67% from 2028
 *   (the fixed share steps 22% / 22.5% / 27.5% / 32% over 2025-2028).
 * - Health tax on an early pension (before the statutory retirement age):
 *   3.23% up to 7,703 a month and 5.17% above, read on btl.gov.il on
 *   2026-10-27. From the statutory retirement age no health tax is charged
 *   on a pension (secondary sources; the BTL page only describes the early
 *   pension).
 * - Section 102 (capital-gains route): the ordinary-income / capital-gain split,
 *   the 24-month holding period and the 25% rate come from an employer's plan
 *   supplement; the 30% rate for a substantial shareholder is not modelled.
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
   * Section 102 (employer shares held by a trustee, capital-gains route): the
   * shares must stay with the trustee this many years from the grant. A sale
   * before that is a disqualifying disposal, taxed entirely as ordinary income.
   */
  section102HoldingPeriodYears: 2,

  /**
   * Qualifying annuity (kitzva mezuka, Section 9A). From the statutory
   * retirement age, up to `qualifyingAnnuityMonthlyCeiling` of a person's
   * monthly pension is partly exempt: the fixed share always, the
   * conditional share reduced by tax-free severance already withdrawn.
   * Before that age the pension is fully taxable.
   */
  qualifyingAnnuityMonthlyCeiling: 9430,
  /**
   * The fixed share of the exemption by tax year (the "additional
   * exemption"). A year after the last entry keeps the last rate, and a year
   * before the first uses the first.
   */
  qualifyingAnnuityFixedExemptionSchedule: [
    { fromYear: 2025, rate: 0.22 },
    { fromYear: 2026, rate: 0.225 },
    { fromYear: 2027, rate: 0.275 },
    { fromYear: 2028, rate: 0.32 },
  ],
  qualifyingAnnuityConditionalExemptionRate: 0.35,
  /** Each tax-free severance shekel withdrawn cuts the conditional exemption by 1.35 / 180 a month. */
  severanceExemptionFactor: 1.35,
  severanceExemptionMonths: 180,

  /**
   * Health tax withheld from a pension paid before the statutory retirement
   * age: the reduced rate on the part up to the bracket, the full rate above.
   */
  healthTaxReducedBracketMonthly: 7703,
  healthTaxReducedRate: 0.0323,
  healthTaxFullRate: 0.0517,
} as const;
