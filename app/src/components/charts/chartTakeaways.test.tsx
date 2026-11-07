import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { MonteCarloFanPoint, NetIncomeYear, NetWorthPoint } from "../../domain";
import { projectCashFlow } from "../../domain";
import "../../i18n";
import { buildTestProfile } from "../../test/domainFixtures";
import { useChartTakeaways } from "./chartTakeaways";

const plain = (text: string | null) => text?.replace(/[\u2066\u2069]/g, "") ?? null;
const netWorth = (...pairs: [number, number][]): NetWorthPoint[] =>
  pairs.map(([age, value]) => ({ age, netWorth: value }));

function takeaways() {
  return renderHook(() => useChartTakeaways()).result.current;
}

describe("chart takeaways", () => {
  it("reports the peak and the end of the net worth path", () => {
    const text = takeaways().netWorth(netWorth([60, 1_000_000], [70, 1_400_000], [90, 200_000]), null);
    expect(plain(text)).toBe("Net worth peaks at ₪1,400,000 at age 70 and ends at ₪200,000 at age 90, in today's money.");
  });

  it("says the path only grows when the peak is the last year", () => {
    const text = takeaways().netWorth(netWorth([60, 1_000_000], [90, 3_000_000]), null);
    expect(plain(text)).toBe("Net worth grows to ₪3,000,000 by age 90, in today's money.");
  });

  it("flags the age the planned spending stops being covered", () => {
    const text = takeaways().netWorth(netWorth([60, 1_000_000], [70, 1_400_000], [90, 0]), 84);
    expect(plain(text)).toContain("peaks at ₪1,400,000 at age 70");
    expect(plain(text)).toContain("no longer fully covered from age 84");
  });

  it("reads the fan at its last age", () => {
    const fan: MonteCarloFanPoint[] = [
      { age: 60, yearsFromNow: 0, p10: 1, p50: 1, p90: 1 },
      { age: 90, yearsFromNow: 30, p10: 100_000, p50: 600_000, p90: 2_000_000 },
    ];
    expect(plain(takeaways().fan(fan))).toBe(
      "By age 90, the middle 80% of simulated outcomes range from ₪100,000 to ₪2,000,000, with a typical outcome of ₪600,000, in today's money.",
    );
  });

  it("finds the lowest after-tax year and compares it with the planned spending", () => {
    const years: NetIncomeYear[] = [
      { age: 67, grossMonthly: 20_000, taxMonthly: 2_000, netMonthly: 18_000, taxableMonthly: 15_000 },
      { age: 68, grossMonthly: 15_000, taxMonthly: 1_000, netMonthly: 14_000, taxableMonthly: 12_000 },
    ];
    expect(plain(takeaways().netIncome(years, 16_000))).toBe(
      "After tax, your lowest year is ₪14,000 a month at age 68, against planned spending of ₪16,000 a month.",
    );
    expect(plain(takeaways().netIncome(years))).toBe(
      "After tax, your lowest year is ₪14,000 a month at age 68, when ₪1,000 a month goes to tax.",
    );
  });

  it("compares the earliest and the latest retirement age", () => {
    const points = [
      { age: 67, netMonthly: 12_000 },
      { age: 62, netMonthly: 8_000 },
    ];
    expect(plain(takeaways().compare(points))).toBe(
      "Retiring at 62 gives ₪8,000 a month after tax; retiring at 67 gives ₪12,000.",
    );
    expect(plain(takeaways().compare([points[0]]))).toBe("Retiring at 67 gives ₪12,000 a month after tax.");
  });

  describe("cash flow at the planned spending", () => {
    // At 0% real return 120,000 pays 12,000 a year, so 1,000 a month runs out at age 77.
    const cashFlowFor = (monthlyExpenses: number) => {
      const plan = projectCashFlow(
        buildTestProfile({
          age: 66,
          retirementAge: 67,
          investmentReturnPct: 4,
          inflationPct: 4,
          pensionBalances: [120_000],
          retirementMonthlyExpenses: monthlyExpenses,
        }),
      );
      if (!plan) throw new Error("expected a cash flow plan");
      return plan;
    };

    it("says the planned spending is covered to the end of the plan", () => {
      expect(plain(takeaways().cashFlow(cashFlowFor(100)))).toBe(
        "Your planned ₪100 a month is fully covered every year to age 90.",
      );
    });

    it("gives the last covered age and the unfunded amount at the end", () => {
      const text = plain(takeaways().cashFlow(cashFlowFor(1_000)));
      expect(text).toMatch(/^Your planned ₪1,000 a month is fully covered up to age 76\. After that it is not, and ₪1,000 a month is unfunded at age 90\.$/);
    });

    it("says so when the first year is already unfunded", () => {
      const text = plain(takeaways().cashFlow(cashFlowFor(20_000)));
      expect(text).toContain("is not fully covered from the first year of retirement, age 67");
      expect(text).toContain("unfunded at age 90");
    });
  });

  it("has no sentence without data", () => {
    const t = takeaways();
    expect(t.netWorth([], null)).toBeNull();
    expect(t.fan([])).toBeNull();
    expect(t.income([])).toBeNull();
    expect(t.netIncome([])).toBeNull();
    expect(t.compare([])).toBeNull();
  });
});
