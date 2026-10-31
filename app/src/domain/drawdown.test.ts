import { describe, expect, it } from "vitest";

import { buildTestProfile } from "../test/domainFixtures";
import { simulateDrawdown } from "./drawdown";

describe("simulateDrawdown unmet spending", () => {
  const profile = buildTestProfile({
    age: 60,
    retirementAge: 60,
    investmentReturnPct: 4,
    inflationPct: 4,
    pensionBalances: [120_000],
  });

  it("is zero every year when the spending is funded to the horizon", () => {
    const rows = simulateDrawdown(profile, 60, 300);
    expect(rows.every((row) => row.unmet === 0)).toBe(true);
  });

  it("appears once the capital runs out, and then covers the whole spending", () => {
    const rows = simulateDrawdown(profile, 60, 2_000);
    const firstShort = rows.findIndex((row) => row.unmet > 0);
    expect(firstShort).toBeGreaterThan(0);
    expect(rows.slice(0, firstShort).every((row) => row.unmet === 0)).toBe(true);
    expect(rows.slice(firstShort).every((row) => row.unmet > 0)).toBe(true);
    expect(rows[rows.length - 1].unmet).toBeCloseTo(2_000 * 12, 6);
  });

  it("is zero before the drawing starts", () => {
    const rows = simulateDrawdown({ ...profile, personal: { ...profile.personal, age: 50 } }, 60, 2_000);
    expect(rows.slice(0, 10).every((row) => row.unmet === 0)).toBe(true);
  });
});

describe("simulateDrawdown spendable capital and draw", () => {
  const profile = buildTestProfile({
    age: 60,
    retirementAge: 60,
    investmentReturnPct: 4,
    inflationPct: 4,
    pensionBalances: [120_000],
  });

  it("draws the spending from the capital each year it is available", () => {
    const rows = simulateDrawdown(profile, 60, 300);
    expect(rows[0].drawn).toBe(0);
    expect(rows[1].spendable).toBeCloseTo(120_000, 6);
    expect(rows[1].drawn).toBeCloseTo(300 * 12, 6);
    expect(rows[2].spendable).toBeCloseTo(120_000 - 300 * 12, 6);
  });

  it("never draws more than the spendable capital", () => {
    const rows = simulateDrawdown(profile, 60, 2_000);
    expect(rows.every((row) => row.drawn <= row.spendable + 1e-6)).toBe(true);
    expect(rows[rows.length - 1].drawn).toBeCloseTo(0, 6);
  });

  it("shows capital but no draw before the retirement year", () => {
    const rows = simulateDrawdown({ ...profile, personal: { ...profile.personal, age: 50 } }, 60, 300);
    expect(rows.slice(0, 10).every((row) => row.drawn === 0 && row.spendable > 0)).toBe(true);
  });

  it("leaves out capital that is still locked", () => {
    const locked = buildTestProfile({
      age: 50,
      retirementAge: 55,
      investmentReturnPct: 4,
      inflationPct: 4,
      pensionBalances: [100_000],
      pensionAccountOverrides: [{ productCategory: "providentFund" }],
    });
    const rows = simulateDrawdown(locked, 60, 300);
    // Before 60 the provident fund is locked, so nothing is spendable and nothing is drawn.
    expect(rows[6].spendable).toBe(0);
    expect(rows[6].drawn).toBe(0);
  });
});

