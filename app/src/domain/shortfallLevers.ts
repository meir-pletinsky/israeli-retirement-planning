import { createEmptyPensionAccount, type ProfileData } from "../types";
import { calculateFundingGap } from "./fundingGap";
import { resolveRetirementTiming } from "./household";
import { resolveCurrentAge } from "./profileBasics";
import type { RetirementFeasibility } from "./types";

/** The extra monthly saving is searched in steps of this many shekels, and quoted rounded up to one. */
const SAVING_STEP = 50;
/** Above this a monthly saving is not a realistic lever, so none is offered. */
const SAVING_CEILING = 100_000;

export interface ShortfallLevers {
  /** The monthly spending, after tax, that the plan supports at the planned retirement age. */
  spend: { monthly: number; planned: number } | null;
  /** The earliest age that closes the gap, when it is later than the planned one. */
  retire: { age: number; plannedAge: number; spouseAge: number | null } | null;
  /** The extra monthly saving, until retirement, that closes the gap at the planned age. */
  save: { monthly: number } | null;
}

/**
 * The profile with one more account the user pays `monthly` into until retirement: an investment
 * provident fund, which is always accessible and taxed on its gain like other investments.
 */
function withExtraSaving(profile: ProfileData, monthly: number): ProfileData {
  const account = createEmptyPensionAccount();
  return {
    ...profile,
    pensionSavings: {
      ...profile.pensionSavings,
      accounts: [
        ...profile.pensionSavings.accounts,
        {
          ...account,
          productCategory: "investmentProvidentFund",
          accountStatus: "activeContributing",
          totalAccumulatedBalance: 0,
          contributions: {
            monthlySalaryBase: monthly,
            employeeRatePercent: 100,
            employerRatePercent: 0,
            severanceRatePercent: 0,
          },
        },
      ],
    },
  };
}

/**
 * The smallest extra monthly saving, in steps of `SAVING_STEP`, that makes the plan cover its
 * planned spending at the planned retirement age, in average markets. 0 when it already does;
 * null when there is no time left to save or no realistic amount closes the gap.
 */
export function extraMonthlySavingToCloseGap(profile: ProfileData): number | null {
  if (calculateFundingGap(profile, "standard").status === "onTrack") return 0;
  const yearsToSave = resolveRetirementTiming(profile, "standard").selfAge - resolveCurrentAge(profile);
  if (yearsToSave <= 0) return null;

  const closesGap = (steps: number) =>
    calculateFundingGap(withExtraSaving(profile, steps * SAVING_STEP), "standard").status === "onTrack";

  const ceilingSteps = SAVING_CEILING / SAVING_STEP;
  let high = 1;
  while (!closesGap(high)) {
    if (high >= ceilingSteps) return null;
    high = Math.min(high * 2, ceilingSteps);
  }
  let low = 0;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (closesGap(middle)) high = middle;
    else low = middle;
  }
  return high * SAVING_STEP;
}

/**
 * Three ways to close a shortfall, each on its own and in average markets: spend less, retire later,
 * or save more. Null when there is no shortfall to close or none of them can be quoted.
 */
export function findShortfallLevers(
  profile: ProfileData,
  feasibility: RetirementFeasibility,
): ShortfallLevers | null {
  const gap = calculateFundingGap(profile, "standard");
  if (gap.status !== "shortfall") return null;

  const spend =
    gap.estimatedMonthlyIncome > 0
      ? { monthly: gap.estimatedMonthlyIncome, planned: gap.desiredMonthlyExpenses }
      : null;

  const plannedAge = resolveRetirementTiming(profile, "standard").selfAge;
  const retire =
    feasibility.status === "feasible" && feasibility.earliestAge !== null && feasibility.earliestAge > plannedAge
      ? { age: feasibility.earliestAge, plannedAge, spouseAge: feasibility.spouseAge ?? null }
      : null;

  const extra = extraMonthlySavingToCloseGap(profile);
  const save = extra !== null && extra > 0 ? { monthly: extra } : null;

  return spend || retire || save ? { spend, retire, save } : null;
}
