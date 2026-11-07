import { describe, expect, it } from "vitest";

import { buildTestProfile } from "../test/domainFixtures";
import { createCoverPlan, type CoverPlan, type PensionAccount } from "../types";
import { COVER_RULES } from "./accessRules";
import { coverCostOf } from "./coverCost";
import { coverOnFile } from "./coverPlan";
import { simulateDrawdownForTiming } from "./drawdown";
import { calculateFundingGapForTiming } from "./fundingGap";
import {
  averageMonthlyCoverCost,
  buildHousehold,
  coverCostYears,
  resolveRetirementTiming,
} from "./household";
import { estimateNetIncomeForTiming } from "./netIncome";
import { estimateRetirementIncomeForTiming } from "./retirementIncome";
import { runTraced } from "./trace";
import { checkTrace } from "./traceCheck";
import { constantsSnapshot } from "./traceConstants";

const FREE = COVER_RULES.freeExtensionMonths / 12;
const EVALUATED_AT = new Date("2026-06-01T00:00:00Z");

const plan = (changes: Partial<CoverPlan>): CoverPlan => ({ ...createCoverPlan("none"), ...changes });

const withRisk = (monthlyRiskDeduction: number): Partial<PensionAccount> => ({
  accountStatus: "activeContributing",
  insuranceCoverages: {
    deathCoverageAmount: 800_000,
    monthlyDisabilityAmount: null,
    monthlyRiskDeduction,
    monthlySurvivorsSpousePension: 4_000,
    survivorSpousePercent: null,
  },
});

const base = {
  age: 50,
  gender: "male" as const,
  retirementAge: 55,
  monthlyGrossSalary: 25_000,
  investmentReturnPct: 4,
  inflationPct: 2,
  pensionBalances: [900_000, 300_000],
  pensionAccountOverrides: [withRisk(90), { productCategory: "providentFund" as const }],
  otherAssets: 600_000,
  retirementMonthlyExpenses: 12_000,
};

const timingOf = (profile: ReturnType<typeof buildTestProfile>) => resolveRetirementTiming(profile, "standard");

describe("coverCostOf", () => {
  const onFile = { deathCoverage: 800_000, monthlyRiskDeduction: 90, monthlySurvivorsPension: 4_000, hasCover: true };

  it("pays nothing without a plan, for 'none', or when the cost is unknown or zero", () => {
    expect(coverCostOf(null, onFile, 55)).toBeNull();
    expect(coverCostOf(plan({ option: "none", monthlyCost: 100 }), onFile, 55)).toBeNull();
    expect(coverCostOf(plan({ option: "termLife" }), onFile, 55)).toBeNull();
    expect(coverCostOf(plan({ option: "termLife", monthlyCost: 0 }), onFile, 55)).toBeNull();
    expect(coverCostOf(plan({ option: "keepPensionInsurance" }), { ...onFile, monthlyRiskDeduction: 0 }, 55)).toBeNull();
  });

  it("starts after the free extension and runs to the end of the option", () => {
    const keep = coverCostOf(plan({ option: "keepPensionInsurance" }), onFile, 55);
    expect(keep).toMatchObject({ option: "keepPensionInsurance", monthly: 90 });
    expect(keep?.startAge).toBeCloseTo(55 + FREE, 10);
    expect(keep?.endAge).toBe(60);

    const term = coverCostOf(plan({ option: "termLife", monthlyCost: 250, termEndAge: 58 }), onFile, 55);
    expect(term).toMatchObject({ option: "termLife", monthly: 250, endAge: 58 });
  });

  it("pays nothing when the option ends inside the free extension", () => {
    expect(coverCostOf(plan({ option: "termLife", monthlyCost: 250, termEndAge: 55.2 }), onFile, 55)).toBeNull();
  });
});

