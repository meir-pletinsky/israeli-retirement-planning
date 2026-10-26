import { describe, expect, it } from "vitest";

import type { PensionAccount } from "../types";
import { buildTestProfile } from "../test/domainFixtures";
import {
  accountUnlockAge,
  buildSources,
  countUncategorizedAccounts,
  sourceKindForCategory,
} from "./sources";
import { projectBalanceAtAge } from "./netWorth";

const zeroReal = { investmentReturnPct: 4, inflationPct: 4 };

/** An ISO date `years` from now (negative = in the past). */
const isoDateInYears = (years: number) =>
  new Date(Date.now() + years * 365.25 * 24 * 3600 * 1000).toISOString().slice(0, 10);

const accountWith = (overrides: Partial<PensionAccount>) =>
  buildTestProfile({ age: 45, pensionBalances: [100_000], pensionAccountOverrides: [overrides] })
    .pensionSavings.accounts[0];

describe("sourceKindForCategory", () => {
  it("maps product categories to the kind of source they are", () => {
    expect(sourceKindForCategory("comprehensivePension")).toBe("pensionFund");
    expect(sourceKindForCategory("generalPension")).toBe("pensionFund");
    expect(sourceKindForCategory("managersInsurance")).toBe("managersInsurance");
    expect(sourceKindForCategory("providentFund")).toBe("providentFund");
    expect(sourceKindForCategory("investmentProvidentFund")).toBe("providentFund");
    expect(sourceKindForCategory("iraProvidentFund")).toBe("providentFund");
    expect(sourceKindForCategory("studyFund")).toBe("studyFund");
  });

  it("treats an uncategorized account as a pension fund", () => {
    expect(sourceKindForCategory(null)).toBe("pensionFund");
  });
});

describe("accountUnlockAge", () => {
  it("locks pension, managers insurance and provident funds until 60", () => {
    for (const productCategory of [
      "comprehensivePension",
      "generalPension",
      "managersInsurance",
      "providentFund",
      "iraProvidentFund",
    ] as const) {
      expect(accountUnlockAge(accountWith({ productCategory }), 45)).toBe(60);
    }
  });

  it("leaves an investment provident fund and uncategorized accounts always accessible", () => {
    expect(accountUnlockAge(accountWith({ productCategory: "investmentProvidentFund" }), 45)).toBe(0);
    expect(accountUnlockAge(accountWith({ productCategory: null }), 45)).toBe(0);
  });

  describe("study fund", () => {
    it("unlocks on the liquidity date", () => {
      const account = accountWith({
        productCategory: "studyFund",
        liquidityDate: isoDateInYears(3),
      });
      expect(accountUnlockAge(account, 45)).toBeCloseTo(48, 1);
    });

    it("is accessible once the liquidity date has passed", () => {
      const account = accountWith({
        productCategory: "studyFund",
        liquidityDate: isoDateInYears(-2),
      });
      expect(accountUnlockAge(account, 45)).toBe(45);
    });

    it("falls back to six years after joining when there is no liquidity date", () => {
      const account = accountWith({ productCategory: "studyFund", joinDate: isoDateInYears(-4) });
      expect(accountUnlockAge(account, 45)).toBeCloseTo(47, 1);
    });

    it("is treated as accessible when no date is known", () => {
      expect(accountUnlockAge(accountWith({ productCategory: "studyFund" }), 45)).toBe(0);
    });
  });
});

