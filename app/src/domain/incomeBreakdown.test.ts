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
});
