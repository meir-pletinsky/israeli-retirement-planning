import { describe, expect, it } from "vitest";

import { buildTestProfile } from "../test/domainFixtures";
import type { WithdrawalStrategy } from "../types";
import { buildBridgeWindow } from "./bridgeWindow";
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

// Retires at 57; the pension annuity starts at 60, so the bridge window is the years before it.
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
    otherAssets: 300_000,
    retirementMonthlyExpenses: 10_000,
    bridgeMode: "zeroTax",
    ...overrides,
  });

describe("buildBridgeWindow", () => {
  it("describes the years before the annuity, the tax-free room and the batch sold first", () => {
    const window = buildBridgeWindow(single());

    expect(window).not.toBeNull();
    expect(window!.mode).toBe("zeroTax");
    expect(window!.members).toHaveLength(1);
    const [me] = window!.members;
    expect(me.owner).toBe("self");
    expect(me.fromAge).toBeGreaterThanOrEqual(57);
    expect(me.toAge).toBeLessThan(60);
    expect(me.endsAtAge).toBe(60);
    expect(me.endsWith).toBe("annuity");
    // A man has 2.25 credit points, which shield 5,445 a month; zero-tax mode fills exactly that.
    expect(me.roomMonthly).toBeCloseTo(5_445, 6);
    expect(me.soldMonthly).toBeCloseTo(5_445, 6);
    expect(me.batches.map(({ label }) => label)).toEqual(["NEW"]);
    expect(me.batches[0].ordinaryShare).toBeCloseTo(0.8, 6);
    expect(me.batches[0].firstAge).toBe(me.fromAge);
  });

  it("measures the saving against the plan's own order, matching the comparison's total tax", () => {
    const profile = single({ withdrawalStrategy: "lowestTaxFirst" });
    const comparison = compareWithdrawalStrategies(profile);
    const total = (strategy: WithdrawalStrategy) => comparison.results.find((result) => result.strategy === strategy)!.totalTax;

    const window = buildBridgeWindow(profile)!;

    expect(window.comparedWith).toBe("lowestTaxFirst");
    expect(window.taxSaved).toBeCloseTo(total("lowestTaxFirst") - total("taxSmart"), 6);
    expect(window.taxSaved).toBeGreaterThan(0);
  });

  it("compares with the even order when the plan already uses the tax-smart one", () => {
    const profile = single({ withdrawalStrategy: "taxSmart" });
    const window = buildBridgeWindow(profile)!;

    expect(window.comparedWith).toBe("proRata");
    expect(window.taxSaved).toBeGreaterThan(0);
  });

  it("is the same as the plan's own order's result when the plan uses another one", () => {
    const profile = single({ withdrawalStrategy: "proRata" });
    const comparison = compareWithdrawalStrategies(profile);

    expect(buildBridgeWindow(profile, "standard", comparison)).toEqual(buildBridgeWindow(profile));
  });

  it("is null without employer shares", () => {
    expect(buildBridgeWindow(single({ equity: [] }))).toBeNull();
  });

  it("reports the lump-sum choice the plan has", () => {
    expect(buildBridgeWindow(single({ lumpSumSales: true }))!.lumpSumSales).toBe(true);
    expect(buildBridgeWindow(single())!.lumpSumSales).toBe(false);
  });

  it("lists each person's own window and room in a couple", () => {
    const couple = buildTestProfile({
      age: 57,
      gender: "male",
      retirementAge: 57,
      maritalStatus: "married",
      spouse: { age: 57, gender: "female", retirementAge: 57 },
      investmentReturnPct: 4,
      inflationPct: 4,
      pensionBalances: [600_000],
      pensionAccountOverrides: [{ productCategory: "comprehensivePension", annuityParameters: ANNUITY }],
      equity: [NEW, { ...NEW, ticker: "HERS", employerGrant: { ...NEW.employerGrant, owner: "spouse" } }],
      usdToIlsRate: { rate: 3.6 },
      otherAssets: 100_000,
      retirementMonthlyExpenses: 14_000,
      bridgeMode: "matchSpending",
      withdrawalStrategy: "taxSmart",
    });
    const window = buildBridgeWindow(couple)!;

    expect(window.comparedWith).toBe("proRata");
    expect(window.taxSaved).toBeCloseTo(1_440, 0);
    const [me, spouse] = window.members;

    expect(me.owner).toBe("self");
    expect([me.fromAge, me.toAge, me.endsAtAge, me.endsWith]).toEqual([58, 59, 60, "annuity"]);
    expect(me.roomMonthly).toBeCloseTo(5_445, 6);
    expect(me.soldMonthly).toBeCloseTo(5_292.8, 1);
    expect(me.batches.map(({ label }) => label)).toEqual(["NEW"]);
    expect(me.batches[0].total).toBeCloseTo(158_784, 0);

    // Nothing in the spouse's plan starts paying later, so every drawing year is in the window.
    expect(spouse.owner).toBe("spouse");
    expect([spouse.fromAge, spouse.toAge, spouse.endsAtAge, spouse.endsWith]).toEqual([60, 78, null, null]);
    expect(spouse.roomMonthly).toBeCloseTo(6_655, 6);
    expect(spouse.soldMonthly).toBeCloseTo(1_263, 0);
    expect(spouse.batches.map(({ label }) => label)).toEqual(["HERS"]);
    expect(spouse.batches[0].total).toBeCloseTo(360_000, 0);
  });
});
