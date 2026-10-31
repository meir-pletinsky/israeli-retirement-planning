import { describe, expect, it } from "vitest";

import { buildTestProfile } from "../test/domainFixtures";
import { WITHDRAWAL_STRATEGIES } from "../types";
import { simulateDrawdown } from "./drawdown";
import { estimateNetIncome } from "./netIncome";
import { compareWithdrawalStrategies } from "./withdrawalStrategies";

const zeroReal = { investmentReturnPct: 4, inflationPct: 4 };

// Sources come in this order: pension, study fund, investment provident fund, then the other investments.
const fourSources = {
  age: 60,
  retirementAge: 60,
  ...zeroReal,
  pensionBalances: [100_000, 100_000, 100_000],
  pensionAccountOverrides: [
    {},
    { productCategory: "studyFund" as const },
    { productCategory: "investmentProvidentFund" as const },
  ],
  otherAssets: 100_000,
};
const [PENSION, STUDY, GEMEL, OTHER] = [0, 1, 2, 3];

const shares = (strategy: (typeof WITHDRAWAL_STRATEGIES)[number], year: number) =>
  simulateDrawdown(buildTestProfile({ ...fourSources, withdrawalStrategy: strategy }), 60, 5_000)[
    year
  ].holdings.map((holding) => holding.capitalShare);

describe("withdrawal order in the drawdown", () => {
  it("takes the same share of every balance when pro rata", () => {
    for (const share of shares("proRata", 1)) expect(share).toBeCloseTo(0.25, 9);
  });

  it("uses up the other investments, then the investment fund, then pension, then the study fund", () => {
    // 60,000 a year: the first year is all other investments, the second year their last 40,000 and 20,000 of the fund.
    expect(shares("taxableFirst", 1)).toEqual([0, 0, 0, 1]);
    const second = shares("taxableFirst", 2);
    expect(second[OTHER]).toBeCloseTo(2 / 3, 9);
    expect(second[GEMEL]).toBeCloseTo(1 / 3, 9);
    expect(second[PENSION]).toBe(0);
    expect(second[STUDY]).toBe(0);

    // By the fourth year only 20,000 of the fund is left, so the pension makes up the rest.
    const fourth = shares("taxableFirst", 4);
    expect(fourth[GEMEL]).toBeCloseTo(1 / 3, 9);
    expect(fourth[PENSION]).toBeCloseTo(2 / 3, 9);
    expect(fourth[STUDY]).toBe(0);
    expect(shares("taxableFirst", 5)).toEqual([1, 0, 0, 0]);
    // The tax-free study fund is last.
    expect(shares("taxableFirst", 6)).toEqual([0, 1, 0, 0]);
  });

  it("starts with the study fund when drawing the lowest tax first", () => {
    expect(shares("lowestTaxFirst", 1)).toEqual([0, 1, 0, 0]);
    // Then money taxed only on its gain, sharing the draw, and pension-like money after it.
    const second = shares("lowestTaxFirst", 2);
    expect(second[STUDY]).toBeCloseTo(2 / 3, 9);
    expect(second[GEMEL]).toBeCloseTo(1 / 6, 9);
    expect(second[OTHER]).toBeCloseTo(1 / 6, 9);
    expect(second[PENSION]).toBe(0);
  });

  it("keeps the shares of a drawing year summing to one", () => {
    for (const strategy of WITHDRAWAL_STRATEGIES) {
      for (let year = 1; year <= 5; year += 1) {
        const total = shares(strategy, year).reduce((sum, share) => sum + share, 0);
        expect(total).toBeCloseTo(1, 9);
      }
    }
  });

  it("draws the same gross amount and leaves the same capital whatever the order", () => {
    const rows = (strategy: (typeof WITHDRAWAL_STRATEGIES)[number]) =>
      simulateDrawdown(
        buildTestProfile({
          ...fourSources,
          investmentReturnPct: 4,
          inflationPct: 0,
          withdrawalStrategy: strategy,
        }),
        60,
        3_000,
      );
    const base = rows("proRata");
    for (const strategy of ["taxableFirst", "lowestTaxFirst"] as const) {
      const other = rows(strategy);
      expect(other.length).toBe(base.length);
      other.forEach((row, index) => {
        expect(row.drawn).toBeCloseTo(base[index].drawn, 6);
        expect(row.unmet).toBeCloseTo(base[index].unmet, 6);
        expect(row.netWorth).toBeCloseTo(base[index].netWorth, 6);
      });
    }
  });

  it("never draws more than a source holds", () => {
    const rows = simulateDrawdown(
      buildTestProfile({ ...fourSources, withdrawalStrategy: "taxableFirst" }),
      60,
      9_000,
    );
    expect(rows.every((row) => row.netWorth >= -1e-9)).toBe(true);
    expect(rows[rows.length - 1].netWorth).toBeCloseTo(0, 6);
  });
});

