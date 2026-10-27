import { describe, expect, it } from "vitest";

import { buildTestProfile } from "../test/domainFixtures";
import { findDataGaps, type DataGapId } from "./inputGuidance";

const ids = (profile: Parameters<typeof findDataGaps>[0]): DataGapId[] =>
  findDataGaps(profile).map((gap) => gap.id);

const ACTIVE = {
  accountStatus: "activeContributing" as const,
  productCategory: "comprehensivePension" as const,
  contributions: { employeeRatePercent: 6, employerRatePercent: 6.5, severanceRatePercent: 6 },
};

describe("findDataGaps", () => {
  it("reports the optional inputs a bare profile is missing, spending first", () => {
    const gaps = ids(buildTestProfile({ age: 40, retirementAge: 67 }));
    expect(gaps).toEqual(["retirementSpending", "noSavings", "gender"]);
  });

  it("reports nothing for a complete single-person profile", () => {
    const profile = buildTestProfile({
      age: 40,
      retirementAge: 67,
      gender: "female",
      maritalStatus: "single",
      monthlyGrossSalary: 20_000,
      pensionBalances: [300_000],
      pensionAccountOverrides: [ACTIVE],
      retirementMonthlyExpenses: 12_000,
    });
    expect(findDataGaps(profile)).toEqual([]);
  });

  it("treats a zero spending target like a missing one", () => {
    const profile = buildTestProfile({
      age: 40,
      retirementAge: 67,
      gender: "male",
      pensionBalances: [100_000],
      pensionAccountOverrides: [{ productCategory: "providentFund", accountStatus: "paidUpFrozen" }],
      retirementMonthlyExpenses: 0,
    });
    expect(ids(profile)).toEqual(["retirementSpending"]);
  });

  it("counts savings in other assets and equity, not only pension accounts", () => {
    const withAssets = buildTestProfile({ age: 40, retirementAge: 67, gender: "male", otherAssets: 50_000 });
    expect(ids(withAssets)).not.toContain("noSavings");
    const withEquity = buildTestProfile({
      age: 40,
      retirementAge: 67,
      gender: "male",
      equity: [{ quantity: 10, priceUSD: 100 }],
    });
    expect(ids(withEquity)).not.toContain("noSavings");
  });

  it("flags accounts without a type or status and counts how many", () => {
    const profile = buildTestProfile({
      age: 40,
      retirementAge: 67,
      gender: "male",
      retirementMonthlyExpenses: 10_000,
      pensionBalances: [100_000, 200_000, 0],
      pensionAccountOverrides: [{}, { productCategory: "studyFund" }, {}],
    });
    const gaps = findDataGaps(profile);
    // The empty account has no balance, so nothing is lost by leaving it blank.
    expect(gaps.find((gap) => gap.id === "accountType")?.count).toBe(1);
    expect(gaps.find((gap) => gap.id === "accountStatus")?.count).toBe(2);
    expect(gaps.every((gap) => gap.step === "pension-savings")).toBe(true);
  });

  it("flags a missing salary only while an account is contributing", () => {
    const base = {
      age: 40,
      retirementAge: 67,
      gender: "male" as const,
      retirementMonthlyExpenses: 10_000,
      pensionBalances: [100_000],
    };
    const active = buildTestProfile({ ...base, pensionAccountOverrides: [ACTIVE] });
    expect(ids(active)).toContain("salary");
    const frozen = buildTestProfile({
      ...base,
      pensionAccountOverrides: [{ ...ACTIVE, accountStatus: "paidUpFrozen" }],
    });
    expect(ids(frozen)).not.toContain("salary");
  });

  it("flags contributing accounts that have a salary but no contribution rates", () => {
    const profile = buildTestProfile({
      age: 40,
      retirementAge: 67,
      gender: "male",
      monthlyGrossSalary: 15_000,
      retirementMonthlyExpenses: 10_000,
      pensionBalances: [100_000],
      pensionAccountOverrides: [{ productCategory: "comprehensivePension", accountStatus: "activeContributing" }],
    });
    expect(ids(profile)).toEqual(["contributionRates"]);
  });

  describe("without a partner", () => {
    const single = {
      age: 40,
      retirementAge: 67,
      gender: "male" as const,
      retirementMonthlyExpenses: 10_000,
      monthlyGrossSalary: 15_000,
      pensionBalances: [100_000],
      pensionAccountOverrides: [ACTIVE],
    };

    it.each([null, "single", "divorced", "widowed"] as const)(
      "never asks about a spouse when marital status is %s",
      (maritalStatus) => {
        const profile = buildTestProfile({
          ...single,
          ...(maritalStatus ? { maritalStatus } : {}),
          // A half-filled spouse form must not change a single-person plan.
          spouse: { age: 38 },
        });
        const all = ids(profile);
        expect(all).not.toContain("spouseMissing");
        expect(all).not.toContain("spouseSalary");
        expect(all).not.toContain("spouseGender");
        expect(all).toEqual([]);
      },
    );

    it("ignores a leftover spouse account", () => {
      const profile = buildTestProfile({
        ...single,
        maritalStatus: "single",
        pensionBalances: [100_000, 50_000],
        pensionAccountOverrides: [ACTIVE, { owner: "spouse" }],
      });
      expect(findDataGaps(profile)).toEqual([]);
    });
  });

  describe("as a couple", () => {
    const couple = {
      age: 40,
      retirementAge: 67,
      gender: "male" as const,
      maritalStatus: "married" as const,
      retirementMonthlyExpenses: 10_000,
      monthlyGrossSalary: 15_000,
    };

    it("reminds a married user to enter the spouse's age", () => {
      const profile = buildTestProfile({ ...couple, pensionBalances: [100_000], pensionAccountOverrides: [ACTIVE] });
      expect(ids(profile)).toEqual(["spouseMissing"]);
    });

    it("flags the spouse's gender and salary once the spouse is in the plan", () => {
      const profile = buildTestProfile({
        ...couple,
        spouse: { age: 38, retirementAge: 67 },
        pensionBalances: [100_000, 100_000],
        pensionAccountOverrides: [ACTIVE, { ...ACTIVE, owner: "spouse" }],
      });
      expect(ids(profile)).toEqual(["spouseSalary", "spouseGender"]);
    });

    it("is complete when both spouses are filled in", () => {
      const profile = buildTestProfile({
        ...couple,
        spouse: { age: 38, retirementAge: 67, gender: "female", monthlyGrossSalary: 12_000 },
        pensionBalances: [100_000, 100_000],
        pensionAccountOverrides: [ACTIVE, { ...ACTIVE, owner: "spouse" }],
      });
      expect(findDataGaps(profile)).toEqual([]);
    });
  });
});
