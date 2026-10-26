import { describe, expect, it } from "vitest";

import {
  calculatePersonTax,
  defaultCreditPoints,
  progressiveTax,
  qualifyingAnnuityExemption,
  type PersonTaxInput,
} from "./tax";

const NO_INCOME: PersonTaxInput = {
  pensionMonthly: 0,
  exemptionApplies: false,
  capitalGainMonthly: 0,
  capitalGainsRate: 0.25,
  creditPoints: 2.25,
  pastTaxFreeSeverance: 0,
  monthlyExemptionCap: null,
};

describe("defaultCreditPoints", () => {
  it("gives a woman 2.75 points and everyone else 2.25", () => {
    expect(defaultCreditPoints("female")).toBe(2.75);
    expect(defaultCreditPoints("male")).toBe(2.25);
    expect(defaultCreditPoints(null)).toBe(2.25);
  });
});

describe("progressiveTax", () => {
  it("is zero for no or negative income", () => {
    expect(progressiveTax(0)).toBe(0);
    expect(progressiveTax(-500)).toBe(0);
  });

  it("charges each bracket's rate on the slice of income inside it", () => {
    expect(progressiveTax(7_010)).toBeCloseTo(701, 6);
    expect(progressiveTax(10_060)).toBeCloseTo(1_128, 6);
    expect(progressiveTax(19_000)).toBeCloseTo(2_916, 6);
    expect(progressiveTax(25_100)).toBeCloseTo(4_807, 6);
    expect(progressiveTax(46_690)).toBeCloseTo(12_363.5, 6);
    expect(progressiveTax(50_000)).toBeCloseTo(13_919.2, 6);
  });
});

describe("qualifyingAnnuityExemption", () => {
  it("exempts the fixed and conditional shares (57.5%) of a pension under the ceiling", () => {
    expect(qualifyingAnnuityExemption(5_000, 0, null)).toBeCloseTo(2_875, 6);
  });

  it("stops growing at the monthly ceiling", () => {
    expect(qualifyingAnnuityExemption(9_430, 0, null)).toBeCloseTo(5_422.25, 6);
    expect(qualifyingAnnuityExemption(30_000, 0, null)).toBeCloseTo(5_422.25, 6);
  });

  it("subtracts tax-free severance already withdrawn from the conditional share only", () => {
    // 100,000 x 1.35 / 180 = 750 off the 35% share (1,750) of a 5,000 pension.
    expect(qualifyingAnnuityExemption(5_000, 100_000, null)).toBeCloseTo(1_125 + 1_000, 6);
    // A large withdrawal removes the conditional share but never the fixed one.
    expect(qualifyingAnnuityExemption(5_000, 1_000_000, null)).toBeCloseTo(1_125, 6);
  });

  it("is limited by the user's remaining allowance when one is entered", () => {
    expect(qualifyingAnnuityExemption(5_000, 0, 1_000)).toBe(1_000);
    expect(qualifyingAnnuityExemption(5_000, 0, 0)).toBe(0);
    expect(qualifyingAnnuityExemption(5_000, 0, 10_000)).toBeCloseTo(2_875, 6);
  });

  it("is zero without a pension", () => {
    expect(qualifyingAnnuityExemption(0, 0, null)).toBe(0);
    expect(qualifyingAnnuityExemption(-100, 0, null)).toBe(0);
  });
});

describe("calculatePersonTax", () => {
  it("charges nothing when there is no income", () => {
    expect(calculatePersonTax(NO_INCOME)).toEqual({
      exemptPensionMonthly: 0,
      incomeTaxMonthly: 0,
      capitalGainsTaxMonthly: 0,
      surtaxMonthly: 0,
      totalMonthly: 0,
    });
  });

  it("taxes a pension before the statutory age in full, less credit points", () => {
    const tax = calculatePersonTax({ ...NO_INCOME, pensionMonthly: 20_000 });
    expect(tax.exemptPensionMonthly).toBe(0);
    // 3,226 at the brackets, less 2.25 x 242 = 544.5.
    expect(tax.incomeTaxMonthly).toBeCloseTo(2_681.5, 6);
    expect(tax.totalMonthly).toBeCloseTo(2_681.5, 6);
  });

  it("gives a woman's extra credit points off her tax", () => {
    const tax = calculatePersonTax({ ...NO_INCOME, pensionMonthly: 20_000, creditPoints: 2.75 });
    expect(tax.incomeTaxMonthly).toBeCloseTo(3_226 - 2.75 * 242, 6);
  });

  it("applies the exemption from the statutory age", () => {
    const tax = calculatePersonTax({ ...NO_INCOME, pensionMonthly: 20_000, exemptionApplies: true });
    // 9,430 x 57.5% = 5,422.25 exempt leaves 14,577.75 taxable.
    expect(tax.exemptPensionMonthly).toBeCloseTo(5_422.25, 6);
    const expected = progressiveTax(14_577.75) - 2.25 * 242;
    expect(tax.incomeTaxMonthly).toBeCloseTo(expected, 6);
  });

  it("charges no income tax on a modest pension once exempt and covered by credit points", () => {
    const tax = calculatePersonTax({ ...NO_INCOME, pensionMonthly: 10_000, exemptionApplies: true });
    expect(tax.incomeTaxMonthly).toBe(0);
    expect(tax.totalMonthly).toBe(0);
  });

  it("never lets credit points push the tax below zero", () => {
    const tax = calculatePersonTax({ ...NO_INCOME, pensionMonthly: 1_000, creditPoints: 10 });
    expect(tax.incomeTaxMonthly).toBe(0);
  });

  it("taxes capital gains at a flat rate outside the brackets and credit points", () => {
    const tax = calculatePersonTax({ ...NO_INCOME, capitalGainMonthly: 4_000 });
    expect(tax.incomeTaxMonthly).toBe(0);
    expect(tax.capitalGainsTaxMonthly).toBeCloseTo(1_000, 6);
    expect(tax.totalMonthly).toBeCloseTo(1_000, 6);
  });

  it("uses the rate given for the gain", () => {
    const tax = calculatePersonTax({
      ...NO_INCOME,
      capitalGainMonthly: 4_000,
      capitalGainsRate: 0.3,
    });
    expect(tax.capitalGainsTaxMonthly).toBeCloseTo(1_200, 6);
  });

  it("adds 3% surtax on income above the annual threshold", () => {
    const tax = calculatePersonTax({ ...NO_INCOME, pensionMonthly: 70_000 });
    // 721,560 / 12 = 60,130 a month; 9,870 above it.
    expect(tax.surtaxMonthly).toBeCloseTo(9_870 * 0.03, 6);
    const brackets = progressiveTax(70_000) - 2.25 * 242;
    expect(tax.totalMonthly).toBeCloseTo(brackets + 9_870 * 0.03, 6);
  });

  it("adds a further 2% surtax on the capital-income part above the threshold", () => {
    const tax = calculatePersonTax({ ...NO_INCOME, capitalGainMonthly: 70_000 });
    expect(tax.surtaxMonthly).toBeCloseTo(9_870 * 0.03 + 9_870 * 0.02, 6);
    expect(tax.capitalGainsTaxMonthly).toBeCloseTo(17_500, 6);
  });

  it("charges no surtax below the threshold", () => {
    const tax = calculatePersonTax({
      ...NO_INCOME,
      pensionMonthly: 40_000,
      capitalGainMonthly: 10_000,
    });
    expect(tax.surtaxMonthly).toBe(0);
  });
});