describe("compareWithdrawalStrategies", () => {
  const profile = buildTestProfile({
    age: 60,
    retirementAge: 60,
    ...zeroReal,
    pensionBalances: [1_500_000, 600_000],
    pensionAccountOverrides: [{}, { productCategory: "studyFund" }],
    otherAssets: 400_000,
    retirementMonthlyExpenses: 9_000,
  });

  it("has one result per strategy, starting with the plan's own order", () => {
    const comparison = compareWithdrawalStrategies(profile);
    expect(comparison.results.map((result) => result.strategy)).toEqual([...WITHDRAWAL_STRATEGIES]);
    expect(comparison.current).toBe("proRata");
    expect(comparison.desiredMonthly).toBe(9_000);
  });

  it("matches the main plan for the order the plan uses", () => {
    for (const strategy of WITHDRAWAL_STRATEGIES) {
      const saved = { ...profile, assumptions: { ...profile.assumptions, withdrawalStrategy: strategy } };
      const comparison = compareWithdrawalStrategies(saved);
      const plan = estimateNetIncome(saved);
      const row = comparison.results.find((result) => result.strategy === strategy);
      expect(comparison.current).toBe(strategy);
      expect(row?.years).toEqual(plan.years);
      expect(row?.lowestNetMonthly).toBe(plan.netMonthlyIncome);
      expect(row?.lowestNetAge).toBe(plan.lowestNetAge);
    }
  });

  it("gives the same gross income every year in every order, and only the tax differs", () => {
    const { results } = compareWithdrawalStrategies(profile);
    const [base, ...others] = results;
    for (const result of others) {
      expect(result.years.map((year) => year.grossMonthly)).toEqual(base.years.map((year) => year.grossMonthly));
    }
    expect(compareWithdrawalStrategies(profile).identical).toBe(false);
  });

  it("totals tax, averages net income and finds the first year below the desired spending", () => {
    const { results } = compareWithdrawalStrategies(profile);
    for (const result of results) {
      expect(result.totalTax).toBeCloseTo(
        result.years.reduce((sum, year) => sum + year.taxMonthly * 12, 0),
        6,
      );
      expect(result.averageNetMonthly).toBeCloseTo(
        result.years.reduce((sum, year) => sum + year.netMonthly, 0) / result.years.length,
        6,
      );
      expect(result.lowestNetMonthly).toBe(Math.min(...result.years.map((year) => year.netMonthly)));
      const short = result.years.find((year) => year.netMonthly < 9_000);
      expect(result.firstShortfallAge).toBe(short ? short.age : null);
    }
  });

  it("has no shortfall age and no surtax years when there is no desired spending or high income", () => {
    const { results, desiredMonthly } = compareWithdrawalStrategies({
      ...profile,
      expenses: { ...profile.expenses, retirementMonthly: null },
    });
    expect(desiredMonthly).toBeNull();
    for (const result of results) {
      expect(result.firstShortfallAge).toBeNull();
      expect(result.surtaxYears).toBe(0);
    }
  });

  it("finds no difference when the whole plan is one kind of money", () => {
    const comparison = compareWithdrawalStrategies(
      buildTestProfile({ age: 60, retirementAge: 60, ...zeroReal, pensionBalances: [500_000] }),
    );
    expect(comparison.identical).toBe(true);
  });

  it("gives empty figures when there is no income", () => {
    const { results } = compareWithdrawalStrategies(buildTestProfile({ age: 60, retirementAge: 60 }));
    for (const result of results) {
      expect(result.totalTax).toBe(0);
      expect(result.lowestNetMonthly).toBe(0);
      expect(result.lowestNetAge).toBeNull();
    }
  });
});
