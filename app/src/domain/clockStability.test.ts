import { afterEach, describe, expect, it, vi } from "vitest";

import { buildTestProfile } from "../test/domainFixtures";
import {
  buildHousehold,
  calculateFundingGap,
  engineNowMs,
  estimateHouseholdRetirementIncome,
  estimateNetIncome,
  findEarliestFeasibleRetirementAge,
  pinEngineClock,
  resolveRetirementTiming,
  simulateHouseholdDrawdown,
  withEngineClock,
} from "./index";

const HOUR_MS = 3600 * 1000;
const START_MS = Date.UTC(2026, 10, 7, 8, 0, 0);

/** An employer-share holding plus a bank deposit that matures: the mix behind UXB-01. */
function planWithDeposit() {
  const tranches = Array.from({ length: 20 }, (_, index) => ({
    vestDate: new Date(Date.UTC(2023, 5 + index * 3, 1)).toISOString().slice(0, 10),
    quantity: 30,
    grantPriceUSD: 250,
  }));
  return buildTestProfile({
    age: 54,
    gender: "female",
    retirementAge: 60,
    monthlyGrossSalary: 38400,
    maritalStatus: "single",
    pensionBalances: [641284, 97978, 1540672, 327702],
    pensionAccountOverrides: [
      { productCategory: "comprehensivePension", accountStatus: "paidUpFrozen" },
      { productCategory: "providentFund", accountStatus: "paidUpFrozen" },
      { productCategory: "managersInsurance", accountStatus: "paidUpFrozen" },
      { productCategory: "studyFund", accountStatus: "paidUpFrozen" },
    ],
    otherAssets: 150000,
    usdToIlsRate: { rate: 3.194, date: "2026-11-06" },
    equity: [
      {
        quantity: 600,
        priceUSD: 555.8,
        ticker: "MSFT",
        employerGrant: {
          taxTrack: "capitalGains102",
          grantPriceUSD: 250,
          grantDate: "2023-03-01",
          vestingTranches: tranches,
        },
      },
    ],
    bankDeposits: [
      {
        amount: 400000,
        startDate: "2026-01-01",
        maturityDate: "2028-01-01",
        annualInterestRatePercent: 4,
        bankName: "Leumi",
      },
    ],
    retirementMonthlyExpenses: 21166,
  });
}

function atHour(hours: number) {
  vi.setSystemTime(new Date(START_MS + hours * HOUR_MS));
}

afterEach(() => {
  vi.useRealTimers();
  pinEngineClock(null);
});

describe("engine clock", () => {
  it("falls back from a trace or withEngineClock to the pin, and then to the system clock", () => {
    vi.useFakeTimers();
    atHour(0);
    expect(engineNowMs()).toBe(START_MS);

    pinEngineClock(new Date(START_MS - 5 * HOUR_MS));
    atHour(30);
    expect(engineNowMs()).toBe(START_MS - 5 * HOUR_MS);
    expect(withEngineClock(new Date(START_MS + HOUR_MS), engineNowMs)).toBe(START_MS + HOUR_MS);

    pinEngineClock(null);
    expect(engineNowMs()).toBe(START_MS + 30 * HOUR_MS);
  });

  it("gives the same figures at any system time while the clock is pinned", () => {
    vi.useFakeTimers();
    const profile = planWithDeposit();
    pinEngineClock(new Date(START_MS));
    const results = new Set<string>();
    for (let hours = 0; hours < 24 * 14; hours += 7) {
      atHour(hours);
      const net = estimateNetIncome(profile, "standard");
      const gap = calculateFundingGap(profile, "standard");
      results.add(
        JSON.stringify([net.netMonthlyIncome, net.taxMonthly, net.lowestNetAge, gap.monthlyGap]),
      );
    }
    expect(results.size).toBe(1);
  });
});

describe("a plan with a bank deposit does not swing with the clock", () => {
  it("keeps every year's draw a valid split of the unlocked capital", () => {
    vi.useFakeTimers();
    const profile = planWithDeposit();
    for (let hours = 0; hours < 24 * 14; hours += 7) {
      atHour(hours);
      const household = buildHousehold(profile, resolveRetirementTiming(profile, "standard"));
      const { monthlyIncomeTodayMoney } = estimateHouseholdRetirementIncome(household);
      for (const row of simulateHouseholdDrawdown(household, monthlyIncomeTodayMoney)) {
        let total = 0;
        for (const { capitalShare } of row.holdings) {
          expect(capitalShare).toBeGreaterThanOrEqual(0);
          total += capitalShare;
        }
        expect(total).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });

  it("moves the net income by shekels, not thousands, over two weeks", () => {
    vi.useFakeTimers();
    const profile = planWithDeposit();
    const net: number[] = [];
    const tax: number[] = [];
    const ages = new Set<number | null>();
    const earliest = new Set<string>();
    for (let hours = 0; hours < 24 * 14; hours += 7) {
      atHour(hours);
      const estimate = estimateNetIncome(profile, "standard");
      net.push(estimate.netMonthlyIncome);
      tax.push(estimate.taxMonthly);
      ages.add(estimate.lowestNetAge);
      earliest.add(JSON.stringify(findEarliestFeasibleRetirementAge(profile)));
    }
    expect(Math.max(...net) - Math.min(...net)).toBeLessThanOrEqual(10);
    expect(Math.max(...tax) - Math.min(...tax)).toBeLessThanOrEqual(10);
    expect(ages.size).toBe(1);
    expect(earliest.size).toBe(1);
  });
});
