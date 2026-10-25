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

export type { RetirementScenario };
