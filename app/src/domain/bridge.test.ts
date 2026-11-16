import { describe, expect, it } from "vitest";

import { buildTestProfile } from "../test/domainFixtures";
import { BRIDGE_MODES, type BridgeMode, type WithdrawalStrategy } from "../types";
import { bridgeIncomeLevels, bridgeWindowEnd, bridgeWindowEndAge, zeroTaxMonthlyIncome } from "./bridge";
import { buildHousehold, retirementTimingAtAge, type HouseholdMember } from "./household";
import { simulateDrawdown, type DrawdownYear } from "./drawdown";
import { compareWithdrawalStrategies } from "./withdrawalStrategies";

const ANNUITY = {
  hasGuaranteedFactor: true,
  conversionFactor: null,
  estimatedMonthlyAnnuity: 5_000,
  annuityTaxType: null,
  guaranteedPaymentMonths: null,
};

// 360,000 each at 3.6 shekels per dollar: the old award is 10% ordinary income, the new one 80%.
const OLD = {
  quantity: 1000,
  priceUSD: 100,
  ticker: "OLD",
  employerGrant: { grantPriceUSD: 10, grantDate: "2018-01-01", holdingPeriodMet: true },
};
const NEW = {
  quantity: 1000,
  priceUSD: 100,
  ticker: "NEW",
  employerGrant: { grantPriceUSD: 80, grantDate: "2023-01-01", holdingPeriodMet: true },
};

// Retires at 57; the pension annuity starts at 60, so the bridge window is the years 57 to 59. A man has 2.25 credit points.
const single = (overrides: Parameters<typeof buildTestProfile>[0] = {}) =>
  buildTestProfile({
    age: 57,
    gender: "male",
    retirementAge: 57,
    investmentReturnPct: 4,
    inflationPct: 4,
    pensionBalances: [600_000],
    pensionAccountOverrides: [{ productCategory: "comprehensivePension", annuityParameters: ANNUITY }],
    equity: [OLD, NEW],
    usdToIlsRate: { rate: 3.6 },
    withdrawalStrategy: "taxSmart",
    ...overrides,
  });

const rowsOf = (profile: ReturnType<typeof single>, spending: number) => simulateDrawdown(profile, 57, spending);
const at = (rows: DrawdownYear[], age: number) => rows.find((row) => row.age === age)!;
const sold = (row: DrawdownYear, label: string) =>
  (row.bridge?.sales ?? []).filter((sale) => sale.label === label).reduce((sum, sale) => sum + sale.amount, 0);

describe("bridge helpers", () => {
  it("finds the monthly income that bears no tax after the credit points", () => {
    expect(zeroTaxMonthlyIncome(2.25)).toBeCloseTo(5_445, 6);
    expect(zeroTaxMonthlyIncome(2.75)).toBeCloseTo(6_655, 6);
    expect(zeroTaxMonthlyIncome(0)).toBe(0);
  });

  it("lists more income levels the further the mode goes, never going down", () => {
    expect(BRIDGE_MODES.map((mode) => bridgeIncomeLevels(mode, 2.25).length)).toEqual([4, 1, 2, 3]);
    expect(bridgeIncomeLevels("bracket10", 2.25)).toEqual([5_445, 7_010]);
    expect(bridgeIncomeLevels("matchSpending", 2.25).at(-1)).toBe(Number.POSITIVE_INFINITY);
    // With many credit points the zero-tax income is past the second bracket.
    const rich = bridgeIncomeLevels("bracket14", 8);
    expect(rich[0]).toBeGreaterThan(10_060);
    expect(rich).toEqual([rich[0], rich[0], rich[0]]);
  });

  it("ends the window at the earliest annuity or Bituach Leumi pension, or never", () => {
    const profile = single();
    const [member] = buildHousehold(profile, retirementTimingAtAge(profile, 57)).members;
    expect(bridgeWindowEndAge(member)).toBe(60);
    expect(bridgeWindowEndAge({ ...member, sources: [] })).toBe(Number.POSITIVE_INFINITY);
    const withPension = { ...member, bituachLeumi: { ...member.bituachLeumi, claimAge: 58, monthlyPension: 1_500 } } as HouseholdMember;
    expect(bridgeWindowEndAge(withPension)).toBe(58);
    expect(bridgeWindowEnd(withPension)).toEqual({ age: 58, source: "bituachLeumi" });
    expect(bridgeWindowEnd(member)).toEqual({ age: 60, source: "annuity" });
    expect(bridgeWindowEnd({ ...member, sources: [] })).toEqual({ age: Number.POSITIVE_INFINITY, source: null });
  });
});

