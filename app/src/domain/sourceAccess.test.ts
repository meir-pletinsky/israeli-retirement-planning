import { describe, expect, it } from "vitest";

import type { PensionAccount } from "../types";
import { buildTestProfile } from "../test/domainFixtures";
import { simulateDrawdown } from "./drawdown";
import { findEarliestFeasibleRetirementAge } from "./feasibility";
import { estimateIncomeBreakdown } from "./incomeBreakdown";
import { projectNetWorth } from "./netWorth";
import { estimateRetirementIncomeAtAge } from "./retirementIncome";
import { buildRetirementTimeline } from "./timeline";

// 4% nominal return and 4% inflation => 0% real return, so results are exact.
const zeroReal = { investmentReturnPct: 4, inflationPct: 4 };

const pension: Partial<PensionAccount> = { productCategory: "comprehensivePension" };

const annuityOf = (overrides: Partial<PensionAccount["annuityParameters"]>) => ({
  hasGuaranteedFactor: false,
  conversionFactor: null,
  estimatedMonthlyAnnuity: null,
  annuityTaxType: null,
  guaranteedPaymentMonths: null,
  ...overrides,
});

describe("income when part of the savings is locked", () => {
  it("is unchanged when the pension has already unlocked", () => {
    const locked = buildTestProfile({
      age: 60,
      pensionBalances: [600_000],
      pensionAccountOverrides: [pension],
      ...zeroReal,
    });
    const plain = buildTestProfile({ age: 60, pensionBalances: [600_000], ...zeroReal });
    const result = estimateRetirementIncomeAtAge(locked, 60);
    expect(result.monthlyIncomeTodayMoney).toBe(
      estimateRetirementIncomeAtAge(plain, 60).monthlyIncomeTodayMoney,
    );
    expect(result.access).toMatchObject({
      accessibleAtRetirement: 600_000,
      lockedAtRetirement: 0,
      nextUnlockAge: null,
      bridgeLimited: false,
    });
  });

  it("cannot spend a locked pension before 60", () => {
    // Retiring at 55 with only a pension fund: nothing is spendable for five years.
    const profile = buildTestProfile({
      age: 55,
      pensionBalances: [600_000],
      pensionAccountOverrides: [pension],
      ...zeroReal,
    });
    const result = estimateRetirementIncomeAtAge(profile, 55);
    expect(result.monthlyIncomeTodayMoney).toBe(0);
    expect(result.netWorthAtRetirement).toBe(600_000);
    expect(result.access).toMatchObject({
      accessibleAtRetirement: 0,
      lockedAtRetirement: 600_000,
      nextUnlockAge: 60,
      bridgeLimited: true,
      limitingAge: 60,
      // 600,000 / 420 months if it could all be spent from the start.
      unconstrainedMonthlyIncome: 1429,
    });
  });

  it("is limited by how long accessible savings must bridge to 60", () => {
    // Retire at 55: 60,000 accessible must last 60 months => 1,000/month; the
    // whole 660,000 would give 1,571/month over 420 months.
    const profile = buildTestProfile({
      age: 55,
      pensionBalances: [600_000],
      pensionAccountOverrides: [pension],
      otherAssets: 60_000,
      ...zeroReal,
    });
    const result = estimateRetirementIncomeAtAge(profile, 55);
    expect(result.monthlyIncomeTodayMoney).toBe(1000);
    expect(result.access).toMatchObject({
      accessibleAtRetirement: 60_000,
      lockedAtRetirement: 600_000,
      bridgeLimited: true,
      limitingAge: 60,
      unconstrainedMonthlyIncome: 1571,
    });
  });

  it("is not limited when the accessible savings are enough to bridge", () => {
    // 120,000 / 60 months = 2,000 > the 1,714 sustainable over the whole horizon.
    const profile = buildTestProfile({
      age: 55,
      pensionBalances: [600_000],
      pensionAccountOverrides: [pension],
      otherAssets: 120_000,
      ...zeroReal,
    });
    const result = estimateRetirementIncomeAtAge(profile, 55);
    expect(result.monthlyIncomeTodayMoney).toBe(1714);
    expect(result.access.bridgeLimited).toBe(false);
    expect(result.access.limitingAge).toBeNull();
  });

  it("counts a study fund only after its liquidity date", () => {
    const inYears = (years: number) =>
      new Date(Date.now() + years * 365.25 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const profile = (liquidityDate: string) =>
      buildTestProfile({
        age: 45,
        pensionBalances: [120_000],
        pensionAccountOverrides: [{ productCategory: "studyFund", liquidityDate }],
        ...zeroReal,
      });
    // Retire now with the study fund still locked for 2 years: nothing to spend until then.
    const stillLocked = estimateRetirementIncomeAtAge(profile(inYears(2)), 45);
    expect(stillLocked.monthlyIncomeTodayMoney).toBe(0);
    expect(stillLocked.access.nextUnlockAge).toBeCloseTo(47, 1);
    // Already liquid: it is spendable straight away.
    const liquid = estimateRetirementIncomeAtAge(profile(inYears(-1)), 45);
    expect(liquid.monthlyIncomeTodayMoney).toBe(Math.round(120_000 / (45 * 12)));
  });
});

describe("income when an account converts to an annuity", () => {
  const managersInsurance = (
    annuityParameters: Partial<PensionAccount["annuityParameters"]>,
    extra: { age?: number; otherAssets?: number } = {},
  ) =>
    buildTestProfile({
      age: extra.age ?? 67,
      pensionBalances: [1_000_000],
      pensionAccountOverrides: [
        { productCategory: "managersInsurance", annuityParameters: annuityOf(annuityParameters) },
      ],
      otherAssets: extra.otherAssets,
      ...zeroReal,
    });

  it("pays the factor-based annuity instead of drawing the capital down", () => {
    const profile = managersInsurance({ hasGuaranteedFactor: true, conversionFactor: 200 });
    const result = estimateRetirementIncomeAtAge(profile, 67);
    // 1,000,000 / 200 = 5,000/month for life; no other money to spend.
    expect(result.monthlyIncomeTodayMoney).toBe(5000);
    expect(result.access.accountAnnuityMonthly).toBe(5000);
    expect(result.access.accessibleAtRetirement).toBe(0);
    expect(result.netWorthAtRetirement).toBe(1_000_000);
  });

  it("adds the annuity on top of what the other savings provide", () => {
    const profile = managersInsurance({ estimatedMonthlyAnnuity: 4000 }, { otherAssets: 120_000 });
    // (120,000 + 4,000 * 276) / 276.
    expect(estimateRetirementIncomeAtAge(profile, 67).monthlyIncomeTodayMoney).toBe(4435);
  });

  it("cannot spend an annuity before it starts", () => {
    // Retire at 55; the policy pays from 60. 300,000 of other savings bridge 60 months.
    const profile = managersInsurance(
      { estimatedMonthlyAnnuity: 4000 },
      { age: 55, otherAssets: 300_000 },
    );
    const result = estimateRetirementIncomeAtAge(profile, 55);
    // (300,000 + 4,000 * 360 months of annuity) / 420 months.
    expect(result.monthlyIncomeTodayMoney).toBe(4143);
    expect(result.access.bridgeLimited).toBe(false);
  });
});

describe("projectNetWorth with locked savings", () => {
  const profile = (otherAssets: number) =>
    buildTestProfile({
      age: 55,
      retirementAge: 55,
      pensionBalances: [600_000],
      pensionAccountOverrides: [pension],
      otherAssets,
      retirementMonthlyExpenses: 1000,
      ...zeroReal,
    });
  const worthAt = (points: { age: number; netWorth: number }[], age: number) =>
    points.find((point) => point.age === age)!.netWorth;

  it("spends only the accessible savings before 60, then draws on the pension too", () => {
    const points = projectNetWorth(profile(60_000));
    expect(worthAt(points, 55)).toBe(660_000);
    // The accessible 60,000 pays 12,000 a year; the pension joins in only at 60.
    expect(worthAt(points, 59)).toBe(660_000 - 4 * 12_000);
    expect(worthAt(points, 60)).toBe(660_000 - 5 * 12_000);
  });

  it("does not dip into the locked pension when the accessible savings run out", () => {
    const points = projectNetWorth(profile(20_000));
    // The 20,000 is gone after two years; from then the pension stays untouched until 60.
    expect(worthAt(points, 57)).toBe(600_000);
    expect(worthAt(points, 59)).toBe(600_000);
    expect(worthAt(points, 60)).toBe(600_000 - 12_000);
  });

  it("drops the capital of an account once it converts to an annuity", () => {
    const converted = buildTestProfile({
      age: 60,
      retirementAge: 60,
      pensionBalances: [1_000_000],
      pensionAccountOverrides: [
        {
          productCategory: "managersInsurance",
          annuityParameters: annuityOf({ estimatedMonthlyAnnuity: 4000 }),
        },
      ],
      ...zeroReal,
    });
    const points = projectNetWorth(converted);
    expect(worthAt(points, 60)).toBe(1_000_000);
    expect(worthAt(points, 61)).toBe(0);
  });
});

describe("simulateDrawdown streams and shares", () => {
  const profile = buildTestProfile({
    age: 55,
    pensionBalances: [600_000, 300_000],
    pensionAccountOverrides: [
      pension,
      { productCategory: "managersInsurance", annuityParameters: annuityOf({ estimatedMonthlyAnnuity: 2500 }) },
    ],
    otherAssets: 60_000,
    ...zeroReal,
  });
  const rows = simulateDrawdown(profile, 55, 1000);
  const rowAt = (age: number) => rows.find((row) => row.age === age)!;

  it("starts the first row at today's net worth", () => {
    expect(rows[0].age).toBe(55);
    expect(rows[0].netWorth).toBe(960_000);
  });

  it("shares only the accessible capital before the pension unlocks", () => {
    expect(rowAt(56).capitalShare).toMatchObject({ otherInvestments: 1, pensionFund: 0 });
  });

  it("pays the annuity from 60 and the share includes the pension from then", () => {
    expect(rowAt(59).streams.managersInsurance).toBe(0);
    expect(rowAt(60).streams.managersInsurance).toBe(2500);
    expect(rowAt(60).capitalShare.pensionFund).toBeGreaterThan(0.9);
  });
});

describe("estimateIncomeBreakdown by source", () => {
  it("shows each kind only once it is unlocked", () => {
    // 0% real. Retire at 55; other assets bridge to 60 when the pension opens.
    const profile = buildTestProfile({
      age: 55,
      retirementAge: 55,
      pensionBalances: [600_000],
      pensionAccountOverrides: [pension],
      otherAssets: 120_000,
      ...zeroReal,
    });
    const points = estimateIncomeBreakdown(profile);
    const at = (age: number) => points.find((point) => point.age === age)!;
    // Sustainable income is 720,000 / 420 = 1,714 throughout.
    expect(at(55)).toMatchObject({ pensionFund: 0, investments: 1714 });
    expect(at(59)).toMatchObject({ pensionFund: 0, investments: 1714 });
    expect(at(60).pensionFund).toBeGreaterThan(0);
    expect(at(60).pensionFund + at(60).investments).toBe(1714);
  });

  it("splits out the account annuity and the other kinds", () => {
    const profile = buildTestProfile({
      age: 67,
      retirementAge: 67,
      pensionBalances: [1_000_000, 100_000],
      pensionAccountOverrides: [
        {
          productCategory: "managersInsurance",
          annuityParameters: annuityOf({ hasGuaranteedFactor: true, conversionFactor: 200 }),
        },
        { productCategory: "providentFund" },
      ],
      ...zeroReal,
    });
    const [first] = estimateIncomeBreakdown(profile);
    expect(first.managersInsurance).toBe(5000);
    // 100,000 / 276 months from the provident fund (unlocked at 60 < 67).
    expect(first.providentFund).toBe(362);
    expect(first.pensionFund).toBe(0);
    expect(first.investments).toBe(0);
  });

  it("keeps the last mix in the final year when all capital is used", () => {
    const profile = buildTestProfile({
      age: 67,
      retirementAge: 67,
      pensionBalances: [120_000],
      pensionAccountOverrides: [pension],
      ...zeroReal,
    });
    const points = estimateIncomeBreakdown(profile);
    expect(points.at(-1)!.pensionFund).toBe(435);
  });
});

describe("findEarliestFeasibleRetirementAge with locked savings", () => {
  const accounts = (locked: boolean) =>
    buildTestProfile({
      age: 40,
      pensionBalances: [2_000_000],
      pensionAccountOverrides: locked ? [pension] : [],
      otherAssets: 200_000,
      retirementMonthlyExpenses: 5000,
      ...zeroReal,
    });

  it("retires at 55 when everything counts as spendable", () => {
    // Net 5,000 needs about 5,167 gross (3.23% health tax on the early pension):
    // 2.2M / (5,167 * 12) = 35.5 years => retire by 54.5.
    expect(findEarliestFeasibleRetirementAge(accounts(false)).earliestAge).toBe(55);
  });

  it("waits until the accessible savings can bridge to 60", () => {
    // 200,000 / ((60 - age) * 12) >= 5,000 => age >= 56.7.
    expect(findEarliestFeasibleRetirementAge(accounts(true)).earliestAge).toBe(57);
  });
});

describe("buildRetirementTimeline", () => {
  const profile = buildTestProfile({
    age: 55,
    retirementAge: 55,
    gender: "male",
    pensionBalances: [600_000],
    pensionAccountOverrides: [pension],
    otherAssets: 120_000,
    bituachLeumi: { includeInProjection: true, monthlyPensionOverride: 1000 },
    ...zeroReal,
  });
  const segments = buildRetirementTimeline(estimateIncomeBreakdown(profile));

  it("starts a new segment whenever the set of paying sources changes", () => {
    expect(segments.map(({ fromAge, toAge, bands }) => ({ fromAge, toAge, bands }))).toEqual([
      { fromAge: 55, toAge: 59, bands: ["investments"] },
      { fromAge: 60, toAge: 66, bands: ["pensionFund", "investments"] },
      { fromAge: 67, toAge: 90, bands: ["pensionFund", "investments", "bituachLeumi"] },
    ]);
  });

  it("reports the average amounts and total per segment", () => {
    const final = segments[2];
    expect(final.amounts.bituachLeumi).toBe(1000);
    expect(final.monthlyIncome).toBe(
      Object.values(final.amounts).reduce((sum, amount) => sum + amount, 0),
    );
  });
});
