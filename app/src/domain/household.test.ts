import { describe, expect, it } from "vitest";

import { buildTestProfile } from "../test/domainFixtures";
import { simulateDrawdownForTiming } from "./drawdown";
import { findEarliestFeasibleRetirementAge } from "./feasibility";
import {
  buildHousehold,
  resolveRetirementTiming,
  retirementTimingAtAge,
  spouseAgeAt,
} from "./household";
import { estimateIncomeBreakdownForTiming } from "./incomeBreakdown";
import {
  aggregateCurrentNetWorth,
  aggregatePensionBalance,
  isHouseholdActive,
  yearsToRetirement,
} from "./profileBasics";
import { estimateRetirementIncome, estimateRetirementIncomeForTiming } from "./retirementIncome";
import { projectBalanceAtAge, projectNetWorth } from "./netWorth";

// 4% nominal return and 4% inflation make the real return exactly 0%.
const ZERO_REAL = { investmentReturnPct: 4, inflationPct: 4 };
const MARRIED = { maritalStatus: "married" as const };
const INCLUDED = { includeInProjection: true };
const ACTIVE_CONTRIBUTING = {
  accountStatus: "activeContributing" as const,
  contributions: { employeeRatePercent: 6, employerRatePercent: 6.5, severanceRatePercent: 6 },
};

describe("household activation", () => {
  const accounts = {
    pensionBalances: [100_000, 100_000],
    pensionAccountOverrides: [{}, { owner: "spouse" as const }],
  };

  it("counts the spouse's accounts only when married with a spouse age entered", () => {
    const base = { age: 60, retirementAge: 67, ...ZERO_REAL, ...accounts };
    const couple = buildTestProfile({ ...base, ...MARRIED, spouse: { age: 58 } });
    const noSpouseAge = buildTestProfile({ ...base, ...MARRIED });
    const notMarried = buildTestProfile({ ...base, maritalStatus: "single", spouse: { age: 58 } });

    expect(isHouseholdActive(couple)).toBe(true);
    expect(isHouseholdActive(noSpouseAge)).toBe(false);
    expect(isHouseholdActive(notMarried)).toBe(false);
    expect(aggregatePensionBalance(couple)).toBe(200_000);
    expect(aggregatePensionBalance(noSpouseAge)).toBe(100_000);
    expect(aggregatePensionBalance(notMarried)).toBe(100_000);
  });

  it("leaves a single plan unchanged by half-filled spouse details", () => {
    const single = buildTestProfile({
      age: 60,
      retirementAge: 67,
      ...ZERO_REAL,
      pensionBalances: [100_000],
    });
    const withIgnoredSpouse = buildTestProfile({
      age: 60,
      retirementAge: 67,
      ...ZERO_REAL,
      ...accounts,
      maritalStatus: "single",
      spouse: { age: 40, retirementAge: 50, monthlyGrossSalary: 20_000 },
    });

    expect(estimateRetirementIncome(withIgnoredSpouse)).toEqual(estimateRetirementIncome(single));
    expect(projectNetWorth(withIgnoredSpouse)).toEqual(projectNetWorth(single));
    expect(findEarliestFeasibleRetirementAge(withIgnoredSpouse)).toEqual(
      findEarliestFeasibleRetirementAge(single),
    );
  });
});

describe("retirement timing", () => {
  const profile = buildTestProfile({
    age: 50,
    retirementAge: 65,
    ...MARRIED,
    spouse: { age: 48, retirementAge: 60 },
  });

  it("shifts both spouses by the same scenario offsets", () => {
    expect(resolveRetirementTiming(profile, "standard")).toEqual({ selfAge: 65, spouseAge: 60 });
    expect(resolveRetirementTiming(profile, "early")).toEqual({ selfAge: 60, spouseAge: 60 });
    expect(resolveRetirementTiming(profile, "delayed")).toEqual({ selfAge: 68, spouseAge: 63 });
  });

  it("defaults a missing spouse retirement age and has no spouse for a single person", () => {
    const noAge = buildTestProfile({ age: 50, ...MARRIED, spouse: { age: 48 } });
    expect(resolveRetirementTiming(noAge, "standard")).toEqual({ selfAge: 67, spouseAge: 67 });
    const single = buildTestProfile({ age: 50 });
    expect(resolveRetirementTiming(single, "standard")).toEqual({ selfAge: 67, spouseAge: null });
  });

  it("links the spouse's age to the primary user's through the age gap", () => {
    expect(spouseAgeAt(profile, 60)).toBe(58);
    expect(retirementTimingAtAge(profile, 60)).toEqual({ selfAge: 60, spouseAge: 58 });
  });

  it("counts years to retirement until the later spouse stops", () => {
    // Self retires in 15 years, the spouse in 12.
    expect(yearsToRetirement(profile)).toBe(15);
    const spouseLater = buildTestProfile({
      age: 50,
      retirementAge: 60,
      ...MARRIED,
      spouse: { age: 40, retirementAge: 67 },
    });
    expect(yearsToRetirement(spouseLater)).toBe(27);
  });
});

