import type { ProfileData } from "../types";
import { MAX_RETIREMENT_SEARCH_AGE } from "./constants";
import { calculateFundingGapAtAge } from "./fundingGap";
import { resolveCurrentAge } from "./netWorth";
import type { RetirementFeasibility } from "./types";

/**
 * Finds the earliest whole retirement age (from the user's current age up
 * to `MAX_RETIREMENT_SEARCH_AGE`) at which the funding gap is non-negative,
 * i.e. the projected balance can sustain the desired retirement expenses.
 *
 * Scans upward and returns the first feasible age rather than bisecting:
 * the gap isn't guaranteed monotonic in retirement age (e.g. with a negative
 * real return, waiting erodes balances), so a linear scan is the only way to
 * be sure the answer is truly the earliest.
 *
 * Without a positive `expenses.retirementMonthly` there is no target to
 * solve against, so the result is `noTarget` instead of a meaningless "now".
 */
export function findEarliestFeasibleRetirementAge(profile: ProfileData): RetirementFeasibility {
  const desiredMonthlyExpenses = profile.expenses.retirementMonthly ?? 0;
  if (desiredMonthlyExpenses <= 0) {
    return { status: "noTarget", earliestAge: null, yearsFromNow: null };
  }

  const currentAge = resolveCurrentAge(profile);
  const startAge = Math.ceil(currentAge);
  const endAge = Math.max(MAX_RETIREMENT_SEARCH_AGE, startAge);

  for (let age = startAge; age <= endAge; age += 1) {
    if (calculateFundingGapAtAge(profile, age).status === "onTrack") {
      return { status: "feasible", earliestAge: age, yearsFromNow: age - currentAge };
    }
  }

  return { status: "notFeasible", earliestAge: null, yearsFromNow: null };
}
