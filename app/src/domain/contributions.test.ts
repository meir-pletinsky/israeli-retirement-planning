import { describe, expect, it } from "vitest";

import type { PensionAccount } from "../types";
import { createEmptyPensionAccount } from "../types";
import { buildTestProfile } from "../test/domainFixtures";
import {
  futureValueOfMonthlyContributions,
  monthlyContributionForAccount,
  totalMonthlyContribution,
} from "./contributions";

function activeAccount(overrides: Partial<PensionAccount["contributions"]> = {}): PensionAccount {
  return {
    ...createEmptyPensionAccount(),
    accountStatus: "activeContributing",
    contributions: {
      monthlySalaryBase: null,
      employeeRatePercent: 6,
      employerRatePercent: 6.5,
      severanceRatePercent: 6,
      ...overrides,
    },
  };
}

describe("monthlyContributionForAccount", () => {
  it("applies the summed rates to the gross monthly salary", () => {
    // 6% + 6.5% + 6% = 18.5% of 10,000.
    expect(monthlyContributionForAccount(activeAccount(), 10_000)).toBeCloseTo(1850, 6);
  });

  it("applies the rates to the account's own salary base instead of the personal salary", () => {
    const account = activeAccount({ monthlySalaryBase: 4_000 });
    expect(monthlyContributionForAccount(account, 10_000)).toBeCloseTo(740, 6);
  });

  it("still deposits from the account's salary base when no personal salary is entered", () => {
    const account = activeAccount({ monthlySalaryBase: 4_000 });
    expect(monthlyContributionForAccount(account, 0)).toBeCloseTo(740, 6);
  });

  it("falls back to the personal salary when the salary base is empty or not positive", () => {
    expect(monthlyContributionForAccount(activeAccount({ monthlySalaryBase: 0 }), 10_000)).toBeCloseTo(1850, 6);
    expect(monthlyContributionForAccount(activeAccount({ monthlySalaryBase: null }), 10_000)).toBeCloseTo(1850, 6);
  });

  it("is zero for a salary base on an account that is not actively contributing", () => {
    const frozen = { ...activeAccount({ monthlySalaryBase: 4_000 }), accountStatus: "paidUpFrozen" as const };
    expect(monthlyContributionForAccount(frozen, 10_000)).toBe(0);
  });

  it("is zero for accounts that are not actively contributing", () => {
    const frozen = { ...activeAccount(), accountStatus: "paidUpFrozen" as const };
    const unset = { ...activeAccount(), accountStatus: null };
    expect(monthlyContributionForAccount(frozen, 10_000)).toBe(0);
    expect(monthlyContributionForAccount(unset, 10_000)).toBe(0);
  });

  it("is zero without a positive salary", () => {
    expect(monthlyContributionForAccount(activeAccount(), 0)).toBe(0);
    expect(monthlyContributionForAccount(activeAccount(), -5000)).toBe(0);
  });

  it("treats missing rates as zero and ignores negative rates", () => {
    const partial = activeAccount({ employeeRatePercent: null, employerRatePercent: -3 });
    expect(monthlyContributionForAccount(partial, 10_000)).toBeCloseTo(600, 6);
  });
});

describe("totalMonthlyContribution", () => {
  it("sums contributions across active accounts only", () => {
    const profile = buildTestProfile({
      monthlyGrossSalary: 10_000,
      pensionBalances: [0, 0, 0],
      pensionAccountOverrides: [
        activeAccount(),
        activeAccount({ employeeRatePercent: 2.5, employerRatePercent: 7.5, severanceRatePercent: 0 }),
        { ...activeAccount(), accountStatus: "paidUpFrozen" },
      ],
    });
    // 1,850 (pension) + 1,000 (study fund); the frozen account contributes nothing.
    expect(totalMonthlyContribution(profile)).toBeCloseTo(2850, 6);
  });

  it("is zero when no salary is entered", () => {
    const profile = buildTestProfile({
      pensionBalances: [0],
      pensionAccountOverrides: [activeAccount()],
    });
    expect(totalMonthlyContribution(profile)).toBe(0);
  });

  it("does not apply one salary to accounts funded from different salaries", () => {
    // Pension on 6,000, managers insurance on 4,000, study fund on the combined 10,000.
    const profile = buildTestProfile({
      monthlyGrossSalary: 10_000,
      pensionBalances: [0, 0, 0],
      pensionAccountOverrides: [
        activeAccount({ monthlySalaryBase: 6_000, employeeRatePercent: 6, employerRatePercent: 6.5, severanceRatePercent: 8.33 }),
        activeAccount({ monthlySalaryBase: 4_000, employeeRatePercent: 6, employerRatePercent: 5.7, severanceRatePercent: 8.33 }),
        activeAccount({ monthlySalaryBase: 10_000, employeeRatePercent: 2.5, employerRatePercent: 7.5, severanceRatePercent: 0 }),
      ],
    });
    // 1,249.80 + 801.20 + 1,000, not 10,000 × (20.83% + 20.03% + 10%).
    expect(totalMonthlyContribution(profile)).toBeCloseTo(1249.8 + 801.2 + 1000, 6);
  });
});

describe("futureValueOfMonthlyContributions", () => {
  it("is a straight sum at a zero rate", () => {
    expect(futureValueOfMonthlyContributions(1000, 0, 5)).toBeCloseTo(60_000, 6);
  });

  it("matches month-by-month compounding at a positive rate", () => {
    const annualRate = 0.05;
    const monthlyRate = Math.pow(1 + annualRate, 1 / 12) - 1;
    let balance = 0;
    for (let month = 0; month < 12 * 7; month += 1) {
      balance = balance * (1 + monthlyRate) + 1000;
    }
    expect(futureValueOfMonthlyContributions(1000, annualRate, 7)).toBeCloseTo(balance, 4);
  });

  it("is zero for no contribution or no time", () => {
    expect(futureValueOfMonthlyContributions(0, 0.03, 10)).toBe(0);
    expect(futureValueOfMonthlyContributions(1000, 0.03, 0)).toBe(0);
  });
});
