import { describe, expect, it } from "vitest";

import { buildTestProfile } from "../test/domainFixtures";
import { simulateHouseholdDrawdown } from "./drawdown";
import { buildHousehold, resolveRetirementTiming } from "./household";
import {
  MONTE_CARLO_CONFIDENCE,
  createRandom,
  quantile,
  resolveVolatility,
  runMonteCarlo,
  standardNormalShocks,
  successBand,
  successPercent,
  yearlyRatesFromShocks,
} from "./monteCarlo";

const FAST = { paths: 400 };

function planFor(desiredMonthly: number, extra: { volatilityPct?: number } = {}) {
  return buildTestProfile({
    age: 40,
    retirementAge: 67,
    gender: "male",
    monthlyGrossSalary: 20_000,
    investmentReturnPct: 5,
    inflationPct: 2,
    pensionBalances: [900_000, 300_000],
    retirementMonthlyExpenses: desiredMonthly,
    ...extra,
  });
}

describe("random numbers", () => {
  it("repeats for the same seed, differs for another, and stays in [0, 1)", () => {
    const first = createRandom(7);
    const again = createRandom(7);
    const other = createRandom(8);
    const draws = Array.from({ length: 1000 }, () => first());
    expect(draws).toEqual(Array.from({ length: 1000 }, () => again()));
    expect(draws).not.toEqual(Array.from({ length: 1000 }, () => other()));
    expect(Math.min(...draws)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...draws)).toBeLessThan(1);
  });

  it("draws standard normal shocks: mean near 0 and spread near 1", () => {
    const rows = standardNormalShocks(500, 40, 123);
    const all = rows.flatMap((row) => Array.from(row));
    const mean = all.reduce((sum, value) => sum + value, 0) / all.length;
    const variance = all.reduce((sum, value) => sum + (value - mean) ** 2, 0) / all.length;
    expect(all).toHaveLength(20_000);
    expect(Math.abs(mean)).toBeLessThan(0.03);
    expect(Math.sqrt(variance)).toBeGreaterThan(0.97);
    expect(Math.sqrt(variance)).toBeLessThan(1.03);
  });

  it("gives the same shocks for the same seed", () => {
    expect(standardNormalShocks(3, 5, 99)).toEqual(standardNormalShocks(3, 5, 99));
  });
});

describe("quantile", () => {
  it("interpolates between neighbours and clamps the ends", () => {
    const sorted = [10, 20, 30, 40];
    expect(quantile(sorted, 0)).toBe(10);
    expect(quantile(sorted, 1)).toBe(40);
    expect(quantile(sorted, 0.5)).toBe(25);
    expect(quantile(sorted, 2)).toBe(40);
    expect(quantile([], 0.5)).toBe(0);
  });
});

describe("resolveVolatility", () => {
  it("returns a fraction, falls back to the default, and clamps to the maximum", () => {
    expect(resolveVolatility(15)).toBe(0.15);
    expect(resolveVolatility(0)).toBe(0);
    expect(resolveVolatility(undefined)).toBe(0.12);
    expect(resolveVolatility(Number.NaN)).toBe(0.12);
    expect(resolveVolatility(-5)).toBe(0);
    expect(resolveVolatility(400)).toBe(0.5);
  });
});

describe("yearlyRatesFromShocks", () => {
  it("makes the median rate the return of a zero shock", () => {
    const rates = yearlyRatesFromShocks([0, 0, 0], 0.03, 0.12);
    rates.forEach((rate) => expect(rate).toBeCloseTo(0.03, 12));
  });

  it("moves the rate up with a positive shock and down with a negative one", () => {
    const [down, flat, up] = yearlyRatesFromShocks([-1, 0, 1], 0.03, 0.12);
    expect(down).toBeLessThan(flat);
    expect(up).toBeGreaterThan(flat);
    expect(1 + up).toBeCloseTo((1 + flat) * Math.exp(0.12), 12);
  });

  it("never loses more than everything in a year", () => {
    const [crash] = yearlyRatesFromShocks([-10], 0.03, 0.5);
    expect(crash).toBeGreaterThan(-1);
  });
});

