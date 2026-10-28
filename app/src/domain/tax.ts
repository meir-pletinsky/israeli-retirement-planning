import type { Gender } from "../types";
import { TAX_RATES as RATES } from "./taxRates";

/**
 * One person's income tax in retirement, for one year at a steady monthly
 * rhythm (everything is a monthly amount in today's money).
 *
 * What is modelled (see docs/implementation-progress.md, Phases I and L):
 * - Pension income is taxed at the progressive brackets, less credit points.
 *   From the statutory retirement age part of it is exempt (Section 9A
 *   qualifying annuity); the exempt share depends on the tax year.
 * - Before the statutory retirement age, a pension also bears health tax.
 * - Real capital gains are taxed at a flat rate, outside the brackets.
 * - Employer shares sold under Section 102 are split: the grant-date value is
 *   ordinary income, stacked on top of the pension at the brackets (no
 *   pension exemption); the rest is a capital gain. The ordinary part also
 *   bears health tax, and before the statutory retirement age Bituach Leumi
 *   contributions, up to the maximum insured income.
 * - Surtax applies to income above the threshold, with an extra rate on the
 *   capital-income part.
 * - Bituach Leumi pensions and study-fund withdrawals are exempt and never
 *   reach this function.
 *
 * Not modelled: health tax on income other than pension and Section 102
 * shares, contributions being tax-deductible, other credit points (children,
 * new immigrants, ...), tax spreading and coordination between spouses.
 */
export interface PersonTaxInput {
  /** Monthly income taxed as a pension: annuity payments and withdrawals from pension-like accounts. */
  pensionMonthly: number;
  /** True from the statutory retirement age, when the qualifying-annuity exemption applies. */
  exemptionApplies: boolean;
  /**
   * True before the statutory retirement age: a pension bears health tax, and
   * the ordinary part of Section 102 shares bears Bituach Leumi contributions.
   */
  beforeStatutoryAge: boolean;
  /** The calendar year the income falls in; selects the exemption share. */
  taxYear: number;
  /** Real gain realised each month on securities and investment provident funds. */
  capitalGainMonthly: number;
  /** Tax rate on that gain; the statutory rate unless the user entered another for a holding. */
  capitalGainsRate: number;
  /**
   * Monthly proceeds of employer shares that are ordinary income (Section
   * 102 grant-date value, or all of an ordinary-income sale). Taxed at the
   * brackets on top of the pension, with no pension exemption, and bearing
   * health tax and (before the statutory age) Bituach Leumi contributions.
   */
  ordinaryInvestmentMonthly: number;
  creditPoints: number;
  /** Tax-free severance already withdrawn, which shrinks the conditional exemption. */
  pastTaxFreeSeverance: number;
  /** The user's remaining monthly exemption from the rights fixation, when known. */
  monthlyExemptionCap: number | null;
}

export interface PersonTax {
  /** Pension that is exempt under Section 9A. */
  exemptPensionMonthly: number;
  /** Progressive income tax after credit points. */
  incomeTaxMonthly: number;
  capitalGainsTaxMonthly: number;
  surtaxMonthly: number;
  /**
   * Health tax on a pension paid before the statutory retirement age, and on
   * the ordinary part of Section 102 shares at any age.
   */
  healthTaxMonthly: number;
  /** Bituach Leumi contributions on the ordinary part of Section 102 shares, before the statutory age. */
  nationalInsuranceMonthly: number;
  totalMonthly: number;
}

/** Credit points when the user has not entered their own: 2.25 for a man, 2.75 for a woman. */
export function defaultCreditPoints(gender: Gender | null): number {
  return gender === "female" ? RATES.defaultCreditPointsWoman : RATES.defaultCreditPointsMan;
}

/** Tax on a monthly income at the progressive brackets, before credit points. */
export function progressiveTax(monthlyIncome: number): number {
  let tax = 0;
  let lower = 0;
  for (const { upTo, rate } of RATES.monthlyBrackets) {
    if (monthlyIncome <= lower) break;
    tax += (Math.min(monthlyIncome, upTo) - lower) * rate;
    lower = upTo;
  }
  return tax;
}

/** The first and last year of the exemption schedule, for the notes shown to the user. */
export const FIRST_EXEMPTION_YEAR = RATES.qualifyingAnnuityFixedExemptionSchedule[0].fromYear;
export const FINAL_EXEMPTION_YEAR =
  RATES.qualifyingAnnuityFixedExemptionSchedule[
    RATES.qualifyingAnnuityFixedExemptionSchedule.length - 1
  ].fromYear;

/** The fixed share of the qualifying-annuity exemption in `taxYear`. */
export function fixedExemptionRate(taxYear: number): number {
  const schedule = RATES.qualifyingAnnuityFixedExemptionSchedule;
  let rate: number = schedule[0].rate;
  for (const step of schedule) {
    if (taxYear >= step.fromYear) rate = step.rate;
  }
  return rate;
}

/** Fixed plus conditional share: the exempt part of a pension up to the ceiling, before any severance offset. */
export function totalExemptionRate(taxYear: number): number {
  return fixedExemptionRate(taxYear) + RATES.qualifyingAnnuityConditionalExemptionRate;
}

