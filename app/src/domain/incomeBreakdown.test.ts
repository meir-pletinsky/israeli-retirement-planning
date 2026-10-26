import { describe, expect, it } from "vitest";

import { buildTestProfile } from "../test/domainFixtures";
import { estimateIncomeBreakdown } from "./incomeBreakdown";
import { MAX_PLANNING_AGE } from "./constants";

describe("estimateIncomeBreakdown", () => {
  it("splits income proportionally to pension vs other balances", () => {
    const profile = buildTestProfile({
      age: 67,
      retirementAge: 67,
      investmentReturnPct: 4,
      inflationPct: 4,
      pensionBalances: [90_000],
      otherAssets: 30_000,
    });
    const points = estimateIncomeBreakdown(profile);
    // Total balance 120,000 -> sustainable income 435/mo (see retirementIncome.test.ts).
    // Pension share = 90,000 / 120,000 = 75%.
    expect(points[0]).toEqual({ age: 67, pensionFund: 326, investments: 109 });
    expect(points).toHaveLength(MAX_PLANNING_AGE - 67 + 1);
  });

  it("is all zero for a profile with no balances", () => {
    const profile = buildTestProfile({ age: 67, retirementAge: 67 });
    const points = estimateIncomeBreakdown(profile);
    expect(points[0]).toEqual({ age: 67, pensionFund: 0, investments: 0 });
  });

  it("attributes ongoing contributions to the pension share", () => {
    // 0% real return. Other assets 100,000; no pension balance yet, but
    // 1,850/month of contributions for 10 years = 222,000 -> pension share 222k / 322k.
    const profile = buildTestProfile({
      age: 50,
      retirementAge: 60,
      monthlyGrossSalary: 10_000,
      investmentReturnPct: 4,
      inflationPct: 4,
      pensionBalances: [0],
      otherAssets: 100_000,
      pensionAccountOverrides: [
        {
          accountStatus: "activeContributing",
          contributions: { employeeRatePercent: 6, employerRatePercent: 6.5, severanceRatePercent: 6 },
        },
      ],
    });
    const [first] = estimateIncomeBreakdown(profile);
    // 322,000 / (30 * 12) = 894.4 -> 894/mo; pension share = 894 * 222/322 ~= 616.
    expect(first.pensionFund + first.investments).toBe(894);
    expect(first.pensionFund).toBe(Math.round((894 * 222_000) / 322_000));
  });
});
