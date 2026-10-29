import type { DrawdownHolding } from "./drawdown";
import type { Household } from "./household";
import {
  calculatePersonTax,
  defaultCreditPoints,
  type PersonTax,
  type PersonTaxInput,
} from "./tax";
import { TAX_RATES } from "./taxRates";

/** One holding's share of a year's draw from savings. */
export interface YearDraw {
  holding: DrawdownHolding;
  amount: number;
}

/**
 * What one member's monthly income in one year is made of, split by how it is
 * taxed. The last four fields only break the first two down, for the trace.
 */
export interface MemberIncome {
  pensionMonthly: number;
  ordinaryInvestmentMonthly: number;
  capitalGainMonthly: number;
  capitalGainsTax: number;
  annuityPension: number;
  pensionDraws: number;
  ordinaryDraws: number;
  shareOrdinary: number;
}

/**
 * The income a member has in one year: their account annuities (`annuities`
 * are that year's holdings) plus their part of the draw from savings.
 */
export function memberIncome(
  memberIndex: number,
  annuities: DrawdownHolding[],
  draws: YearDraw[],
): MemberIncome {
  const income: MemberIncome = {
    pensionMonthly: 0,
    ordinaryInvestmentMonthly: 0,
    capitalGainMonthly: 0,
    capitalGainsTax: 0,
    annuityPension: 0,
    pensionDraws: 0,
    ordinaryDraws: 0,
    shareOrdinary: 0,
  };
  for (const holding of annuities) {
    if (holding.memberIndex === memberIndex && holding.treatment === "pension") {
      income.pensionMonthly += holding.annuityMonthly;
      income.annuityPension += holding.annuityMonthly;
    }
  }
  for (const { holding, amount } of draws) {
    if (holding.memberIndex !== memberIndex) continue;
    if (holding.treatment === "pension") {
      income.pensionMonthly += amount;
      income.pensionDraws += amount;
    } else if (holding.treatment === "ordinaryIncome") {
      income.ordinaryInvestmentMonthly += amount;
      income.ordinaryDraws += amount;
    } else if (holding.treatment === "capitalGains") {
      const ordinary = amount * holding.ordinaryFraction;
      income.ordinaryInvestmentMonthly += ordinary;
      income.shareOrdinary += ordinary;
      const gain = amount * holding.gainFraction;
      income.capitalGainMonthly += gain;
      income.capitalGainsTax += gain * holding.capitalGainsTaxRate;
    }
  }
  return income;
}

/** Whether the member has reached their statutory retirement age `yearsFromNow` years from now. */
export function pastStatutoryAgeIn(household: Household, memberIndex: number, yearsFromNow: number) {
  const member = household.members[memberIndex];
  return member.currentAge + yearsFromNow >= member.bituachLeumi.statutoryRetirementAge;
}

/** The input of the person-tax calculation for one member and year. */
export function personTaxInput(
  household: Household,
  memberIndex: number,
  yearsFromNow: number,
  income: MemberIncome,
): PersonTaxInput {
  const { personal, taxExemptionBasket } = household.members[memberIndex].profile;
  const pastStatutoryAge = pastStatutoryAgeIn(household, memberIndex, yearsFromNow);
  return {
    pensionMonthly: income.pensionMonthly,
    exemptionApplies: pastStatutoryAge,
    beforeStatutoryAge: !pastStatutoryAge,
    taxYear: household.baseYear + yearsFromNow,
    ordinaryInvestmentMonthly: income.ordinaryInvestmentMonthly,
    capitalGainMonthly: income.capitalGainMonthly,
    capitalGainsRate:
      income.capitalGainMonthly > 0
        ? income.capitalGainsTax / income.capitalGainMonthly
        : TAX_RATES.capitalGainsRate,
    creditPoints: personal.creditPoints ?? defaultCreditPoints(personal.gender),
    pastTaxFreeSeverance: taxExemptionBasket.pastTaxFreeSeveranceWithdrawn ?? 0,
    monthlyExemptionCap: taxExemptionBasket.remainingMonthlyExemptionCap,
  };
}

/** The tax a household member pays in one year, from the holdings that year's income comes out of. */
export function memberTax(
  household: Household,
  memberIndex: number,
  yearsFromNow: number,
  annuities: DrawdownHolding[],
  draws: YearDraw[],
): PersonTax {
  return calculatePersonTax(
    personTaxInput(household, memberIndex, yearsFromNow, memberIncome(memberIndex, annuities, draws)),
  );
}