describe("the household's cover cost", () => {
  it("is nothing without a plan or for 'none'", () => {
    for (const coverPlan of [undefined, plan({ option: "none", monthlyCost: 300 })]) {
      const household = buildHousehold(buildTestProfile({ ...base, coverPlan }), resolveRetirementTiming(buildTestProfile(base), "standard"));
      expect(household.members[0].coverCost).toBeNull();
      expect(coverCostYears(household.members[0])).toBeNull();
      expect(averageMonthlyCoverCost(household, 6)).toBe(0);
    }
  });

  it("averages the monthly cost over the part of each year in which it is paid", () => {
    const profile = buildTestProfile({ ...base, coverPlan: plan({ option: "keepPensionInsurance" }) });
    const household = buildHousehold(profile, timingOf(profile));
    expect(household.members[0].coverCost?.monthly).toBe(90);
    const { startYears, endYears } = coverCostYears(household.members[0])!;
    expect(startYears).toBeCloseTo(5 + FREE, 10);
    expect(endYears).toBe(10);
    expect(averageMonthlyCoverCost(household, 4)).toBe(0);
    expect(averageMonthlyCoverCost(household, 5)).toBeCloseTo(90 * (1 - FREE), 10);
    expect(averageMonthlyCoverCost(household, 7)).toBe(90);
    expect(averageMonthlyCoverCost(household, 10)).toBe(0);
  });

  it("follows each spouse's own ages and sums the two plans", () => {
    const profile = buildTestProfile({
      ...base,
      maritalStatus: "married",
      coverPlan: plan({ option: "keepPensionInsurance" }),
      spouse: {
        age: 48,
        retirementAge: 53,
        coverPlan: plan({ option: "termLife", monthlyCost: 250, termEndAge: 58 }),
      },
      pensionBalances: [900_000, 300_000, 400_000],
      pensionAccountOverrides: [withRisk(90), { productCategory: "providentFund" as const }, { owner: "spouse" as const }],
    });
    const household = buildHousehold(profile, timingOf(profile));
    const [self, spouse] = household.members;
    expect(self.coverCost?.monthly).toBe(90);
    expect(spouse.coverCost).toMatchObject({ option: "termLife", monthly: 250, endAge: 58 });
    // The spouse is 2 years younger than the primary user, so the policy ends 10 years from now.
    expect(coverCostYears(spouse)?.endYears).toBeCloseTo(10, 10);
    expect(averageMonthlyCoverCost(household, 7)).toBeCloseTo(90 + 250, 10);
    // Both policies end 10 years from now, so a year that starts at 9.5 has half a year of each.
    expect(averageMonthlyCoverCost(household, 9.5)).toBeCloseTo((90 + 250) * 0.5, 10);
    expect(averageMonthlyCoverCost(household, 10)).toBe(0);
  });
});

describe("the cover cost in the retirement income", () => {
  const without = buildTestProfile(base);
  const noneYet = buildTestProfile({ ...base, coverPlan: plan({ option: "none" }) });
  const keep = buildTestProfile({ ...base, coverPlan: plan({ option: "keepPensionInsurance" }) });
  const term = buildTestProfile({ ...base, coverPlan: plan({ option: "termLife", monthlyCost: 400, termEndAge: 60 }) });

  it("changes nothing without a plan or for 'none'", () => {
    const expected = estimateRetirementIncomeForTiming(without, timingOf(without));
    expect(estimateRetirementIncomeForTiming(noneYet, timingOf(noneYet))).toEqual(expected);
    expect(estimateNetIncomeForTiming(noneYet, timingOf(noneYet))).toEqual(
      estimateNetIncomeForTiming(without, timingOf(without)),
    );
    expect(simulateDrawdownForTiming(noneYet, timingOf(noneYet), 12_000)).toEqual(
      simulateDrawdownForTiming(without, timingOf(without), 12_000),
    );
  });

  it("lowers the sustainable income, more for the dearer option", () => {
    const free = estimateRetirementIncomeForTiming(without, timingOf(without)).monthlyIncomeTodayMoney;
    const kept = estimateRetirementIncomeForTiming(keep, timingOf(keep)).monthlyIncomeTodayMoney;
    const termed = estimateRetirementIncomeForTiming(term, timingOf(term)).monthlyIncomeTodayMoney;
    expect(kept).toBeLessThan(free);
    expect(termed).toBeLessThan(kept);
    expect(free - termed).toBeLessThan(400);
  });

  it("is drawn from savings in the years it is paid, and not in the others", () => {
    const rowsWithout = simulateDrawdownForTiming(without, timingOf(without), 12_000);
    const rowsWith = simulateDrawdownForTiming(term, timingOf(term), 12_000);
    expect(rowsWith.length).toBe(rowsWithout.length);
    const at = (rows: typeof rowsWith, yearsFromNow: number) => rows.find((row) => row.yearsFromNow === yearsFromNow)!;
    // 5 to 10 years from now the household pays 400 a month, i.e. 4,800 a year, on top of its spending.
    expect(at(rowsWith, 7).drawn - at(rowsWithout, 7).drawn).toBeCloseTo(4_800, 6);
    expect(at(rowsWith, 12).drawn).toBeCloseTo(at(rowsWithout, 12).drawn, 6);
    expect(at(rowsWith, 12).netWorth).toBeLessThan(at(rowsWithout, 12).netWorth);
  });

  it("is paid but not counted as income, so that gross less tax is the net income", () => {
    const estimate = estimateNetIncomeForTiming(term, timingOf(term));
    const free = estimateNetIncomeForTiming(without, timingOf(without));
    for (const year of estimate.years) {
      expect(year.grossMonthly - year.taxMonthly).toBe(year.netMonthly);
    }
    expect(estimate.netMonthlyIncome).toBeLessThanOrEqual(free.netMonthlyIncome);
    const gapWith = calculateFundingGapForTiming(term, timingOf(term));
    const gapWithout = calculateFundingGapForTiming(without, timingOf(without));
    expect(gapWith.monthlyGap).toBeLessThanOrEqual(gapWithout.monthlyGap);
  });

  it("starts a spouse's cost after the spouse's own free extension, and counts it from the household's retirement", () => {
    const couple = buildTestProfile({
      ...base,
      maritalStatus: "married",
      spouse: {
        age: 50,
        retirementAge: 62,
        coverPlan: plan({ option: "termLife", monthlyCost: 300, termEndAge: 64 }),
      },
      pensionBalances: [900_000, 300_000, 400_000],
      pensionAccountOverrides: [withRisk(90), { productCategory: "providentFund" as const }, { owner: "spouse" as const }],
    });
    const household = buildHousehold(couple, timingOf(couple));
    // The household retires with the spouse, 12 years from now, while the policy ran from 62 + FREE.
    expect(averageMonthlyCoverCost(household, 12)).toBeCloseTo(300 * (1 - FREE), 10);
    const withPlan = estimateRetirementIncomeForTiming(couple, timingOf(couple)).monthlyIncomeTodayMoney;
    const noPlan = estimateRetirementIncomeForTiming(
      { ...couple, spouse: { ...couple.spouse, coverPlan: null } },
      timingOf(couple),
    ).monthlyIncomeTodayMoney;
    expect(withPlan).toBeLessThan(noPlan);
  });

  it("never reports a negative income", () => {
    const heavy = buildTestProfile({
      ...base,
      pensionBalances: [20_000],
      pensionAccountOverrides: [withRisk(90)],
      otherAssets: 0,
      coverPlan: plan({ option: "termLife", monthlyCost: 30_000, termEndAge: 80 }),
    });
    expect(estimateRetirementIncomeForTiming(heavy, timingOf(heavy)).monthlyIncomeTodayMoney).toBeGreaterThanOrEqual(0);
  });
});

