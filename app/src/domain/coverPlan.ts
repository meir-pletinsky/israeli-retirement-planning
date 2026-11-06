import type { AccountOwner, CoverPlan, PensionAccount, ProfileData } from "../types";
import { ACCESS_RULES, COVER_RULES } from "./accessRules";
import { ownAccounts, spouseAccounts } from "./profileBasics";

/**
 * The cover plan of one person: what to do about the survivors' cover that
 * stops when the deposits stop. Design: `docs/insurance-cover-design.md`.
 */

/** The accounts of one person that the plan counts (a spouse's only once the plan covers a spouse). */
export function accountsOfPerson(profile: ProfileData, person: AccountOwner): PensionAccount[] {
  return person === "spouse" ? spouseAccounts(profile) : ownAccounts(profile);
}

/** What a person's accounts say about their risk cover, summed over the accounts that lose it when deposits stop. */
export interface CoverOnFile {
  /** Sum of the death cover amounts, in ILS. */
  deathCoverage: number;
  /** Sum of the monthly risk premiums taken from the deposits, in ILS. */
  monthlyRiskDeduction: number;
  /** Sum of the monthly survivors' pensions to the spouse that the products insure, in ILS. */
  monthlySurvivorsPension: number;
  /** Whether any of the three is above zero. */
  hasCover: boolean;
}

/**
 * The cover on file for a person. Only accounts that still receive deposits
 * count: the cover of a paid-up account has already lapsed, and an account
 * that pays an annuity has no risk cover to lose. Amounts the user or the
 * import left empty count as 0.
 */
export function coverOnFile(profile: ProfileData, person: AccountOwner): CoverOnFile {
  const sum = (pick: (account: PensionAccount) => number | null) =>
    accountsOfPerson(profile, person)
      .filter((account) => account.accountStatus === "activeContributing")
      .reduce((total, account) => total + Math.max(pick(account) ?? 0, 0), 0);
  const deathCoverage = sum((account) => account.insuranceCoverages.deathCoverageAmount);
  const monthlyRiskDeduction = sum((account) => account.insuranceCoverages.monthlyRiskDeduction);
  const monthlySurvivorsPension = sum((account) => account.insuranceCoverages.monthlySurvivorsSpousePension);
  return {
    deathCoverage,
    monthlyRiskDeduction,
    monthlySurvivorsPension,
    hasCover: deathCoverage > 0 || monthlyRiskDeduction > 0 || monthlySurvivorsPension > 0,
  };
}

/**
 * Ages are the insured person's own, as fractions of a year. `lastDepositAge`
 * is the age at which deposits stop (the retirement age).
 */
export interface CoverWindows {
  lastDepositAge: number;
  /** End of the free extension: the cover that costs nothing runs to here. */
  freeEndAge: number;
  /** End of the insurance arrangement: the longest cover the fund itself can extend. */
  arrangementEndAge: number;
  /** Age until which the cover is needed. */
  needEndAge: number;
  /** Age at which the chosen option's cover ends. */
  coverEndAge: number;
  /** When the person is without cover although it is needed. */
  gapStartAge: number;
  gapEndAge: number;
  /** Years without cover between `gapStartAge` and `needEndAge`; 0 when none. */
  gapYears: number;
  /** The age range in which the person pays for the option out of pocket. */
  costStartAge: number;
  costEndAge: number;
  costYears: number;
}

/** The age until which cover is needed: the person's own choice, else the earliest pension age. */
export function needEndAgeOf(plan: CoverPlan): number {
  return plan.needUntilAge ?? ACCESS_RULES.earliestAnnuityAge;
}

/**
 * The windows of one cover option for a person whose deposits stop at
 * `lastDepositAge`. The need starts when the free extension ends, so the gap
 * is the part of [free extension end, need-until age] that the option does not
 * cover. Design: `docs/insurance-cover-design.md` section 5.
 */
