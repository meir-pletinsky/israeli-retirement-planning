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

  describe("what can be spent now and what is locked", () => {
    const groupAmounts = (profile: Parameters<typeof breakdownPortfolio>[0]) =>
      Object.fromEntries(breakdownPortfolio(profile).groups.map((group) => [group.key, group.amount]));

    it("locks pension-like accounts until 60 and leaves the rest usable", () => {
      const result = breakdownPortfolio({ ...rich, personal: { ...rich.personal, age: 45 } });
      const locked = result.groups.find((group) => group.key === "locked");
      const usable = result.groups.find((group) => group.key === "usableNow");
      expect(locked?.rows).toEqual([
        { key: "pensionFund", amount: 500_000, dollarPriced: false, opensAtAge: 60 },
        { key: "providentFund", amount: 100_000, dollarPriced: false, opensAtAge: 60 },
        { key: "managersInsurance", amount: 80_000, dollarPriced: false, opensAtAge: 60 },
      ]);
      // The study fund has no join or liquidity date, so the model treats it as liquid.
      expect(usable?.rows.map((row) => row.key)).toEqual([
        "studyFund",
        "bankDeposits",
        "privateShares",
        "employerShares",
        "cashAndOther",
      ]);
      expect(locked?.amount).toBe(680_000);
      expect(result.groups.reduce((sum, group) => sum + group.amount, 0)).toBe(result.total);
    });

    it("has nothing locked once the owner is past 60", () => {
      const profile = buildTestProfile({ age: 62, pensionBalances: [500_000], otherAssets: 20_000 });
      expect(groupAmounts(profile)).toEqual({ usableNow: 520_000 });
    });

    it("locks a study fund until its liquidity date, in the owner's age", () => {
      const profile = buildTestProfile({
        age: 45,
        pensionBalances: [90_000],
        pensionAccountOverrides: [{ productCategory: "studyFund", liquidityDate: "2029-06-15" }],
      });
      expect(breakdownPortfolio(profile).groups).toEqual([
        {
          key: "locked",
          amount: 90_000,
          rows: [{ key: "studyFund", amount: 90_000, dollarPriced: false, opensAtAge: 48 }],
        },
      ]);
    });

    it("states when a spouse's locked account opens in the primary user's age", () => {
      const profile = buildTestProfile({
        age: 62,
        maritalStatus: "married",
        spouse: { age: 45 },
        pensionBalances: [100_000, 40_000],
        pensionAccountOverrides: [
          { productCategory: "comprehensivePension" },
          { owner: "spouse", productCategory: "comprehensivePension" },
        ],
      });
      const { groups } = breakdownPortfolio(profile);
      // The spouse reaches 60 in 15 years, when the primary user is 77.
      expect(groups).toEqual([
        { key: "usableNow", amount: 100_000, rows: [{ key: "pensionFund", amount: 100_000, dollarPriced: false, opensAtAge: null }] },
        { key: "locked", amount: 40_000, rows: [{ key: "pensionFund", amount: 40_000, dollarPriced: false, opensAtAge: 77 }] },
      ]);
    });

    it("keeps the rows of one kind together when part of it is locked", () => {
      const profile = buildTestProfile({
        age: 45,
        pensionBalances: [100_000, 60_000],
        pensionAccountOverrides: [
          { productCategory: "providentFund" },
          { productCategory: "investmentProvidentFund" },
        ],
      });
      expect(groupAmounts(profile)).toEqual({ usableNow: 60_000, locked: 100_000 });
      const { groups, rows } = breakdownPortfolio(profile);
      expect(rows).toEqual([{ key: "providentFund", amount: 160_000, dollarPriced: false }]);
      expect(groups.every((group) => group.rows.length === 1 && group.rows[0].key === "providentFund")).toBe(true);
    });

    it("leaves no group for an empty profile", () => {
      expect(breakdownPortfolio(buildTestProfile({})).groups).toEqual([]);
    });
  });

  describe("the part priced in dollars", () => {
    it("adds up the share rows", () => {
      expect(breakdownPortfolio(rich).dollarPriced).toBe(15_000 + 3_600);
      expect(breakdownPortfolio(rich).rows.find((row) => row.key === "privateShares")?.dollarPriced).toBe(true);
      expect(breakdownPortfolio(rich).rows.find((row) => row.key === "bankDeposits")?.dollarPriced).toBe(false);
    });

    it("is zero without shares", () => {
      expect(breakdownPortfolio(buildTestProfile({ otherAssets: 10 })).dollarPriced).toBe(0);
    });
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
