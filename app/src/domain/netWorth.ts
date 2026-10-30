import type { ProfileData } from "../types";
import { futureValueOfMonthlyContributions, totalMonthlyContribution } from "./contributions";
import { simulateDrawdownForScenario } from "./drawdown";
import { selfProfileView } from "./household";
import {
  aggregateCurrentNetWorth,
  realAnnualReturnRate,
  resolveCurrentAge,
} from "./profileBasics";
import type { NetWorthPoint, RetirementScenario } from "./types";

export {
  aggregateCurrentNetWorth,
  aggregateOtherBalance,
  aggregatePensionBalance,
  holdingValueIls,
  isHouseholdActive,
  realAnnualReturnRate,
  resolveCurrentAge,
  resolveRetirementAge,
  usdToIlsRate,
  yearsToRetirement,
} from "./profileBasics";

/**
 * Projected balance (today's money) when the user reaches `targetAge`, before
 * any retirement withdrawals: current balances compounded at the real
 * return, plus ongoing monthly contributions (see `contributions.ts`) made
 * every year up to `targetAge`. Covers the primary user's own finances (a
 * spouse's accounts are excluded).
 */
export function projectBalanceAtAge(profile: ProfileData, targetAge: number): number {
  const own = selfProfileView(profile);
  const years = Math.max(targetAge - resolveCurrentAge(own), 0);
  const rate = realAnnualReturnRate(own.assumptions);
  const grownBalance = aggregateCurrentNetWorth(own) * Math.pow(1 + rate, years);
  return (
    grownBalance + futureValueOfMonthlyContributions(totalMonthlyContribution(own), rate, years)
  );
}

/**
 * Projects net worth year-by-year from the user's current age through
 * `MAX_PLANNING_AGE`, entirely in today's money (real terms):
 * - Until retirement age: balances grow at the real return rate and ongoing
 *   monthly contributions (salary x per-account rates, see `contributions.ts`)
 *   are added each year.
 * - From retirement age onward: balances grow, then the desired retirement
 *   monthly expense (annualized) is withdrawn, less the Bituach Leumi
 *   pension and any account annuities once they start. Only capital that is
 *   unlocked at that age can be spent (see `drawdown.ts` and `sources.ts`).
 *   Contributions stop.
 * - Balances are floored at 0 (no borrowing/negative-net-worth modeling yet).
 *
 * For a couple the points cover the whole household, drawing starts when the
 * later spouse retires, and the ages are the primary user's.
 */
export function projectNetWorth(
  profile: ProfileData,
  scenario: RetirementScenario = "standard",
): NetWorthPoint[] {
  return simulateDrawdownForScenario(profile, scenario, profile.expenses.retirementMonthly ?? 0).map(
    ({ age, netWorth }) => ({ age, netWorth: Math.round(netWorth) }),
  );
}
