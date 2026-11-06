import type { ProfileData } from "../types";
import { futureValueOfMonthlyContributions, totalMonthlyContribution } from "./contributions";
import { simulateDrawdownForScenario, simulateHouseholdDrawdown } from "./drawdown";
import { desiredRetirementMonthly } from "./expenses";
import { buildHousehold, resolveRetirementTiming, selfProfileView } from "./household";
import {
  aggregateOtherBalance,
  aggregatePensionBalance,
  realAnnualReturnRate,
  resolveCurrentAge,
} from "./profileBasics";
import { UNMET_TOLERANCE } from "./spendingTest";
import { engineNowMs } from "./trace";
import type { NetWorthPoint, RetirementScenario } from "./types";
import { momentAfterYears } from "./vesting";

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
  const startingBalance =
    aggregatePensionBalance(own) +
    aggregateOtherBalance(own, momentAfterYears(engineNowMs(), years));
  const grownBalance = startingBalance * Math.pow(1 + rate, years);
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
  return simulateDrawdownForScenario(profile, scenario, desiredRetirementMonthly(profile.expenses) ?? 0).map(
    ({ age, netWorth }) => ({ age, netWorth: Math.round(netWorth) }),
  );
}

/** Whether the savings fund the spending the net-worth projection draws. */
export interface SpendingFunding {
  /** The monthly retirement spending the projection draws, today's money; 0 when none is entered. */
  monthlySpending: number;
  /** The primary user's age in the first year the usable savings cannot fund it; null when they can through the horizon. */
  shortfallAge: number | null;
}

/**
 * Where the spending that `projectNetWorth` draws first goes unfunded. The net-worth path
 * follows the planned spending, so it may run out of usable capital well before the planning
 * horizon, unlike the sustainable income (`retirementIncome.ts`), which is sized to last to it.
 */
export function projectSpendingFunding(
  profile: ProfileData,
  scenario: RetirementScenario = "standard",
): SpendingFunding {
  const monthlySpending = desiredRetirementMonthly(profile.expenses) ?? 0;
  if (monthlySpending <= 0) return { monthlySpending: 0, shortfallAge: null };
  const household = buildHousehold(profile, resolveRetirementTiming(profile, scenario));
  const rows = simulateHouseholdDrawdown(household, monthlySpending, { lean: true });
  const short = rows.find((row) => row.unmet > UNMET_TOLERANCE);
  return { monthlySpending, shortfallAge: short ? short.age : null };
}
