import { describe, expect, it } from "vitest";

import { buildTestProfile } from "../test/domainFixtures";
import { MAX_RETIREMENT_SEARCH_AGE } from "./constants";
import { findEarliestFeasibleRetirementAge } from "./feasibility";
import { calculateFundingGapAtAge } from "./fundingGap";

const ACTIVE_PENSION = {
  accountStatus: "activeContributing" as const,
  contributions: {
    employeeRatePercent: 6,
    employerRatePercent: 6.5,
    severanceRatePercent: 6,
  },
};

// 4% nominal return and 4% inflation => 0% real return, which keeps the
// hand-computed expectations below exact.
const ZERO_REAL_RETURN = { investmentReturnPct: 4, inflationPct: 4 };

describe("findEarliestFeasibleRetirementAge", () => {
  it("reports noTarget when no retirement expenses are entered", () => {
    const profile = buildTestProfile({ age: 40, otherAssets: 5_000_000, ...ZERO_REAL_RETURN });
    expect(findEarliestFeasibleRetirementAge(profile)).toEqual({
      status: "noTarget",
      earliestAge: null,
      yearsFromNow: null,
    });
  });

  it("reports feasible today when current assets already cover the target", () => {
    const profile = buildTestProfile({
      age: 50,
      otherAssets: 5_000_000,
      retirementMonthlyExpenses: 6000,
      ...ZERO_REAL_RETURN,
    });
    expect(findEarliestFeasibleRetirementAge(profile)).toEqual({
      status: "feasible",
      earliestAge: 50,
      yearsFromNow: 0,
    });
  });

  it("finds the first age whose balance can sustain the target (no contributions)", () => {
    // Needs 3,000,000 >= 6,000 * 12 * (90 - age): fails at 48 (5,952/mo), passes at 49 (6,097/mo).
    const profile = buildTestProfile({
      age: 40,
      otherAssets: 3_000_000,
      retirementMonthlyExpenses: 6000,
      ...ZERO_REAL_RETURN,
    });
    expect(findEarliestFeasibleRetirementAge(profile)).toEqual({
      status: "feasible",
      earliestAge: 49,
      yearsFromNow: 9,
    });
  });

  it("retires earlier when ongoing salary contributions are modeled", () => {
    const base = {
      age: 40,
      otherAssets: 3_000_000,
      retirementMonthlyExpenses: 6000,
      ...ZERO_REAL_RETURN,
    };
    const withContributions = buildTestProfile({
      ...base,
      monthlyGrossSalary: 20_000,
      pensionBalances: [0],
      pensionAccountOverrides: [ACTIVE_PENSION],
    });
    // 3,700/month of deposits: fails at 45 (5,967/mo), passes at 46 (6,186/mo).
    expect(findEarliestFeasibleRetirementAge(withContributions)).toEqual({
      status: "feasible",
      earliestAge: 46,
      yearsFromNow: 6,
    });
  });

  it("can be feasible only because of contributions", () => {
    // 500,000 alone would need age 84 (beyond the search limit), but 3,700/month of
    // deposits do it by 67: fails at 66 (5,744/mo), passes at 67 (6,155/mo).
    const profile = buildTestProfile({
      age: 40,
      otherAssets: 500_000,
      retirementMonthlyExpenses: 6000,
      monthlyGrossSalary: 20_000,
      pensionBalances: [0],
      pensionAccountOverrides: [ACTIVE_PENSION],
      ...ZERO_REAL_RETURN,
    });
    const result = findEarliestFeasibleRetirementAge(profile);
    expect(result.status).toBe("feasible");
    expect(result.earliestAge).toBe(67);

    const withoutSalary = { ...profile, personal: { ...profile.personal, monthlyGrossSalary: null } };
    expect(findEarliestFeasibleRetirementAge(withoutSalary).status).toBe("notFeasible");
  });

  it("reports notFeasible when no age up to the search limit closes the gap", () => {
    const profile = buildTestProfile({
      age: 40,
      otherAssets: 100_000,
      retirementMonthlyExpenses: 20_000,
      ...ZERO_REAL_RETURN,
    });
    expect(findEarliestFeasibleRetirementAge(profile)).toEqual({
      status: "notFeasible",
      earliestAge: null,
      yearsFromNow: null,
    });
  });

  it("is independent of the user's chosen retirement age", () => {
    const common = {
      age: 40,
      otherAssets: 3_000_000,
      retirementMonthlyExpenses: 6000,
      ...ZERO_REAL_RETURN,
    };
    const early = findEarliestFeasibleRetirementAge(buildTestProfile({ ...common, retirementAge: 55 }));
    const late = findEarliestFeasibleRetirementAge(buildTestProfile({ ...common, retirementAge: 70 }));
    expect(early).toEqual(late);
  });

  it("retires earlier when the Bituach Leumi pension is counted", () => {
    const common = {
      age: 40,
      otherAssets: 3_000_000,
      retirementMonthlyExpenses: 6000,
      gender: "male" as const,
      ...ZERO_REAL_RETURN,
    };
    const without = findEarliestFeasibleRetirementAge(buildTestProfile(common));
    const withPension = findEarliestFeasibleRetirementAge(
      buildTestProfile({
        ...common,
        bituachLeumi: { includeInProjection: true, monthlyPensionOverride: 2000 },
      }),
    );
    expect(without).toEqual({ status: "feasible", earliestAge: 49, yearsFromNow: 9 });
    expect(withPension).toEqual({ status: "feasible", earliestAge: 41, yearsFromNow: 1 });
  });

  it("is the true boundary: feasible at the result, a shortfall one year earlier", () => {
    const profiles = [
      buildTestProfile({ age: 35, otherAssets: 800_000, retirementMonthlyExpenses: 7000 }),
      buildTestProfile({
        age: 45,
        pensionBalances: [600_000],
        otherAssets: 200_000,
        retirementMonthlyExpenses: 8000,
        monthlyGrossSalary: 18_000,
        pensionAccountOverrides: [ACTIVE_PENSION],
      }),
      buildTestProfile({
        age: 50,
        otherAssets: 400_000,
        retirementMonthlyExpenses: 5000,
        investmentReturnPct: 3,
        inflationPct: 3.5,
      }),
    ];

    let checked = 0;
    for (const profile of profiles) {
      const { status, earliestAge } = findEarliestFeasibleRetirementAge(profile);
      if (status !== "feasible" || earliestAge === null) continue;
      checked += 1;
      expect(calculateFundingGapAtAge(profile, earliestAge).status).toBe("onTrack");
      if (earliestAge > (profile.personal.age ?? 0)) {
        expect(calculateFundingGapAtAge(profile, earliestAge - 1).status).toBe("shortfall");
      }
      expect(earliestAge).toBeLessThanOrEqual(MAX_RETIREMENT_SEARCH_AGE);
    }
    expect(checked).toBeGreaterThanOrEqual(2);
  });
});
