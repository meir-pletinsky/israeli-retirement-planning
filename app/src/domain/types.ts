import type { RetirementScenario } from "../types";

/**
 * A single year's projected net worth, expressed in today's money (real
 * terms — see `netWorth.ts` for why). This is the shape the `NetWorthChart`
 * component expects.
 */
export interface NetWorthPoint {
  age: number;
  netWorth: number;
}

export type ReadinessStatus = "onTrack" | "shortfall";

export interface RetirementIncomeEstimate {
  /** Sustainable monthly income in today's money, from retirement through the planning horizon. */
  monthlyIncomeTodayMoney: number;
  retirementAge: number;
  netWorthAtRetirement: number;
}

export interface FundingGapResult {
  /** estimatedMonthlyIncome - desiredMonthlyExpenses. Positive = surplus, negative = shortfall. */
  monthlyGap: number;
  status: ReadinessStatus;
  estimatedMonthlyIncome: number;
  desiredMonthlyExpenses: number;
}

/**
 * - `noTarget`: no desired retirement expenses entered, so there is nothing to solve against.
 * - `feasible`: `earliestAge` is the first whole age whose funding gap is non-negative.
 * - `notFeasible`: no age up to `MAX_RETIREMENT_SEARCH_AGE` closes the gap.
 */
export type FeasibilityStatus = "noTarget" | "feasible" | "notFeasible";

export interface RetirementFeasibility {
  status: FeasibilityStatus;
  earliestAge: number | null;
  /** Years from the user's current age; 0 means they could retire today. */
  yearsFromNow: number | null;
}

export type { RetirementScenario };
