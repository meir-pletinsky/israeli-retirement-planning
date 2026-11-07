import { describe, expect, it } from "vitest";

import { buildTestProfile } from "../test/domainFixtures";
import { projectCashFlow } from "./cashFlow";
import { recurringAmount } from "./incomeBreakdown";
import { projectNetWorth, projectSpendingFunding } from "./netWorth";
import { buildRetirementTimeline } from "./timeline";

// A 0% real return, so 120,000 pays 1,000 a month for exactly ten years: ages 67 to 76.
const base = {
  age: 66,
  retirementAge: 67,
  investmentReturnPct: 4,
  inflationPct: 4,
  pensionBalances: [120_000],
  retirementMonthlyExpenses: 1_000,
};

describe("projectCashFlow", () => {
  it("is null when no spending is entered", () => {
    expect(projectCashFlow(buildTestProfile({ ...base, retirementMonthlyExpenses: undefined }))).toBeNull();
  });

  it("starts the year the household retires and runs to the planning horizon", () => {
    const plan = projectCashFlow(buildTestProfile(base))!;
    expect(plan.monthlySpending).toBe(1_000);
    expect(plan.years[0].age).toBe(67);
    expect(plan.years[0].calendarYear).toBe(2026 + 1);
    expect(plan.years.at(-1)!.age).toBe(90);
  });

  it("names the same first unfunded age as the net-worth line", () => {
    const profile = buildTestProfile(base);
    const plan = projectCashFlow(profile)!;
    expect(plan.firstUnfundedAge).toBe(77);
    expect(plan.firstUnfundedAge).toBe(projectSpendingFunding(profile).shortfallAge);
    expect(plan.years.filter((year) => year.short).map((year) => year.age)[0]).toBe(77);
  });

  it("pays the spending from savings while they last, then shows it unfunded", () => {
    const { years } = projectCashFlow(buildTestProfile(base))!;
    const funded = years.find((year) => year.age === 76)!;
    expect(funded.withdrawn.pensionFund).toBe(1_000);
    expect(funded.income).toBe(1_000);
    expect(funded.unfunded).toBe(0);
    expect(funded.short).toBe(false);

    const unfunded = years.find((year) => year.age === 77)!;
    expect(unfunded.income).toBe(0);
    expect(unfunded.withdrawn.pensionFund).toBe(0);
    expect(unfunded.unfunded).toBe(1_000);
    expect(unfunded.short).toBe(true);
    expect(years.filter((year) => year.age >= 77).every((year) => year.unfunded === 1_000)).toBe(true);
  });

  it("keeps the recurring payments coming after the savings run out, and unfunds only the rest", () => {
    const profile = buildTestProfile({
      ...base,
      bituachLeumi: { includeInProjection: true, monthlyPensionOverride: 400 },
    });
    const { years } = projectCashFlow(profile)!;
    const late = years.find((year) => year.age === 85)!;
    expect(late.bituachLeumi).toBe(400);
    expect(recurringAmount(late, "bituachLeumi")).toBe(400);
    expect(late.withdrawn.pensionFund).toBe(0);
    expect(late.income).toBe(400);
    expect(late.unfunded).toBe(600);
  });

  it("splits the withdrawal over the kinds of savings that can pay it", () => {
    const profile = buildTestProfile({ ...base, retirementMonthlyExpenses: 2_000, otherAssets: 120_000 });
    const { years, bands } = projectCashFlow(profile)!;
    const first = years[0];
    expect(first.withdrawn.pensionFund).toBeGreaterThan(0);
    expect(first.withdrawn.investments).toBeGreaterThan(0);
    expect(first.withdrawn.pensionFund + first.withdrawn.investments).toBe(2_000);
    expect(first.income).toBe(2_000);
    expect(bands).toEqual(["pensionFund", "investments"]);
  });

  it("adds up in every year: what comes in and what is unfunded cover the spending", () => {
    const profile = buildTestProfile({
      ...base,
      retirementMonthlyExpenses: 2_500,
      otherAssets: 60_000,
      bituachLeumi: { includeInProjection: true, monthlyPensionOverride: 700 },
    });
    for (const year of projectCashFlow(profile)!.years) {
      const parts = (Object.keys(year.withdrawn) as (keyof typeof year.withdrawn)[]).reduce(
        (sum, band) => sum + year[band],
        0,
      );
      expect(year.income).toBe(parts);
      expect(Math.abs(year.income + year.unfunded - (year.spending + year.cover))).toBeLessThanOrEqual(1);
    }
  });

  it("follows the net-worth path: savings are gone the year before the first unfunded year", () => {
    const profile = buildTestProfile(base);
    const plan = projectCashFlow(profile)!;
    const path = projectNetWorth(profile);
    expect(path.find((point) => point.age === plan.firstUnfundedAge! - 1)!.netWorth).toBe(0);
  });

  it("has no unfunded year when the savings last to the horizon", () => {
    const plan = projectCashFlow(buildTestProfile({ ...base, retirementMonthlyExpenses: 100 }))!;
    expect(plan.firstUnfundedAge).toBeNull();
    expect(plan.years.every((year) => year.unfunded === 0 && !year.short)).toBe(true);
  });

  it("estimates tax on what is withdrawn", () => {
    const profile = buildTestProfile({
      age: 60,
      retirementAge: 60,
      pensionBalances: [12_000_000],
      retirementMonthlyExpenses: 30_000,
    });
    const { years } = projectCashFlow(profile)!;
    expect(years[0].tax).toBeGreaterThan(0);
    expect(years[0].tax).toBeLessThan(years[0].income);
    const empty = projectCashFlow(buildTestProfile(base))!.years.find((year) => year.age === 85)!;
    expect(empty.tax).toBe(0);
  });

  describe("the spending", () => {
    it("is one amount when the budget is a typed total", () => {
      const plan = projectCashFlow(buildTestProfile(base))!;
      expect(plan.years[0].essential).toBeNull();
      expect(plan.years[0].discretionary).toBeNull();
      expect(plan.irregularMonthly).toBe(0);
    });

    it("splits into essential and discretionary when the budget is itemised", () => {
      const profile = buildTestProfile({
        ...base,
        retirementMonthlyExpenses: undefined,
        expenseItems: [
          { amount: 700, frequency: "monthly", necessity: "essential" },
          { amount: 3_600, frequency: "yearly", necessity: "discretionary" },
        ],
      });
      const plan = projectCashFlow(profile)!;
      const year = plan.years[0];
      expect(year.spending).toBe(1_000);
      expect(year.essential).toBe(700);
      expect(year.discretionary).toBe(300);
      expect(plan.irregularMonthly).toBe(300);
    });
  });

  it("feeds the timeline, which marks the unfunded stage", () => {
    const { years } = projectCashFlow(buildTestProfile(base))!;
    const segments = buildRetirementTimeline(years);
    expect(segments).toHaveLength(2);
    expect(segments[0].unfunded).toBeUndefined();
    expect(segments[0].fromAge).toBe(67);
    expect(segments[0].toAge).toBe(76);
    expect(segments[0].monthlyIncome).toBe(1_000);
    expect(segments[1].fromAge).toBe(77);
    expect(segments[1].unfunded).toBe(1_000);
    expect(segments[1].monthlyIncome).toBe(0);
  });
});
