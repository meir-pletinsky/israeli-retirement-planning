import type { ProfileData } from "../types";
import { MAX_RETIREMENT_SEARCH_AGE } from "./constants";
import { desiredRetirementMonthly } from "./expenses";
import { calculateFundingGapAtAge } from "./fundingGap";
import { retirementTimingAtAge, spouseAgeAt } from "./household";
import { MONTE_CARLO_CONFIDENCE, meetsMonteCarloConfidence } from "./monteCarlo";
import { isHouseholdActive, resolveCurrentAge } from "./profileBasics";
import type { ConfidentRetirementAge, RetirementFeasibility } from "./types";

/**
 * Finds the earliest whole retirement age (from the user's current age up
 * to `MAX_RETIREMENT_SEARCH_AGE`) at which the funding gap is non-negative,
 * i.e. the projected balance can sustain the desired retirement expenses.
 *
 * For a couple, both spouses retire at the same moment: the age scanned is
 * the primary user's, and the spouse's age at that moment follows from the
 * age gap (reported as `spouseAge`).
 *
 * Scans upward and returns the first feasible age rather than bisecting:
 * the gap isn't guaranteed monotonic in retirement age (e.g. with a negative
 * real return, waiting erodes balances), so a linear scan is the only way to
 * be sure the answer is truly the earliest.
 *
 * Without a positive desired retirement spending (`desiredRetirementMonthly`) there is no target to
 * solve against, so the result is `noTarget` instead of a meaningless "now".
 */
export function findEarliestFeasibleRetirementAge(profile: ProfileData): RetirementFeasibility {
  const desiredMonthlyExpenses = desiredRetirementMonthly(profile.expenses) ?? 0;
  if (desiredMonthlyExpenses <= 0) {
    return { status: "noTarget", earliestAge: null, yearsFromNow: null };
  }

  const currentAge = resolveCurrentAge(profile);
  const startAge = Math.ceil(currentAge);
  const endAge = Math.max(MAX_RETIREMENT_SEARCH_AGE, startAge);
  const isCouple = isHouseholdActive(profile);

  for (let age = startAge; age <= endAge; age += 1) {
    if (calculateFundingGapAtAge(profile, age).status === "onTrack") {
      return {
        status: "feasible",
        earliestAge: age,
        yearsFromNow: age - currentAge,
        ...(isCouple ? { spouseAge: spouseAgeAt(profile, age) } : {}),
      };
    }
  }

  return { status: "notFeasible", earliestAge: null, yearsFromNow: null };
}

/**
 * The earliest retirement age, from `fromAge` up to `MAX_RETIREMENT_SEARCH_AGE`, at which the
 * Monte Carlo funds the desired spending in at least `MONTE_CARLO_CONFIDENCE` of the paths.
 * Ages are scanned in order, like the average-market search, because the share of paths that
 * succeed is not guaranteed to rise with every extra year of work. A couple retires together.
 */
export function findEarliestConfidentRetirementAge(
  profile: ProfileData,
  fromAge: number,
): ConfidentRetirementAge {
  const endAge = Math.max(MAX_RETIREMENT_SEARCH_AGE, fromAge);
  for (let age = fromAge; age <= endAge; age += 1) {
    if (meetsMonteCarloConfidence(profile, retirementTimingAtAge(profile, age), MONTE_CARLO_CONFIDENCE)) {
      return { status: "found", age };
    }
  }
  return { status: "none", age: null };
}
