import { describe, expect, it } from "vitest";

import { buildTestProfile } from "../test/domainFixtures";
import { estimateNetIncome, estimateNetIncomeAtAge } from "./netIncome";

const zeroReal = { investmentReturnPct: 4, inflationPct: 4 };

describe("estimateNetIncome", () => {
  it("is all zero without savings", () => {
    const net = estimateNetIncome(buildTestProfile({ age: 67, retirementAge: 67 }));
    expect(net).toMatchObject({
      grossMonthlyIncome: 0,
      taxMonthly: 0,
      netMonthlyIncome: 0,
      effectiveTaxRate: 0,
      lowestNetAge: null,
    });
  });

  it("pays no tax at the statutory age on an income the exemption and credit points cover", () => {
    // 2,400,000 over the 23 years from 67 to 90 is about 8,696 a month.
    const net = estimateNetIncome(
      buildTestProfile({ age: 67, retirementAge: 67, ...zeroReal, pensionBalances: [2_400_000] }),
    );
    expect(net.grossMonthlyIncome).toBe(8_696);
    expect(net.taxMonthly).toBe(0);
    expect(net.netMonthlyIncome).toBe(net.grossMonthlyIncome);
    expect(net.effectiveTaxRate).toBe(0);
  });

  it("taxes the years before the statutory age in full and reports the lowest net year", () => {
    // 6,000,000 over the 28 years from 62 to 90 is about 17,857 a month.
    const net = estimateNetIncome(
      buildTestProfile({ age: 62, retirementAge: 62, ...zeroReal, pensionBalances: [6_000_000] }),
    );
    expect(net.grossMonthlyIncome).toBe(17_857);
    // Brackets 1,128 + (17,857 - 10,060) x 20% = 2,687, less 2.25 credit points (544.5).
    expect(net.taxMonthly).toBe(2_143);
    expect(net.netMonthlyIncome).toBe(15_714);
    expect(net.lowestNetAge).toBe(62);
    expect(net.effectiveTaxRate).toBeCloseTo(2_143 / 17_857, 6);

    const before = net.years.find((year) => year.age === 66);
    const after = net.years.find((year) => year.age === 67);
    expect(before?.taxMonthly).toBe(2_143);
    // From 67 the exemption removes 5,422 of the pension: brackets 1,603, less credit points.
    expect(after?.taxMonthly).toBe(1_058);
    expect(after?.netMonthly).toBe(16_799);
  });

  it("covers every year from retirement to the planning horizon", () => {
    const net = estimateNetIncome(
      buildTestProfile({ age: 62, retirementAge: 62, ...zeroReal, pensionBalances: [6_000_000] }),
    );
    expect(net.years[0].age).toBe(62);
    expect(net.years.at(-1)?.age).toBe(90);
    for (const year of net.years) {
      expect(year.netMonthly).toBe(year.grossMonthly - year.taxMonthly);
    }
  });

  it("taxes each spouse on their own income", () => {
    const single = estimateNetIncome(
      buildTestProfile({ age: 62, retirementAge: 62, ...zeroReal, pensionBalances: [6_000_000] }),
    );
    const couple = estimateNetIncome(
      buildTestProfile({
        age: 62,
        gender: "male",
        retirementAge: 62,
        maritalStatus: "married",
        spouse: { age: 62, gender: "male", retirementAge: 62 },
        ...zeroReal,
        pensionBalances: [3_000_000, 3_000_000],
        pensionAccountOverrides: [{ owner: "self" }, { owner: "spouse" }],
      }),
    );
    expect(couple.grossMonthlyIncome).toBe(single.grossMonthlyIncome);
    // Two people at 8,929 each: brackets 970 less 544.5 of credit points, twice.
    expect(couple.taxMonthly).toBe(850);
    expect(couple.taxMonthly).toBeLessThan(single.taxMonthly);
    expect(couple.netMonthlyIncome).toBe(couple.grossMonthlyIncome - couple.taxMonthly);
  });

  it("uses the spouse's own credit points, defaulting by gender", () => {
    const build = (spouse: { gender: "male" | "female"; creditPoints?: number }) =>
      estimateNetIncome(
        buildTestProfile({
          age: 62,
          gender: "male",
          retirementAge: 62,
          maritalStatus: "married",
          spouse: { age: 62, retirementAge: 62, ...spouse },
          ...zeroReal,
          pensionBalances: [3_000_000, 3_000_000],
          pensionAccountOverrides: [{ owner: "self" }, { owner: "spouse" }],
        }),
      ).taxMonthly;

    const man = build({ gender: "male" });
    const woman = build({ gender: "female" });
    const generous = build({ gender: "male", creditPoints: 5 });
    // Half a credit point is worth 121 a month.
    expect(man - woman).toBe(121);
    expect(generous).toBeLessThan(man);
  });

  it("applies the remaining exemption allowance of the primary user", () => {
    const build = (taxExemptionBasket?: { remainingMonthlyExemptionCap: number }) =>
      estimateNetIncomeAtAge(
        buildTestProfile({
          age: 67,
          retirementAge: 67,
          ...zeroReal,
          pensionBalances: [2_400_000],
          taxExemptionBasket,
        }),
        67,
      );
    expect(build().taxMonthly).toBe(0);
    // With no exemption left, the 8,696 pension is taxed: 937 less 544.5 of credit points.
    expect(build({ remainingMonthlyExemptionCap: 0 }).taxMonthly).toBe(393);
  });

  it("does not tax study-fund money", () => {
    const studyFund = estimateNetIncome(
      buildTestProfile({
        age: 62,
        retirementAge: 62,
        ...zeroReal,
        pensionBalances: [6_000_000],
        pensionAccountOverrides: [{ productCategory: "studyFund", liquidityDate: "2000-01-01" }],
      }),
    );
    expect(studyFund.grossMonthlyIncome).toBe(17_857);
    expect(studyFund.taxMonthly).toBe(0);
    expect(studyFund.netMonthlyIncome).toBe(17_857);
  });

  describe("capital gains", () => {
    it("taxes only the declared gain of other investments", () => {
      // Half of the holding is a gain, so a quarter of it goes to tax on the half withdrawn.
      const net = estimateNetIncome(
        buildTestProfile({
          age: 67,
          retirementAge: 67,
          ...zeroReal,
          equity: [{ quantity: 1_000, priceUSD: 1_000, unrealizedCapitalGainUSD: 500_000 }],
        }),
      );
      expect(net.grossMonthlyIncome).toBeGreaterThan(0);
      expect(net.effectiveTaxRate).toBeCloseTo(0.125, 3);
      expect(net.netMonthlyIncome).toBe(net.grossMonthlyIncome - net.taxMonthly);
    });

    it("uses the capital gains tax rate entered for the holding", () => {
      const net = estimateNetIncome(
        buildTestProfile({
          age: 67,
          retirementAge: 67,
          ...zeroReal,
          equity: [
            {
              quantity: 1_000,
              priceUSD: 1_000,
              unrealizedCapitalGainUSD: 500_000,
              capitalGainsTaxRatePercent: 20,
            },
          ],
        }),
      );
      expect(net.effectiveTaxRate).toBeCloseTo(0.1, 3);
    });

    it("does not tax other investments that have no declared gain", () => {
      const net = estimateNetIncome(
        buildTestProfile({ age: 67, retirementAge: 67, ...zeroReal, otherAssets: 2_760_000 }),
      );
      expect(net.grossMonthlyIncome).toBe(10_000);
      expect(net.taxMonthly).toBe(0);
    });

    it("taxes the growth of an investment provident fund but not its deposits", () => {
      const flat = estimateNetIncome(
        buildTestProfile({
          age: 50,
          retirementAge: 67,
          ...zeroReal,
          pensionBalances: [1_000_000],
          pensionAccountOverrides: [{ productCategory: "investmentProvidentFund" }],
        }),
      );
      expect(flat.taxMonthly).toBe(0);

      const growing = estimateNetIncome(
        buildTestProfile({
          age: 50,
          retirementAge: 67,
          investmentReturnPct: 7,
          inflationPct: 3,
          pensionBalances: [1_000_000],
          pensionAccountOverrides: [{ productCategory: "investmentProvidentFund" }],
        }),
      );
      expect(growing.taxMonthly).toBeGreaterThan(0);
      expect(growing.effectiveTaxRate).toBeGreaterThan(0);
      expect(growing.effectiveTaxRate).toBeLessThan(0.25);
    });
  });
});