describe("buildSources", () => {
  it("has one source per account plus the other-investments bucket", () => {
    const profile = buildTestProfile({
      age: 50,
      pensionBalances: [100_000, 50_000],
      pensionAccountOverrides: [
        { productCategory: "comprehensivePension" },
        { productCategory: "studyFund" },
      ],
      otherAssets: 30_000,
      equity: [{ quantity: 10, priceUSD: 100 }],
      ...zeroReal,
    });
    const sources = buildSources(profile, 60);
    expect(sources.map((source) => source.kind)).toEqual([
      "pensionFund",
      "studyFund",
      "otherInvestments",
    ]);
    // 30,000 other assets + 10 * $100 * 3.7 (fallback rate) of equity.
    expect(sources[2].balance).toBeCloseTo(33_700, 6);
    expect(sources[2].unlockAge).toBe(0);
  });

  it("adds up to the projected balance at retirement, contributions included", () => {
    const profile = buildTestProfile({
      age: 40,
      monthlyGrossSalary: 12_000,
      pensionBalances: [200_000, 80_000],
      pensionAccountOverrides: [
        {
          productCategory: "comprehensivePension",
          accountStatus: "activeContributing",
          contributions: { employeeRatePercent: 6, employerRatePercent: 6.5, severanceRatePercent: 6 },
        },
        {
          productCategory: "studyFund",
          accountStatus: "activeContributing",
          contributions: { employeeRatePercent: 2.5, employerRatePercent: 7.5, severanceRatePercent: 0 },
        },
      ],
      otherAssets: 50_000,
      investmentReturnPct: 6,
      inflationPct: 2.5,
    });
    const total = buildSources(profile, 62).reduce((sum, s) => sum + s.valueAtRetirement, 0);
    expect(total).toBeCloseTo(projectBalanceAtAge(profile, 62), 6);
  });

  describe("annuities", () => {
    const managersInsurance = (
      overrides: Partial<PensionAccount>,
      age = 55,
      retirementAge = 55,
    ) =>
      buildSources(
        buildTestProfile({
          age,
          retirementAge,
          pensionBalances: [1_000_000],
          pensionAccountOverrides: [{ productCategory: "managersInsurance", ...overrides }],
          ...zeroReal,
        }),
        retirementAge,
      )[0];

    it("is none unless the user gave a guaranteed factor or an estimated annuity", () => {
      expect(managersInsurance({}).annuity).toBeNull();
    });

    it("converts the balance at the start age using the guaranteed factor", () => {
      const source = managersInsurance({
        annuityParameters: {
          hasGuaranteedFactor: true,
          conversionFactor: 200,
          estimatedMonthlyAnnuity: null,
          annuityTaxType: null,
          guaranteedPaymentMonths: null,
        },
      });
      // Retiring at 55 but the policy opens at 60; 0% real return so the balance is unchanged.
      expect(source.annuity).toEqual({ monthly: 5000, startAge: 60, origin: "factor" });
    });

    it("ignores a conversion factor that is not guaranteed", () => {
      const source = managersInsurance({
        annuityParameters: {
          hasGuaranteedFactor: false,
          conversionFactor: 200,
          estimatedMonthlyAnnuity: null,
          annuityTaxType: null,
          guaranteedPaymentMonths: null,
        },
      });
      expect(source.annuity).toBeNull();
    });

    it("prefers the user's own estimate over the factor", () => {
      const source = managersInsurance({
        annuityParameters: {
          hasGuaranteedFactor: true,
          conversionFactor: 200,
          estimatedMonthlyAnnuity: 4200,
          annuityTaxType: null,
          guaranteedPaymentMonths: null,
        },
      });
      expect(source.annuity).toEqual({ monthly: 4200, startAge: 60, origin: "override" });
    });

    it("starts at retirement when the account already pays an annuity", () => {
      const source = managersInsurance({
        accountStatus: "payingAnnuity",
        annuityParameters: {
          hasGuaranteedFactor: false,
          conversionFactor: null,
          estimatedMonthlyAnnuity: 4200,
          annuityTaxType: null,
          guaranteedPaymentMonths: null,
        },
      });
      expect(source.annuity).toEqual({ monthly: 4200, startAge: 55, origin: "override" });
    });

    it("never annuitizes a study fund", () => {
      const source = managersInsurance({
        productCategory: "studyFund",
        annuityParameters: {
          hasGuaranteedFactor: true,
          conversionFactor: 200,
          estimatedMonthlyAnnuity: 4200,
          annuityTaxType: null,
          guaranteedPaymentMonths: null,
        },
      });
      expect(source.annuity).toBeNull();
    });
  });

  describe("tax treatment", () => {
    const treatmentOf = (productCategory: PensionAccount["productCategory"]) =>
      buildSources(
        buildTestProfile({
          age: 50,
          pensionBalances: [100_000],
          pensionAccountOverrides: [{ productCategory }],
          ...zeroReal,
        }),
        60,
      )[0].taxTreatment;

    it("taxes an investment provident fund on its gain and a study fund not at all", () => {
      expect(treatmentOf("investmentProvidentFund")).toBe("capitalGains");
      expect(treatmentOf("studyFund")).toBe("exempt");
    });

    it("taxes every other account, and an uncategorized one, as a pension", () => {
      for (const category of [
        "comprehensivePension",
        "generalPension",
        "managersInsurance",
        "providentFund",
        "iraProvidentFund",
        null,
      ] as const) {
        expect(treatmentOf(category)).toBe("pension");
      }
    });

    it("starts an account's cost basis at its balance, at the statutory capital gains rate", () => {
      const [source] = buildSources(
        buildTestProfile({
          age: 50,
          pensionBalances: [100_000],
          pensionAccountOverrides: [{ productCategory: "investmentProvidentFund" }],
          ...zeroReal,
        }),
        60,
      );
      expect(source.costBasis).toBe(100_000);
      expect(source.capitalGainsTaxRate).toBe(0.25);
    });

    it("gives other investments a cost basis below their value by the declared gains", () => {
      const sources = buildSources(
        buildTestProfile({
          age: 50,
          otherAssets: 100_000,
          equity: [{ quantity: 100, priceUSD: 100, unrealizedCapitalGainUSD: 4_000 }],
          ...zeroReal,
        }),
        60,
      );
      const other = sources[0];
      expect(other.kind).toBe("otherInvestments");
      expect(other.taxTreatment).toBe("capitalGains");
      // 100,000 + 100 * $100 * 3.7 = 137,000, of which $4,000 * 3.7 = 14,800 is gain.
      expect(other.balance).toBeCloseTo(137_000, 6);
      expect(other.costBasis).toBeCloseTo(122_200, 6);
    });

    it("never lets a declared gain exceed the holding's value", () => {
      const [other] = buildSources(
        buildTestProfile({
          age: 50,
          equity: [{ quantity: 10, priceUSD: 100, unrealizedCapitalGainUSD: 50_000 }],
          ...zeroReal,
        }),
        60,
      );
      expect(other.costBasis).toBe(0);
    });

    it("blends the tax rate of each holding by its value", () => {
      const [other] = buildSources(
        buildTestProfile({
          age: 50,
          equity: [
            { quantity: 10, priceUSD: 100, capitalGainsTaxRatePercent: 15 },
            { quantity: 10, priceUSD: 100 },
          ],
          ...zeroReal,
        }),
        60,
      );
      // Equal values at 15% and the statutory 25%.
      expect(other.capitalGainsTaxRate).toBeCloseTo(0.2, 6);
    });
  });
});

describe("countUncategorizedAccounts", () => {
  it("counts accounts that hold money but have no product type", () => {
    const profile = buildTestProfile({
      pensionBalances: [100_000, 0, 50_000],
      pensionAccountOverrides: [{}, {}, { productCategory: "studyFund" }],
    });
    expect(countUncategorizedAccounts(profile)).toBe(1);
  });
});
