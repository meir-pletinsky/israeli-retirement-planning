import { describe, expect, it } from "vitest";

import { buildTestProfile } from "../test/domainFixtures";
import { estimateRetirementIncome, estimateRetirementIncomeAtAge } from "./retirementIncome";

describe("estimateRetirementIncome", () => {
  it("divides evenly across the planning horizon when the real return rate is zero", () => {
    // 4% nominal return, 4% inflation => 0% real return.
    const profile = buildTestProfile({
      age: 67,
      retirementAge: 67,
      investmentReturnPct: 4,
      inflationPct: 4,
      pensionBalances: [120_000],
    });
    const result = estimateRetirementIncome(profile);
    // 120,000 / ((90 - 67) * 12 months) = 434.78... -> rounds to 435.
    expect(result.monthlyIncomeTodayMoney).toBe(435);
    expect(result.netWorthAtRetirement).toBe(120_000);
    expect(result.retirementAge).toBe(67);
  });

  it("amortizes a growing balance using the real monthly rate", () => {
    const profile = buildTestProfile({
      age: 60,
      retirementAge: 67,
      investmentReturnPct: 6,
      inflationPct: 2.5,
      pensionBalances: [500_000],
    });
    const result = estimateRetirementIncome(profile);
    expect(result.netWorthAtRetirement).toBe(632_476);
    expect(result.monthlyIncomeTodayMoney).toBe(3294);
  });

  it("returns zero income when retirement age is at/past the planning horizon", () => {
    const profile = buildTestProfile({
      age: 90,
      retirementAge: 95,
      pensionBalances: [1_000_000],
    });
    const result = estimateRetirementIncome(profile);
    expect(result.monthlyIncomeTodayMoney).toBe(0);
  });

  it("is zero for a profile with no assets", () => {
    const profile = buildTestProfile({ age: 40, retirementAge: 67 });
    const result = estimateRetirementIncome(profile);
    expect(result.monthlyIncomeTodayMoney).toBe(0);
  });

  it("includes ongoing contributions made until retirement", () => {
    // 0% real return; 18.5% of 10,000 = 1,850/month for 7 years = 155,400.
    const profile = buildTestProfile({
      age: 60,
      retirementAge: 67,
      monthlyGrossSalary: 10_000,
      investmentReturnPct: 4,
      inflationPct: 4,
      pensionBalances: [0],
      pensionAccountOverrides: [
        {
          accountStatus: "activeContributing",
          contributions: { employeeRatePercent: 6, employerRatePercent: 6.5, severanceRatePercent: 6 },
        },
      ],
    });
    const result = estimateRetirementIncome(profile);
    expect(result.netWorthAtRetirement).toBe(155_400);
    // 155,400 / ((90 - 67) * 12 months) = 563.04...
    expect(result.monthlyIncomeTodayMoney).toBe(563);
  });
});

describe("estimateRetirementIncomeAtAge", () => {
  it("matches the scenario-based estimate at the same age", () => {
    const profile = buildTestProfile({
      age: 50,
      retirementAge: 67,
      pensionBalances: [400_000],
    });
    expect(estimateRetirementIncomeAtAge(profile, 62)).toEqual(estimateRetirementIncome(profile, "early"));
  });

  it("pays more per month the later you retire", () => {
    const profile = buildTestProfile({ age: 50, pensionBalances: [400_000] });
    const at60 = estimateRetirementIncomeAtAge(profile, 60).monthlyIncomeTodayMoney;
    const at67 = estimateRetirementIncomeAtAge(profile, 67).monthlyIncomeTodayMoney;
    expect(at67).toBeGreaterThan(at60);
  });
});
