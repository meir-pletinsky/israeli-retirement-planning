import { describe, expect, it } from "vitest";

import { buildTestProfile } from "../test/domainFixtures";
import { calculateFundingGap } from "./fundingGap";
import {
  COMPARISON_MAX_AGE,
  compareRetirementAge,
  compareRetirementAges,
  defaultComparisonAges,
  isValidComparisonAge,
} from "./scenarioComparison";

// 4% nominal return and 4% inflation make the real return exactly 0%.
const ZERO_REAL = { investmentReturnPct: 4, inflationPct: 4 };
const MARRIED = { maritalStatus: "married" as const };
const CONTRIBUTING = {
  accountStatus: "activeContributing" as const,
  contributions: { employeeRatePercent: 6, employerRatePercent: 6.5, severanceRatePercent: 6 },
};

const single = buildTestProfile({
  age: 55,
  retirementAge: 65,
  monthlyGrossSalary: 20_000,
  pensionBalances: [1_500_000],
  pensionAccountOverrides: [CONTRIBUTING],
  retirementMonthlyExpenses: 9_000,
  ...ZERO_REAL,
});

const couple = buildTestProfile({
  age: 55,
  retirementAge: 65,
  monthlyGrossSalary: 20_000,
  pensionBalances: [1_500_000, 800_000],
  pensionAccountOverrides: [CONTRIBUTING, { owner: "spouse", ...CONTRIBUTING }],
  retirementMonthlyExpenses: 14_000,
  ...MARRIED,
  spouse: { age: 52, retirementAge: 63, monthlyGrossSalary: 12_000 },
  ...ZERO_REAL,
});

