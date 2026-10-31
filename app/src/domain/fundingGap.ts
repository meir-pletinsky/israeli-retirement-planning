import type { ProfileData } from "../types";
import { desiredRetirementMonthly } from "./expenses";
import { resolveRetirementTiming, retirementTimingAtAge, type RetirementTiming } from "./household";
import { estimateNetIncomeForTiming } from "./netIncome";
import {
  fromDerived,
  fromLatestStep,
  fromProfile,
  fromStep,
  input,
  recordStep,
  withScope,
} from "./trace";
import type { FundingGapResult, RetirementScenario } from "./types";

/**
 * Compares the estimated sustainable retirement income after tax, if retiring
 * at the given ages, against the household's desired retirement monthly
 * expenses. A non-negative gap means the projected balance can cover (or
 * exceed) the desired spending; negative means a shortfall. This is
 * deterministic — no probability of success (that lives in monteCarlo.ts).
 */
export function calculateFundingGapForTiming(
  profile: ProfileData,
  timing: RetirementTiming,
): FundingGapResult {
  const { netMonthlyIncome, grossMonthlyIncome, taxMonthly } = estimateNetIncomeForTiming(
    profile,
    timing,
  );
  const desiredSpending = desiredRetirementMonthly(profile.expenses);
  const desiredMonthlyExpenses = desiredSpending ?? 0;
  const monthlyGap = Math.round(netMonthlyIncome - desiredMonthlyExpenses);
  const status = monthlyGap >= 0 ? "onTrack" : "shortfall";

  withScope("fundingGap", () => {
    const gapId = recordStep("monthlyGap", () => ({
      title: "Monthly gap between the net income and the desired spending",
      formula: "net monthly income − desired monthly spending, rounded to a whole shekel",
      expr: "round(netMonthlyIncome - desiredMonthlyExpenses)",
      inputs: {
        netMonthlyIncome: input(
          netMonthlyIncome,
          fromLatestStep("net/netMonthlyIncome", netMonthlyIncome),
        ),
        desiredMonthlyExpenses: input(
          desiredMonthlyExpenses,
          desiredSpending === null
            ? fromDerived("no retirement spending entered, counted as 0")
            : profile.expenses.mode === "detailed"
              ? fromDerived(
                  "sum of the itemised retirement expenses (amount ÷ months between payments), rounded to a whole shekel",
                )
              : fromProfile("expenses.retirementMonthly"),
        ),
      },
      output: monthlyGap,
    }));
    recordStep("status", () => ({
      title: "Whether the plan covers the desired spending",
      formula: "onTrack when the monthly gap is 0 or more, otherwise shortfall",
      inputs: { monthlyGap: input(monthlyGap, fromStep(gapId)) },
      output: status,
    }));
  });

  return {
    monthlyGap,
    status,
    estimatedMonthlyIncome: netMonthlyIncome,
    grossMonthlyIncome,
    estimatedMonthlyTax: taxMonthly,
    desiredMonthlyExpenses,
  };
}

/** `calculateFundingGapForTiming` with the primary user retiring at `retirementAge` (a spouse retires at the same moment). */
export function calculateFundingGapAtAge(
  profile: ProfileData,
  retirementAge: number,
): FundingGapResult {
  return calculateFundingGapForTiming(profile, retirementTimingAtAge(profile, retirementAge));
}

/** Same as `calculateFundingGapForTiming`, at the retirement ages implied by `scenario`. */
export function calculateFundingGap(
  profile: ProfileData,
  scenario: RetirementScenario = "standard",
): FundingGapResult {
  return calculateFundingGapForTiming(profile, resolveRetirementTiming(profile, scenario));
}
