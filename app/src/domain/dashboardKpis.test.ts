import { describe, expect, it } from "vitest";

import { buildTestProfile } from "../test/domainFixtures";
import { checkRetirementAges, calculateRetirementKpis } from "./dashboardKpis";
import { calculateFundingGapAtAge } from "./fundingGap";
import { estimateRetirementIncome } from "./retirementIncome";

type Overrides = Parameters<typeof buildTestProfile>[0];

// Uncategorised test accounts are always accessible; pension products open only at 60.
const LOCKED_ACCOUNTS = [
  { productCategory: "comprehensivePension" as const },
  { productCategory: "comprehensivePension" as const },
];

const WITH_FACTOR = {
  productCategory: "comprehensivePension" as const,
  annuityParameters: {
    hasGuaranteedFactor: false,
    conversionFactor: 200,
    estimatedMonthlyAnnuity: null,
    annuityTaxType: null,
    guaranteedPaymentMonths: null,
  },
};

function plan(extra: Overrides = {}) {
  return buildTestProfile({
    age: 40,
    retirementAge: 67,
    gender: "male",
    monthlyGrossSalary: 20_000,
    investmentReturnPct: 5,
    inflationPct: 2,
    pensionBalances: [900_000, 300_000],
    retirementMonthlyExpenses: 9_000,
    ...extra,
  });
}

describe("calculateRetirementKpis", () => {
  it("reports the planned spending, or null when none is entered", () => {
    expect(calculateRetirementKpis(plan()).plannedMonthlySpending).toBe(9_000);
    expect(
      calculateRetirementKpis(plan({ retirementMonthlyExpenses: undefined })).plannedMonthlySpending,
    ).toBeNull();
  });

  it("sums an itemised list into the planned spending", () => {
    const profile = plan({
      retirementMonthlyExpenses: undefined,
      expenseItems: [
        { name: "Rent", amount: 6_000, frequency: "monthly" },
        { name: "Food", amount: 3_000, frequency: "monthly" },
      ],
    });
    expect(calculateRetirementKpis(profile).plannedMonthlySpending).toBe(9_000);
  });

  describe("withdrawal rate", () => {
    it("is the planned spending's first-year draw over the savings that can be spent then", () => {
      const profile = plan();
      const { netWorthAtRetirement } = estimateRetirementIncome(profile);
      const rate = calculateRetirementKpis(profile).withdrawalRate;

      expect(rate).not.toBeNull();
      expect(rate!).toBeCloseTo((9_000 * 12) / netWorthAtRetirement, 3);
    });

    it("follows the planned spending, not the income the savings could sustain", () => {
      const base = calculateRetirementKpis(plan()).withdrawalRate!;
      const more = calculateRetirementKpis(plan({ retirementMonthlyExpenses: 12_000 })).withdrawalRate!;
      const less = calculateRetirementKpis(plan({ retirementMonthlyExpenses: 6_000 })).withdrawalRate!;

      expect(more).toBeCloseTo((base * 12_000) / 9_000, 6);
      expect(less).toBeCloseTo((base * 6_000) / 9_000, 6);
    });

    it("passes 100% when the savings cannot pay the planned spending", () => {
      const rate = calculateRetirementKpis(plan({ retirementMonthlyExpenses: 400_000 })).withdrawalRate;
      expect(rate!).toBeGreaterThan(1);
    });

    it("is lower when a state pension starts the day the user retires", () => {
      const without = calculateRetirementKpis(plan()).withdrawalRate!;
      const withBl = calculateRetirementKpis(
        plan({ bituachLeumi: { includeInProjection: true, monthlyPensionOverride: 4_000 } }),
      ).withdrawalRate!;
      expect(withBl).toBeCloseTo(((9_000 - 4_000) / 9_000) * without, 3);
    });

    it("ignores a state pension that has not started when the savings start to be drawn", () => {
      const early = { retirementAge: 60 };
      const without = calculateRetirementKpis(plan(early)).withdrawalRate!;
      const withBl = calculateRetirementKpis(
        plan({ ...early, bituachLeumi: { includeInProjection: true, monthlyPensionOverride: 4_000 } }),
      ).withdrawalRate!;
      expect(withBl).toBeCloseTo(without, 6);
    });

    it("is null when no spending is planned", () => {
      expect(
        calculateRetirementKpis(plan({ retirementMonthlyExpenses: undefined })).withdrawalRate,
      ).toBeNull();
    });

    it("is null when there are no savings to draw on", () => {
      expect(calculateRetirementKpis(plan({ pensionBalances: [] })).withdrawalRate).toBeNull();
    });
  });

  describe("income composition", () => {
    it("is the income breakdown of the first retirement year, split into payments and withdrawals", () => {
      const profile = plan({
        pensionAccountOverrides: [WITH_FACTOR, WITH_FACTOR],
        otherAssets: 400_000,
        bituachLeumi: { includeInProjection: true, monthlyPensionOverride: 3_000 },
      });
      const { incomeComposition } = calculateRetirementKpis(profile);
      const income = estimateRetirementIncome(profile).monthlyIncomeTodayMoney;

      expect(incomeComposition).toHaveLength(1);
      expect(incomeComposition[0].age).toBe(67);
      expect(Math.abs(incomeComposition[0].total - income)).toBeLessThanOrEqual(1);
      expect(incomeComposition[0].parts.map((part) => part.kind)).toContain("payment");
      expect(incomeComposition[0].parts.map((part) => part.kind)).toContain("withdrawal");
    });

    it("is empty when there is nothing to draw on", () => {
      expect(calculateRetirementKpis(plan({ pensionBalances: [] })).incomeComposition).toEqual([]);
    });
  });

  it("passes the access summary through", () => {
    const profile = plan({
      retirementAge: 55,
      otherAssets: 400_000,
      pensionAccountOverrides: LOCKED_ACCOUNTS,
    });
    const { access } = calculateRetirementKpis(profile);
    expect(access).toEqual(estimateRetirementIncome(profile).access);
    expect(access.lockedAtRetirement).toBeGreaterThan(0);
    expect(access.nextUnlockAge).toBe(60);
  });
});

