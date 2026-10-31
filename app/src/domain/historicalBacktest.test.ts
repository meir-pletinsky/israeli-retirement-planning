import { describe, expect, it } from "vitest";

import { geometricMean, realReturnsForMix, rebaseReturns } from "../history/returns";
import { buildTestProfile } from "../test/domainFixtures";
import { simulateHouseholdDrawdown } from "./drawdown";
import {
  DEFAULT_BACKTEST_STOCK_SHARE_PCT,
  groupConsecutiveYears,
  runHistoricalBacktest,
} from "./historicalBacktest";
import { prepareSpendingTest } from "./spendingTest";

const FAST = { findSurvivableSpending: false };

function planFor(desiredMonthly: number, age = 40) {
  return buildTestProfile({
    age,
    retirementAge: 67,
    gender: "male",
    monthlyGrossSalary: 20_000,
    investmentReturnPct: 5,
    inflationPct: 2,
    pensionBalances: [900_000, 300_000],
    retirementMonthlyExpenses: desiredMonthly,
  });
}

describe("runHistoricalBacktest", () => {
  it("returns null without desired spending, or without drawing years", () => {
    expect(runHistoricalBacktest(buildTestProfile({ age: 40, retirementAge: 67 }))).toBeNull();
    expect(runHistoricalBacktest(planFor(0))).toBeNull();
    const pastHorizon = buildTestProfile({
      age: 95,
      retirementAge: 95,
      pensionBalances: [100_000],
      retirementMonthlyExpenses: 1_000,
    });
    expect(runHistoricalBacktest(pastHorizon)).toBeNull();
  });

  it("starts a window in every year that leaves a full horizon of history", () => {
    const result = runHistoricalBacktest(planFor(9_000), "standard", FAST)!;
    // Age 40 to 90 is 50 years; 1928-2025 is 98 years, so starts 1928 to 1976.
    expect(result.horizonYears).toBe(50);
    expect(result.windows).toHaveLength(49);
    expect(result.windows[0]).toMatchObject({ startYear: 1928, endYear: 1977 });
    expect(result.windows[48]).toMatchObject({ startYear: 1976, endYear: 2025 });
    result.windows.forEach((window, index) => expect(window.startYear).toBe(1928 + index));
  });

  it("has fewer windows for a younger person with a longer plan", () => {
    const young = runHistoricalBacktest(planFor(9_000, 30), "standard", FAST)!;
    const older = runHistoricalBacktest(planFor(9_000, 60), "standard", FAST)!;
    expect(young.windows).toHaveLength(39);
    expect(older.windows).toHaveLength(69);
  });

  it("is deterministic", () => {
    const profile = planFor(9_000);
    expect(runHistoricalBacktest(profile)).toEqual(runHistoricalBacktest(profile));
  });

  it("gives every window a net worth line from today to the planning horizon", () => {
    const result = runHistoricalBacktest(planFor(9_000), "standard", FAST)!;
    for (const window of result.windows) {
      expect(window.netWorth).toHaveLength(51);
      expect(window.finalNetWorth).toBe(window.netWorth[50]);
    }
    // Nothing has been earned yet today, so every window starts from the same wealth.
    const starts = new Set(result.windows.map((window) => window.netWorth[0]));
    expect(starts.size).toBe(1);
  });

  it("matches a direct simulation of the same window", () => {
    const profile = planFor(9_000);
    const test = prepareSpendingTest(profile, "standard")!;
    const result = runHistoricalBacktest(profile, "standard", FAST)!;
    const returns = realReturnsForMix(0.6).map((entry) => entry.realReturn);
    for (const index of [0, 3, 20, 48]) {
      const rows = simulateHouseholdDrawdown(test.household, test.targetGrossMonthly, {
        yearlyRates: returns.slice(index, index + 50),
      });
      expect(result.windows[index].netWorth).toEqual(rows.map((row) => Math.round(row.netWorth)));
      const firstShort = rows.find((row) => row.unmet > 1);
      expect(result.windows[index].shortfallAge).toBe(firstShort?.age ?? null);
      expect(result.windows[index].funded).toBe(firstShort === undefined);
    }
  });

  it("uses a 60% stock share unless told otherwise, and keeps it within 0 to 100", () => {
    const profile = planFor(9_000);
    const byDefault = runHistoricalBacktest(profile, "standard", FAST)!;
    expect(byDefault.stockSharePct).toBe(DEFAULT_BACKTEST_STOCK_SHARE_PCT);
    expect(runHistoricalBacktest(profile, "standard", { ...FAST, stockSharePct: 60 })).toEqual(byDefault);
    expect(runHistoricalBacktest(profile, "standard", { ...FAST, stockSharePct: 150 })!.windows).toEqual(
      runHistoricalBacktest(profile, "standard", { ...FAST, stockSharePct: 100 })!.windows,
    );
  });

  it("is funded in every window when spending is modest, and then names the weakest by final wealth", () => {
    const result = runHistoricalBacktest(planFor(1_500), "standard", FAST)!;
    expect(result.successProbability).toBe(1);
    expect(result.fundedCount).toBe(result.windows.length);
    expect(result.failedStartYears).toEqual([]);
    const lowest = Math.min(...result.windows.map((window) => window.finalNetWorth));
    expect(result.worstWindow.finalNetWorth).toBe(lowest);
    expect(result.worstWindow.funded).toBe(true);
  });

  it("fails every window when the spending is out of reach, and names the earliest shortfall", () => {
    const result = runHistoricalBacktest(planFor(80_000), "standard", FAST)!;
    expect(result.successProbability).toBe(0);
    expect(result.failedStartYears).toHaveLength(result.windows.length);
    const earliest = Math.min(...result.windows.map((window) => window.shortfallAge!));
    expect(result.worstWindow.shortfallAge).toBe(earliest);
    expect(earliest).toBeGreaterThanOrEqual(67);
  });

  it("is less likely to succeed as the spending rises", () => {
    const odds = [3_000, 6_000, 9_000, 13_000, 20_000].map(
      (spending) => runHistoricalBacktest(planFor(spending), "standard", FAST)!.successProbability,
    );
    for (let i = 1; i < odds.length; i += 1) expect(odds[i]).toBeLessThanOrEqual(odds[i - 1]);
    expect(odds[0]).toBeGreaterThan(odds[odds.length - 1]);
  });

  it("lists the failing start years in ascending order, in step with the funded count", () => {
    const result = runHistoricalBacktest(planFor(20_000), "standard", FAST)!;
    expect(result.failedStartYears.length).toBeGreaterThan(0);
    expect(result.failedStartYears.length).toBeLessThan(result.windows.length);
    expect(result.failedStartYears).toEqual([...result.failedStartYears].sort((a, b) => a - b));
    expect(result.fundedCount + result.failedStartYears.length).toBe(result.windows.length);
    expect(result.successProbability).toBeCloseTo(result.fundedCount / result.windows.length, 12);
    const failed = result.windows.filter((window) => !window.funded).map((window) => window.startYear);
    expect(result.failedStartYears).toEqual(failed);
    expect(result.worstWindow.funded).toBe(false);
  });

  it("finds the spending that every window funds, and not much more", () => {
    const result = runHistoricalBacktest(planFor(9_000))!;
    const survivable = result.survivableNetMonthly!;
    expect(survivable).toBeGreaterThan(0);
    expect(survivable % 10).toBe(0);
    const at = (spending: number) =>
      runHistoricalBacktest(planFor(spending), "standard", FAST)!.successProbability;
    expect(at(survivable)).toBe(1);
    expect(at(Math.ceil(survivable * 1.02) + 10)).toBeLessThan(1);
  });

  it("skips the survivable-spending search on request", () => {
    expect(runHistoricalBacktest(planFor(9_000), "standard", FAST)!.survivableNetMonthly).toBeNull();
  });

  it("reports the target, its pre-tax equivalent and the returns involved", () => {
    const profile = planFor(9_000);
    const result = runHistoricalBacktest(profile, "standard", FAST)!;
    const test = prepareSpendingTest(profile, "standard")!;
    expect(result.targetNetMonthly).toBe(9_000);
    expect(result.targetGrossMonthly).toBe(Math.round(test.targetGrossMonthly));
    expect(result.taxShare).toBe(test.taxShare);
    expect(result.planRealReturn).toBe(test.household.rate);
    const history = realReturnsForMix(0.6).map((entry) => entry.realReturn);
    expect(result.historyRealReturn).toBeCloseTo(geometricMean(history), 12);
    expect(result.replayedRealReturn).toBe(result.historyRealReturn);
    expect(result.firstYear).toBe(1928);
    expect(result.lastYear).toBeGreaterThanOrEqual(2025);
    expect(result.drawdownStartAge).toBe(test.household.drawdownStartAge);
    expect(result.currentAge).toBe(40);
  });
});

