import type { ProfileData } from "../types";
import { PAYMENT_SOURCES, simulateHouseholdDrawdown, type DrawdownHolding } from "./drawdown";
import {
  buildHousehold,
  resolveRetirementTiming,
  retirementTimingAtAge,
  type Household,
  type RetirementTiming,
} from "./household";
import { estimateHouseholdRetirementIncome } from "./retirementIncome";
import { calculatePersonTax, defaultCreditPoints } from "./tax";
import { TAX_RATES } from "./taxRates";
import type { RetirementScenario } from "./types";

/** One retirement year's income before and after tax, per month in today's money. */
export interface NetIncomeYear {
  /** The primary user's age. */
  age: number;
  grossMonthly: number;
  taxMonthly: number;
  netMonthly: number;
}

export interface NetIncomeEstimate {
  /** Gross income in the year with the lowest net income. */
  grossMonthlyIncome: number;
  /** Tax in that year (income tax, health tax, capital gains tax and surtax, summed over both spouses). */
  taxMonthly: number;
  /**
   * The lowest net monthly income of any retirement year: what the household
   * can count on every year. Equals the gross income when nothing is taxed.
   */
  netMonthlyIncome: number;
  /** `taxMonthly / grossMonthlyIncome`; 0 when there is no income. */
  effectiveTaxRate: number;
  /** The primary user's age in the year with the lowest net income; null when there is no income. */
  lowestNetAge: number | null;
  /** Every year from the household's retirement to the planning horizon. */
  years: NetIncomeYear[];
  /** The calendar year the plan counts from; the tax rules of that year apply to year zero. */
  baseYear: number;
}

/** The income tax a household member pays in one year, from the holdings that year's income comes out of. */
function memberTaxMonthly(
  household: Household,
  memberIndex: number,
  yearsFromNow: number,
  annuities: DrawdownHolding[],
  draws: { holding: DrawdownHolding; amount: number }[],
): number {
  const member = household.members[memberIndex];
  const { personal, taxExemptionBasket } = member.profile;

  let pensionMonthly = 0;
  let ordinaryInvestmentMonthly = 0;
  let capitalGainMonthly = 0;
  let capitalGainsTax = 0;
  for (const holding of annuities) {
    if (holding.memberIndex === memberIndex && holding.treatment === "pension") {
      pensionMonthly += holding.annuityMonthly;
    }
  }
  for (const { holding, amount } of draws) {
    if (holding.memberIndex !== memberIndex) continue;
    if (holding.treatment === "pension") {
      pensionMonthly += amount;
    } else if (holding.treatment === "ordinaryIncome") {
      ordinaryInvestmentMonthly += amount;
    } else if (holding.treatment === "capitalGains") {
      ordinaryInvestmentMonthly += amount * holding.ordinaryFraction;
      const gain = amount * holding.gainFraction;
      capitalGainMonthly += gain;
      capitalGainsTax += gain * holding.capitalGainsTaxRate;
    }
  }

  const pastStatutoryAge =
    member.currentAge + yearsFromNow >= member.bituachLeumi.statutoryRetirementAge;

  return calculatePersonTax({
    pensionMonthly,
    exemptionApplies: pastStatutoryAge,
    beforeStatutoryAge: !pastStatutoryAge,
    taxYear: household.baseYear + yearsFromNow,
    ordinaryInvestmentMonthly,
    capitalGainMonthly,
    capitalGainsRate:
      capitalGainMonthly > 0 ? capitalGainsTax / capitalGainMonthly : TAX_RATES.capitalGainsRate,
    creditPoints: personal.creditPoints ?? defaultCreditPoints(personal.gender),
    pastTaxFreeSeverance: taxExemptionBasket.pastTaxFreeSeveranceWithdrawn ?? 0,
    monthlyExemptionCap: taxExemptionBasket.remainingMonthlyExemptionCap,
  }).totalMonthly;
}

