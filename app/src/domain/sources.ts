import type { PensionAccount, ProductCategory, ProfileData } from "../types";
import { ACCESS_RULES } from "./accessRules";
import { futureValueOfMonthlyContributions, monthlyContributionForAccount } from "./contributions";
import {
  accountsInPlan,
  aggregateOtherBalance,
  ownAccounts,
  realAnnualReturnRate,
  resolveCurrentAge,
} from "./profileBasics";

/** The kinds of savings a retirement income can be drawn from. */
export type SourceKind =
  | "pensionFund"
  | "providentFund"
  | "managersInsurance"
  | "studyFund"
  | "otherInvestments";

export const SOURCE_KINDS: readonly SourceKind[] = [
  "pensionFund",
  "providentFund",
  "managersInsurance",
  "studyFund",
  "otherInvestments",
];

/** A fixed lifelong-style monthly payment an account converts into (today's money). */
export interface SourceAnnuity {
  monthly: number;
  /** Age the payments start (may be fractional). */
  startAge: number;
  /** `override`: the user's own estimate. `factor`: balance at the start age / conversion factor. */
  origin: "override" | "factor";
}

export interface RetirementSource {
  id: string;
  kind: SourceKind;
  /** Balance today, in ILS. */
  balance: number;
  /** Ongoing monthly deposits until retirement, in today's money. */
  monthlyContribution: number;
  /** Age from which the capital can be spent; 0 = always accessible. */
  unlockAge: number;
  /** Balance grown to retirement plus all deposits made until then, in today's money. */
  valueAtRetirement: number;
  /** Set when the account pays a fixed annuity instead of being drawn down as capital. */
  annuity: SourceAnnuity | null;
}

export function sourceKindForCategory(category: ProductCategory | null): SourceKind {
  switch (category) {
    case "providentFund":
    case "investmentProvidentFund":
    case "iraProvidentFund":
      return "providentFund";
    case "managersInsurance":
      return "managersInsurance";
    case "studyFund":
      return "studyFund";
    case "comprehensivePension":
    case "generalPension":
    default:
      // Uncategorized accounts keep the pre-categorization behaviour: pension-like.
      return "pensionFund";
  }
}

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

/** Years from now until an ISO date (negative when in the past); null when unparseable. */
function yearsUntilDate(isoDate: string | null): number | null {
  if (!isoDate) return null;
  const time = Date.parse(isoDate);
  return Number.isNaN(time) ? null : (time - Date.now()) / MS_PER_YEAR;
}

/**
 * Age from which an account's capital can be spent. An uncategorized account
 * is treated as accessible (the pre-categorization behaviour); the dashboard
 * flags those accounts so the user can set the product type.
 */
export function accountUnlockAge(account: PensionAccount, currentAge: number): number {
  switch (account.productCategory) {
    case "comprehensivePension":
    case "generalPension":
    case "managersInsurance":
    case "providentFund":
    case "iraProvidentFund":
      return ACCESS_RULES.earliestAnnuityAge;
    case "studyFund": {
      const yearsToLiquidity =
        yearsUntilDate(account.liquidityDate) ??
        (() => {
          const sinceJoin = yearsUntilDate(account.joinDate);
          return sinceJoin === null ? null : sinceJoin + ACCESS_RULES.studyFundLiquidityYears;
        })();
      return yearsToLiquidity === null
        ? ACCESS_RULES.alwaysAccessibleAge
        : currentAge + Math.max(yearsToLiquidity, 0);
    }
    case "investmentProvidentFund":
    default:
      return ACCESS_RULES.alwaysAccessibleAge;
  }
}

/** Only pension-like products convert into a monthly annuity. */
function canAnnuitize(kind: SourceKind): boolean {
  return kind === "pensionFund" || kind === "managersInsurance";
}

function buildAnnuity(
  account: PensionAccount,
  kind: SourceKind,
  unlockAge: number,
  retirementAge: number,
  valueAtRetirement: number,
  rate: number,
): SourceAnnuity | null {
  if (!canAnnuitize(kind)) return null;
  const { estimatedMonthlyAnnuity, hasGuaranteedFactor, conversionFactor } =
    account.annuityParameters;
  // An account that already pays an annuity does so from the retirement age
  // regardless of the product's earliest-access age.
  const startAge =
    account.accountStatus === "payingAnnuity"
      ? retirementAge
      : Math.max(retirementAge, unlockAge);

  if (estimatedMonthlyAnnuity !== null && estimatedMonthlyAnnuity > 0) {
    return { monthly: estimatedMonthlyAnnuity, startAge, origin: "override" };
  }
  if (hasGuaranteedFactor && conversionFactor !== null && conversionFactor > 0) {
    const balanceAtStart = valueAtRetirement * Math.pow(1 + rate, Math.max(startAge - retirementAge, 0));
    return { monthly: balanceAtStart / conversionFactor, startAge, origin: "factor" };
  }
  return null;
}

/**
 * Breaks one person's finances into the individual sources retirement income
 * is drawn from: one per pension/savings account they own plus a single
 * bucket for non-pension investments. Values are in today's money (real
 * terms), as everywhere in the engine. The sum of `valueAtRetirement` equals
 * `projectBalanceAtAge`. For a couple this describes the primary user only;
 * `household.ts` builds one set of sources per spouse.
 */
export function buildSources(profile: ProfileData, retirementAge: number): RetirementSource[] {
  const currentAge = resolveCurrentAge(profile);
  const rate = realAnnualReturnRate(profile.assumptions);
  const years = Math.max(retirementAge - currentAge, 0);
  const growth = Math.pow(1 + rate, years);
  const salary = profile.personal.monthlyGrossSalary ?? 0;

  const sources: RetirementSource[] = ownAccounts(profile).map((account) => {
    const kind = sourceKindForCategory(account.productCategory);
    const balance = account.totalAccumulatedBalance ?? 0;
    const monthlyContribution = monthlyContributionForAccount(account, salary);
    const unlockAge = accountUnlockAge(account, currentAge);
    const valueAtRetirement =
      balance * growth + futureValueOfMonthlyContributions(monthlyContribution, rate, years);
    return {
      id: account.id,
      kind,
      balance,
      monthlyContribution,
      unlockAge,
      valueAtRetirement,
      annuity: buildAnnuity(account, kind, unlockAge, retirementAge, valueAtRetirement, rate),
    };
  });

  const otherBalance = aggregateOtherBalance(profile);
  sources.push({
    id: "other-investments",
    kind: "otherInvestments",
    balance: otherBalance,
    monthlyContribution: 0,
    unlockAge: ACCESS_RULES.alwaysAccessibleAge,
    valueAtRetirement: otherBalance * growth,
    annuity: null,
  });

  return sources;
}

/** Counted accounts that hold money but have no product type, so their access rules are unknown. */
export function countUncategorizedAccounts(profile: ProfileData): number {
  return accountsInPlan(profile).filter(
    (account) => account.productCategory === null && (account.totalAccumulatedBalance ?? 0) > 0,
  ).length;
}