describe("household retirement income", () => {
  it("pools the savings of spouses of the same age", () => {
    const couple = buildTestProfile({
      age: 60,
      retirementAge: 67,
      ...ZERO_REAL,
      ...MARRIED,
      spouse: { age: 60, retirementAge: 67 },
      pensionBalances: [100_000, 100_000],
      pensionAccountOverrides: [{}, { owner: "spouse" }],
    });
    const pooled = buildTestProfile({
      age: 60,
      retirementAge: 67,
      ...ZERO_REAL,
      pensionBalances: [200_000],
    });

    const result = estimateRetirementIncome(couple);
    expect(result.netWorthAtRetirement).toBe(200_000);
    expect(result.householdRetirementAge).toBe(67);
    expect(result.members.map((member) => member.role)).toEqual(["self", "spouse"]);
    expect(result.monthlyIncomeTodayMoney).toBe(estimateRetirementIncome(pooled).monthlyIncomeTodayMoney);
    // 200,000 over (90 - 60 - 7) years.
    expect(result.monthlyIncomeTodayMoney).toBe(Math.round(200_000 / (23 * 12)));
  });

  it("plans until the younger spouse reaches 90", () => {
    const profile = buildTestProfile({
      age: 62,
      retirementAge: 67,
      ...ZERO_REAL,
      ...MARRIED,
      spouse: { age: 57, retirementAge: 62 },
      pensionBalances: [100_000, 100_000],
      pensionAccountOverrides: [{}, { owner: "spouse" }],
    });
    const household = buildHousehold(profile, resolveRetirementTiming(profile, "standard"));

    expect(household.retirementYears).toBe(5);
    expect(household.horizonYears).toBe(33);
    expect(household.drawdownStartAge).toBe(67);
    // 200,000 over (33 - 5) years.
    expect(estimateRetirementIncome(profile).monthlyIncomeTodayMoney).toBe(
      Math.round(200_000 / (28 * 12)),
    );
  });

  it("stops each spouse's deposits at their own retirement and starts drawing with the later one", () => {
    const profile = buildTestProfile({
      age: 60,
      retirementAge: 62,
      monthlyGrossSalary: 10_000,
      ...ZERO_REAL,
      ...MARRIED,
      spouse: { age: 60, retirementAge: 67, monthlyGrossSalary: 10_000 },
      pensionBalances: [0, 0],
      pensionAccountOverrides: [
        ACTIVE_CONTRIBUTING,
        { ...ACTIVE_CONTRIBUTING, owner: "spouse" },
      ],
    });
    const timing = resolveRetirementTiming(profile, "standard");
    expect(timing).toEqual({ selfAge: 62, spouseAge: 67 });

    // 1,850/month: 2 years for the primary user, 7 for the spouse.
    const income = estimateRetirementIncomeForTiming(profile, timing);
    expect(income.netWorthAtRetirement).toBe(44_400 + 155_400);
    expect(income.householdRetirementAge).toBe(67);

    const rows = simulateDrawdownForTiming(profile, timing, 0);
    expect(rows[2].netWorth).toBeCloseTo(2 * 22_200 + 2 * 22_200);
    expect(rows[3].netWorth).toBeCloseTo(2 * 22_200 + 3 * 22_200);
    expect(rows[0].age).toBe(60);
  });

  it("keeps an earlier retiree's savings growing until the household retires", () => {
    // 4% real return.
    const profile = buildTestProfile({
      age: 60,
      retirementAge: 60,
      investmentReturnPct: 6.08,
      inflationPct: 2,
      ...MARRIED,
      spouse: { age: 60, retirementAge: 70 },
      pensionBalances: [100_000],
    });
    const result = estimateRetirementIncomeForTiming(profile, { selfAge: 60, spouseAge: 70 });
    expect(result.netWorthAtRetirement).toBe(Math.round(100_000 * Math.pow(1.04, 10)));
  });
});

