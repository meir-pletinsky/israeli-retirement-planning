import { describe, expect, it } from "vitest";

import { buildTestProfile } from "../test/domainFixtures";
import {
  FALLBACK_USD_TO_ILS_RATE,
  MAX_PLANNING_AGE,
} from "./constants";
import {
  aggregateCurrentNetWorth,
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
});
