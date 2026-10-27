import { describe, expect, it } from "vitest";

import { buildTestProfile } from "../test/domainFixtures";
import { buildHousehold } from "./household";
import {
  estimateNetIncome,
  estimateNetIncomeAtAge,
  estimateNetIncomeForHousehold,
} from "./netIncome";

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
    // Brackets 1,128 + (17,857 - 10,060) x 20% = 2,687, less 2.25 credit points (544.5) = 2,143,
    // plus health tax of 3.23% on 7,703 and 5.17% on the rest (774).
    expect(net.taxMonthly).toBe(2_917);
    expect(net.netMonthlyIncome).toBe(14_940);
    expect(net.lowestNetAge).toBe(62);
    expect(net.effectiveTaxRate).toBeCloseTo(2_917 / 17_857, 6);

    const before = net.years.find((year) => year.age === 66);
    const after = net.years.find((year) => year.age === 67);
    expect(before?.taxMonthly).toBe(2_917);
    // From 67 (2031) the exemption removes 9,430 x 67% = 6,318 of the pension: brackets 1,424,
    // less credit points, and no health tax.
    expect(after?.taxMonthly).toBe(879);
    expect(after?.netMonthly).toBe(16_978);
  });

  it("charges health tax on an early pension until the statutory age, then none", () => {
    // 1,836,000 over the 30 years from 60 to 90 is 5,100 a month: income tax is covered by credit points.
    const net = estimateNetIncome(
      buildTestProfile({ age: 60, retirementAge: 60, ...zeroReal, pensionBalances: [1_836_000] }),
    );
    expect(net.grossMonthlyIncome).toBe(5_100);
    // 5,100 x 3.23% = 164.73.
    expect(net.years.find((year) => year.age === 60)?.taxMonthly).toBe(165);
    expect(net.years.find((year) => year.age === 66)?.taxMonthly).toBe(165);
    expect(net.years.find((year) => year.age === 67)?.taxMonthly).toBe(0);
  });

  it("exempts more of the pension in later calendar years", () => {
    // 3,312,000 over the 23 years from 67 to 90 is 12,000 a month.
    const net = estimateNetIncome(
      buildTestProfile({ age: 67, retirementAge: 67, ...zeroReal, pensionBalances: [3_312_000] }),
    );
    const taxAt = (age: number) => net.years.find((year) => year.age === age)?.taxMonthly;
    // 2026: 57.5% of 9,430 exempt, taxable 6,578: 658 less 544.5.
    expect(taxAt(67)).toBe(113);
    // 2027: 62.5% exempt; 2028 on: 67% exempt.
    expect(taxAt(68)).toBe(66);
    expect(taxAt(69)).toBe(24);
    expect(taxAt(80)).toBe(24);
  });

  it("uses the calendar year of the household it is given", () => {
    const profile = buildTestProfile({
      age: 67,
      retirementAge: 67,
      ...zeroReal,
      pensionBalances: [3_312_000],
    });
    const timing = { selfAge: 67, spouseAge: null };
    const from2026 = estimateNetIncomeForHousehold(buildHousehold(profile, timing, 2026));
    const from2030 = estimateNetIncomeForHousehold(buildHousehold(profile, timing, 2030));
    expect(from2026.taxMonthly).toBe(113);
    expect(from2030.taxMonthly).toBe(24);
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
    // Two people at 8,929 each: brackets 970 less 544.5 of credit points, plus 312 of health tax, twice.
    expect(couple.taxMonthly).toBe(1_475);
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

  describe("employer stock under Section 102", () => {
    // 1,000 shares at $2,000 are worth 7,400,000 and give 26,812 a month over the 23 years from 67.
    // Half of that value was already there at the grant ($1,000 a share).
    const employerStock = (
      employerGrant: NonNullable<Parameters<typeof buildTestProfile>[0]["equity"]>[number]["employerGrant"],
    ) =>
      estimateNetIncome(
        buildTestProfile({
          age: 67,
          retirementAge: 67,
          ...zeroReal,
          equity: [{ quantity: 1_000, priceUSD: 2_000, employerGrant }],
        }),
      );

    it("taxes the grant-date value at the brackets and the rest at the capital gains rate", () => {
      const net = employerStock({
        taxTrack: "section102CapitalGainsTrustee",
        grantPriceUSD: 1_000,
      });
      expect(net.grossMonthlyIncome).toBe(26_812);
      // Ordinary half 13,406: brackets 1,128 + (13,406 - 10,060) x 20% = 1,797, less credit points 544.5 = 1,253.
      // Capital gain half 13,406 x 25% = 3,351.
      expect(net.taxMonthly).toBe(4_604);
      expect(net.netMonthlyIncome).toBe(22_208);
    });

    it("taxes all of it as ordinary income on the ordinary-income track", () => {
      const net = employerStock({ taxTrack: "section102OrdinaryIncomeTrustee", grantPriceUSD: 1_000 });
      // Brackets 1,128 + 8,940 x 20% + 6,100 x 31% + (26,812 - 25,100) x 35% = 5,406, less 544.5 = 4,862.
      expect(net.taxMonthly).toBe(4_862);
      expect(net.netMonthlyIncome).toBe(21_950);
    });

    it("taxes a sale before the 24 months are up like ordinary income", () => {
      const sixMonthsAgo = new Date(Date.now() - 0.5 * 365.25 * 24 * 3600 * 1000)
        .toISOString()
        .slice(0, 10);
      const net = employerStock({
        taxTrack: "section102CapitalGainsTrustee",
        grantDate: sixMonthsAgo,
        grantPriceUSD: 1_000,
      });
      expect(net.taxMonthly).toBe(4_862);
    });

    it("taxes only the growth above the grant value for shares outside a trustee", () => {
      const net = employerStock({ taxTrack: "section3iNonTrustee", grantPriceUSD: 1_000 });
      // Half is gain: 13,406 x 25%.
      // 26,812 a month is drawn, which is what the estimate rounds to: 13,406 x 25%, half rounded up.
      expect(net.taxMonthly).toBe(3_352);
    });
  });
});