describe("simulateDrawdown holdings", () => {
  const investmentFund = [{ productCategory: "investmentProvidentFund" as const }];

  it("emits one holding per source with its owner, tax treatment and annuity", () => {
    const rows = simulateDrawdown(
      buildTestProfile({
        age: 50,
        retirementAge: 60,
        investmentReturnPct: 4,
        inflationPct: 4,
        pensionBalances: [100_000, 50_000],
        pensionAccountOverrides: [{ productCategory: "studyFund" }, {}],
        otherAssets: 20_000,
      }),
      60,
      1_000,
    );
    expect(rows[0].holdings.map(({ memberIndex, treatment }) => ({ memberIndex, treatment }))).toEqual([
      { memberIndex: 0, treatment: "exempt" },
      { memberIndex: 0, treatment: "pension" },
      { memberIndex: 0, treatment: "capitalGains" },
    ]);
    expect(rows[0].holdings.every((holding) => holding.annuityMonthly === 0)).toBe(true);
  });

  it("has no gain on an investment fund that has not grown in real terms", () => {
    const rows = simulateDrawdown(
      buildTestProfile({
        age: 50,
        retirementAge: 60,
        investmentReturnPct: 4,
        inflationPct: 4,
        pensionBalances: [100_000],
        pensionAccountOverrides: investmentFund,
      }),
      60,
      500,
    );
    for (const row of rows) {
      expect(row.holdings[0].gainFraction).toBeCloseTo(0, 9);
    }
  });

  it("accrues a gain as the fund grows", () => {
    const rows = simulateDrawdown(
      buildTestProfile({
        age: 50,
        retirementAge: 60,
        investmentReturnPct: 4,
        inflationPct: 0,
        pensionBalances: [100_000],
        pensionAccountOverrides: investmentFund,
      }),
      60,
      0,
    );
    // Balance 100,000 x 1.04^10 against a basis that stayed at 100,000.
    const gainAt60 = 1 - 100_000 / (100_000 * 1.04 ** 10);
    expect(rows[10].holdings[0].gainFraction).toBeCloseTo(gainAt60, 9);
  });

  it("keeps the gain share of a holding as withdrawals draw its basis down pro rata", () => {
    const rows = simulateDrawdown(
      buildTestProfile({
        age: 50,
        retirementAge: 60,
        investmentReturnPct: 4,
        inflationPct: 4,
        equity: [{ quantity: 100, priceUSD: 100, unrealizedCapitalGainUSD: 1_000 }],
      }),
      60,
      1_000,
    );
    // $1,000 of $10,000 is gain, and the 37,000 lasts until about three years after retiring.
    for (const row of rows.slice(0, 13)) {
      expect(row.holdings[0].gainFraction).toBeCloseTo(0.1, 9);
    }
    expect(rows[14].netWorth).toBeCloseTo(0, 6);
  });

  it("adds deposits to the cost basis, so they are not counted as gain", () => {
    const rows = simulateDrawdown(
      buildTestProfile({
        age: 50,
        retirementAge: 60,
        monthlyGrossSalary: 10_000,
        investmentReturnPct: 4,
        inflationPct: 4,
        pensionBalances: [100_000],
        pensionAccountOverrides: [
          {
            productCategory: "investmentProvidentFund",
            accountStatus: "activeContributing",
            contributions: {
              employeeRatePercent: 5,
              employerRatePercent: 5,
              severanceRatePercent: 0,
            },
          },
        ],
      }),
      60,
      0,
    );
    // 0% real return: every shekel in the fund is a deposit, whatever its size.
    expect(rows[5].netWorth).toBeGreaterThan(100_000);
    expect(rows[5].holdings[0].gainFraction).toBeCloseTo(0, 9);
  });

  it("leaves capital shares summing to one while capital remains", () => {
    const rows = simulateDrawdown(
      buildTestProfile({
        age: 60,
        retirementAge: 60,
        investmentReturnPct: 4,
        inflationPct: 4,
        pensionBalances: [100_000, 300_000],
        pensionAccountOverrides: [{}, investmentFund[0]],
      }),
      60,
      1_000,
    );
    const row = rows[1];
    const total = row.holdings.reduce((sum, holding) => sum + holding.capitalShare, 0);
    expect(total).toBeCloseTo(1, 9);
    expect(row.holdings[0].capitalShare).toBeCloseTo(0.25, 9);
    expect(row.holdings[1].capitalShare).toBeCloseTo(0.75, 9);
  });

  describe("employer-granted shares", () => {
    // The shares come after the investments bucket, which exists even when empty.
    const SHARES = 1;
    // 100 shares at $50 now (18,500 shekels), worth $20 each at the grant (7,400 shekels).
    const capitalRoute = {
      equity: [
        {
          quantity: 100,
          priceUSD: 50,
          employerGrant: { taxTrack: "section102CapitalGainsTrustee" as const, grantPriceUSD: 20 },
        },
      ],
    };

    it("splits a Section 102 holding into the grant-date ordinary layer and a capital gain", () => {
      const rows = simulateDrawdown(
        buildTestProfile({
          age: 50,
          retirementAge: 60,
          investmentReturnPct: 4,
          inflationPct: 4,
          ...capitalRoute,
        }),
        60,
        0,
      );
      expect(rows[0].holdings[SHARES].ordinaryFraction).toBeCloseTo(0.4, 9);
      expect(rows[0].holdings[SHARES].gainFraction).toBeCloseTo(0.6, 9);
    });

    it("keeps the ordinary layer fixed while growth above it is a capital gain", () => {
      const rows = simulateDrawdown(
        buildTestProfile({
          age: 50,
          retirementAge: 60,
          investmentReturnPct: 4,
          inflationPct: 0,
          ...capitalRoute,
        }),
        60,
        0,
      );
      const grown = 1.04 ** 10;
      const ordinaryAt60 = 7_400 / (18_500 * grown);
      expect(rows[10].holdings[SHARES].ordinaryFraction).toBeCloseTo(ordinaryAt60, 9);
      expect(rows[10].holdings[SHARES].gainFraction).toBeCloseTo(1 - ordinaryAt60, 9);
    });

    it("draws the ordinary layer down pro rata with withdrawals", () => {
      const rows = simulateDrawdown(
        buildTestProfile({
          age: 50,
          retirementAge: 60,
          investmentReturnPct: 4,
          inflationPct: 4,
          ...capitalRoute,
        }),
        60,
        1_000,
      );
      // 18,500 less 12,000 a year from age 60: spent by 62.
      for (const row of rows.slice(0, 12)) {
        expect(row.holdings[SHARES].ordinaryFraction).toBeCloseTo(0.4, 9);
        expect(row.holdings[SHARES].gainFraction).toBeCloseTo(0.6, 9);
      }
      expect(rows[12].holdings[SHARES].ordinaryFraction).toBe(0);
    });

    it("treats the whole of an ordinary-income holding as ordinary income", () => {
      const rows = simulateDrawdown(
        buildTestProfile({
          age: 50,
          retirementAge: 60,
          investmentReturnPct: 4,
          inflationPct: 4,
          equity: [
            {
              quantity: 100,
              priceUSD: 50,
              employerGrant: { taxTrack: "section102OrdinaryIncomeTrustee" },
            },
          ],
        }),
        60,
        0,
      );
      expect(rows[0].holdings[SHARES].treatment).toBe("ordinaryIncome");
      expect(rows[0].holdings[SHARES].ordinaryFraction).toBe(1);
      expect(rows[0].holdings[SHARES].gainFraction).toBe(0);
    });

    it("has no ordinary income on other holdings", () => {
      const rows = simulateDrawdown(
        buildTestProfile({
          age: 50,
          retirementAge: 60,
          investmentReturnPct: 4,
          inflationPct: 4,
          equity: [{ quantity: 100, priceUSD: 50, unrealizedCapitalGainUSD: 1_000 }],
        }),
        60,
        0,
      );
      expect(rows[0].holdings[0].ordinaryFraction).toBe(0);
    });
  });
});
