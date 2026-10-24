import type { RetirementScenario } from "../types";

export interface NetWorthPoint {
  age: number;
  netWorth: number;
}

export interface IncomeBreakdownPoint {
  age: number;
  pensionFund: number;
  investments: number;
}

/**
 * Deterministic mock projection used purely to populate prototype charts.
 * No real retirement math — Phase 1 implementation replaces this with the
 * actual domain/calculation engine (see docs/plan.md).
 */
export function getMockNetWorthProjection(
  scenario: RetirementScenario = "standard",
): NetWorthPoint[] {
  const retirementAgeByScenario: Record<RetirementScenario, number> = {
    early: 55,
    standard: 67,
    delayed: 70,
  };
  const retirementAge = retirementAgeByScenario[scenario];
  const points: NetWorthPoint[] = [];
  let value = 450_000;
  for (let age = 40; age <= 90; age += 1) {
    const growth = age < retirementAge ? 1.045 : 0.985;
    value = Math.round(value * growth);
    points.push({ age, netWorth: value });
  }
  return points;
}

export function getMockIncomeBreakdown(): IncomeBreakdownPoint[] {
  const points: IncomeBreakdownPoint[] = [];
  for (let age = 67; age <= 90; age += 1) {
    points.push({
      age,
      pensionFund: 5200,
      investments: 1800,
    });
  }
  return points;
}

export const MOCK_KPIS = {
  monthlyIncome: 7000,
  netWorth: 620_000,
  fundingGap: -850,
  yearsToRetirement: 22,
};
