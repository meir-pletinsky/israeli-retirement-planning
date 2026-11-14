import { describe, expect, it } from "vitest";

import { buildTestProfile } from "../test/domainFixtures";
import { incomeSurplus, measureSurplus } from "./incomeSurplus";
import { applyWhatIf, baselineWhatIf, evaluateWhatIf } from "./whatIf";

const ANNUITY = {
  hasGuaranteedFactor: true,
  conversionFactor: null,
  estimatedMonthlyAnnuity: 5_000,
  annuityTaxType: null,
  guaranteedPaymentMonths: null,
};

/** A pension that pays 5,000 a month from 60 against spending that is well below it. */
const generous = (monthlySpending: number) =>
  buildTestProfile({
    age: 55,
    retirementAge: 60,
    pensionBalances: [1_500_000],
    pensionAccountOverrides: [{ providerName: "Migdal", productCategory: "comprehensivePension", annuityParameters: ANNUITY }],
    otherAssets: 300_000,
    retirementMonthlyExpenses: monthlySpending,
  });

describe("measureSurplus", () => {
  it("measures how far income is above the planned spending", () => {
    expect(measureSurplus(10_500, 10_000, 5)).toEqual({ excess: 500, excessPct: 5, overCap: false });
    expect(measureSurplus(10_800, 10_000, 5)).toMatchObject({ excess: 800, excessPct: 8, overCap: true });
  });

  it("ignores a few shekels of rounding, and income at or below the spending", () => {
    expect(measureSurplus(10_502, 10_000, 5).overCap).toBe(false);
    expect(measureSurplus(9_000, 10_000, 0)).toEqual({ excess: 0, excessPct: 0, overCap: false });
  });

  it("flags any real excess with no allowance, and none with nothing planned", () => {
    expect(measureSurplus(10_100, 10_000, 0).overCap).toBe(true);
    expect(measureSurplus(1_000, 0, 5)).toEqual({ excess: 1_000, excessPct: 0, overCap: false });
  });
});

describe("incomeSurplus", () => {
  const planOf = (profile: ReturnType<typeof generous>) => evaluateWhatIf(profile).cashFlow!;

  it("flags the years in which a pension alone pays more than the spending allows", () => {
    const surplus = incomeSurplus(planOf(generous(4_000)), 5);
    expect(surplus.years.length).toBeGreaterThan(0);
    expect(surplus.years.every((year) => year.excess > 200)).toBe(true);
    expect(surplus.peak?.excess).toBe(Math.max(...surplus.years.map((year) => year.excess)));
    expect(surplus.years[0].age).toBe(60);
  });

  it("flags nothing when the allowance is large enough, or when spending needs the pension", () => {
    expect(incomeSurplus(planOf(generous(4_000)), 100).years).toEqual([]);
    expect(incomeSurplus(planOf(generous(9_000)), 5)).toMatchObject({ years: [], peak: null });
  });

  it("flags a year with a later pension start only when the pension lands in it", () => {
    const profile = generous(4_000);
    const delayed = applyWhatIf(profile, { ...baselineWhatIf(profile), pensionStartAge: 66 });
    const ages = incomeSurplus(planOf(delayed), 5).years.map((year) => year.age);
    expect(ages.length).toBeGreaterThan(0);
    expect(Math.min(...ages)).toBeGreaterThanOrEqual(66);
  });
});
