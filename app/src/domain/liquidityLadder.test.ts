import { describe, expect, it } from "vitest";

import { buildTestProfile } from "../test/domainFixtures";
import { buildLiquidityLadder } from "./liquidityLadder";
import { estimateRetirementIncome } from "./retirementIncome";

const zeroReal = { investmentReturnPct: 4, inflationPct: 4 };

/** An ISO date `years` from now (the test clock is pinned to 2026-06-15). */
const isoDateInYears = (years: number) =>
  new Date(Date.now() + years * 365.25 * 24 * 3600 * 1000).toISOString().slice(0, 10);

const staircase = () =>
  buildTestProfile({
    age: 50,
    gender: "male",
    retirementAge: 55,
    otherAssets: 50_000,
    pensionBalances: [300_000, 80_000, 100_000],
    pensionAccountOverrides: [
      { productCategory: "comprehensivePension" },
      { productCategory: "studyFund", liquidityDate: isoDateInYears(8) },
      { productCategory: "investmentProvidentFund" },
    ],
    ...zeroReal,
  });

describe("buildLiquidityLadder", () => {
  it("lists what opens at retirement, then each later unlock, with a running total", () => {
    const ladder = buildLiquidityLadder(staircase());

    expect(ladder.retirementAge).toBe(55);
    expect(ladder.retirementYear).toBe(2031);
    expect(ladder.rungs.map((rung) => [rung.month, rung.age, rung.year])).toEqual([
      [0, 55, 2031],
      [36, 58, 2034],
      [60, 60, 2036],
    ]);

    const [now, studyFund, pension] = ladder.rungs;
    expect(now.items.map((item) => [item.kind, item.amount])).toEqual([
      ["providentFund", 100_000],
      ["otherInvestments", 50_000],
    ]);
    expect(now.capital).toBe(150_000);
    expect(now.usableTotal).toBe(150_000);
    expect(studyFund.items.map((item) => [item.kind, item.amount])).toEqual([["studyFund", 80_000]]);
    expect(studyFund.usableTotal).toBe(230_000);
    expect(pension.items.map((item) => [item.kind, item.amount])).toEqual([["pensionFund", 300_000]]);
    expect(pension.usableTotal).toBe(530_000);
  });

  it("agrees with the access summary of the income estimate, with growth", () => {
    const profile = { ...staircase(), assumptions: { ...staircase().assumptions, investmentReturnPct: 6, inflationPct: 2.5 } };
    const access = estimateRetirementIncome(profile).access;
    const ladder = buildLiquidityLadder(profile);

    const atRetirement = ladder.rungs.find((rung) => rung.month === 0);
    expect(atRetirement?.capital).toBe(access.accessibleAtRetirement);
    const locked = ladder.rungs.at(-1)!.usableTotal - atRetirement!.capital;
    expect(Math.abs(locked - access.lockedAtRetirement)).toBeLessThanOrEqual(1);
    expect(ladder.rungs[1].age).toBeCloseTo(access.nextUnlockAge!, 1);
  });

  it("shows annuities and the Bituach Leumi pension as monthly payments that start, not capital", () => {
    const profile = buildTestProfile({
      age: 50,
      gender: "male",
      retirementAge: 55,
      pensionBalances: [300_000],
      pensionAccountOverrides: [
        {
          productCategory: "comprehensivePension",
          annuityParameters: {
            hasGuaranteedFactor: false,
            conversionFactor: null,
            estimatedMonthlyAnnuity: 2_000,
            annuityTaxType: null,
            guaranteedPaymentMonths: null,
          },
        },
      ],
      bituachLeumi: { includeInProjection: true, monthlyPensionOverride: 1_000 },
      ...zeroReal,
    });
    const ladder = buildLiquidityLadder(profile);

    const income = ladder.rungs.flatMap((rung) =>
      rung.items.filter((item) => item.type === "income").map((item) => [item.kind, item.amount, rung.age]),
    );
    expect(income).toContainEqual(["annuity", 2_000, expect.any(Number)]);
    expect(income).toContainEqual(["bituachLeumi", 1_000, 67]);
    expect(ladder.rungs.every((rung) => rung.capital === 0)).toBe(true);
    expect(ladder.rungs.at(-1)?.usableTotal).toBe(0);
  });

  it("places a spouse's pot at the primary user's age when it opens, and keeps the person", () => {
    const profile = buildTestProfile({
      age: 40,
      gender: "male",
      retirementAge: 60,
      maritalStatus: "married",
      spouse: { age: 36, gender: "female", retirementAge: 55 },
      pensionBalances: [200_000],
      pensionAccountOverrides: [{ productCategory: "comprehensivePension", owner: "spouse" }],
      ...zeroReal,
    });
    const ladder = buildLiquidityLadder(profile);

    // The spouse turns 60 in 24 years, when the primary user is 64.
    expect(ladder.rungs).toHaveLength(1);
    expect(ladder.rungs[0].age).toBe(64);
    expect(ladder.rungs[0].items).toEqual([
      { kind: "pensionFund", member: "spouse", amount: 200_000, type: "capital" },
    ]);
  });

  it("leaves out anything that opens after the planning horizon", () => {
    const profile = buildTestProfile({
      age: 85,
      retirementAge: 85,
      pensionBalances: [100_000, 50_000],
      pensionAccountOverrides: [
        { productCategory: "investmentProvidentFund" },
        { productCategory: "studyFund", liquidityDate: isoDateInYears(10) },
      ],
      ...zeroReal,
    });
    const ladder = buildLiquidityLadder(profile);

    expect(ladder.rungs.map((rung) => rung.items.map((item) => item.kind))).toEqual([["providentFund"]]);
  });

  it("has no rungs for an empty plan", () => {
    expect(buildLiquidityLadder(buildTestProfile({ age: 40, retirementAge: 67 })).rungs).toEqual([]);
  });

  describe("employer shares that vest after retirement", () => {
    const withTranches = (vestDates: string[], keepsVestingAfterLeaving: boolean) =>
      buildTestProfile({
        age: 50,
        retirementAge: 55,
        equity: [
          {
            quantity: 100 * vestDates.length,
            priceUSD: 50,
            employerGrant: {
              keepsVestingAfterLeaving,
              vestingTranches: vestDates.map((vestDate) => ({ vestDate, quantity: 100 })),
            },
          },
        ],
        ...zeroReal,
      });

    it("flags the ones the owner keeps, with their value and the first date", () => {
      const late = isoDateInYears(7);
      const ladder = buildLiquidityLadder(
        withTranches([isoDateInYears(1), late, isoDateInYears(9)], true),
      );
      // 100 shares * $50 * 3.7 for each of the two late batches.
      expect(ladder.lateVesting).toEqual({ value: 37_000, firstVestDate: late });
    });

    it("does not flag them when the unvested shares are lost on leaving", () => {
      const ladder = buildLiquidityLadder(
        withTranches([isoDateInYears(1), isoDateInYears(7), isoDateInYears(9)], false),
      );
      expect(ladder.lateVesting).toBeNull();
    });

    it("does not flag shares that are all vested by retirement", () => {
      expect(
        buildLiquidityLadder(withTranches([isoDateInYears(1), isoDateInYears(4)], true)).lateVesting,
      ).toBeNull();
    });
  });
});
