import type { PensionAccount, ProfileData } from "../types";
import { contributionSalaryBase } from "./contributions";
import { desiredRetirementMonthly } from "./expenses";
import {
  accountsInPlan,
  aggregateCurrentNetWorth,
  isHouseholdActive,
  ownAccounts,
  spouseAccounts,
} from "./profileBasics";

/**
 * Inputs the plan can run without, but whose absence silently changes the
 * result. Each gap names the My Data step where it is fixed.
 */
export type DataGapId =
  | "retirementSpending"
  | "noSavings"
  | "spouseMissing"
  | "accountType"
  | "accountStatus"
  | "salary"
  | "spouseSalary"
  | "contributionRates"
  | "gender"
  | "spouseGender";

export type DataGapStep = "personal" | "pension-savings" | "expenses";

export interface DataGap {
  id: DataGapId;
  step: DataGapStep;
  /** Accounts affected, for the account-level gaps; 1 otherwise. */
  count: number;
}

const hasBalance = (account: PensionAccount) => (account.totalAccumulatedBalance ?? 0) > 0;

const isContributing = (account: PensionAccount) => account.accountStatus === "activeContributing";

function totalRatePercent(account: PensionAccount): number {
  const { employeeRatePercent, employerRatePercent, severanceRatePercent } = account.contributions;
  return (
    Math.max(employeeRatePercent ?? 0, 0) +
    Math.max(employerRatePercent ?? 0, 0) +
    Math.max(severanceRatePercent ?? 0, 0)
  );
}

/**
 * Lists the optional inputs that are missing and would change the result,
 * most important first. Age and retirement age are not listed: the Personal
 * step will not continue without them. Spouse gaps appear only while the plan
 * covers a spouse, so a single person never sees them.
 */
export function findDataGaps(profile: ProfileData): DataGap[] {
  const gaps: DataGap[] = [];
  const add = (id: DataGapId, step: DataGapStep, count = 1) => {
    if (count > 0) gaps.push({ id, step, count });
  };

  const isCouple = isHouseholdActive(profile);
  const counted = accountsInPlan(profile).filter(hasBalance);
  const own = ownAccounts(profile);
  const spouse = spouseAccounts(profile);
  const ownSalary = profile.personal.monthlyGrossSalary ?? 0;
  const spouseSalary = profile.spouse.monthlyGrossSalary ?? 0;

  if ((desiredRetirementMonthly(profile.expenses) ?? 0) <= 0) add("retirementSpending", "expenses");
  if (aggregateCurrentNetWorth(profile) <= 0) add("noSavings", "pension-savings");
  if (profile.personal.maritalStatus === "married" && !isCouple) add("spouseMissing", "personal");

  add("accountType", "pension-savings", counted.filter((a) => a.productCategory === null).length);
  add("accountStatus", "pension-savings", counted.filter((a) => a.accountStatus === null).length);

  const usesPersonalSalary = (account: PensionAccount) =>
    isContributing(account) && (account.contributions.monthlySalaryBase ?? 0) <= 0;
  if (ownSalary <= 0) add("salary", "personal", own.filter(usesPersonalSalary).length);
  if (isCouple && spouseSalary <= 0) {
    add("spouseSalary", "personal", spouse.filter(usesPersonalSalary).length);
  }

  const withoutRates = (accounts: PensionAccount[], salary: number) =>
    accounts.filter(
      (a) => isContributing(a) && contributionSalaryBase(a, salary) > 0 && totalRatePercent(a) === 0,
    ).length;
  add(
    "contributionRates",
    "pension-savings",
    withoutRates(own, ownSalary) + (isCouple ? withoutRates(spouse, spouseSalary) : 0),
  );

  if (profile.personal.gender === null) add("gender", "personal");
  if (isCouple && profile.spouse.gender === null) add("spouseGender", "personal");

  return gaps;
}
