import { describe, expect, it } from "vitest";

import { buildTestProfile } from "../test/domainFixtures";
import { estimateNetIncome } from "./netIncome";
import {
  buildSourceCostTable,
  SOURCE_COST_NET_STEP,
  type SourceCostGroup,
  type SourceCostRow,
} from "./sourceCosts";

const zeroReal = { investmentReturnPct: 4, inflationPct: 4 };
const retired = { age: 60, retirementAge: 60, ...zeroReal };

type Profile = Parameters<typeof buildTestProfile>[0];

const table = (overrides: Profile) => buildSourceCostTable(buildTestProfile(overrides));
const rowOf = (rows: SourceCostRow[], group: SourceCostGroup, member: "self" | "spouse" = "self") =>
  rows.find((row) => row.group === group && row.member === member);

/** Shares worth 100,000 with 30,000 of gain, at a dollar worth one shekel. */
const brokerage: NonNullable<Profile["equity"]> = [
  { quantity: 1_000, priceUSD: 100, unrealizedCapitalGainUSD: 30_000, category: "personalBrokeragePurchase" },
];

describe("buildSourceCostTable", () => {
  it("lists nothing when there are no savings", () => {
    expect(table({ ...retired })).toEqual([]);
  });

  it("charges no tax on the study fund", () => {
    const rows = table({
      ...retired,
      pensionBalances: [500_000],
      pensionAccountOverrides: [{ productCategory: "studyFund" }],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      group: "studyFund",
      member: "self",
      age: 60,
      year: 2026,
      taxPerStep: 0,
      drawPerStep: SOURCE_COST_NET_STEP,
    });
  });

  it("taxes only the gain share of an investment: 7.5% of the draw for a 30% gain at 25%", () => {
    const rows = table({ ...retired, usdToIlsRate: { rate: 1 }, equity: brokerage });
    const row = rowOf(rows, "investments");
    // The draw d leaves d × (1 - 0.3 × 0.25) = 100, so d = 108.11 and the tax is 8.11.
    expect(row?.drawPerStep).toBeCloseTo(100 / (1 - 0.3 * 0.25), 2);
    expect(row?.taxPerStep).toBeCloseTo(8.11, 2);
  });

  it("charges nothing on investments that have no gain", () => {
    const row = rowOf(table({ ...retired, otherAssets: 200_000 }), "investments");
    expect(row?.taxPerStep).toBe(0);
  });

  it("taxes an investment provident fund on its growth since today", () => {
    const rows = table({
      age: 50,
      retirementAge: 60,
      investmentReturnPct: 4,
      inflationPct: 0,
      pensionBalances: [300_000],
      pensionAccountOverrides: [{ productCategory: "investmentProvidentFund" }],
    });
    const gainShare = 1 - 1 / Math.pow(1.04, 10);
    const row = rowOf(rows, "investmentProvidentFund");
    expect(row?.drawPerStep).toBeCloseTo(100 / (1 - gainShare * 0.25), 2);
    expect(row?.age).toBe(60);
    expect(row?.year).toBe(2036);
  });

  it("gives every row a draw equal to the net amount plus the tax", () => {
    const rows = table({
      ...retired,
      usdToIlsRate: { rate: 1 },
      equity: brokerage,
      pensionBalances: [800_000, 200_000],
      pensionAccountOverrides: [{}, { productCategory: "studyFund" }],
    });
    expect(rows.length).toBeGreaterThanOrEqual(3);
    for (const row of rows) {
      expect(row.drawPerStep - row.taxPerStep).toBeCloseTo(SOURCE_COST_NET_STEP, 2);
      expect(row.taxPerStep).toBeGreaterThanOrEqual(0);
    }
  });

  it("charges pension money more before the statutory retirement age than after it", () => {
    const pension = {
      gender: "male" as const,
      pensionBalances: [3_000_000],
      pensionAccountOverrides: [{ productCategory: "comprehensivePension" as const }],
      ...zeroReal,
    };
    const before = rowOf(table({ ...pension, age: 62, retirementAge: 62 }), "pensionFund");
    const after = rowOf(table({ ...pension, age: 70, retirementAge: 70 }), "pensionFund");
    expect(before?.taxPerStep).toBeGreaterThan(0);
    expect(after?.taxPerStep).toBeLessThan(before?.taxPerStep ?? 0);
  });

  it("works out the tax in the first year a locked pot opens", () => {
    const rows = table({
      age: 55,
      retirementAge: 55,
      ...zeroReal,
      pensionBalances: [400_000, 100_000],
      pensionAccountOverrides: [{ productCategory: "comprehensivePension" }, { productCategory: "studyFund" }],
    });
    expect(rowOf(rows, "studyFund")).toMatchObject({ age: 55, year: 2026 });
    expect(rowOf(rows, "pensionFund")).toMatchObject({ age: 60, year: 2031 });
  });

  it("leaves out an account that pays an annuity", () => {
    const rows = table({
      ...retired,
      pensionBalances: [600_000, 100_000],
      pensionAccountOverrides: [
        {
          productCategory: "comprehensivePension",
          annuityParameters: {
            hasGuaranteedFactor: false,
            conversionFactor: null,
            estimatedMonthlyAnnuity: 3_000,
            annuityTaxType: null,
            guaranteedPaymentMonths: null,
          },
        },
        { productCategory: "studyFund" },
      ],
    });
    expect(rows.map((row) => row.group)).toEqual(["studyFund"]);
  });

  it("taxes the grant-date part of Section 102 shares as ordinary income", () => {
    const withShares = (grantPriceUSD: number) =>
      rowOf(
        table({
          ...retired,
          usdToIlsRate: { rate: 1 },
          equity: [{ quantity: 40_000, priceUSD: 100, employerGrant: { grantPriceUSD } }],
        }),
        "section102Shares",
      );
    // All gain: the flat 25% of the draw, so 33.33 of tax on a draw of 133.33.
    expect(withShares(0)?.taxPerStep).toBeCloseTo(100 / (1 - 0.25) - 100, 2);
    // At an income this size the brackets, with health tax and Bituach Leumi before the statutory age, cost more than the flat rate.
    expect(withShares(80)?.taxPerStep).toBeGreaterThan(33.34);
  });

  it("taxes shares on the ordinary-income route as salary", () => {
    const rows = table({
      ...retired,
      usdToIlsRate: { rate: 1 },
      equity: [
        { quantity: 40_000, priceUSD: 100, employerGrant: { taxTrack: "section102OrdinaryIncomeTrustee" } },
      ],
    });
    expect(rowOf(rows, "ordinaryIncomeShares")?.taxPerStep).toBeGreaterThan(33.34);
  });

  it("reports the management fee only when one is entered, weighted by value", () => {
    const fee = (feeFromAccumulationPercent: number | null) => ({
      investmentAndFees: {
        investmentTrackName: "",
        feeFromAccumulationPercent,
        feeFromDepositPercent: null,
        profitSharingFeePercent: null,
        hasStateYieldGuarantee: false,
      },
    });
    const rows = table({
      ...retired,
      pensionBalances: [300_000, 100_000, 100_000],
      pensionAccountOverrides: [
        { productCategory: "studyFund", ...fee(0.5) },
        { productCategory: "studyFund", ...fee(1.5) },
        { productCategory: "studyFund", ...fee(null) },
      ],
    });
    // The two accounts with a fee, 300,000 at 0.5 and 100,000 at 1.5.
    expect(rowOf(rows, "studyFund")?.managementFeePercent).toBeCloseTo(0.75, 2);
    expect(rowOf(table({ ...retired, otherAssets: 50_000 }), "investments")?.managementFeePercent).toBeNull();
  });

  it("lists each spouse's money on its own row, in the order self then spouse", () => {
    const rows = table({
      age: 60,
      gender: "male",
      retirementAge: 60,
      maritalStatus: "married",
      spouse: { age: 58, gender: "female", retirementAge: 60 },
      ...zeroReal,
      pensionBalances: [300_000, 300_000, 200_000],
      pensionAccountOverrides: [
        { productCategory: "studyFund", owner: "spouse" },
        { productCategory: "investmentProvidentFund" },
        { productCategory: "studyFund" },
      ],
    });
    expect(rows.map((row) => `${row.group}:${row.member}`)).toEqual([
      "studyFund:self",
      "studyFund:spouse",
      "investmentProvidentFund:self",
    ]);
    // The spouse retires in two years, which is when the household starts to draw: they are 60, the primary user 62.
    expect(rowOf(rows, "studyFund", "spouse")).toMatchObject({ age: 60, year: 2028 });
    expect(rowOf(rows, "studyFund", "self")).toMatchObject({ age: 62, year: 2028 });
  });

  it("taxes each spouse on their own income, so splitting the pensions between two people costs no more", () => {
    const common = {
      age: 62,
      gender: "male" as const,
      retirementAge: 62,
      maritalStatus: "married" as const,
      spouse: { age: 62, gender: "female" as const, retirementAge: 62 },
      ...zeroReal,
    };
    const accounts = (owner: "self" | "spouse") => ({
      pensionBalances: [3_000_000, 3_000_000],
      pensionAccountOverrides: [
        { productCategory: "comprehensivePension" as const, owner: "self" as const },
        { productCategory: "comprehensivePension" as const, owner },
      ],
    });
    const both = table({ ...common, ...accounts("spouse") });
    const bothSelf = table({ ...common, ...accounts("self") });
    // Splitting the same pot over two people lowers each person's marginal tax.
    expect(rowOf(both, "pensionFund", "self")?.taxPerStep).toBeLessThanOrEqual(
      rowOf(bothSelf, "pensionFund", "self")?.taxPerStep ?? 0,
    );
  });

  it("does not change the plan's own net income", () => {
    const profile = buildTestProfile({
      ...retired,
      usdToIlsRate: { rate: 1 },
      equity: brokerage,
      pensionBalances: [800_000],
    });
    const before = estimateNetIncome(profile);
    buildSourceCostTable(profile);
    expect(estimateNetIncome(profile)).toEqual(before);
  });
});
