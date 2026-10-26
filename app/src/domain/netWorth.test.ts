import { describe, expect, it } from "vitest";

import { buildTestProfile } from "../test/domainFixtures";
import {
  FALLBACK_USD_TO_ILS_RATE,
  MAX_PLANNING_AGE,
} from "./constants";
import {
  aggregateCurrentNetWorth,
  projectBalanceAtAge,
  projectNetWorth,
  realAnnualReturnRate,
  resolveCurrentAge,
  resolveRetirementAge,
} from "./netWorth";

describe("resolveCurrentAge", () => {
  it("returns the profile's age when set", () => {
    expect(resolveCurrentAge(buildTestProfile({ age: 45 }))).toBe(45);
  });

  it("falls back to a default when age is missing", () => {
    expect(resolveCurrentAge(buildTestProfile({}))).toBeGreaterThan(0);
  });
});

describe("resolveRetirementAge", () => {
  const profile = buildTestProfile({ retirementAge: 67 });

  it("standard scenario uses the entered retirement age", () => {
    expect(resolveRetirementAge(profile, "standard")).toBe(67);
  });

  it("early scenario subtracts the offset", () => {
    expect(resolveRetirementAge(profile, "early")).toBe(62);
  });

  it("delayed scenario adds the offset", () => {
    expect(resolveRetirementAge(profile, "delayed")).toBe(70);
  });

  it("early scenario is floored at the minimum retirement age", () => {
    const youngRetiree = buildTestProfile({ retirementAge: 61 });
    expect(resolveRetirementAge(youngRetiree, "early")).toBe(60);
  });

  it("falls back to the default retirement age when unset", () => {
    expect(resolveRetirementAge(buildTestProfile({}), "standard")).toBe(67);
  });
});

describe("realAnnualReturnRate", () => {
  it("is zero when nominal return equals inflation", () => {
    const rate = realAnnualReturnRate({ preset: "base", investmentReturnPct: 4, inflationPct: 4 });
    expect(rate).toBeCloseTo(0, 10);
  });

  it("is positive when nominal return exceeds inflation", () => {
    const rate = realAnnualReturnRate({ preset: "base", investmentReturnPct: 6, inflationPct: 2.5 });
    expect(rate).toBeGreaterThan(0);
    expect(rate).toBeCloseTo(0.0341, 4);
  });

  it("is negative when inflation exceeds nominal return", () => {
    const rate = realAnnualReturnRate({ preset: "base", investmentReturnPct: 2, inflationPct: 4 });
    expect(rate).toBeLessThan(0);
  });
});

describe("aggregateCurrentNetWorth", () => {
  it("sums pension balances, other assets, and equity (at the fallback FX rate)", () => {
    const profile = buildTestProfile({
      pensionBalances: [100_000, 50_000],
      otherAssets: 20_000,
      equity: [{ quantity: 10, priceUSD: 100 }],
    });
    const expected = 100_000 + 50_000 + 20_000 + 10 * 100 * FALLBACK_USD_TO_ILS_RATE;
    expect(aggregateCurrentNetWorth(profile)).toBeCloseTo(expected, 5);
  });

  it("is zero for a fully empty profile", () => {
    expect(aggregateCurrentNetWorth(buildTestProfile({}))).toBe(0);
  });
});

