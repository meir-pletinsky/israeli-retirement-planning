import { describe, expect, it } from "vitest";

import { buildTestProfile } from "../test/domainFixtures";
import { estimateRetirementIncome } from "./retirementIncome";

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
});
