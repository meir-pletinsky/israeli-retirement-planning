import { describe, expect, it } from "vitest";

import { buildTestProfile } from "../test/domainFixtures";
import { calculateFundingGap } from "./fundingGap";

describe("calculateFundingGap", () => {
  it("reports onTrack with a non-negative gap when income covers expenses", () => {
    const profile = buildTestProfile({
      age: 67,
      retirementAge: 67,
      investmentReturnPct: 4,
      inflationPct: 4,
      pensionBalances: [120_000],
      retirementMonthlyExpenses: 400, // below the ~435 sustainable estimate
    });
    const result = calculateFundingGap(profile);
    expect(result.status).toBe("onTrack");
    expect(result.monthlyGap).toBeGreaterThanOrEqual(0);
    expect(result.estimatedMonthlyIncome).toBe(435);
    expect(result.desiredMonthlyExpenses).toBe(400);
    expect(result.monthlyGap).toBe(35);
  });

  it("reports shortfall with a negative gap when expenses exceed sustainable income", () => {
    const profile = buildTestProfile({
      age: 67,
      retirementAge: 67,
      investmentReturnPct: 4,
      inflationPct: 4,
      pensionBalances: [120_000],
      retirementMonthlyExpenses: 2_000,
    });
    const result = calculateFundingGap(profile);
    expect(result.status).toBe("shortfall");
    expect(result.monthlyGap).toBeLessThan(0);
    expect(result.monthlyGap).toBe(435 - 2_000);
  });

  it("treats unset desired expenses as zero", () => {
    const profile = buildTestProfile({ age: 67, retirementAge: 67, pensionBalances: [120_000] });
    const result = calculateFundingGap(profile);
    expect(result.desiredMonthlyExpenses).toBe(0);
    expect(result.status).toBe("onTrack");
  });

  it("compares net income, after tax, with the desired expenses", () => {
    // About 17,857 gross a month at 62, taxed at 2,917 (income tax and health tax) before the exemption starts at 67.
    const profile = buildTestProfile({
      age: 62,
      retirementAge: 62,
      investmentReturnPct: 4,
      inflationPct: 4,
      pensionBalances: [6_000_000],
      retirementMonthlyExpenses: 17_000,
    });
    const result = calculateFundingGap(profile);
    expect(result.grossMonthlyIncome).toBe(17_857);
    expect(result.estimatedMonthlyTax).toBe(2_917);
    expect(result.estimatedMonthlyIncome).toBe(14_940);
    expect(result.monthlyGap).toBe(14_940 - 17_000);
    expect(result.status).toBe("shortfall");
  });

  it("reports gross equal to net when no tax is due", () => {
    const profile = buildTestProfile({
      age: 67,
      retirementAge: 67,
      investmentReturnPct: 4,
      inflationPct: 4,
      pensionBalances: [120_000],
      retirementMonthlyExpenses: 400,
    });
    const result = calculateFundingGap(profile);
    expect(result.estimatedMonthlyTax).toBe(0);
    expect(result.grossMonthlyIncome).toBe(result.estimatedMonthlyIncome);
  });
});
