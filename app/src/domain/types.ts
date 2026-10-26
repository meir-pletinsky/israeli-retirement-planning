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
   * For a couple it is the household's income, from the moment the later spouse retires.
   */
  monthlyIncomeTodayMoney: number;
  /** The primary user's retirement age. */
  retirementAge: number;
  /**
   * The primary user's age when the household starts drawing on savings: their
   * own retirement age for a single person, the later spouse's retirement
   * moment for a couple.
   */
  householdRetirementAge: number;
  netWorthAtRetirement: number;
  /** The primary user's own Bituach Leumi estimate (also `members[0].bituachLeumi`). */
  bituachLeumi: BituachLeumiEstimate;
  /** One entry for a single person, two (user first, spouse second) for a couple. */
  members: HouseholdMemberEstimate[];
  access: RetirementAccessSummary;
}

export interface HouseholdMemberEstimate {
  role: "self" | "spouse";
  currentAge: number;
  retirementAge: number;
  bituachLeumi: BituachLeumiEstimate;
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
  /** Spouse supplement this person receives for their spouse; null when none. Set by the household layer. */
  spouseSupplement: SpouseSupplement | null;
}

/**
 * The flat supplement paid to a pensioner for a spouse who has no pension of
 * their own. Ages are the recipient's own age.
 */
export interface SpouseSupplement {
  /** Monthly amount in today's money. */
  monthly: number;
  /** Recipient's age from which it is counted. */
  startAge: number;
  /** Recipient's age at which it stops (the spouse's own pension starts); null = for life. */
  endAge: number | null;
}

export interface FundingGapResult {
  /** estimatedMonthlyIncome - desiredMonthlyExpenses. Positive = surplus, negative = shortfall. */
  monthlyGap: number;
  status: ReadinessStatus;
  /** Net (after-tax) monthly income: the lowest of any retirement year. */
  estimatedMonthlyIncome: number;
  /** The gross monthly income of that year. */
  grossMonthlyIncome: number;
  /** The tax paid out of the gross income in that year. */
  estimatedMonthlyTax: number;
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
  /** The primary user's earliest age. For a couple, both retire together at this and `spouseAge`. */
  earliestAge: number | null;
  /** Years from the user's current age; 0 means they could retire today. */
  yearsFromNow: number | null;
  /** The spouse's age at that moment. Only present for a feasible couple. */
  spouseAge?: number;
}

export type { RetirementScenario };