describe("simulation with yearly rates", () => {
  it("reproduces the constant-rate projection when every year earns the household rate", () => {
    const profile = planFor(8_000);
    const household = buildHousehold(profile, resolveRetirementTiming(profile, "standard"));
    const plain = simulateHouseholdDrawdown(household, 9_000);
    const withRates = simulateHouseholdDrawdown(household, 9_000, {
      yearlyRates: Array.from({ length: Math.floor(household.horizonYears) }, () => household.rate),
    });
    expect(withRates.map((row) => row.netWorth)).toEqual(plain.map((row) => row.netWorth));
    expect(withRates.map((row) => row.unmet)).toEqual(plain.map((row) => row.unmet));
  });

  it("skips the holdings breakdown in lean mode without changing net worth", () => {
    const profile = planFor(8_000);
    const household = buildHousehold(profile, resolveRetirementTiming(profile, "standard"));
    const full = simulateHouseholdDrawdown(household, 9_000);
    const lean = simulateHouseholdDrawdown(household, 9_000, { lean: true });
    expect(lean.map((row) => row.netWorth)).toEqual(full.map((row) => row.netWorth));
    expect(lean.every((row) => row.holdings.length === 0)).toBe(true);
    expect(full.some((row) => row.holdings.length > 0)).toBe(true);
  });
});

describe("successBand and successPercent", () => {
  it("bands a probability as strong, fair or weak", () => {
    expect(successBand(1)).toBe("strong");
    expect(successBand(0.9)).toBe("strong");
    expect(successBand(0.89)).toBe("fair");
    expect(successBand(0.7)).toBe("fair");
    expect(successBand(0.69)).toBe("weak");
    expect(successBand(0)).toBe("weak");
  });

  it("rounds the percentage down, never showing 99.9% as certain", () => {
    expect(successPercent(1)).toBe(100);
    expect(successPercent(0.999)).toBe(99);
    expect(successPercent(0.29)).toBe(29);
    expect(successPercent(0.004)).toBe(0);
    expect(successPercent(-1)).toBe(0);
    expect(successPercent(2)).toBe(100);
  });
});