describe("tax-smart drawdown", () => {
  it("sells the shares with the most ordinary income first in the window and in proportion after it", () => {
    const rows = rowsOf(single(), 8_000);
    // Only shares to draw on: the whole 96,000 a year comes from the new award.
    for (const age of [58, 59]) {
      expect(at(rows, age).bridge?.members[0].inWindow).toBe(true);
      expect(sold(at(rows, age), "NEW")).toBeCloseTo(96_000, 6);
      expect(sold(at(rows, age), "OLD")).toBe(0);
    }
    // After the window the annuity covers 5,000 of the spending, and what is left is sold in proportion to what remains.
    const after = at(rows, 60);
    expect(after.bridge?.members[0].inWindow).toBe(false);
    expect(sold(after, "OLD") + sold(after, "NEW")).toBeCloseTo(36_000, 6);
    expect(sold(after, "OLD") / sold(after, "NEW")).toBeCloseTo(360_000 / 168_000, 6);
  });

  it("sizes the sale by the mode and pays the rest from the other money", () => {
    const base = single({ otherAssets: 300_000 });
    const year = (bridgeMode: BridgeMode) => at(rowsOf({ ...base, assumptions: { ...base.assumptions, bridgeMode } }, 10_000), 58);

    const zero = year("zeroTax");
    expect(zero.bridge?.members[0].zeroTaxAnnual).toBeCloseTo(65_340, 6);
    expect(zero.bridge?.members[0].ordinaryAnnual).toBeCloseTo(65_340, 6);
    expect(sold(zero, "NEW")).toBeCloseTo(65_340 / 0.8, 6);
    expect(zero.drawn).toBeCloseTo(120_000, 6);

    // Up to the 10% bracket: 7,010 a month of ordinary income.
    const ten = year("bracket10");
    expect(ten.bridge?.members[0].ordinaryAnnual).toBeCloseTo(7_010 * 12, 6);

    const match = year("matchSpending");
    expect(sold(match, "NEW")).toBeCloseTo(120_000, 6);
    expect(match.bridge?.members[0].ordinaryAnnual).toBeCloseTo(96_000, 6);

    const ordinary = [zero, ten, match].map((row) => row.bridge!.members[0].ordinaryAnnual);
    expect(ordinary).toEqual([...ordinary].sort((a, b) => a - b));
  });

  it("sells past the sized room when the other money has run out", () => {
    const row = at(rowsOf(single({ bridgeMode: "zeroTax" }), 8_000), 58);
    expect(row.bridge!.members[0].ordinaryAnnual).toBeGreaterThan(row.bridge!.members[0].zeroTaxAnnual);
    expect(row.unmet).toBe(0);
  });

  it("draws the same gross amount and leaves the same capital as pro rata in every mode", () => {
    for (const spending of [10_000, 25_000]) {
      const base = single({ otherAssets: 300_000 });
      const reference = rowsOf({ ...base, assumptions: { ...base.assumptions, withdrawalStrategy: "proRata" } }, spending);
      for (const bridgeMode of BRIDGE_MODES) {
        const rows = rowsOf({ ...base, assumptions: { ...base.assumptions, bridgeMode } }, spending);
        expect(rows.length).toBe(reference.length);
        rows.forEach((row, index) => {
          expect(row.drawn).toBeCloseTo(reference[index].drawn, 6);
          expect(row.unmet).toBeCloseTo(reference[index].unmet, 6);
          expect(row.netWorth).toBeCloseTo(reference[index].netWorth, 6);
        });
      }
    }
  });

  it("keeps the shares of a drawing year summing to one", () => {
    for (const row of rowsOf(single({ otherAssets: 300_000 }), 10_000).slice(1)) {
      if (row.drawn > 0) expect(row.holdings.reduce((sum, holding) => sum + holding.capitalShare, 0)).toBeCloseTo(1, 9);
    }
  });

  it("uses each owner's own bracket for the shares they own", () => {
    const couple = buildTestProfile({
      age: 57,
      gender: "male",
      retirementAge: 57,
      maritalStatus: "married",
      spouse: { age: 57, gender: "female", retirementAge: 57 },
      investmentReturnPct: 4,
      inflationPct: 4,
      equity: [NEW, { ...NEW, ticker: "HERS", employerGrant: { ...NEW.employerGrant, owner: "spouse" } }],
      usdToIlsRate: { rate: 3.6 },
      withdrawalStrategy: "taxSmart",
      bridgeMode: "zeroTax",
    });
    const year = at(simulateDrawdown(couple, 57, 14_000), 58);
    const [mine, hers] = year.bridge!.members;
    expect(mine.zeroTaxAnnual).toBeCloseTo(65_340, 6);
    expect(hers.zeroTaxAnnual).toBeCloseTo(79_860, 6);
    expect(mine.ordinaryAnnual).toBeLessThanOrEqual(mine.zeroTaxAnnual + 1e-6);
    expect(hers.ordinaryAnnual).toBeLessThanOrEqual(hers.zeroTaxAnnual + 1e-6);
    const owners = (label: string) => year.bridge!.sales.filter((sale) => sale.label === label).map((sale) => sale.memberIndex);
    expect(owners("NEW")).toEqual([0]);
    expect(owners("HERS")).toEqual([1]);
    expect(sold(year, "NEW") + sold(year, "HERS")).toBeCloseTo(168_000, 6);
  });

  it("only records the bridge for the tax-smart strategy, and only in drawing years", () => {
    const smart = rowsOf(single({ otherAssets: 300_000 }), 10_000);
    expect(smart[0].bridge).toBeUndefined();
    expect(smart[1].bridge).toBeDefined();
    for (const strategy of ["proRata", "taxableFirst", "lowestTaxFirst", "custom"] as const satisfies WithdrawalStrategy[]) {
      expect(rowsOf(single({ otherAssets: 300_000, withdrawalStrategy: strategy }), 10_000).every((row) => row.bridge === undefined)).toBe(true);
    }
  });

  it("pays less tax over the plan than drawing pro rata, by selling the shares in the window", () => {
    const profile = single({ otherAssets: 300_000, retirementMonthlyExpenses: 10_000, bridgeMode: "zeroTax" });
    const { results } = compareWithdrawalStrategies(profile);
    const total = (strategy: WithdrawalStrategy) => results.find((result) => result.strategy === strategy)!.totalTax;
    expect(total("taxSmart")).toBeLessThan(total("proRata"));
    expect(total("taxSmart")).toBeLessThan(total("lowestTaxFirst"));
  });

  it("draws like the lowest-tax order when there are no employer shares", () => {
    const shares = (strategy: WithdrawalStrategy) =>
      simulateDrawdown(
        single({
          equity: [],
          pensionBalances: [100_000, 100_000, 100_000],
          pensionAccountOverrides: [{}, { productCategory: "studyFund" }, { productCategory: "investmentProvidentFund" }],
          otherAssets: 100_000,
          withdrawalStrategy: strategy,
        }),
        57,
        5_000,
      ).map((row) => row.holdings.map((holding) => holding.capitalShare));
    expect(shares("taxSmart")).toEqual(shares("lowestTaxFirst"));
  });
});

