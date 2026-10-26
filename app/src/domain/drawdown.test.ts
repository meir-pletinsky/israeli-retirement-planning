import { describe, expect, it } from "vitest";

import { buildTestProfile } from "../test/domainFixtures";
import { simulateDrawdown } from "./drawdown";

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
});