describe("spouse supplement", () => {
  const spouseWithoutPension = {
    gender: "female" as const,
    bituachLeumi: { insuredYearsToDate: 0 },
  };

  it("pays the primary user a flat supplement from their claim while the spouse has no pension", () => {
    const profile = buildTestProfile({
      age: 60,
      gender: "male",
      retirementAge: 67,
      bituachLeumi: INCLUDED,
      ...ZERO_REAL,
      ...MARRIED,
      spouse: { ...spouseWithoutPension, age: 58, retirementAge: 58 },
    });
    const timing = { selfAge: 67, spouseAge: 58 };
    const [self, spouse] = buildHousehold(profile, timing).members;

    expect(self.bituachLeumi.monthlyPension).toBe(2757);
    expect(self.bituachLeumi.spouseSupplement).toEqual({ monthly: 924, startAge: 67, endAge: null });
    expect(spouse.bituachLeumi.eligible).toBe(false);
    expect(spouse.bituachLeumi.spouseSupplement).toBeNull();

    expect(estimateRetirementIncomeForTiming(profile, timing).monthlyIncomeTodayMoney).toBe(
      2757 + 924,
    );
    const rows = simulateDrawdownForTiming(profile, timing, 0);
    expect(rows[6].streams.bituachLeumi).toBe(0);
    expect(rows[7].streams.bituachLeumi).toBe(2757 + 924);
  });

  it("waits until the spouse has stopped working", () => {
    const profile = buildTestProfile({
      age: 65,
      gender: "male",
      retirementAge: 65,
      bituachLeumi: INCLUDED,
      ...MARRIED,
      spouse: { ...spouseWithoutPension, age: 55, retirementAge: 58 },
    });
    const [self] = buildHousehold(profile, { selfAge: 65, spouseAge: 58 }).members;
    // The primary user claims at 67 (in 2 years); the spouse stops at 58 (in 3).
    expect(self.bituachLeumi.spouseSupplement).toEqual({ monthly: 924, startAge: 68, endAge: null });
  });

  it("ends when the spouse starts their own pension, whether or not it is included", () => {
    for (const spouseBituachLeumi of [{}, INCLUDED]) {
      const profile = buildTestProfile({
        age: 60,
        gender: "male",
        retirementAge: 67,
        bituachLeumi: INCLUDED,
        ...MARRIED,
        spouse: {
          age: 50,
          gender: "female",
          retirementAge: 50,
          bituachLeumi: spouseBituachLeumi,
        },
      });
      const [self, spouse] = buildHousehold(profile, { selfAge: 67, spouseAge: 50 }).members;

      // She claims at 65, in 15 years, when the primary user is 75.
      expect(self.bituachLeumi.spouseSupplement).toEqual({ monthly: 924, startAge: 67, endAge: 75 });
      // Her own pension starts after his, so she is never the recipient.
      expect(spouse.bituachLeumi.spouseSupplement).toBeNull();
    }
  });

  it("is not paid when the spouse's pension starts first or the recipient has none", () => {
    const base = {
      age: 60,
      gender: "male" as const,
      retirementAge: 67,
      ...MARRIED,
      spouse: { age: 62, gender: "female" as const, retirementAge: 62 },
    };
    const both = buildHousehold(
      buildTestProfile({ ...base, bituachLeumi: INCLUDED }),
      { selfAge: 67, spouseAge: 62 },
    ).members[0];
    // She is 62 and claims in about 3 years, long before he claims at 67.
    expect(both.bituachLeumi.spouseSupplement).toBeNull();

    const excluded = buildHousehold(
      buildTestProfile({
        ...base,
        spouse: { ...spouseWithoutPension, age: 58, retirementAge: 58 },
        bituachLeumi: { includeInProjection: false },
      }),
      { selfAge: 67, spouseAge: 58 },
    ).members[0];
    expect(excluded.bituachLeumi.spouseSupplement).toBeNull();
  });
});

describe("couple feasibility", () => {
  const base = {
    age: 50,
    ...ZERO_REAL,
    otherAssets: 1_500_000,
    retirementMonthlyExpenses: 5_000,
  };

  it("finds the earliest age at which both can retire together", () => {
    const couple = buildTestProfile({ ...base, ...MARRIED, spouse: { age: 48 } });
    // The plan runs until the younger spouse is 90, so it has to last 42 years from now.
    expect(findEarliestFeasibleRetirementAge(couple)).toEqual({
      status: "feasible",
      earliestAge: 67,
      yearsFromNow: 17,
      spouseAge: 65,
    });
  });

  it("does not report a spouse age for a single person", () => {
    expect(findEarliestFeasibleRetirementAge(buildTestProfile(base))).toEqual({
      status: "feasible",
      earliestAge: 65,
      yearsFromNow: 15,
    });
  });
});

describe("household projections", () => {
  const profile = buildTestProfile({
    age: 50,
    retirementAge: 60,
    ...ZERO_REAL,
    ...MARRIED,
    spouse: { age: 48, retirementAge: 58 },
    pensionBalances: [100_000, 100_000],
    pensionAccountOverrides: [{}, { owner: "spouse" }],
    otherAssets: 50_000,
    retirementMonthlyExpenses: 1_000,
  });

  it("projects net worth for the whole household on the primary user's age axis", () => {
    const points = projectNetWorth(profile);
    expect(points[0]).toEqual({ age: 50, netWorth: 250_000 });
    expect(aggregateCurrentNetWorth(profile)).toBe(250_000);
    // The younger spouse reaches 90 two years after the primary user does.
    expect(points[points.length - 1].age).toBe(92);
  });

  it("projects the primary user's balance without the spouse's accounts", () => {
    expect(projectBalanceAtAge(profile, 60)).toBe(150_000);
  });

  it("starts the income breakdown when the household retires and covers the full horizon", () => {
    const timing = resolveRetirementTiming(profile, "standard");
    const points = estimateIncomeBreakdownForTiming(profile, timing);
    // The later spouse (the primary user, retiring at 60) stops in 10 years.
    expect(points[0].age).toBe(60);
    expect(points[points.length - 1].age).toBe(92);
  });
});