describe("dollar rate at the grant in the drawdown", () => {
  // 360,000 now at 3.6; the grant price was $50 a share, 180,000 at today's rate or 150,000 at a grant-day rate of 3.0.
  const grant = (rateAtGrant?: number, withdrawalStrategy: WithdrawalStrategy = "proRata") =>
    buildTestProfile({
      age: 57,
      gender: "male",
      retirementAge: 57,
      investmentReturnPct: 4,
      inflationPct: 4,
      equity: [
        {
          quantity: 1000,
          priceUSD: 100,
          entry: rateAtGrant ? { usdToIlsRate: rateAtGrant } : undefined,
          employerGrant: { grantPriceUSD: 50, grantDate: "2018-01-01", holdingPeriodMet: true },
        },
      ],
      usdToIlsRate: { rate: 3.6 },
      withdrawalStrategy,
    });
  const mixAt = (profile: ReturnType<typeof grant>, age: number) =>
    at(rowsOf(profile, 4_000), age).holdings.find((holding) => holding.treatment === "capitalGains" && holding.balance > 0)!;

  it.each<WithdrawalStrategy>(["proRata", "taxSmart"])(
    "takes the rise of the rate out of the salary layer and not into the taxed gain when selling in parts (%s)",
    (strategy) => {
      for (const age of [58, 60, 62]) {
        const plain = mixAt(grant(undefined, strategy), age);
        const withRate = mixAt(grant(3, strategy), age);
        // The salary layer is 150,000 instead of 180,000; the 30,000 difference is exempt, so the gain is the same.
        expect(withRate.ordinaryFraction / plain.ordinaryFraction).toBeCloseTo(150 / 180, 9);
        expect(withRate.gainFraction).toBeCloseTo(plain.gainFraction, 9);
      }
    },
  );

  it("takes more salary and no exempt part when the rate was higher at the grant", () => {
    const plain = mixAt(grant(), 58);
    const higher = mixAt(grant(4), 58);
    expect(higher.ordinaryFraction / plain.ordinaryFraction).toBeCloseTo(200 / 180, 9);
    expect(higher.gainFraction).toBeCloseTo(plain.gainFraction - plain.ordinaryFraction * (20 / 180), 9);
  });
});
