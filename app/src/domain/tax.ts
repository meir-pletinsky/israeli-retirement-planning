import type { Gender } from "../types";
import { TAX_RATES as RATES } from "./taxRates";

/**
 * One person's income tax in retirement, for one year at a steady monthly
 * rhythm (everything is a monthly amount in today's money).
 *
 * What is modelled (see docs/implementation-progress.md, Phase I):
 * - Pension income is taxed at the progressive brackets, less credit points.
 *   From the statutory retirement age part of it is exempt (Section 9A
 *   qualifying annuity).
 * - Real capital gains are taxed at a flat rate, outside the brackets.
 * - Surtax applies to income above the threshold, with an extra rate on the
 *   capital-income part.
 * - Bituach Leumi pensions and study-fund withdrawals are exempt and never
 *   reach this function.
 *
 * Not modelled: health insurance and Bituach Leumi contributions, other
 * credit points (children, new immigrants, ...), tax spreading and
 * coordination between spouses.
 */
export interface PersonTaxInput {
  /** Monthly income taxed as a pension: annuity payments and withdrawals from pension-like accounts. */
  pensionMonthly: number;
  /** True from the statutory retirement age, when the qualifying-annuity exemption applies. */
  exemptionApplies: boolean;
  /** Real gain realised each month on securities and investment provident funds. */
  capitalGainMonthly: number;
  /** Tax rate on that gain; the statutory rate unless the user entered another for a holding. */
  capitalGainsRate: number;
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

/**
 * The exempt part of a monthly qualifying annuity: the fixed share and the
 * conditional share (less the severance offset) of the pension up to the
 * ceiling, limited by the user's remaining allowance when they entered one.
 */
export function qualifyingAnnuityExemption(
  pensionMonthly: number,
  pastTaxFreeSeverance: number,
  monthlyExemptionCap: number | null,
): number {
  const covered = Math.min(Math.max(pensionMonthly, 0), RATES.qualifyingAnnuityMonthlyCeiling);
  const severanceOffset =
    (Math.max(pastTaxFreeSeverance, 0) * RATES.severanceExemptionFactor) /
    RATES.severanceExemptionMonths;
  const exempt =
    covered * RATES.qualifyingAnnuityFixedExemptionRate +
    Math.max(covered * RATES.qualifyingAnnuityConditionalExemptionRate - severanceOffset, 0);
  return monthlyExemptionCap === null ? exempt : Math.min(exempt, Math.max(monthlyExemptionCap, 0));
}

export function calculatePersonTax(input: PersonTaxInput): PersonTax {
  const pension = Math.max(input.pensionMonthly, 0);
  const capitalGain = Math.max(input.capitalGainMonthly, 0);

  const exemptPensionMonthly = input.exemptionApplies
    ? qualifyingAnnuityExemption(pension, input.pastTaxFreeSeverance, input.monthlyExemptionCap)
    : 0;
  const taxablePension = pension - exemptPensionMonthly;

  const credits = Math.max(input.creditPoints, 0) * RATES.creditPointMonthlyValue;
  const incomeTaxMonthly = Math.max(progressiveTax(taxablePension) - credits, 0);
  const capitalGainsTaxMonthly = capitalGain * Math.max(input.capitalGainsRate, 0);

  const surtaxExcess = Math.max(
    taxablePension + capitalGain - RATES.surtaxAnnualThreshold / 12,
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
    totalMonthly: incomeTaxMonthly + capitalGainsTaxMonthly + surtaxMonthly,
  };
}
