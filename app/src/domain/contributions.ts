import type { PensionAccount, ProfileData } from "../types";
import { ownAccounts } from "./profileBasics";

/**
 * The monthly salary an account's rates apply to: the account's own salary
 * base when it has one, otherwise the owner's gross monthly salary.
 */
export function contributionSalaryBase(account: PensionAccount, ownerSalary: number): number {
  const own = account.contributions.monthlySalaryBase ?? 0;
  return own > 0 ? own : ownerSalary;
}

/**
 * Monthly deposit into one account, in today's money: its salary base times
 * the sum of its employee/employer/severance rates. Only accounts with status
 * "activeContributing" receive deposits.
 */
export function monthlyContributionForAccount(
  account: PensionAccount,
  monthlySalary: number,
): number {
  const base = contributionSalaryBase(account, monthlySalary);
  if (account.accountStatus !== "activeContributing" || base <= 0) {
    return 0;
  }
  const { employeeRatePercent, employerRatePercent, severanceRatePercent } =
    account.contributions;
  const totalRatePercent =
    Math.max(employeeRatePercent ?? 0, 0) +
    Math.max(employerRatePercent ?? 0, 0) +
    Math.max(severanceRatePercent ?? 0, 0);
  return (base * totalRatePercent) / 100;
}

/**
 * Total monthly deposits across the primary user's active accounts, in
 * today's money. Salary is held constant in real terms (no real wage growth)
 * until retirement. A spouse's accounts are driven by the spouse's salary and
 * are handled per member in `household.ts`.
 */
export function totalMonthlyContribution(profile: ProfileData): number {
  const salary = profile.personal.monthlyGrossSalary ?? 0;
  return ownAccounts(profile).reduce(
    (sum, account) => sum + monthlyContributionForAccount(account, salary),
    0,
  );
}

/**
 * Future value of equal end-of-month deposits compounded at the monthly
 * rate equivalent to `annualRate`, after `years` years. Matches the monthly
 * compounding convention used when amortizing retirement income.
 */
export function futureValueOfMonthlyContributions(
  monthlyContribution: number,
  annualRate: number,
  years: number,
): number {
  if (monthlyContribution <= 0 || years <= 0) return 0;
  const monthlyRate = Math.pow(1 + annualRate, 1 / 12) - 1;
  if (Math.abs(monthlyRate) < 1e-9) {
    return monthlyContribution * 12 * years;
  }
  return (monthlyContribution * (Math.pow(1 + annualRate, years) - 1)) / monthlyRate;
}
