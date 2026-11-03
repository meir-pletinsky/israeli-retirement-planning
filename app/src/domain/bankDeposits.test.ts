import { describe, expect, it } from "vitest";

import type { BankDeposit } from "../types";
import { aggregateBankDepositsBalance, bankDepositValueIls } from "./bankDeposits";

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;
const START = Date.parse("2025-06-15");
const NOW = Date.parse("2026-06-15");
const YEARS_ELAPSED = (NOW - START) / MS_PER_YEAR;

function depositOf(overrides: Partial<BankDeposit> = {}): BankDeposit {
  return {
    id: "d1",
    bankName: "Test Bank",
    amount: 10_000,
    startDate: "2025-06-15",
    maturityDate: null,
    rateType: "fixed",
    annualInterestRatePercent: 4,
    cpiLinked: false,
    ...overrides,
  };
}

describe("bankDepositValueIls", () => {
  it("compounds a non-CPI-linked deposit at its quoted nominal rate, ignoring inflation", () => {
    const value = bankDepositValueIls(depositOf(), 2, NOW);
    expect(value).toBeCloseTo(10_000 * Math.pow(1.04, YEARS_ELAPSED), 2);
    expect(bankDepositValueIls(depositOf(), 5, NOW)).toBeCloseTo(value, 6);
  });

  it("keeps a zero-interest deposit at its principal", () => {
    const value = bankDepositValueIls(depositOf({ annualInterestRatePercent: 0 }), 2, NOW);
    expect(value).toBeCloseTo(10_000, 6);
  });

  it("grows a CPI-linked deposit by the index (the inflation assumption) plus its quoted rate", () => {
    const value = bankDepositValueIls(depositOf({ cpiLinked: true }), 2, NOW);
    expect(value).toBeCloseTo(10_000 * Math.pow(1.04 * 1.02, YEARS_ELAPSED), 2);
  });

  it("is zero for a missing or non-positive amount", () => {
    expect(bankDepositValueIls(depositOf({ amount: null }), 2, NOW)).toBe(0);
    expect(bankDepositValueIls(depositOf({ amount: 0 }), 2, NOW)).toBe(0);
    expect(bankDepositValueIls(depositOf({ amount: -500 }), 2, NOW)).toBe(0);
  });

  it("is just the principal while the start date is missing, invalid or in the future", () => {
    expect(bankDepositValueIls(depositOf({ startDate: null }), 2, NOW)).toBe(10_000);
    expect(bankDepositValueIls(depositOf({ startDate: "not-a-date" }), 2, NOW)).toBe(10_000);
    expect(bankDepositValueIls(depositOf({ startDate: "2027-01-01" }), 2, NOW)).toBe(10_000);
  });

  it("compounds over multiple years", () => {
    const twoYearsLater = Date.parse("2027-06-15");
    const years = (twoYearsLater - START) / MS_PER_YEAR;
    const value = bankDepositValueIls(depositOf(), 2, twoYearsLater);
    expect(value).toBeCloseTo(10_000 * Math.pow(1.04, years), 2);
  });
});

describe("aggregateBankDepositsBalance", () => {
  it("sums the current value of every deposit", () => {
    const deposits = [
      depositOf({ id: "d1", amount: 10_000, cpiLinked: true }),
      depositOf({ id: "d2", amount: 5_000, cpiLinked: true }),
    ];
    const total = aggregateBankDepositsBalance(deposits, 2, NOW);
    const expectedPerUnit = Math.pow(1.04 * 1.02, YEARS_ELAPSED);
    expect(total).toBeCloseTo(10_000 * expectedPerUnit + 5_000 * expectedPerUnit, 2);
  });

  it("is zero for an empty list", () => {
    expect(aggregateBankDepositsBalance([], 2, NOW)).toBe(0);
  });
});
