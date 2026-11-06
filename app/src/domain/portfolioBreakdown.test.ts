import { describe, expect, it } from "vitest";

import { buildTestProfile } from "../test/domainFixtures";
import { aggregateCurrentNetWorth } from "./profileBasics";
import { breakdownPortfolio } from "./portfolioBreakdown";

const amountOf = (profile: Parameters<typeof breakdownPortfolio>[0]) =>
  Object.fromEntries(breakdownPortfolio(profile).rows.map((row) => [row.key, row.amount]));

describe("breakdownPortfolio", () => {
  // The clock is pinned to 2026-06-15: the first batch has vested, the second has not.
  const rich = buildTestProfile({
    pensionBalances: [500_000, 100_000, 50_000, 80_000],
    pensionAccountOverrides: [
      { productCategory: "comprehensivePension" },
      { productCategory: "providentFund" },
      { productCategory: "studyFund" },
      { productCategory: "managersInsurance" },
    ],
    otherAssets: 20_000,
    bankDeposits: [{ amount: 200_000 }],
    usdToIlsRate: { rate: 3, date: "2026-06-01" },
    equity: [
      { quantity: 100, priceUSD: 50, category: "personalBrokeragePurchase" },
      {
        quantity: 200,
        priceUSD: 10,
        employerGrant: {
          vestingTranches: [
            { vestDate: "2025-01-01", quantity: 120 },
            { vestDate: "2027-01-01", quantity: 80 },
          ],
        },
      },
    ],
  });

  it("splits Net Worth Today into the kinds of assets it counts", () => {
    expect(amountOf(rich)).toEqual({
      pensionFund: 500_000,
      providentFund: 100_000,
      managersInsurance: 80_000,
      studyFund: 50_000,
      bankDeposits: 200_000,
      privateShares: 15_000,
      employerShares: 3_600,
      cashAndOther: 20_000,
    });
  });

  it("adds up to the Net Worth Today figure", () => {
    const { rows, total } = breakdownPortfolio(rich);
    expect(total).toBe(Math.round(aggregateCurrentNetWorth(rich)));
    expect(rows.reduce((sum, row) => sum + row.amount, 0)).toBe(total);
  });

  it("lists the employer shares that have not vested as left out of the total", () => {
    expect(breakdownPortfolio(rich).unvestedEmployerShares).toBe(2_400);
  });

  it("settles whole-shekel rounding so the rows still add up to the total", () => {
    const profile = buildTestProfile({ pensionBalances: [10.4], otherAssets: 10.4 });
    const { rows, total } = breakdownPortfolio(profile);
    expect(total).toBe(21);
    expect(rows.reduce((sum, row) => sum + row.amount, 0)).toBe(21);
  });

  it("counts an account without a category as a pension fund, as the model does", () => {
    expect(amountOf(buildTestProfile({ pensionBalances: [300_000] }))).toEqual({ pensionFund: 300_000 });
  });

  it("leaves out kinds that have nothing in them", () => {
    expect(Object.keys(amountOf(buildTestProfile({ otherAssets: 50_000 })))).toEqual(["cashAndOther"]);
  });

  it("has no rows for an empty profile", () => {
    expect(breakdownPortfolio(buildTestProfile({}))).toMatchObject({ rows: [], total: 0 });
  });

  it("counts a holding without a category as a private share", () => {
    const profile = buildTestProfile({ equity: [{ quantity: 10, priceUSD: 10 }] });
    expect(amountOf(profile)).toEqual({ privateShares: Math.round(10 * 10 * 3.7) });
  });

  describe("the exchange rate behind the share values", () => {
    const holding = [{ quantity: 10, priceUSD: 10, category: "personalBrokeragePurchase" as const }];

    it("is not reported when there are no shares", () => {
      expect(breakdownPortfolio(buildTestProfile({ otherAssets: 10 })).fx).toBeNull();
    });

    it("says a looked-up Bank of Israel rate and its date", () => {
      const { fx } = breakdownPortfolio(
        buildTestProfile({ equity: holding, usdToIlsRate: { rate: 3.2, date: "2026-06-01" } }),
      );
      expect(fx).toEqual({ rate: 3.2, source: "boi", date: "2026-06-01" });
    });

    it("says a rate the user typed", () => {
      const { fx } = breakdownPortfolio(buildTestProfile({ equity: holding, usdToIlsRate: { rate: 3.3 } }));
      expect(fx).toEqual({ rate: 3.3, source: "typed", date: null });
    });

    it("says when only the built-in rate is available", () => {
      const { fx } = breakdownPortfolio(buildTestProfile({ equity: holding }));
      expect(fx).toMatchObject({ source: "fallback", date: null });
    });
  });

  describe("a spouse's accounts", () => {
    const accounts = {
      pensionBalances: [100_000, 40_000],
      pensionAccountOverrides: [{}, { owner: "spouse" as const }],
    };

    it("are counted, and flagged, while the plan covers a spouse", () => {
      const result = breakdownPortfolio(
        buildTestProfile({ ...accounts, maritalStatus: "married", spouse: { age: 50 } }),
      );
      expect(result.total).toBe(140_000);
      expect(result.includesSpouse).toBe(true);
    });

    it("are left out, as in the total, before the spouse's age is entered", () => {
      const result = breakdownPortfolio(buildTestProfile({ ...accounts, maritalStatus: "married" }));
      expect(result.total).toBe(100_000);
      expect(result.includesSpouse).toBe(false);
    });
  });
});
