import { describe, expect, it } from "vitest";

import { buildTestProfile } from "../test/domainFixtures";
import { findEarliestFeasibleRetirementAge } from "./feasibility";
import { calculateFundingGap } from "./fundingGap";
import { extraMonthlySavingToCloseGap, findShortfallLevers } from "./shortfallLevers";

const PLAN = {
  age: 40,
  retirementAge: 67,
  gender: "male" as const,
  monthlyGrossSalary: 20_000,
  investmentReturnPct: 5,
  inflationPct: 2,
  pensionBalances: [300_000],
};

describe("extraMonthlySavingToCloseGap", () => {
  it("is 0 when the plan already covers its spending", () => {
    const profile = buildTestProfile({ ...PLAN, retirementMonthlyExpenses: 1_000 });
    expect(extraMonthlySavingToCloseGap(profile)).toBe(0);
  });

  it("is the smallest amount, in steps of 50, that closes the gap", () => {
    const profile = buildTestProfile({ ...PLAN, retirementMonthlyExpenses: 15_000 });
    expect(calculateFundingGap(profile).status).toBe("shortfall");

    const extra = extraMonthlySavingToCloseGap(profile);
    expect(extra).not.toBeNull();
    expect(extra).toBeGreaterThan(0);
    expect(extra! % 50).toBe(0);

    const withSaving = (monthly: number) =>
      buildTestProfile({
        ...PLAN,
        retirementMonthlyExpenses: 15_000,
        pensionAccountOverrides: [
          {},
          {
            productCategory: "investmentProvidentFund",
            accountStatus: "activeContributing",
            contributions: {
              monthlySalaryBase: monthly,
              employeeRatePercent: 100,
              employerRatePercent: 0,
              severanceRatePercent: 0,
            },
          },
        ],
        pensionBalances: [300_000, 0],
      });
    expect(calculateFundingGap(withSaving(extra!)).status).toBe("onTrack");
    expect(calculateFundingGap(withSaving(extra! - 50)).status).toBe("shortfall");
  });

  it("is null when there is no time left to save", () => {
    const profile = buildTestProfile({
      ...PLAN,
      age: 67,
      retirementMonthlyExpenses: 15_000,
    });
    expect(extraMonthlySavingToCloseGap(profile)).toBeNull();
  });

  it("is null when no realistic amount closes the gap", () => {
    const profile = buildTestProfile({ ...PLAN, retirementMonthlyExpenses: 1_000_000 });
    expect(extraMonthlySavingToCloseGap(profile)).toBeNull();
  });
});

describe("findShortfallLevers", () => {
  it("is null when the plan covers its spending", () => {
    const profile = buildTestProfile({ ...PLAN, retirementMonthlyExpenses: 1_000 });
    expect(findShortfallLevers(profile, findEarliestFeasibleRetirementAge(profile))).toBeNull();
  });

  it("offers the spending, the age and the saving that each close the gap", () => {
    const profile = buildTestProfile({ ...PLAN, retirementMonthlyExpenses: 6_000 });
    const gap = calculateFundingGap(profile);
    const feasibility = findEarliestFeasibleRetirementAge(profile);
    const levers = findShortfallLevers(profile, feasibility);

    expect(levers?.spend).toEqual({ monthly: gap.estimatedMonthlyIncome, planned: 6_000 });
    expect(levers?.spend?.monthly).toBeLessThan(6_000);
    expect(feasibility.status).toBe("feasible");
    expect(levers?.retire).toEqual({
      age: feasibility.earliestAge,
      plannedAge: 67,
      spouseAge: null,
    });
    expect(levers?.retire?.age).toBeGreaterThan(67);
    expect(levers?.save?.monthly).toBeGreaterThan(0);
  });

  it("leaves out the age when no age up to the search limit closes the gap", () => {
    const profile = buildTestProfile({ ...PLAN, retirementMonthlyExpenses: 1_000_000 });
    const feasibility = findEarliestFeasibleRetirementAge(profile);
    expect(feasibility.status).toBe("notFeasible");

    const levers = findShortfallLevers(profile, feasibility);
    expect(levers?.retire).toBeNull();
    expect(levers?.save).toBeNull();
    expect(levers?.spend?.planned).toBe(1_000_000);
  });
});