describe("the calculation trace with a cover plan", () => {
  const couple = buildTestProfile({
    ...base,
    maritalStatus: "married",
    coverPlan: plan({ option: "keepPensionInsurance", needUntilAge: 62 }),
    spouse: {
      age: 48,
      gender: "female",
      retirementAge: 53,
      monthlyGrossSalary: 15_000,
      coverPlan: plan({ option: "termLife", monthlyCost: 250, termEndAge: 58 }),
    },
    pensionBalances: [900_000, 300_000, 400_000],
    pensionAccountOverrides: [withRisk(90), { productCategory: "providentFund" as const }, { owner: "spouse" as const }],
  });
  const timing = timingOf(couple);
  const untraced = calculateFundingGapForTiming(couple, timing);
  const traced = runTraced(() => calculateFundingGapForTiming(couple, timing), { evaluatedAt: EVALUATED_AT });

  it("does not change the result", () => {
    expect(traced.result).toEqual(untraced);
  });

  it("checks out against its own inputs and the constants", () => {
    const report = checkTrace(traced.log, { profile: couple, constants: constantsSnapshot() });
    expect(report.issues).toEqual([]);
    expect(report.exprChecked).toBeGreaterThan(50);
  });

  it("records how each member's cost came about", () => {
    const ids = new Set(traced.log.steps.map((step) => step.id));
    for (const role of ["self", "spouse"]) {
      for (const id of ["monthlyCost", "startAge", "endAge"]) expect(ids, `${role}/cover/${id}`).toContain(`${role}/cover/${id}`);
      expect(ids).toContain(`income/${role}/coverCostStartMonth`);
      expect(ids).toContain(`income/${role}/coverCostEndMonth`);
    }
    expect(ids).toContain("net/binding/coverCostMonthly");
    const tables = traced.log.tables.map((table) => table.id);
    expect(tables).toContain("drawdown/coverCost");
    const column = traced.log.tables.find((table) => table.id === "net/years")?.columns ?? [];
    expect(column).toContain("coverCostMonthly");
  });

  it("leaves out the cover steps and the cost table when nothing is paid", () => {
    const quiet: typeof couple = {
      ...couple,
      personal: { ...couple.personal, coverPlan: null },
      spouse: { ...couple.spouse, coverPlan: null },
    };
    const { log } = runTraced(() => calculateFundingGapForTiming(quiet, timingOf(quiet)), { evaluatedAt: EVALUATED_AT });
    expect(log.steps.some((step) => step.id.includes("/cover/"))).toBe(false);
    expect(log.tables.some((table) => table.id === "drawdown/coverCost")).toBe(false);
  });

  it("reads the cost back from the profile", () => {
    expect(coverOnFile(couple, "self").monthlyRiskDeduction).toBe(90);
  });
});