describe("compareRetirementAge", () => {
  it("matches the Dashboard's plan at the user's own retirement age", () => {
    const outcome = compareRetirementAge(single, 65);
    const gap = calculateFundingGap(single, "standard");

    expect(outcome.netMonthlyIncome).toBe(gap.estimatedMonthlyIncome);
    expect(outcome.grossMonthlyIncome).toBe(gap.grossMonthlyIncome);
    expect(outcome.taxMonthly).toBe(gap.estimatedMonthlyTax);
    expect(outcome.monthlyGap).toBe(gap.monthlyGap);
    expect(outcome.status).toBe(gap.status);
  });

  it("matches the early and delayed scenarios for a single person", () => {
    expect(compareRetirementAge(single, 60).monthlyGap).toBe(calculateFundingGap(single, "early").monthlyGap);
    expect(compareRetirementAge(single, 68).monthlyGap).toBe(calculateFundingGap(single, "delayed").monthlyGap);
  });

  it("matches the Dashboard for a couple, moving the spouse by the same number of years", () => {
    const standard = compareRetirementAge(couple, 65);
    expect(standard.spouseRetirementAge).toBe(63);
    expect(standard.monthlyGap).toBe(calculateFundingGap(couple, "standard").monthlyGap);

    const delayed = compareRetirementAge(couple, 68);
    expect(delayed.spouseRetirementAge).toBe(66);
    expect(delayed.monthlyGap).toBe(calculateFundingGap(couple, "delayed").monthlyGap);
  });

  it("never retires the spouse before their current age", () => {
    // 57 is eight years early: the spouse moves from 63 to 55, which is still ahead of their age of 52.
    expect(compareRetirementAge(couple, 57).spouseRetirementAge).toBe(55);
    // 50 would put them at 48, before their current age of 52.
    expect(compareRetirementAge(couple, 50).spouseRetirementAge).toBe(52);
  });

  it("has no spouse for a single person", () => {
    expect(compareRetirementAge(single, 65).spouseRetirementAge).toBeNull();
  });

  it("counts years from now, never negative", () => {
    expect(compareRetirementAge(single, 65).yearsFromNow).toBe(10);
    expect(compareRetirementAge(single, 50).yearsFromNow).toBe(0);
  });

  it("reports the savings at the age the household starts drawing", () => {
    const noSalary = buildTestProfile({ age: 60, retirementAge: 60, pensionBalances: [2_160_000], ...ZERO_REAL });
    expect(compareRetirementAge(noSalary, 60).netWorthAtRetirement).toBe(2_160_000);
    // The later spouse sets when the household starts drawing, in the user's age:
    // the spouse is three years younger, so they retire when the user is 66 (or 58 at the earlier option).
    expect(compareRetirementAge(couple, 65).householdRetirementAge).toBe(66);
    expect(compareRetirementAge(couple, 57).householdRetirementAge).toBe(58);
  });

  it("gives more savings and more income the later you retire", () => {
    const [early, standard, delayed] = compareRetirementAges(single, [60, 65, 70]);

    expect(standard.netWorthAtRetirement).toBeGreaterThan(early.netWorthAtRetirement);
    expect(delayed.netWorthAtRetirement).toBeGreaterThan(standard.netWorthAtRetirement);
    expect(standard.netMonthlyIncome).toBeGreaterThan(early.netMonthlyIncome);
    expect(delayed.netMonthlyIncome).toBeGreaterThan(standard.netMonthlyIncome);
  });

  it("keeps the order of the ages given", () => {
    const outcomes = compareRetirementAges(single, [70, 60, 65]);
    expect(outcomes.map((outcome) => outcome.retirementAge)).toEqual([70, 60, 65]);
  });

  it("compares net income to the desired spending", () => {
    const outcomes = compareRetirementAges(single, [60, 70]);
    const [low, high] = outcomes;

    expect(low.desiredMonthlyExpenses).toBe(9_000);
    expect(low.monthlyGap).toBe(Math.round(low.netMonthlyIncome - 9_000));
    expect(high.monthlyGap).toBe(Math.round(high.netMonthlyIncome - 9_000));
    expect(low.status).toBe(low.monthlyGap! >= 0 ? "onTrack" : "shortfall");
    expect(high.status).toBe(high.monthlyGap! >= 0 ? "onTrack" : "shortfall");
  });

  it("flags a shortfall and an on-track outcome", () => {
    const demanding = { ...single, expenses: { ...single.expenses, retirementMonthly: 500_000 } };
    const modest = { ...single, expenses: { ...single.expenses, retirementMonthly: 1_000 } };

    expect(compareRetirementAge(demanding, 65).status).toBe("shortfall");
    expect(compareRetirementAge(modest, 65).status).toBe("onTrack");
  });

  it("has no gap to report without desired expenses", () => {
    const noTarget = { ...single, expenses: { ...single.expenses, retirementMonthly: null } };
    const outcome = compareRetirementAge(noTarget, 65);

    expect(outcome.status).toBe("noTarget");
    expect(outcome.monthlyGap).toBeNull();
    expect(outcome.desiredMonthlyExpenses).toBe(0);
    expect(outcome.netMonthlyIncome).toBeGreaterThan(0);
  });
});

describe("defaultComparisonAges", () => {
  it("offers the early, standard and delayed scenarios' ages", () => {
    expect(defaultComparisonAges(single)).toEqual([60, 65, 68]);
  });

  it("starts from the default retirement age when none is entered", () => {
    expect(defaultComparisonAges(buildTestProfile({ age: 50 }))).toEqual([62, 67, 70]);
  });

  it("never offers an early age before today or after the standard age", () => {
    expect(defaultComparisonAges(buildTestProfile({ age: 62, retirementAge: 62 }))).toEqual([62, 62, 65]);
    expect(defaultComparisonAges(buildTestProfile({ age: 52, retirementAge: 55 }))).toEqual([55, 55, 58]);
  });
});

describe("isValidComparisonAge", () => {
  it("accepts ages from today up to the maximum", () => {
    expect(isValidComparisonAge(single, 55)).toBe(true);
    expect(isValidComparisonAge(single, COMPARISON_MAX_AGE)).toBe(true);
  });

  it("rejects missing, past and out-of-range ages", () => {
    expect(isValidComparisonAge(single, null)).toBe(false);
    expect(isValidComparisonAge(single, 54)).toBe(false);
    expect(isValidComparisonAge(single, COMPARISON_MAX_AGE + 1)).toBe(false);
    expect(isValidComparisonAge(single, Number.NaN)).toBe(false);
    expect(isValidComparisonAge(buildTestProfile({ age: 40 }), 49)).toBe(false);
  });
});