export function coverWindows(plan: CoverPlan, lastDepositAge: number): CoverWindows {
  const freeEndAge = lastDepositAge + COVER_RULES.freeExtensionMonths / 12;
  const arrangementEndAge = lastDepositAge + COVER_RULES.arrangementMonths / 12;
  const needEndAge = needEndAgeOf(plan);

  let coverEndAge: number;
  let costEndAge: number;
  switch (plan.option) {
    case "none":
      coverEndAge = freeEndAge;
      costEndAge = freeEndAge;
      break;
    case "keepPensionInsurance":
      coverEndAge = plan.keepPayingAfterArrangement ? Math.max(needEndAge, arrangementEndAge) : arrangementEndAge;
      costEndAge = Math.min(coverEndAge, needEndAge);
      break;
    case "termLife":
      coverEndAge = Math.max(plan.termEndAge ?? needEndAge, freeEndAge);
      costEndAge = coverEndAge;
      break;
  }

  const gapStartAge = Math.max(freeEndAge, coverEndAge);
  return {
    lastDepositAge,
    freeEndAge,
    arrangementEndAge,
    needEndAge,
    coverEndAge,
    gapStartAge,
    gapEndAge: needEndAge,
    gapYears: Math.max(needEndAge - gapStartAge, 0),
    costStartAge: freeEndAge,
    costEndAge,
    costYears: Math.max(costEndAge - freeEndAge, 0),
  };
}

/**
 * The monthly cost of the option, in today's money. The user's own figure wins;
 * for the pension insurance the fallback is what the accounts already take as a
 * risk premium. Null when it is not known.
 */
export function coverMonthlyCost(plan: CoverPlan, riskDeductionOnFile: number): number | null {
  switch (plan.option) {
    case "none":
      return 0;
    case "keepPensionInsurance":
      return plan.monthlyCost ?? (riskDeductionOnFile > 0 ? riskDeductionOnFile : null);
    case "termLife":
      return plan.monthlyCost;
  }
}

/** Everything paid out of pocket for the option over its cost window, in today's money; null when the cost is unknown. */
export function coverTotalCost(monthlyCost: number | null, windows: CoverWindows): number | null {
  return monthlyCost === null ? null : monthlyCost * 12 * windows.costYears;
}

/** One account that insures a survivors' pension, as the gap in money sees it. */
export interface SurvivorsAccountInput {
  /** The monthly survivors' pension to the spouse that the product insures, in today's money. */
  monthlySurvivorsPension: number;
  /** The account's projected balance when the gap starts, in today's money. */
  balanceAtGapStart: number;
  /** Balance divided by this gives the monthly pension; null or 0 = not entered. */
  conversionFactor: number | null;
}

export interface SurvivorsGapInMoney {
  /** What the products insure for the spouse, per month. */
  insuredMonthly: number;
  /** What the same balances would pay a spouse without the insurance, per month (a Low-confidence estimate). */
  balanceOnlyMonthly: number;
  /** The monthly amount the spouse would be missing at the start of the gap; never below 0. */
  gapMonthly: number;
  /** Accounts that insure a survivors' pension but have no conversion factor: their balance-only part is left out, so the gap is an upper bound. */
  accountsWithoutFactor: number;
}

/**
 * The gap in money for the spouse's survivors' pension: insured pension minus the
 * balance-only estimate. Accounts without a positive insured amount are ignored.
 * Orphans' and parents' pensions and lump sums are not counted.
 */
export function survivorsGapInMoney(accounts: SurvivorsAccountInput[]): SurvivorsGapInMoney {
  let insuredMonthly = 0;
  let balanceOnlyMonthly = 0;
  let accountsWithoutFactor = 0;
  for (const account of accounts) {
    if (!(account.monthlySurvivorsPension > 0)) continue;
    insuredMonthly += account.monthlySurvivorsPension;
    if (account.conversionFactor !== null && account.conversionFactor > 0) {
      balanceOnlyMonthly += Math.max(account.balanceAtGapStart, 0) / account.conversionFactor;
    } else {
      accountsWithoutFactor += 1;
    }
  }
  return {
    insuredMonthly,
    balanceOnlyMonthly,
    gapMonthly: Math.max(insuredMonthly - balanceOnlyMonthly, 0),
    accountsWithoutFactor,
  };
}