describe("runMonteCarlo", () => {
  it("returns null without desired spending, or without drawing years", () => {
    expect(runMonteCarlo(buildTestProfile({ age: 40, retirementAge: 67 }), "standard", FAST)).toBeNull();
    expect(runMonteCarlo(planFor(0), "standard", FAST)).toBeNull();
    const pastHorizon = buildTestProfile({
      age: 95,
      retirementAge: 95,
      pensionBalances: [100_000],
      retirementMonthlyExpenses: 1_000,
    });
    expect(runMonteCarlo(pastHorizon, "standard", FAST)).toBeNull();
  });

  it("gives the same answer twice for the same profile", () => {
    const profile = planFor(9_000);
    expect(runMonteCarlo(profile, "standard", FAST)).toEqual(runMonteCarlo(profile, "standard", FAST));
  });

  it("builds a fan from today to the planning horizon with ordered percentiles", () => {
    const result = runMonteCarlo(planFor(9_000), "standard", { ...FAST, findConfidentSpending: false });
    expect(result).not.toBeNull();
    const { fan } = result!;
    expect(fan).toHaveLength(51); // age 40 to 90
    expect(fan[0]).toMatchObject({ age: 40, yearsFromNow: 0 });
    expect(fan[fan.length - 1].age).toBe(90);
    for (const point of fan) {
      expect(point.p10).toBeLessThanOrEqual(point.p50);
      expect(point.p50).toBeLessThanOrEqual(point.p90);
    }
    expect(fan[0].p10).toBe(fan[0].p90);
  });

  it("follows the deterministic projection with its median path", () => {
    const profile = planFor(9_000);
    const result = runMonteCarlo(profile, "standard", { paths: 2000, findConfidentSpending: false })!;
    const household = buildHousehold(profile, resolveRetirementTiming(profile, "standard"));
    const deterministic = simulateHouseholdDrawdown(household, result.targetGrossMonthly);
    const atRetirement = result.fan.find((point) => point.age === 67)!;
    const expected = deterministic.find((row) => row.age === 67)!.netWorth;
    // Wealth is skewed, so the middle path sits a little under the deterministic line.
    expect(atRetirement.p50).toBeGreaterThan(expected * 0.8);
    expect(atRetirement.p50).toBeLessThan(expected * 1.05);
  });

  it("is certain when there is no volatility and the plan is comfortably funded", () => {
    const result = runMonteCarlo(planFor(2_000, { volatilityPct: 0 }), "standard", {
      ...FAST,
      findConfidentSpending: false,
    })!;
    expect(result.successProbability).toBe(1);
    expect(result.medianShortfallAge).toBeNull();
  });

  it("fails every path when there is no volatility and the spending is out of reach", () => {
    const result = runMonteCarlo(planFor(60_000, { volatilityPct: 0 }), "standard", {
      ...FAST,
      findConfidentSpending: false,
    })!;
    expect(result.successProbability).toBe(0);
    expect(result.medianShortfallAge).not.toBeNull();
    expect(result.medianShortfallAge!).toBeGreaterThanOrEqual(67);
    expect(result.medianShortfallAge!).toBeLessThan(90);
  });

  it("is less likely to succeed as the spending rises", () => {
    const options = { ...FAST, findConfidentSpending: false };
    const odds = [4_000, 7_000, 10_000, 14_000].map(
      (spending) => runMonteCarlo(planFor(spending), "standard", options)!.successProbability,
    );
    for (let i = 1; i < odds.length; i += 1) expect(odds[i]).toBeLessThanOrEqual(odds[i - 1]);
    expect(odds[0]).toBeGreaterThan(odds[odds.length - 1]);
  });

  it("is less likely to succeed as the market gets more volatile", () => {
    const options = { ...FAST, findConfidentSpending: false };
    const odds = [0, 12, 25].map(
      (volatilityPct) =>
        runMonteCarlo(planFor(5_500, { volatilityPct }), "standard", options)!.successProbability,
    );
    expect(odds[0]).toBeGreaterThanOrEqual(odds[1]);
    expect(odds[1]).toBeGreaterThanOrEqual(odds[2]);
    expect(odds[0]).toBeGreaterThan(odds[2]);
  });

  it("finds the spending that is funded in at least 90% of paths, and not much more", () => {
    const profile = planFor(9_000);
    const result = runMonteCarlo(profile, "standard", FAST)!;
    expect(result.confidentNetMonthly).not.toBeNull();
    const confident = result.confidentNetMonthly!;
    expect(confident).toBeGreaterThan(0);
    expect(confident % 10).toBe(0);

    const at = (spending: number) =>
      runMonteCarlo(planFor(spending), "standard", { ...FAST, findConfidentSpending: false })!
        .successProbability;
    expect(at(confident)).toBeGreaterThanOrEqual(MONTE_CARLO_CONFIDENCE);
    expect(at(Math.ceil(confident * 1.01))).toBeLessThan(MONTE_CARLO_CONFIDENCE);
  });

  it("skips the confident-spending search on request", () => {
    const result = runMonteCarlo(planFor(9_000), "standard", { ...FAST, findConfidentSpending: false })!;
    expect(result.confidentNetMonthly).toBeNull();
  });

  it("reports the target, its pre-tax equivalent and the volatility used", () => {
    const result = runMonteCarlo(planFor(9_000, { volatilityPct: 15 }), "standard", {
      ...FAST,
      findConfidentSpending: false,
    })!;
    expect(result.targetNetMonthly).toBe(9_000);
    expect(result.targetGrossMonthly).toBeGreaterThanOrEqual(9_000);
    expect(result.taxShare).toBeGreaterThanOrEqual(0);
    expect(result.taxShare).toBeLessThan(0.9);
    expect(result.volatilityPct).toBeCloseTo(15, 10);
    expect(result.paths).toBe(400);
    expect(result.drawdownStartAge).toBe(67);
  });

  it("uses the volatility default for a profile saved without one", () => {
    const profile = planFor(9_000);
    const legacy = {
      ...profile,
      assumptions: { ...profile.assumptions, volatilityPct: undefined as unknown as number },
    };
    const result = runMonteCarlo(legacy, "standard", { ...FAST, findConfidentSpending: false })!;
    expect(result.volatilityPct).toBeCloseTo(12, 10);
  });

  it("follows the chosen retirement scenario", () => {
    const options = { ...FAST, findConfidentSpending: false };
    const early = runMonteCarlo(planFor(9_000), "early", options)!;
    const delayed = runMonteCarlo(planFor(9_000), "delayed", options)!;
    expect(early.drawdownStartAge).toBeLessThan(delayed.drawdownStartAge);
    expect(delayed.successProbability).toBeGreaterThanOrEqual(early.successProbability);
  });
});
