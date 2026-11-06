import type { CoverOption, CoverPlan } from "../types";
import { coverMonthlyCost, coverWindows, type CoverOnFile } from "./coverPlan";

/**
 * What a person pays out of pocket for the cover they chose, as the
 * retirement engine sees it. Kept apart from `coverAnalysis.ts` because the
 * household builder needs it and that file reads the household.
 * Design: `docs/insurance-cover-design.md` section 8.
 */
export interface CoverCost {
  option: CoverOption;
  /** Per month, today's money. */
  monthly: number;
  /** The insured person's own ages, as fractions of a year. */
  startAge: number;
  endAge: number;
}

/**
 * The cost of `plan` for a person whose deposits stop at `lastDepositAge`, or
 * null when nothing is paid: no plan, no cover chosen, an unknown or zero cost,
 * or no time between the end of the free extension and the end of the option.
 */
export function coverCostOf(
  plan: CoverPlan | null,
  onFile: CoverOnFile,
  lastDepositAge: number,
): CoverCost | null {
  if (plan === null) return null;
  const monthly = coverMonthlyCost(plan, onFile.monthlyRiskDeduction);
  if (monthly === null || monthly <= 0) return null;
  const windows = coverWindows(plan, lastDepositAge);
  if (windows.costYears <= 0) return null;
  return {
    option: plan.option,
    monthly,
    startAge: windows.costStartAge,
    endAge: windows.costEndAge,
  };
}