describe("checkRetirementAges", () => {
  it("is null without planned spending, since there is nothing to test against", () => {
    expect(checkRetirementAges(plan({ retirementMonthlyExpenses: undefined }))).toBeNull();
  });

  it("checks now and each of 55, 60 and 65 the user has not reached", () => {
    const young = checkRetirementAges(plan({ age: 40 }))!;
    expect(young.map((check) => check.age)).toEqual([40, 55, 60, 65]);
    expect(young.map((check) => check.isNow)).toEqual([true, false, false, false]);

    expect(checkRetirementAges(plan({ age: 58 }))!.map((check) => check.age)).toEqual([58, 60, 65]);
    expect(checkRetirementAges(plan({ age: 55 }))!.map((check) => check.age)).toEqual([55, 60, 65]);
    expect(checkRetirementAges(plan({ age: 66 }))!.map((check) => check.age)).toEqual([66]);
    expect(
      checkRetirementAges(plan({ age: 70, retirementAge: 72 }))!.map((check) => check.age),
    ).toEqual([70]);
  });

  it("gives each check the same status and gap as the funding gap at that age", () => {
    const profile = plan();
    for (const check of checkRetirementAges(profile)!) {
      const gap = calculateFundingGapAtAge(profile, check.age);
      expect(check.status).toBe(gap.status);
      expect(check.monthlyGap).toBe(gap.monthlyGap);
    }
  });

  it("finds retiring later easier: the gap narrows as the savings grow and the horizon shortens", () => {
    const checks = checkRetirementAges(
      plan({ pensionBalances: [300_000, 100_000], retirementMonthlyExpenses: 9_000 }),
    )!;
    const at = (age: number) => checks.find((check) => check.age === age)!;
    expect(at(55).status).toBe("shortfall");
    expect(at(65).monthlyGap).toBeGreaterThan(at(55).monthlyGap);
  });

  it("marks every age on track for a large pot and a modest target", () => {
    const checks = checkRetirementAges(
      plan({ pensionBalances: [], otherAssets: 20_000_000, retirementMonthlyExpenses: 5_000 }),
    )!;
    expect(checks.every((check) => check.status === "onTrack")).toBe(true);
  });

  it("has no spouse age for a single person, and follows the age gap for a couple", () => {
    expect(checkRetirementAges(plan())!.every((check) => check.spouseAge === null)).toBe(true);

    const couple = plan({ age: 40, maritalStatus: "married", spouse: { age: 36, gender: "female" } });
    const spouseAges = checkRetirementAges(couple)!.map((check) => check.spouseAge);
    expect(spouseAges).toEqual([36, 51, 56, 61]);
  });
});
