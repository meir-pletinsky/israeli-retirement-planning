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
    it("is the first year's income over the savings at retirement when no state pension helps", () => {
      const profile = plan();
      const { monthlyIncomeTodayMoney, netWorthAtRetirement } = estimateRetirementIncome(profile);
      const rate = calculateRetirementKpis(profile).withdrawalRate;

      expect(rate).not.toBeNull();
      expect(rate!).toBeCloseTo((monthlyIncomeTodayMoney * 12) / netWorthAtRetirement, 3);
      // Over a long retirement at a 3% real return the sustainable draw is a few percent.
      expect(rate!).toBeGreaterThan(0.03);
      expect(rate!).toBeLessThan(0.08);
    });

    it("is unchanged by a state pension that starts the day the user retires", () => {
      const without = calculateRetirementKpis(plan()).withdrawalRate!;
      const withBl = calculateRetirementKpis(
        plan({ bituachLeumi: { includeInProjection: true, monthlyPensionOverride: 4_000 } }),
      ).withdrawalRate!;
      expect(withBl).toBeCloseTo(without, 6);
    });

    it("is higher when the savings carry the years before the state pension starts", () => {
      const early = { retirementAge: 60 };
      const without = calculateRetirementKpis(plan(early)).withdrawalRate!;
      const withBl = calculateRetirementKpis(
        plan({ ...early, bituachLeumi: { includeInProjection: true, monthlyPensionOverride: 4_000 } }),
      ).withdrawalRate!;
      expect(withBl).toBeGreaterThan(without);
    });

    it("is null when there are no savings to draw on", () => {
      expect(calculateRetirementKpis(plan({ pensionBalances: [] })).withdrawalRate).toBeNull();
    });
  });

  describe("pension income", () => {
    it("is the income paid from the pension accounts, from the retirement age", () => {
      const profile = plan();
      const { pension } = calculateRetirementKpis(profile);
      const income = estimateRetirementIncome(profile).monthlyIncomeTodayMoney;

      expect(pension.fromAge).toBe(67);
      expect(Math.abs(pension.monthly - income)).toBeLessThanOrEqual(1);
    });

    it("leaves out savings held outside the pension accounts", () => {
      const { pension } = calculateRetirementKpis(plan({ pensionBalances: [], otherAssets: 1_000_000 }));
      expect(pension).toEqual({ monthly: 0, fromAge: null });
    });

    it("starts only when the accounts unlock if the user retires earlier", () => {
      const { pension } = calculateRetirementKpis(
        plan({ retirementAge: 55, otherAssets: 600_000, pensionAccountOverrides: LOCKED_ACCOUNTS }),
      );
      expect(pension.fromAge).toBe(60);
      expect(pension.monthly).toBeGreaterThan(0);
    });
  });

  describe("state benefits", () => {
    it("is the Bituach Leumi pension, from the age it is paid", () => {
      const { stateBenefits } = calculateRetirementKpis(
        plan({ bituachLeumi: { includeInProjection: true, monthlyPensionOverride: 3_000 } }),
      );
      expect(stateBenefits).toEqual({ monthly: 3_000, fromAge: 67 });
    });

    it("starts at the statutory age even when the user retires before it", () => {
      const { stateBenefits } = calculateRetirementKpis(
        plan({
          retirementAge: 60,
          otherAssets: 500_000,
          bituachLeumi: { includeInProjection: true, monthlyPensionOverride: 3_000 },
        }),
      );
      expect(stateBenefits).toEqual({ monthly: 3_000, fromAge: 67 });
    });

    it("is zero when the user left it out of the projection", () => {
      expect(calculateRetirementKpis(plan()).stateBenefits).toEqual({ monthly: 0, fromAge: null });
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
