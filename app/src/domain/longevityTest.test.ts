import { describe, expect, it } from "vitest";

import { buildTestProfile } from "../test/domainFixtures";
import { PLANNING_HORIZON_AGES } from "../types";
import { buildLongevityTest } from "./longevityTest";

// 4% nominal return and 4% inflation make the real return exactly 0%.
const retired = { age: 60, retirementAge: 60, investmentReturnPct: 4, inflationPct: 4 };

type Profile = Parameters<typeof buildTestProfile>[0];

const longevity = (overrides: Profile, scenario?: "early" | "standard" | "delayed") =>
  buildLongevityTest(buildTestProfile({ ...retired, ...overrides }), scenario);

describe("buildLongevityTest", () => {
  it("has one row for each planning age, the earliest first, and marks the one the plan uses", () => {
    const test = longevity({ pensionBalances: [400_000] });
    expect(test.rows.map((row) => row.age)).toEqual([...PLANNING_HORIZON_AGES]);
    expect(test.plannedAge).toBe(90);
    expect(test.rows.map((row) => row.isPlanned)).toEqual([true, false, false]);
  });

  it("marks the chosen age, and measures every other age against it", () => {
    const test = longevity({ pensionBalances: [400_000], planningHorizonAge: 95 });
    const [at90, at95, at100] = test.rows;
    expect(test.plannedAge).toBe(95);
    expect([at90.isPlanned, at95.isPlanned, at100.isPlanned]).toEqual([false, true, false]);
    expect(at95.netMonthlyChange).toBe(0);
    expect(at90.netMonthlyChange).toBeGreaterThan(0);
    expect(at100.netMonthlyChange).toBeLessThan(0);
    expect(at90.netMonthlyChange).toBeCloseTo(at90.netMonthlyIncome - at95.netMonthlyIncome, 6);
  });

  it("pays less each month the longer the savings have to last", () => {
    const [at90, at95, at100] = longevity({ pensionBalances: [400_000] }).rows;
    expect(at95.netMonthlyIncome).toBeLessThan(at90.netMonthlyIncome);
    expect(at100.netMonthlyIncome).toBeLessThan(at95.netMonthlyIncome);
  });

  it("matches the plan's own income for the planned age", () => {
    const [at90] = longevity({ pensionBalances: [400_000] }).rows;
    const rerun = longevity({ pensionBalances: [400_000], planningHorizonAge: 90 }).rows[0];
    expect(at90.netMonthlyIncome).toBe(rerun.netMonthlyIncome);
  });

  it("reports no spending comparison when no retirement spending is entered", () => {
    const test = longevity({ pensionBalances: [400_000] });
    expect(test.desiredMonthly).toBeNull();
    for (const row of test.rows) {
      expect(row.monthlyGap).toBeNull();
      expect(row.runsOutAge).toBeNull();
    }
  });

  it("names the age the savings run out when the desired spending outlasts them", () => {
    // 400,000 at 1,000 a month lasts 33 years: past 90, before 95.
    const test = longevity({ pensionBalances: [400_000], retirementMonthlyExpenses: 1_000 });
    const [at90, at95, at100] = test.rows;
    expect(test.desiredMonthly).toBe(1_000);
    expect(at90.runsOutAge).toBeNull();
    expect(at95.runsOutAge).toBeGreaterThan(90);
    expect(at95.runsOutAge).toBeLessThan(95);
    expect(at100.runsOutAge).toBe(at95.runsOutAge);
  });

  it("measures the net income against the desired spending", () => {
    const test = longevity({ pensionBalances: [400_000], retirementMonthlyExpenses: 1_000 });
    for (const row of test.rows) {
      expect(row.monthlyGap).toBeCloseTo(row.netMonthlyIncome - 1_000, 6);
    }
  });

  it("pays state benefits for life, so a longer plan lowers only the part paid from savings", () => {
    const savingsOnly = longevity({ pensionBalances: [400_000] });
    const withState = longevity({
      pensionBalances: [400_000],
      bituachLeumi: { includeInProjection: true, insuredYearsToDate: 35 },
    });
    const drop = (test: typeof savingsOnly) => test.rows[0].netMonthlyIncome - test.rows[2].netMonthlyIncome;
    expect(withState.rows[2].netMonthlyIncome).toBeGreaterThan(savingsOnly.rows[2].netMonthlyIncome);
    expect(drop(withState)).toBeLessThanOrEqual(drop(savingsOnly));
  });
});
