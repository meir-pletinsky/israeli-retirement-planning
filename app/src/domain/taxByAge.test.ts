import { describe, expect, it, vi } from "vitest";

import { buildTestProfile } from "../test/domainFixtures";
import { buildTaxByAge, type TaxByAgeAccount, type TaxByAgeRow } from "./taxByAge";
import { HEALTH_TAX_PERCENT, MARGINAL_RATE_RANGE } from "./taxByAgeRules";

type Profile = Parameters<typeof buildTestProfile>[0];

const build = (overrides: Profile) => buildTaxByAge(buildTestProfile(overrides));
const only = (overrides: Profile): TaxByAgeAccount => {
  const { accounts } = build(overrides);
  expect(accounts).toHaveLength(1);
  return accounts[0];
};
const rowOf = (account: TaxByAgeAccount, part: TaxByAgeRow["part"], option: TaxByAgeRow["option"]) => {
  const row = account.rows.find((candidate) => candidate.part === part && candidate.option === option);
  expect(row).toBeDefined();
  return row as TaxByAgeRow;
};
const partsOf = (account: TaxByAgeAccount) => [...new Set(account.rows.map(({ part }) => part))];

const man = { age: 50, gender: "male" as const, retirementAge: 60 };

describe("buildTaxByAge", () => {
  it("lists nothing when there are no accounts", () => {
    expect(build({ ...man })).toMatchObject({ accounts: [], skippedAccounts: 0 });
  });

  it("skips and counts accounts that have no product type", () => {
    const result = build({
      ...man,
      pensionBalances: [100_000, 200_000],
      pensionAccountOverrides: [{ productCategory: null }, { productCategory: "studyFund" }],
    });
    expect(result.accounts.map(({ category }) => category)).toEqual(["studyFund"]);
    expect(result.skippedAccounts).toBe(1);
  });

  it("skips a stored product type it has no rules for instead of failing", () => {
    const result = build({
      ...man,
      pensionBalances: [100_000, 200_000],
      pensionAccountOverrides: [{ productCategory: "pensionFund" as never }, { productCategory: "studyFund" }],
    });
    expect(result.accounts.map(({ category }) => category)).toEqual(["studyFund"]);
    expect(result.skippedAccounts).toBe(1);
  });

  it("taxes a pension annuity at the brackets with health tax from 60, then partly exempt from the statutory age", () => {
    const account = only({
      ...man,
      pensionBalances: [800_000],
      pensionAccountOverrides: [{ productCategory: "comprehensivePension" }],
    });
    const annuity = rowOf(account, "pensionMoney", "annuity").cells;

    expect(annuity.before60).toEqual([{ treatment: { kind: "unavailable" }, confidence: "medium" }]);
    expect(annuity.from60[0].treatment).toEqual({ kind: "marginal", ...MARGINAL_RATE_RANGE, healthTax: true });
    expect(annuity.fromStatutory[0].treatment).toEqual({
      kind: "partlyExempt",
      exemptPercent: 67,
      taxYear: 2043,
      ...MARGINAL_RATE_RANGE,
    });
    expect(MARGINAL_RATE_RANGE).toEqual({ minPercent: 10, maxPercent: 47 });
    expect(HEALTH_TAX_PERCENT).toEqual({ reduced: 3.23, full: 5.17 });
  });

  it("splits a pension fund into pension savings and severance, each with an annuity and a lump sum", () => {
    const account = only({
      ...man,
      pensionBalances: [800_000],
      pensionAccountOverrides: [{ productCategory: "generalPension" }],
    });
    expect(partsOf(account)).toEqual(["pensionMoney", "recognizedMoney", "severance"]);
    expect(account.rows.map(({ part, option }) => `${part}:${option}`)).toEqual([
      "pensionMoney:annuity",
      "pensionMoney:lumpSum",
      "recognizedMoney:annuity",
      "recognizedMoney:lumpSum",
      "severance:lumpSum",
      "severance:annuity",
    ]);
    const lumpSum = rowOf(account, "pensionMoney", "lumpSum").cells;
    expect(lumpSum.before60[0].treatment).toEqual({ kind: "penalty", ratePercent: 35 });
    expect(lumpSum.fromStatutory[0]).toMatchObject({ condition: "partialCommutation", confidence: "low" });
    expect(lumpSum.from60[0].treatment.kind).toBe("commutation");
    expect(lumpSum.fromStatutory[0].treatment.kind).toBe("commutation");
    expect(rowOf(account, "severance", "lumpSum").cells.before60[0].treatment.kind).toBe("exemptUpToCap");
  });

  describe("the statutory age and the exempt share", () => {
    it.each([[2026, 57.5], [2027, 62.5], [2028, 67]])(
      "uses the payment-year rate in %i for someone already retired",
      (year, exemptPercent) => {
        const now = new Date();
        try {
          vi.setSystemTime(new Date(`${year}-06-15T12:00:00Z`));
          const account = only({
            age: 70,
            gender: "male",
            retirementAge: 67,
            pensionBalances: [100_000],
            pensionAccountOverrides: [{ productCategory: "comprehensivePension" }],
          });
          expect(rowOf(account, "pensionMoney", "annuity").cells.fromStatutory[0].treatment).toMatchObject({
            kind: "partlyExempt", taxYear: year, exemptPercent,
          });
        } finally {
          vi.setSystemTime(now);
        }
      },
    );

    it("illustrates the first eligible payment year without fixing the rate for all later payments", () => {
      expect(only({ ...man, pensionBalances: [1], pensionAccountOverrides: [{ productCategory: "providentFund" }] })).toMatchObject({
        statutoryAge: 67,
        exemptionYear: 2043,
        exemptPercent: 67,
      });
      expect(
        only({ age: 66, gender: "male", retirementAge: 66, pensionBalances: [1], pensionAccountOverrides: [{ productCategory: "providentFund" }] }),
      ).toMatchObject({ exemptionYear: 2027, exemptPercent: 62.5 });
    });

    it("uses the woman's age by birth year, and this year's share once she is past it", () => {
      const overrides = { pensionBalances: [1], pensionAccountOverrides: [{ productCategory: "providentFund" as const }] };
      expect(only({ age: 56, gender: "female", retirementAge: 60, ...overrides })).toMatchObject({
        statutoryAge: 65,
        exemptionYear: 2035,
        exemptPercent: 67,
      });
      expect(only({ age: 64, gender: "female", retirementAge: 64, ...overrides })).toMatchObject({
        statutoryAge: 63,
        exemptionYear: 2026,
        exemptPercent: 57.5,
      });
    });

    it("gives each spouse their own statutory age", () => {
      const result = build({
        ...man,
        maritalStatus: "married",
        spouse: { age: 56, gender: "female", retirementAge: 60 },
        pensionBalances: [100_000, 100_000],
        pensionAccountOverrides: [
          { owner: "self", productCategory: "comprehensivePension" },
          { owner: "spouse", productCategory: "comprehensivePension" },
        ],
      });
      expect(result.accounts.map(({ member, statutoryAge }) => [member, statutoryAge])).toEqual([
        ["self", 67],
        ["spouse", 65],
      ]);
    });

    it("lists one person's accounts, and counts only their skipped accounts, when asked", () => {
      const profile = buildTestProfile({
        ...man,
        maritalStatus: "married",
        spouse: { age: 56, gender: "female", retirementAge: 60 },
        pensionBalances: [100_000, 100_000, 100_000],
        pensionAccountOverrides: [
          { owner: "self", productCategory: "comprehensivePension" },
          { owner: "spouse", productCategory: "studyFund" },
          { owner: "spouse", productCategory: null },
        ],
      });
      const self = buildTaxByAge(profile, "self");
      const spouse = buildTaxByAge(profile, "spouse");
      expect(self.accounts.map(({ member }) => member)).toEqual(["self"]);
      expect(self.skippedAccounts).toBe(0);
      expect(spouse.accounts.map(({ member, category }) => [member, category])).toEqual([["spouse", "studyFund"]]);
      expect(spouse.skippedAccounts).toBe(1);
    });
  });

  describe("the parts an account holds", () => {
    it("shows every part the product can hold when there is no balance breakdown", () => {
      const account = only({
        ...man,
        pensionBalances: [100_000],
        pensionAccountOverrides: [{ productCategory: "managersInsurance" }],
      });
      expect(partsOf(account)).toEqual(["annuityMoney", "recognizedMoney", "oldCapital", "severance"]);
      expect(account.partsFromBreakdown).toBe(false);
    });

    it("leaves out parts the balance breakdown shows are empty", () => {
      const account = only({
        ...man,
        pensionBalances: [100_000],
        pensionAccountOverrides: [
          {
            productCategory: "managersInsurance",
            balanceBreakdown: {
              pre2008CapitalBalance: 0,
              post2008AnnuityBalance: 60_000,
              tikun190CapitalBalance: null,
              severanceBalance: 40_000,
            },
          },
        ],
      });
      expect(partsOf(account)).toEqual(["annuityMoney", "severance"]);
      expect(account.partsFromBreakdown).toBe(true);
    });

    it("ignores a breakdown that covers too little of the balance", () => {
      const account = only({
        ...man,
        pensionBalances: [100_000],
        pensionAccountOverrides: [
          {
            productCategory: "managersInsurance",
            balanceBreakdown: {
              pre2008CapitalBalance: null,
              post2008AnnuityBalance: 50_000,
              tikun190CapitalBalance: null,
              severanceBalance: null,
            },
          },
        ],
      });
      expect(partsOf(account)).toEqual(["annuityMoney", "recognizedMoney", "oldCapital", "severance"]);
      expect(account.partsFromBreakdown).toBe(false);
    });

    it("shows only the annuity of an account that already pays one", () => {
      const account = only({
        ...man,
        pensionBalances: [800_000],
        pensionAccountOverrides: [{ productCategory: "comprehensivePension", accountStatus: "payingAnnuity" }],
      });
      expect(account.rows.map(({ part, option }) => `${part}:${option}`)).toEqual(["pensionMoney:annuity"]);
    });

    it("preserves the exemption of recognized money in a paying account with a complete breakdown", () => {
      const account = only({
        ...man,
        pensionBalances: [100_000],
        pensionAccountOverrides: [{
          productCategory: "managersInsurance",
          accountStatus: "payingAnnuity",
          balanceBreakdown: {
            pre2008CapitalBalance: 0,
            post2008AnnuityBalance: 0,
            tikun190CapitalBalance: 100_000,
            severanceBalance: 0,
          },
        }],
      });
      expect(account.rows).toHaveLength(1);
      expect(account.rows[0]).toMatchObject({ part: "recognizedMoney", option: "annuity" });
      expect(account.rows[0].cells.from60[0].treatment.kind).toBe("exempt");
    });
  });

  describe("lump-sum products", () => {
    it("taxes only the real gain of an investment provident fund, at any age, with a tax-free annuity from 60", () => {
      const account = only({
        ...man,
        pensionBalances: [300_000],
        pensionAccountOverrides: [{ productCategory: "investmentProvidentFund" }],
      });
      const lumpSum = rowOf(account, "wholeBalance", "lumpSum").cells;
      for (const band of ["before60", "from60", "fromStatutory"] as const) {
        expect(lumpSum[band][0].treatment).toEqual({ kind: "flatGain", ratePercent: 25, gain: "real" });
      }
      const annuity = rowOf(account, "wholeBalance", "annuity").cells;
      expect(annuity.before60[0].treatment.kind).toBe("unavailable");
      expect(annuity.from60[0]).toMatchObject({ treatment: { kind: "exempt" }, condition: "investmentAnnuity" });
    });

    it("makes a study fund exempt within the ceiling and taxes the gain above it, with the rules before it is liquid", () => {
      const account = only({
        ...man,
        pensionBalances: [300_000],
        pensionAccountOverrides: [{ productCategory: "studyFund" }],
      });
      expect(account.rows.map(({ part, option }) => `${part}:${option}`)).toEqual([
        "studyFundWithinCeiling:lumpSum",
        "studyFundAboveCeiling:lumpSum",
      ]);
      const within = rowOf(account, "studyFundWithinCeiling", "lumpSum").cells.from60;
      expect(within.map(({ condition, treatment }) => [condition, treatment.kind])).toEqual([
        ["studyFundSixYears", "exempt"],
        ["studyFundEarlier", "studyFundEarly"],
      ]);
      expect(rowOf(account, "studyFundWithinCeiling", "lumpSum").cells.fromStatutory).toMatchObject([
        { condition: "studyFundSixYears", treatment: { kind: "exempt" } },
        { condition: "studyFundThreeYearsFromStatutory", treatment: { kind: "exempt" } },
        { condition: "studyFundEarlier", treatment: { kind: "studyFundEarly" } },
      ]);
      expect(rowOf(account, "studyFundAboveCeiling", "lumpSum").cells.before60[0].treatment).toEqual({
        kind: "flatGain",
        ratePercent: 25,
        gain: "real",
      });
    });
  });

  it.each(["providentFund", "iraProvidentFund", "managersInsurance"] as const)(
    "offers Amendment 190 only on recognized money in %s, not ordinary post-2008 deposits",
    (productCategory) => {
      const account = only({
        ...man,
        pensionBalances: [100_000],
        pensionAccountOverrides: [{ productCategory }],
      });
      const lumpSum = rowOf(account, "recognizedMoney", "lumpSum").cells;
      expect(lumpSum.before60[0].treatment).toEqual({ kind: "penalty", ratePercent: 35 });
      expect(lumpSum.from60[0]).toMatchObject({
        treatment: { kind: "flatGain", ratePercent: 15, gain: "nominal" },
        condition: "minimumAnnuity",
        confidence: "medium",
      });
      expect(rowOf(account, "annuityMoney", "lumpSum").cells.from60[0].treatment.kind).toBe("commutation");
      expect(rowOf(account, "recognizedMoney", "annuity").cells.from60[0].treatment.kind).toBe("exempt");
    },
  );

  it("exempts lawful old-capital withdrawals without assuming age alone makes them lawful", () => {
    const account = only({
      ...man,
      pensionBalances: [100_000],
      pensionAccountOverrides: [{ productCategory: "providentFund" }],
    });
    const lumpSum = rowOf(account, "oldCapital", "lumpSum").cells;
    for (const band of ["before60", "from60", "fromStatutory"] as const) {
      expect(lumpSum[band][0]).toMatchObject({
        treatment: { kind: "exempt" },
        condition: "lawfulOldCapital",
      });
      expect(lumpSum[band][1].treatment.kind).toBe("penalty");
    }
  });
});
