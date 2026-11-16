import type { BridgeMode } from "../types";
import type { HouseholdMember } from "./household";
import { defaultCreditPoints } from "./tax";
import { TAX_RATES } from "./taxRates";

/**
 * The years between a member's retirement and the first fixed income they receive (an account
 * annuity or the Bituach Leumi pension), when their taxable income is low. The tax-smart strategy
 * sells employer shares in these years. Returns the age the window ends at, or infinity when the
 * member has no such income to wait for.
 */
export function bridgeWindowEndAge(member: HouseholdMember): number {
  return bridgeWindowEnd(member).age;
}

/** `bridgeWindowEndAge` with the income that ends the window; the source is null when the window never ends. */
export function bridgeWindowEnd(member: HouseholdMember): {
  age: number;
  source: "annuity" | "bituachLeumi" | null;
} {
  const { claimAge, monthlyPension } = member.bituachLeumi;
  let end: { age: number; source: "annuity" | "bituachLeumi" | null } =
    monthlyPension > 0 ? { age: claimAge, source: "bituachLeumi" } : { age: Number.POSITIVE_INFINITY, source: null };
  for (const { annuity } of member.sources) {
    if (annuity && annuity.startAge < end.age) end = { age: annuity.startAge, source: "annuity" };
  }
  return end;
}

/** The member's credit points: their own when entered, otherwise the default for their gender. */
export function memberCreditPoints(member: HouseholdMember): number {
  const { creditPoints, gender } = member.profile.personal;
  return creditPoints ?? defaultCreditPoints(gender);
}

/**
 * The most monthly income that bears no income tax once the credit points are applied: the income
 * at which the tax of the brackets equals the credits.
 */
export function zeroTaxMonthlyIncome(creditPoints: number): number {
  const credits = Math.max(creditPoints, 0) * TAX_RATES.creditPointMonthlyValue;
  let tax = 0;
  let lower = 0;
  for (const { upTo, rate } of TAX_RATES.monthlyBrackets) {
    const bracketTax = (upTo - lower) * rate;
    if (tax + bracketTax >= credits) return lower + (credits - tax) / rate;
    tax += bracketTax;
    lower = upTo;
  }
  return lower;
}

/**
 * The monthly incomes of a member that a bridge year fills with ordinary income from share sales,
 * lowest first: no tax, then the first and second bracket. The mode picks how far to go; matching
 * the spending goes past the last one without a limit.
 */
export function bridgeIncomeLevels(mode: BridgeMode, creditPoints: number): number[] {
  const [first, second] = TAX_RATES.monthlyBrackets;
  const zero = zeroTaxMonthlyIncome(creditPoints);
  const tenPercent = Math.max(first.upTo, zero);
  const fourteenPercent = Math.max(second.upTo, tenPercent);
  switch (mode) {
    case "zeroTax":
      return [zero];
    case "bracket10":
      return [zero, tenPercent];
    case "bracket14":
      return [zero, tenPercent, fourteenPercent];
    case "matchSpending":
      return [zero, tenPercent, fourteenPercent, Number.POSITIVE_INFINITY];
  }
}