/**
 * Turns the gross retirement plan of a household into net income by taxing
 * each spouse separately, year by year. The plan itself (see
 * `retirementIncome.ts` and `drawdown.ts`) is unchanged: the household draws
 * the same gross amount, and tax comes out of it.
 *
 * Each year's income is the fixed streams plus the draw from savings, which
 * is split over the unlocked sources in proportion to their balances, as in
 * the income breakdown. Per owner:
 * - Bituach Leumi pensions and study-fund money are tax-free.
 * - Account annuities and withdrawals from pension-like accounts are pension
 *   income: brackets and credit points. From the statutory retirement age the
 *   Section 9A exemption applies, at the share set for that calendar year
 *   (`household.baseYear` plus the years from now); before it, the pension
 *   bears health tax instead.
 * - Withdrawals from investment provident funds and other investments are
 *   taxed only on their real gain, at a flat rate.
 * - Employer shares follow their tax route (see `employerStockRoute`): under
 *   Section 102 the grant-date value of the shares sold is ordinary income
 *   at the brackets, stacked on the pension, and the growth above it is a
 *   flat-rate gain; an ordinary-income route is taxed at the brackets in
 *   full. The ordinary part also bears health tax and, before the statutory
 *   age, Bituach Leumi contributions.
 *
 * Spouses are taxed on their own income; the draw is not shifted between
 * them to save tax. When the last capital is used up, the previous year's mix
 * is kept, like the income breakdown does.
 */
export function estimateNetIncomeForHousehold(household: Household): NetIncomeEstimate {
  const { monthlyIncomeTodayMoney } = estimateHouseholdRetirementIncome(household);
  const rows = simulateHouseholdDrawdown(household, monthlyIncomeTodayMoney);

  const years: NetIncomeYear[] = [];
  let drawHoldings = rows[0].holdings;
  for (let index = Math.ceil(household.retirementYears); index < rows.length; index += 1) {
    const row = rows[index];
    if (row.holdings.some((holding) => holding.capitalShare > 0)) {
      drawHoldings = row.holdings;
    }

    const streamsTotal = PAYMENT_SOURCES.reduce((sum, band) => sum + row.streams[band], 0);
    const fromSavings = Math.max(monthlyIncomeTodayMoney - streamsTotal, 0);
    const draws = drawHoldings.map((holding) => ({
      holding,
      amount: fromSavings * holding.capitalShare,
    }));

    const taxMonthly = Math.round(
      household.members.reduce(
        (sum, _member, memberIndex) =>
          sum + memberTaxMonthly(household, memberIndex, row.yearsFromNow, row.holdings, draws),
        0,
      ),
    );
    const grossMonthly = Math.round(streamsTotal + fromSavings);
    years.push({
      age: row.age,
      grossMonthly,
      taxMonthly,
      netMonthly: grossMonthly - taxMonthly,
    });
  }

  const lowest = years.reduce<NetIncomeYear | null>(
    (best, year) => (best === null || year.netMonthly < best.netMonthly ? year : best),
    null,
  );
  if (lowest === null || lowest.grossMonthly <= 0) {
    return {
      grossMonthlyIncome: 0,
      taxMonthly: 0,
      netMonthlyIncome: 0,
      effectiveTaxRate: 0,
      lowestNetAge: null,
      years,
      baseYear: household.baseYear,
    };
  }
  return {
    grossMonthlyIncome: lowest.grossMonthly,
    taxMonthly: lowest.taxMonthly,
    netMonthlyIncome: lowest.netMonthly,
    effectiveTaxRate: lowest.taxMonthly / lowest.grossMonthly,
    lowestNetAge: lowest.age,
    years,
    baseYear: household.baseYear,
  };
}

/** `estimateNetIncomeForHousehold` for the given retirement ages. */
export function estimateNetIncomeForTiming(
  profile: ProfileData,
  timing: RetirementTiming,
): NetIncomeEstimate {
  return estimateNetIncomeForHousehold(buildHousehold(profile, timing));
}

/** `estimateNetIncomeForTiming` with the primary user retiring at `retirementAge` (a spouse retires at the same moment). */
export function estimateNetIncomeAtAge(
  profile: ProfileData,
  retirementAge: number,
): NetIncomeEstimate {
  return estimateNetIncomeForTiming(profile, retirementTimingAtAge(profile, retirementAge));
}

/** `estimateNetIncomeForTiming` at the retirement ages implied by `scenario`. */
export function estimateNetIncome(
  profile: ProfileData,
  scenario: RetirementScenario = "standard",
): NetIncomeEstimate {
  return estimateNetIncomeForTiming(profile, resolveRetirementTiming(profile, scenario));
}