describe("runHistoricalBacktest with the plan's own average return", () => {
  it("replays the plan's return as the long-run average", () => {
    const profile = planFor(9_000);
    const test = prepareSpendingTest(profile, "standard")!;
    const matched = runHistoricalBacktest(profile, "standard", { ...FAST, basis: "matchedToPlan" })!;
    const asHappened = runHistoricalBacktest(profile, "standard", FAST)!;
    expect(matched.basis).toBe("matchedToPlan");
    expect(matched.replayedRealReturn).toBe(test.household.rate);
    expect(matched.historyRealReturn).toBe(asHappened.historyRealReturn);
    expect(matched.planRealReturn).toBe(asHappened.planRealReturn);
  });

  it("matches a direct simulation on the shifted returns", () => {
    const profile = planFor(9_000);
    const test = prepareSpendingTest(profile, "standard")!;
    const matched = runHistoricalBacktest(profile, "standard", { ...FAST, basis: "matchedToPlan" })!;
    const shifted = rebaseReturns(
      realReturnsForMix(0.6).map((entry) => entry.realReturn),
      test.household.rate,
    );
    const rows = simulateHouseholdDrawdown(test.household, test.targetGrossMonthly, {
      yearlyRates: shifted.slice(10, 60),
    });
    expect(matched.windows[10].netWorth).toEqual(rows.map((row) => Math.round(row.netWorth)));
  });

  it("is no better than the real history when the plan expects a lower return than history gave", () => {
    const profile = planFor(11_000);
    const asHappened = runHistoricalBacktest(profile, "standard", FAST)!;
    const matched = runHistoricalBacktest(profile, "standard", { ...FAST, basis: "matchedToPlan" })!;
    expect(matched.planRealReturn).toBeLessThan(asHappened.historyRealReturn);
    expect(matched.successProbability).toBeLessThanOrEqual(asHappened.successProbability);
  });
});

describe("groupConsecutiveYears", () => {
  it("joins runs of consecutive years", () => {
    expect(groupConsecutiveYears([1929, 1930, 1931, 1965, 1969, 1970])).toEqual([
      [1929, 1931],
      [1965, 1965],
      [1969, 1970],
    ]);
  });

  it("handles empty and single inputs", () => {
    expect(groupConsecutiveYears([])).toEqual([]);
    expect(groupConsecutiveYears([2000])).toEqual([[2000, 2000]]);
  });
});
