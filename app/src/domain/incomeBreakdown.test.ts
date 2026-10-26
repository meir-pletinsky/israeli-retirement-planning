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
    expect(points[0]).toEqual({ age: 67, pensionFund: 326, investments: 109, bituachLeumi: 0 });
    expect(points).toHaveLength(MAX_PLANNING_AGE - 67 + 1);
  });

  it("is all zero for a profile with no balances", () => {
    const profile = buildTestProfile({ age: 67, retirementAge: 67 });
    const points = estimateIncomeBreakdown(profile);
    expect(points[0]).toEqual({ age: 67, pensionFund: 0, investments: 0, bituachLeumi: 0 });
  });

  describe("with the Bituach Leumi pension", () => {
    // 0% real return. Man born 1966, so the pension is claimed at 67; retiring at 60.
    const profile = buildTestProfile({
      age: 60,
      retirementAge: 60,
      investmentReturnPct: 4,
      inflationPct: 4,
      pensionBalances: [600_000],
      bituachLeumi: { includeInProjection: true, monthlyPensionOverride: 2000 },
    });

    it("adds a state-pension band that starts at the claim age", () => {
      const points = estimateIncomeBreakdown(profile);
      const at = (age: number) => points.find((p) => p.age === age)!;
      // Level spending is (600,000 + 2,000 * 276) / 360 = 3,200 throughout.
      expect(at(66)).toEqual({ age: 66, pensionFund: 3200, investments: 0, bituachLeumi: 0 });
      expect(at(67)).toEqual({ age: 67, pensionFund: 1200, investments: 0, bituachLeumi: 2000 });
      expect(at(90).bituachLeumi).toBe(2000);
    });

    it("keeps total income level across the claim age", () => {
      const totals = new Set(
        estimateIncomeBreakdown(profile).map((p) => p.pensionFund + p.investments + p.bituachLeumi),
      );
      expect([...totals]).toEqual([3200]);
    });
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