/**
 * The exempt part of a monthly qualifying annuity: the fixed share and the
 * conditional share (less the severance offset) of the pension up to the
 * ceiling, limited by the user's remaining allowance when they entered one.
 * The allowance is used as entered in every year, even though the shares
 * grow after 2026.
 */
export function qualifyingAnnuityExemption(
  pensionMonthly: number,
  pastTaxFreeSeverance: number,
  monthlyExemptionCap: number | null,
  taxYear: number,
): number {
  const covered = Math.min(Math.max(pensionMonthly, 0), RATES.qualifyingAnnuityMonthlyCeiling);
  const severanceOffset =
    (Math.max(pastTaxFreeSeverance, 0) * RATES.severanceExemptionFactor) /
    RATES.severanceExemptionMonths;
  const exempt =
    covered * fixedExemptionRate(taxYear) +
    Math.max(covered * RATES.qualifyingAnnuityConditionalExemptionRate - severanceOffset, 0);
  return monthlyExemptionCap === null ? exempt : Math.min(exempt, Math.max(monthlyExemptionCap, 0));
}

/** Health tax on a monthly pension paid before the statutory retirement age. */
export function earlyPensionHealthTax(pensionMonthly: number): number {
  const pension = Math.max(pensionMonthly, 0);
  const reduced = Math.min(pension, RATES.healthTaxReducedBracketMonthly);
  const full = pension - reduced;
  return reduced * RATES.healthTaxReducedRate + full * RATES.healthTaxFullRate;
}

/**
 * Health tax and Bituach Leumi contributions on `ordinaryMonthly` of Section
 * 102 income that sits above `startMonthly` of other contribution-bearing
 * income. Only the slice below the maximum insured income pays, and the
 * reduced rates apply to the part of the stack up to the reduced bracket.
 * Health tax is due at any age; Bituach Leumi only before the statutory
 * retirement age.
 */
export function employerShareContributions(
  startMonthly: number,
  ordinaryMonthly: number,
  beforeStatutoryAge: boolean,
): { nationalInsurance: number; health: number } {
  const ceiling = RATES.contributionCeilingMonthly;
  const bracket = RATES.healthTaxReducedBracketMonthly;
  const lower = Math.min(Math.max(startMonthly, 0), ceiling);
  const upper = Math.min(lower + Math.max(ordinaryMonthly, 0), ceiling);
  const reduced = Math.max(Math.min(upper, bracket) - Math.min(lower, bracket), 0);
  const full = upper - lower - reduced;
  return {
    nationalInsurance: beforeStatutoryAge
      ? reduced * RATES.nationalInsuranceReducedRate + full * RATES.nationalInsuranceFullRate
      : 0,
    health: reduced * RATES.healthTaxReducedRate + full * RATES.healthTaxFullRate,
  };
}

export function calculatePersonTax(input: PersonTaxInput): PersonTax {
  const pension = Math.max(input.pensionMonthly, 0);
  const capitalGain = Math.max(input.capitalGainMonthly, 0);
  const ordinaryInvestment = Math.max(input.ordinaryInvestmentMonthly, 0);

  const exemptPensionMonthly = input.exemptionApplies
    ? qualifyingAnnuityExemption(
        pension,
        input.pastTaxFreeSeverance,
        input.monthlyExemptionCap,
        input.taxYear,
      )
    : 0;
  const taxablePension = pension - exemptPensionMonthly;

  const credits = Math.max(input.creditPoints, 0) * RATES.creditPointMonthlyValue;
  const incomeTaxMonthly = Math.max(
    progressiveTax(taxablePension + ordinaryInvestment) - credits,
    0,
  );
  const capitalGainsTaxMonthly = capitalGain * Math.max(input.capitalGainsRate, 0);
  const pensionHealthTax = input.beforeStatutoryAge ? earlyPensionHealthTax(pension) : 0;
  const shareContributions = employerShareContributions(
    input.beforeStatutoryAge ? pension : 0,
    ordinaryInvestment,
    input.beforeStatutoryAge,
  );
  const healthTaxMonthly = pensionHealthTax + shareContributions.health;
  const nationalInsuranceMonthly = shareContributions.nationalInsurance;

  const surtaxExcess = Math.max(
    taxablePension + ordinaryInvestment + capitalGain - RATES.surtaxAnnualThreshold / 12,
    0,
  );
  const surtaxMonthly =
    surtaxExcess * RATES.surtaxRate +
    Math.min(capitalGain, surtaxExcess) * RATES.surtaxCapitalIncomeExtraRate;

  return {
    exemptPensionMonthly,
    incomeTaxMonthly,
    capitalGainsTaxMonthly,
    surtaxMonthly,
    healthTaxMonthly,
    nationalInsuranceMonthly,
    totalMonthly:
      incomeTaxMonthly +
      capitalGainsTaxMonthly +
      surtaxMonthly +
      healthTaxMonthly +
      nationalInsuranceMonthly,
  };
}
