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
});
