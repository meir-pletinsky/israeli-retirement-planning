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
  /**
   * Sustainable monthly income in today's money, from retirement through the planning horizon.
   * Includes the Bituach Leumi pension and any account annuities from their start age onward.
   */
  monthlyIncomeTodayMoney: number;
  retirementAge: number;
  netWorthAtRetirement: number;
  bituachLeumi: BituachLeumiEstimate;
  access: RetirementAccessSummary;
}

/** How much of the savings can actually be spent when retiring, given each product's access rules. */
export interface RetirementAccessSummary {
  /** Spendable capital (today's money) already unlocked at the retirement age. */
  accessibleAtRetirement: number;
  /** Spendable capital still locked at the retirement age (unlocks later). */
  lockedAtRetirement: number;
  /** Earliest age after retirement at which locked capital unlocks; null when none is locked. */
  nextUnlockAge: number | null;
  /** True when the timing of access, not the total, is what limits the income. */
  bridgeLimited: boolean;
  /** Income if every saving were available from retirement; equals the estimate unless `bridgeLimited`. */
  unconstrainedMonthlyIncome: number;
  /** Age whose funding need is the binding limit; null unless `bridgeLimited`. */
  limitingAge: number | null;
  /** Total monthly payment from accounts converted to an annuity (today's money). */
  accountAnnuityMonthly: number;
  /** Accounts with a balance but no product type, treated as fully accessible. */
  uncategorizedAccounts: number;
}

export interface BituachLeumiEstimate {
  /** Whether the user chose to include the state pension in projections. */
  included: boolean;
  eligible: boolean;
  /** `override` when the user entered a figure from Bituach Leumi's own calculator. */
  source: "calculated" | "override";
  statutoryRetirementAge: number;
  /** Age the pension starts being paid. May be fractional (e.g. 62.333 = 62y 4m). */
  claimAge: number;
  insuredYearsAtClaim: number;
  /** Fractions, e.g. 0.5 = +50%. */
  seniorityRate: number;
  deferralRate: number;
  /** Monthly pension in today's money; 0 when excluded or not eligible. */
  monthlyPension: number;
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
