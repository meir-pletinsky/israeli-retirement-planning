import { describe, expect, it } from "vitest";

import {
  calculatePersonTax,
  defaultCreditPoints,
  earlyPensionHealthTax,
  fixedExemptionRate,
  progressiveTax,
  qualifyingAnnuityExemption,
  totalExemptionRate,
  type PersonTaxInput,
} from "./tax";

const NO_INCOME: PersonTaxInput = {
  pensionMonthly: 0,
  exemptionApplies: false,
  healthTaxApplies: false,
  taxYear: 2026,
  ordinaryInvestmentMonthly: 0,
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

describe("exemption schedule", () => {
  it("raises the fixed share by calendar year", () => {
    expect(fixedExemptionRate(2025)).toBeCloseTo(0.22, 10);
    expect(fixedExemptionRate(2026)).toBeCloseTo(0.225, 10);
    expect(fixedExemptionRate(2027)).toBeCloseTo(0.275, 10);
    expect(fixedExemptionRate(2028)).toBeCloseTo(0.32, 10);
  });

  it("keeps the last rate after the schedule ends and the first before it starts", () => {
    expect(fixedExemptionRate(2040)).toBeCloseTo(0.32, 10);
    expect(fixedExemptionRate(2020)).toBeCloseTo(0.22, 10);
  });

  it("adds the 35% conditional share to give the total exempt share", () => {
    expect(totalExemptionRate(2025)).toBeCloseTo(0.57, 10);
    expect(totalExemptionRate(2026)).toBeCloseTo(0.575, 10);
    expect(totalExemptionRate(2027)).toBeCloseTo(0.625, 10);
    expect(totalExemptionRate(2028)).toBeCloseTo(0.67, 10);
    expect(totalExemptionRate(2035)).toBeCloseTo(0.67, 10);
  });
});

describe("qualifyingAnnuityExemption", () => {
  it("exempts the fixed and conditional shares (57.5% in 2026) of a pension under the ceiling", () => {
    expect(qualifyingAnnuityExemption(5_000, 0, null, 2026)).toBeCloseTo(2_875, 6);
  });

  it("exempts more in later years as the fixed share rises", () => {
    expect(qualifyingAnnuityExemption(5_000, 0, null, 2027)).toBeCloseTo(3_125, 6);
    expect(qualifyingAnnuityExemption(5_000, 0, null, 2028)).toBeCloseTo(3_350, 6);
    expect(qualifyingAnnuityExemption(5_000, 0, null, 2045)).toBeCloseTo(3_350, 6);
  });

  it("stops growing at the monthly ceiling", () => {
    expect(qualifyingAnnuityExemption(9_430, 0, null, 2026)).toBeCloseTo(5_422.25, 6);
    expect(qualifyingAnnuityExemption(30_000, 0, null, 2026)).toBeCloseTo(5_422.25, 6);
    expect(qualifyingAnnuityExemption(30_000, 0, null, 2030)).toBeCloseTo(9_430 * 0.67, 6);
  });

  it("subtracts tax-free severance already withdrawn from the conditional share only", () => {
    // 100,000 x 1.35 / 180 = 750 off the 35% share (1,750) of a 5,000 pension.
    expect(qualifyingAnnuityExemption(5_000, 100_000, null, 2026)).toBeCloseTo(1_125 + 1_000, 6);
    // A large withdrawal removes the conditional share but never the fixed one.
    expect(qualifyingAnnuityExemption(5_000, 1_000_000, null, 2026)).toBeCloseTo(1_125, 6);
    expect(qualifyingAnnuityExemption(5_000, 1_000_000, null, 2028)).toBeCloseTo(1_600, 6);
  });

  it("is limited by the user's remaining allowance when one is entered", () => {
    expect(qualifyingAnnuityExemption(5_000, 0, 1_000, 2026)).toBe(1_000);
    expect(qualifyingAnnuityExemption(5_000, 0, 0, 2026)).toBe(0);
    expect(qualifyingAnnuityExemption(5_000, 0, 10_000, 2026)).toBeCloseTo(2_875, 6);
  });

  it("keeps the entered allowance as a ceiling in later years", () => {
    expect(qualifyingAnnuityExemption(5_000, 0, 2_900, 2030)).toBe(2_900);
  });

  it("is zero without a pension", () => {
    expect(qualifyingAnnuityExemption(0, 0, null, 2026)).toBe(0);
    expect(qualifyingAnnuityExemption(-100, 0, null, 2026)).toBe(0);
  });
});

describe("earlyPensionHealthTax", () => {
  it("charges the reduced rate (3.23%) up to the bracket", () => {
    expect(earlyPensionHealthTax(5_000)).toBeCloseTo(161.5, 6);
    expect(earlyPensionHealthTax(7_703)).toBeCloseTo(7_703 * 0.0323, 6);
  });

  it("charges the full rate (5.17%) only on the part above the bracket", () => {
    expect(earlyPensionHealthTax(10_000)).toBeCloseTo(7_703 * 0.0323 + 2_297 * 0.0517, 6);
  });

  it("is zero without a pension", () => {
    expect(earlyPensionHealthTax(0)).toBe(0);
    expect(earlyPensionHealthTax(-500)).toBe(0);
  });
});

describe("calculatePersonTax", () => {
  it("charges nothing when there is no income", () => {
    expect(calculatePersonTax(NO_INCOME)).toEqual({
      exemptPensionMonthly: 0,
      incomeTaxMonthly: 0,
      capitalGainsTaxMonthly: 0,
      surtaxMonthly: 0,
      healthTaxMonthly: 0,
      totalMonthly: 0,
    });
  });

  it("adds health tax to a pension paid before the statutory age", () => {
    const tax = calculatePersonTax({
      ...NO_INCOME,
      pensionMonthly: 10_000,
      healthTaxApplies: true,
    });
    const health = 7_703 * 0.0323 + 2_297 * 0.0517;
    expect(tax.healthTaxMonthly).toBeCloseTo(health, 6);
    expect(tax.incomeTaxMonthly).toBeCloseTo(progressiveTax(10_000) - 2.25 * 242, 6);
    expect(tax.totalMonthly).toBeCloseTo(tax.incomeTaxMonthly + health, 6);
  });

  it("charges no health tax once the statutory age is reached", () => {
    const tax = calculatePersonTax({
      ...NO_INCOME,
      pensionMonthly: 10_000,
      exemptionApplies: true,
    });
    expect(tax.healthTaxMonthly).toBe(0);
  });

  it("charges health tax on the whole pension, not on the capital gain", () => {
    const tax = calculatePersonTax({
      ...NO_INCOME,
      pensionMonthly: 5_000,
      capitalGainMonthly: 4_000,
      healthTaxApplies: true,
    });
    expect(tax.healthTaxMonthly).toBeCloseTo(5_000 * 0.0323, 6);
  });

  it("uses the exemption share of the tax year", () => {
    const base = { ...NO_INCOME, pensionMonthly: 20_000, exemptionApplies: true };
    const in2026 = calculatePersonTax({ ...base, taxYear: 2026 });
    const in2028 = calculatePersonTax({ ...base, taxYear: 2028 });
    expect(in2026.exemptPensionMonthly).toBeCloseTo(9_430 * 0.575, 6);
    expect(in2028.exemptPensionMonthly).toBeCloseTo(9_430 * 0.67, 6);
    expect(in2028.incomeTaxMonthly).toBeLessThan(in2026.incomeTaxMonthly);
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

  describe("ordinary income from employer shares", () => {
    it("is taxed at the brackets less credit points", () => {
      const tax = calculatePersonTax({ ...NO_INCOME, ordinaryInvestmentMonthly: 10_000 });
      // 7,010 at 10% plus 2,990 at 14%, less 2.25 credit points.
      expect(tax.incomeTaxMonthly).toBeCloseTo(7_010 * 0.1 + 2_990 * 0.14 - 2.25 * 242, 6);
      expect(tax.capitalGainsTaxMonthly).toBe(0);
    });

    it("is stacked on top of a pension, so it bears the marginal rate", () => {
      const pensionOnly = calculatePersonTax({ ...NO_INCOME, pensionMonthly: 20_000 });
      const withShares = calculatePersonTax({
        ...NO_INCOME,
        pensionMonthly: 20_000,
        ordinaryInvestmentMonthly: 5_000,
      });
      // 20,000 to 25,000 sits in the 31% bracket.
      expect(withShares.incomeTaxMonthly - pensionOnly.incomeTaxMonthly).toBeCloseTo(5_000 * 0.31, 6);
    });

    it("gets no pension exemption and bears no health tax", () => {
      const tax = calculatePersonTax({
        ...NO_INCOME,
        ordinaryInvestmentMonthly: 10_000,
        exemptionApplies: true,
        healthTaxApplies: true,
      });
      expect(tax.exemptPensionMonthly).toBe(0);
      expect(tax.healthTaxMonthly).toBe(0);
      expect(tax.incomeTaxMonthly).toBeCloseTo(7_010 * 0.1 + 2_990 * 0.14 - 2.25 * 242, 6);
    });

    it("counts toward the 3% surtax but not the extra capital-income rate", () => {
      const tax = calculatePersonTax({ ...NO_INCOME, ordinaryInvestmentMonthly: 70_000 });
      expect(tax.surtaxMonthly).toBeCloseTo(9_870 * 0.03, 6);
    });

    it("moves the surtax threshold for a capital gain realised alongside it", () => {
      const tax = calculatePersonTax({
        ...NO_INCOME,
        ordinaryInvestmentMonthly: 60_000,
        capitalGainMonthly: 10_000,
      });
      // 70,000 in total is 9,870 above the threshold, all of it capital income.
      expect(tax.surtaxMonthly).toBeCloseTo(9_870 * 0.03 + 9_870 * 0.02, 6);
    });
  });
});
