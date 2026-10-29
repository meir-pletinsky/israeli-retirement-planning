import { describe, expect, it } from "vitest";

import type { PensionAccount, TaxTrack } from "../types";
import { buildTestProfile } from "../test/domainFixtures";
import {
  accountUnlockAge,
  buildSources,
  countUncategorizedAccounts,
  employerStockRoute,
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

    it("uses a pension fund's conversion factor even when it is not marked guaranteed", () => {
      const source = managersInsurance({
        productCategory: "comprehensivePension",
        annuityParameters: {
          hasGuaranteedFactor: false,
          conversionFactor: 200,
          estimatedMonthlyAnnuity: null,
          annuityTaxType: null,
          guaranteedPaymentMonths: null,
        },
      });
      expect(source.annuity).toEqual({ monthly: 5000, startAge: 60, origin: "factor" });
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

  describe("employer-granted shares", () => {
    const capitalRoute: TaxTrack = "section102CapitalGainsTrustee";
    const sourcesFor = (
      employerGrant: NonNullable<Parameters<typeof buildTestProfile>[0]["equity"]>[number]["employerGrant"],
      extra: { otherAssets?: number; age?: number } = {},
    ) =>
      buildSources(
        buildTestProfile({
          age: extra.age ?? 50,
          otherAssets: extra.otherAssets,
          equity: [{ quantity: 100, priceUSD: 50, employerGrant }],
          ...zeroReal,
        }),
        60,
      );

    it("puts Section 102 capital-route shares in their own source with the grant value as ordinary layer", () => {
      const sources = sourcesFor({ taxTrack: capitalRoute, grantPriceUSD: 20 }, { otherAssets: 10_000 });
      expect(sources.map((source) => source.id)).toEqual([
        "other-investments",
        "employer-stock-section-102",
      ]);
      const [other, shares] = sources;
      expect(other.balance).toBe(10_000);
      // 100 shares * $50 * 3.7 now, of which 100 * $20 * 3.7 was worth that at the grant.
      expect(shares.balance).toBeCloseTo(18_500, 6);
      expect(shares.ordinaryLayer).toBeCloseTo(7_400, 6);
      expect(shares.costBasis).toBe(0);
      expect(shares.taxTreatment).toBe("capitalGains");
      expect(shares.capitalGainsTaxRate).toBe(0.25);
      expect(shares.unlockAge).toBe(0);
    });

    it("takes a missing tax track as the Section 102 capital route", () => {
      const sources = sourcesFor({ grantPriceUSD: 20 });
      expect(sources.map((source) => source.id)).toContain("employer-stock-section-102");
    });

    it("never lets the grant value exceed the current value", () => {
      const shares = sourcesFor({ taxTrack: capitalRoute, grantPriceUSD: 80 })[1];
      expect(shares.ordinaryLayer).toBeCloseTo(shares.balance, 6);
    });

    it("counts a missing grant price as zero, so the whole value is a capital gain", () => {
      const shares = sourcesFor({ taxTrack: capitalRoute })[1];
      expect(shares.ordinaryLayer).toBe(0);
      expect(shares.costBasis).toBe(0);
    });

    it("taxes the ordinary-income route entirely as ordinary income", () => {
      const sources = sourcesFor({ taxTrack: "section102OrdinaryIncomeTrustee", grantPriceUSD: 20 });
      const shares = sources.find((source) => source.id === "employer-stock-ordinary-income");
      expect(shares?.taxTreatment).toBe("ordinaryIncome");
      expect(shares?.balance).toBeCloseTo(18_500, 6);
    });

    it("keeps Section 3(i) shares in the investments bucket with the grant value as cost basis", () => {
      const sources = sourcesFor({ taxTrack: "section3iNonTrustee", grantPriceUSD: 20 });
      expect(sources.map((source) => source.id)).toEqual(["other-investments"]);
      expect(sources[0].balance).toBeCloseTo(18_500, 6);
      expect(sources[0].costBasis).toBeCloseTo(7_400, 6);
    });

    it("leaves the total balance unchanged by how the shares are taxed", () => {
      const total = (employerGrant: Parameters<typeof sourcesFor>[0]) =>
        sourcesFor(employerGrant, { otherAssets: 10_000 }).reduce(
          (sum, source) => sum + source.valueAtRetirement,
          0,
        );
      const expected = 10_000 + 18_500;
      expect(total({ taxTrack: capitalRoute, grantPriceUSD: 20 })).toBeCloseTo(expected, 6);
      expect(total({ taxTrack: "section102OrdinaryIncomeTrustee" })).toBeCloseTo(expected, 6);
      expect(total({ taxTrack: "section3iNonTrustee" })).toBeCloseTo(expected, 6);
    });

    describe("vesting tranches", () => {
      // Retirement is ten years out, so a batch vested later than eight years from now is held under two years.
      const old = isoDateInYears(-3);
      const recent = isoDateInYears(9);
      const find = (sources: ReturnType<typeof sourcesFor>, id: string) =>
        sources.find((source) => source.id === id);

      it("routes each batch by its own vesting date", () => {
        const sources = sourcesFor({
          taxTrack: capitalRoute,
          grantPriceUSD: 20,
          vestingTranches: [
            { vestDate: old, quantity: 30 },
            { vestDate: recent, quantity: 40 },
          ],
        });
        // 40 recent shares are a disqualifying disposal; 30 old plus the 30 undated ones keep the capital route.
        expect(find(sources, "employer-stock-ordinary-income")?.balance).toBeCloseTo(7_400, 6);
        const capital = find(sources, "employer-stock-section-102");
        expect(capital?.balance).toBeCloseTo(11_100, 6);
        expect(capital?.ordinaryLayer).toBeCloseTo(4_440, 6);
      });

      it("lets the remaining shares follow the holding's own grant date", () => {
        const sources = sourcesFor({
          taxTrack: capitalRoute,
          grantDate: recent,
          vestingTranches: [{ vestDate: old, quantity: 60 }],
        });
        expect(find(sources, "employer-stock-section-102")?.balance).toBeCloseTo(11_100, 6);
        expect(find(sources, "employer-stock-ordinary-income")?.balance).toBeCloseTo(7_400, 6);
      });

      it("scales batches that together exceed the quantity so the total stays put", () => {
        const sources = sourcesFor({
          taxTrack: capitalRoute,
          vestingTranches: [
            { vestDate: old, quantity: 150 },
            { vestDate: recent, quantity: 50 },
          ],
        });
        expect(find(sources, "employer-stock-section-102")?.balance).toBeCloseTo(13_875, 6);
        expect(find(sources, "employer-stock-ordinary-income")?.balance).toBeCloseTo(4_625, 6);
      });

      it("takes an undated batch as held long enough and ignores one without a quantity", () => {
        const sources = sourcesFor({
          taxTrack: capitalRoute,
          vestingTranches: [{ quantity: 100 }, { vestDate: recent, quantity: 0 }],
        });
        expect(find(sources, "employer-stock-ordinary-income")).toBeUndefined();
        expect(find(sources, "employer-stock-section-102")?.balance).toBeCloseTo(18_500, 6);
      });

      it("treats a batch that vests after retirement as ordinary income", () => {
        const sources = sourcesFor({
          taxTrack: capitalRoute,
          vestingTranches: [{ vestDate: isoDateInYears(12), quantity: 100 }],
        });
        expect(find(sources, "employer-stock-ordinary-income")?.balance).toBeCloseTo(18_500, 6);
        expect(find(sources, "employer-stock-section-102")).toBeUndefined();
      });

      it("uses each batch's own grant price for the ordinary layer, falling back to the holding's", () => {
        const shares = find(
          sourcesFor({
            taxTrack: capitalRoute,
            grantPriceUSD: 20,
            vestingTranches: [{ vestDate: old, quantity: 50, grantPriceUSD: 30 }],
          }),
          "employer-stock-section-102",
        );
        // 50 * $30 * 3.7 plus the other 50 * $20 * 3.7.
        expect(shares?.ordinaryLayer).toBeCloseTo(9_250, 6);
      });

      it("sums the grant values of Section 3(i) batches into the cost basis", () => {
        const sources = sourcesFor({
          taxTrack: "section3iNonTrustee",
          grantPriceUSD: 20,
          vestingTranches: [{ vestDate: recent, quantity: 40, grantPriceUSD: 10 }],
        });
        expect(sources.map((source) => source.id)).toEqual(["other-investments"]);
        // 40 * $10 * 3.7 plus 60 * $20 * 3.7.
        expect(sources[0].costBasis).toBeCloseTo(5_920, 6);
      });

      it("taxes every batch of the ordinary-income track as ordinary income, whatever its date", () => {
        const sources = sourcesFor({
          taxTrack: "section102OrdinaryIncomeTrustee",
          vestingTranches: [{ vestDate: old, quantity: 100 }],
        });
        expect(find(sources, "employer-stock-ordinary-income")?.balance).toBeCloseTo(18_500, 6);
      });

      it("leaves the total balance unchanged by how the batches are taxed", () => {
        const sources = sourcesFor(
          {
            taxTrack: capitalRoute,
            vestingTranches: [
              { vestDate: old, quantity: 30 },
              { vestDate: recent, quantity: 40 },
            ],
          },
          { otherAssets: 10_000 },
        );
        const total = sources.reduce((sum, source) => sum + source.valueAtRetirement, 0);
        expect(total).toBeCloseTo(10_000 + 18_500, 6);
      });
    });
  });
});

describe("employerStockRoute", () => {
  const holdingWith = (employerGrant: { grantDate?: string; holdingPeriodMet?: boolean; taxTrack?: TaxTrack }) =>
    buildTestProfile({ equity: [{ quantity: 1, priceUSD: 1, employerGrant }] }).equity.holdings[0];

  it("is the capital route once the 24 months have passed by retirement", () => {
    expect(employerStockRoute(holdingWith({ grantDate: isoDateInYears(-3) }), 1)).toBe(
      "section102Capital",
    );
    // Granted six months ago, sold in 1.5 years: held two years.
    expect(employerStockRoute(holdingWith({ grantDate: isoDateInYears(-0.5) }), 1.5)).toBe(
      "section102Capital",
    );
  });

  it("is a disqualifying disposal, taxed as ordinary income, when the grant is too recent", () => {
    expect(employerStockRoute(holdingWith({ grantDate: isoDateInYears(-0.5) }), 1)).toBe(
      "ordinaryIncome",
    );
    expect(employerStockRoute(holdingWith({ grantDate: isoDateInYears(0.5) }), 1)).toBe(
      "ordinaryIncome",
    );
  });

  it("trusts the holding-period confirmation over the grant date", () => {
    expect(
      employerStockRoute(holdingWith({ grantDate: isoDateInYears(-0.5), holdingPeriodMet: true }), 1),
    ).toBe("section102Capital");
  });

  it("assumes the period is met when there is no grant date", () => {
    expect(employerStockRoute(holdingWith({}), 1)).toBe("section102Capital");
  });

  it("follows the other tax tracks regardless of dates", () => {
    const recent = isoDateInYears(-0.1);
    expect(
      employerStockRoute(
        holdingWith({ taxTrack: "section102OrdinaryIncomeTrustee", grantDate: recent }),
        10,
      ),
    ).toBe("ordinaryIncome");
    expect(
      employerStockRoute(holdingWith({ taxTrack: "section3iNonTrustee", grantDate: recent }), 10),
    ).toBe("nonTrustee");
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
