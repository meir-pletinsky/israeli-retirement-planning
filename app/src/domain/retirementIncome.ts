import type { ProfileData } from "../types";
import { estimateBituachLeumiPension } from "./bituachLeumi";
import { MAX_PLANNING_AGE } from "./constants";
import { projectBalanceAtAge, realAnnualReturnRate, resolveRetirementAge } from "./netWorth";
import type { RetirementIncomeEstimate, RetirementScenario } from "./types";

/** Present value of 1 paid at the end of each of `months` months, at `monthlyRate`. */
function annuityFactor(monthlyRate: number, months: number): number {
  if (months <= 0) return 0;
  if (Math.abs(monthlyRate) < 1e-9) return months;
  return (1 - Math.pow(1 + monthlyRate, -months)) / monthlyRate;
}

/**
 * Estimates the sustainable monthly retirement income (in today's money)
 * that the projected net worth at `retirementAge` can provide, fully
 * amortized from that age through `MAX_PLANNING_AGE`. This is independent
 * of the user's desired expenses — see `fundingGap.ts` for the comparison
 * against `expenses.retirementMonthly`.
 *
 * Uses the standard annuity/amortization formula so the balance reaches
 * (approximately) zero at the end of the planning horizon, rather than a
 * naive balance-divided-by-months estimate that ignores ongoing growth.
 *
 * The Bituach Leumi pension (see `bituachLeumi.ts`) is paid from its claim
 * age onward, so savings only have to fund the spending level S before it
 * starts and S minus the pension after. Solving for the level S that
 * exhausts the balance at the horizon gives
 * `S = (balance + pension * (A(total) - A(monthsUntilClaim))) / A(total)`,
 * where A is the annuity factor. With no pension this is the plain
 * amortization above.
 */
export function estimateRetirementIncomeAtAge(
  profile: ProfileData,
  retirementAge: number,
): RetirementIncomeEstimate {
  const annualRate = realAnnualReturnRate(profile.assumptions);
  const netWorthAtRetirement = projectBalanceAtAge(profile, retirementAge);
  const bituachLeumi = estimateBituachLeumiPension(profile, retirementAge);

  const monthsInRetirement = Math.round((MAX_PLANNING_AGE - retirementAge) * 12);
  if (monthsInRetirement <= 0) {
    return {
      monthlyIncomeTodayMoney: 0,
      retirementAge,
      netWorthAtRetirement: Math.round(netWorthAtRetirement),
      bituachLeumi,
    };
  }

  const monthlyRate = Math.pow(1 + annualRate, 1 / 12) - 1;
  const monthsUntilClaim = Math.min(
    Math.max(Math.round((bituachLeumi.claimAge - retirementAge) * 12), 0),
    monthsInRetirement,
  );
  const totalFactor = annuityFactor(monthlyRate, monthsInRetirement);
  const pensionFactor = totalFactor - annuityFactor(monthlyRate, monthsUntilClaim);
  const monthlyIncomeTodayMoney =
    (netWorthAtRetirement + bituachLeumi.monthlyPension * pensionFactor) / totalFactor;

  return {
    monthlyIncomeTodayMoney: Math.round(monthlyIncomeTodayMoney),
    retirementAge,
    netWorthAtRetirement: Math.round(netWorthAtRetirement),
    bituachLeumi,
  };
}

/** Same as `estimateRetirementIncomeAtAge`, at the retirement age implied by `scenario`. */
export function estimateRetirementIncome(
  profile: ProfileData,
  scenario: RetirementScenario = "standard",
): RetirementIncomeEstimate {
  return estimateRetirementIncomeAtAge(profile, resolveRetirementAge(profile, scenario));
}