describe("projectNetWorth", () => {
  it("starts at the current age with today's aggregated net worth", () => {
    const profile = buildTestProfile({ age: 50, retirementAge: 67, pensionBalances: [500_000] });
    const points = projectNetWorth(profile);
    expect(points[0]).toEqual({ age: 50, netWorth: 500_000 });
  });

  it("projects one point per year through the planning horizon", () => {
    const profile = buildTestProfile({ age: 60, retirementAge: 67 });
    const points = projectNetWorth(profile);
    expect(points).toHaveLength(MAX_PLANNING_AGE - 60 + 1);
    expect(points[points.length - 1].age).toBe(MAX_PLANNING_AGE);
  });

  it("grows the balance before retirement with no withdrawals", () => {
    const profile = buildTestProfile({
      age: 60,
      retirementAge: 67,
      investmentReturnPct: 6,
      inflationPct: 2.5,
      pensionBalances: [500_000],
    });
    const points = projectNetWorth(profile);
    const atAge61 = points.find((p) => p.age === 61)!;
    expect(atAge61.netWorth).toBeGreaterThan(500_000);
  });

  it("withdraws annual retirement expenses from retirement age onward", () => {
    const profile = buildTestProfile({
      age: 66,
      retirementAge: 67,
      investmentReturnPct: 4,
      inflationPct: 4, // real rate 0, so growth alone wouldn't change the balance
      pensionBalances: [120_000],
      retirementMonthlyExpenses: 1_000,
    });
    const points = projectNetWorth(profile);
    const atRetirement = points.find((p) => p.age === 67)!;
    // 0% real growth, then minus 12,000/year withdrawal starting at retirement age.
    expect(atRetirement.netWorth).toBe(108_000);
  });

  it("floors the balance at zero instead of going negative", () => {
    const profile = buildTestProfile({
      age: 66,
      retirementAge: 67,
      pensionBalances: [10_000],
      retirementMonthlyExpenses: 50_000,
    });
    const points = projectNetWorth(profile);
    expect(points.find((p) => p.age === 67)!.netWorth).toBe(0);
    expect(points[points.length - 1].netWorth).toBe(0);
  });

  it("uses an earlier retirement age for the early scenario", () => {
    const profile = buildTestProfile({
      age: 60,
      retirementAge: 67,
      pensionBalances: [500_000],
      retirementMonthlyExpenses: 1_000,
    });
    const standard = projectNetWorth(profile, "standard");
    const early = projectNetWorth(profile, "early");
    // Early retirement starts withdrawing sooner, so net worth at age 65
    // should already be lower under the early scenario than standard.
    const standardAt65 = standard.find((p) => p.age === 65)!.netWorth;
    const earlyAt65 = early.find((p) => p.age === 65)!.netWorth;
    expect(earlyAt65).toBeLessThan(standardAt65);
  });

  describe("with ongoing contributions", () => {
    // 0% real return so expectations are exact. 18.5% of 10,000 = 1,850/month = 22,200/year.
    const contributing = {
      age: 40,
      retirementAge: 42,
      monthlyGrossSalary: 10_000,
      investmentReturnPct: 4,
      inflationPct: 4,
      pensionBalances: [100_000],
      pensionAccountOverrides: [
        {
          accountStatus: "activeContributing" as const,
          contributions: {
            employeeRatePercent: 6,
            employerRatePercent: 6.5,
            severanceRatePercent: 6,
          },
        },
      ],
    };

    it("adds contributions each working year and stops at retirement", () => {
      const points = projectNetWorth(buildTestProfile(contributing));
      expect(points.find((p) => p.age === 41)!.netWorth).toBe(122_200);
      expect(points.find((p) => p.age === 42)!.netWorth).toBe(144_400);
      expect(points.find((p) => p.age === 43)!.netWorth).toBe(144_400);
    });

    it("stops contributing earlier under the early scenario", () => {
      const profile = buildTestProfile({ ...contributing, age: 58, retirementAge: 66 });
      const early = projectNetWorth(profile, "early"); // retires at 61
      const standard = projectNetWorth(profile, "standard"); // retires at 66
      expect(early.find((p) => p.age === 70)!.netWorth).toBe(100_000 + 22_200 * 3);
      expect(standard.find((p) => p.age === 70)!.netWorth).toBe(100_000 + 22_200 * 8);
    });

    it("ignores accounts that are not actively contributing", () => {
      const profile = buildTestProfile({
        ...contributing,
        pensionAccountOverrides: [{ ...contributing.pensionAccountOverrides[0], accountStatus: "paidUpFrozen" }],
      });
      expect(projectNetWorth(profile).find((p) => p.age === 42)!.netWorth).toBe(100_000);
    });

    it("agrees with projectBalanceAtAge at retirement when compounding at a real return", () => {
      const profile = buildTestProfile({
        ...contributing,
        retirementAge: 55,
        investmentReturnPct: 6,
        inflationPct: 2.5,
      });
      const atRetirement = projectNetWorth(profile).find((p) => p.age === 55)!.netWorth;
      expect(Math.abs(atRetirement - projectBalanceAtAge(profile, 55))).toBeLessThanOrEqual(1);
    });
  });
});

describe("projectBalanceAtAge", () => {
  it("compounds today's balance at the real return rate", () => {
    const profile = buildTestProfile({
      age: 60,
      investmentReturnPct: 6,
      inflationPct: 2.5,
      pensionBalances: [500_000],
    });
    expect(Math.round(projectBalanceAtAge(profile, 67))).toBe(632_476);
  });

  it("does not shrink or grow the balance for ages at or before today", () => {
    const profile = buildTestProfile({ age: 60, pensionBalances: [500_000] });
    expect(projectBalanceAtAge(profile, 60)).toBe(500_000);
    expect(projectBalanceAtAge(profile, 50)).toBe(500_000);
  });

  it("adds the future value of monthly contributions", () => {
    const profile = buildTestProfile({
      age: 40,
      monthlyGrossSalary: 10_000,
      investmentReturnPct: 4,
      inflationPct: 4,
      pensionBalances: [100_000],
      pensionAccountOverrides: [
        {
          accountStatus: "activeContributing",
          contributions: { employeeRatePercent: 6, employerRatePercent: 6.5, severanceRatePercent: 6 },
        },
      ],
    });
    // 100,000 + 1,850 * 12 * 10 years.
    expect(projectBalanceAtAge(profile, 50)).toBeCloseTo(322_000, 4);
  });
});
