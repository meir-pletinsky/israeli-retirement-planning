import { describe, expect, it } from "vitest";

import { buildTestProfile } from "../test/domainFixtures";
import { createCoverPlan, type CoverPlan, type InsuranceCoverages, type PensionAccount } from "../types";
import { analyseCover, compareCoverOptions, findCoverNotices, planForOption } from "./coverAnalysis";
import {
  accountsOfPerson,
  coverMonthlyCost,
  coverOnFile,
  coverTotalCost,
  coverWindows,
  survivorsGapInMoney,
} from "./coverPlan";

const cover = (changes: Partial<InsuranceCoverages>): Partial<PensionAccount> => ({
  accountStatus: "activeContributing",
  insuranceCoverages: {
    deathCoverageAmount: null,
    monthlyDisabilityAmount: null,
    monthlyRiskDeduction: null,
    monthlySurvivorsSpousePension: null,
    survivorSpousePercent: null,
    ...changes,
  },
});

describe("coverOnFile", () => {
  it("sums the cover of the person's accounts that still receive deposits", () => {
    const profile = buildTestProfile({
      age: 50,
      retirementAge: 55,
      pensionBalances: [1, 1, 1],
      pensionAccountOverrides: [
        cover({ deathCoverageAmount: 800_000, monthlyRiskDeduction: 90, monthlySurvivorsSpousePension: 4_000 }),
        cover({ deathCoverageAmount: 200_000, monthlyRiskDeduction: 40 }),
        { ...cover({ deathCoverageAmount: 5_000_000, monthlyRiskDeduction: 999 }), accountStatus: "paidUpFrozen" },
      ],
    });
    expect(coverOnFile(profile, "self")).toEqual({
      deathCoverage: 1_000_000,
      monthlyRiskDeduction: 130,
      monthlySurvivorsPension: 4_000,
      hasCover: true,
    });
  });

  it("reports no cover when nothing is on file, and ignores empty and negative amounts", () => {
    const profile = buildTestProfile({
      age: 50,
      pensionBalances: [1, 1],
      pensionAccountOverrides: [cover({}), cover({ deathCoverageAmount: -5, monthlyRiskDeduction: 0 })],
    });
    expect(coverOnFile(profile, "self")).toEqual({
      deathCoverage: 0,
      monthlyRiskDeduction: 0,
      monthlySurvivorsPension: 0,
      hasCover: false,
    });
  });

  it("counts a spouse's accounts only for the spouse, and only once the plan covers a spouse", () => {
    const base = {
      age: 50,
      pensionBalances: [1, 1],
      pensionAccountOverrides: [
        cover({ monthlyRiskDeduction: 100 }),
        { ...cover({ monthlyRiskDeduction: 70 }), owner: "spouse" as const },
      ],
    };
    const couple = buildTestProfile({ ...base, maritalStatus: "married", spouse: { age: 48 } });
    expect(coverOnFile(couple, "self").monthlyRiskDeduction).toBe(100);
    expect(coverOnFile(couple, "spouse").monthlyRiskDeduction).toBe(70);

    const spouseAgeMissing = buildTestProfile({ ...base, maritalStatus: "married" });
    expect(coverOnFile(spouseAgeMissing, "spouse").hasCover).toBe(false);
    expect(accountsOfPerson(spouseAgeMissing, "spouse")).toEqual([]);
  });
});

const plan = (changes: Partial<CoverPlan>): CoverPlan => ({ ...createCoverPlan("none"), ...changes });
// Five months after the last deposit (rule V), as a fraction of a year.
const FREE = 5 / 12;

describe("coverWindows", () => {
  it("option none: the cover ends with the free extension and the gap runs to the need-until age", () => {
    const w = coverWindows(plan({ option: "none" }), 55);
    expect(w.freeEndAge).toBeCloseTo(55 + FREE, 10);
    expect(w.arrangementEndAge).toBe(57);
    expect(w.needEndAge).toBe(60);
    expect(w.coverEndAge).toBeCloseTo(55 + FREE, 10);
    expect(w.gapStartAge).toBeCloseTo(55 + FREE, 10);
    expect(w.gapYears).toBeCloseTo(5 - FREE, 10);
    expect(w.costYears).toBe(0);
  });

  it("option keep pension insurance without paying on: cover to the end of the 24-month arrangement", () => {
    const w = coverWindows(plan({ option: "keepPensionInsurance", keepPayingAfterArrangement: false }), 55);
    expect(w.coverEndAge).toBe(57);
    expect(w.gapStartAge).toBe(57);
    expect(w.gapYears).toBe(3);
    expect(w.costStartAge).toBeCloseTo(55 + FREE, 10);
    expect(w.costEndAge).toBe(57);
    expect(w.costYears).toBeCloseTo(2 - FREE, 10);
  });

  it("option keep pension insurance with personal deposits after the arrangement: cover to the need-until age", () => {
    const w = coverWindows(plan({ option: "keepPensionInsurance", keepPayingAfterArrangement: true }), 55);
    expect(w.coverEndAge).toBe(60);
    expect(w.gapYears).toBe(0);
    expect(w.costYears).toBeCloseTo(5 - FREE, 10);
  });

  it("option term life: cover from the end of the free extension to the term end age", () => {
    const w = coverWindows(plan({ option: "termLife", termEndAge: 58 }), 55);
    expect(w.coverEndAge).toBe(58);
    expect(w.gapStartAge).toBe(58);
    expect(w.gapYears).toBe(2);
    expect(w.costYears).toBeCloseTo(3 - FREE, 10);
  });

  it("option term life without a term end age runs to the need-until age", () => {
    const w = coverWindows(plan({ option: "termLife", termEndAge: null, needUntilAge: 64 }), 55);
    expect(w.needEndAge).toBe(64);
    expect(w.coverEndAge).toBe(64);
    expect(w.gapYears).toBe(0);
  });

  it("a term end before the free extension ends is read as the free extension", () => {
    const w = coverWindows(plan({ option: "termLife", termEndAge: 55.1 }), 55);
    expect(w.coverEndAge).toBeCloseTo(55 + FREE, 10);
    expect(w.costYears).toBe(0);
  });

  it("a later need-until age lengthens the gap", () => {
    const w = coverWindows(plan({ option: "none", needUntilAge: 65 }), 55);
    expect(w.needEndAge).toBe(65);
    expect(w.gapYears).toBeCloseTo(10 - FREE, 10);
  });

  it("no gap and no cost when deposits stop at or after the need-until age", () => {
    for (const option of ["none", "keepPensionInsurance", "termLife"] as const) {
      const w = coverWindows(plan({ option, termEndAge: null }), 60);
      expect(w.gapYears).toBe(0);
      expect(w.costYears).toBe(0);
    }
    expect(coverWindows(plan({ option: "keepPensionInsurance" }), 62).costYears).toBe(0);
    expect(coverWindows(plan({ option: "none" }), 62).gapYears).toBe(0);
  });
});

describe("coverMonthlyCost and coverTotalCost", () => {
  it("is 0 for no cover, and the user's own figure when typed", () => {
    expect(coverMonthlyCost(plan({ option: "none", monthlyCost: 500 }), 90)).toBe(0);
    expect(coverMonthlyCost(plan({ option: "keepPensionInsurance", monthlyCost: 120 }), 90)).toBe(120);
    expect(coverMonthlyCost(plan({ option: "termLife", monthlyCost: 300 }), 90)).toBe(300);
  });

  it("falls back to the risk deduction on file for the pension insurance, and is unknown otherwise", () => {
    expect(coverMonthlyCost(plan({ option: "keepPensionInsurance" }), 90)).toBe(90);
    expect(coverMonthlyCost(plan({ option: "keepPensionInsurance" }), 0)).toBeNull();
    expect(coverMonthlyCost(plan({ option: "termLife" }), 90)).toBeNull();
    expect(coverMonthlyCost(plan({ option: "keepPensionInsurance", monthlyCost: 0 }), 90)).toBe(0);
  });

  it("multiplies the monthly cost by the months in the cost window; unknown stays unknown", () => {
    const w = coverWindows(plan({ option: "termLife", termEndAge: 58 }), 55);
    expect(coverTotalCost(300, w)).toBeCloseTo(300 * 12 * (3 - FREE), 6);
    expect(coverTotalCost(null, w)).toBeNull();
    expect(coverTotalCost(0, w)).toBe(0);
  });
});

describe("survivorsGapInMoney", () => {
  it("subtracts the balance-only pension from the insured pension", () => {
    const result = survivorsGapInMoney([
      { monthlySurvivorsPension: 4_000, balanceAtGapStart: 600_000, conversionFactor: 200 },
    ]);
    expect(result).toEqual({
      insuredMonthly: 4_000,
      balanceOnlyMonthly: 3_000,
      gapMonthly: 1_000,
      accountsWithoutFactor: 0,
    });
  });

  it("never goes below zero", () => {
    expect(
      survivorsGapInMoney([{ monthlySurvivorsPension: 2_000, balanceAtGapStart: 900_000, conversionFactor: 200 }])
        .gapMonthly,
    ).toBe(0);
  });

  it("counts an account without a factor as an upper bound and leaves its balance out", () => {
    const result = survivorsGapInMoney([
      { monthlySurvivorsPension: 4_000, balanceAtGapStart: 600_000, conversionFactor: 200 },
      { monthlySurvivorsPension: 1_000, balanceAtGapStart: 900_000, conversionFactor: null },
      { monthlySurvivorsPension: 500, balanceAtGapStart: 900_000, conversionFactor: 0 },
    ]);
    expect(result.insuredMonthly).toBe(5_500);
    expect(result.balanceOnlyMonthly).toBe(3_000);
    expect(result.gapMonthly).toBe(2_500);
    expect(result.accountsWithoutFactor).toBe(2);
  });

  it("ignores accounts that insure no survivors' pension", () => {
    const result = survivorsGapInMoney([
      { monthlySurvivorsPension: 0, balanceAtGapStart: 900_000, conversionFactor: 200 },
      { monthlySurvivorsPension: -3, balanceAtGapStart: 900_000, conversionFactor: 200 },
    ]);
    expect(result).toEqual({ insuredMonthly: 0, balanceOnlyMonthly: 0, gapMonthly: 0, accountsWithoutFactor: 0 });
  });
});

describe("analyseCover", () => {
  // A zero real rate keeps the projected balance equal to today's balance.
  const base = {
    age: 50,
    retirementAge: 55,
    investmentReturnPct: 0,
    inflationPct: 0,
    pensionBalances: [600_000],
    pensionAccountOverrides: [
      {
        ...cover({ monthlyRiskDeduction: 90, monthlySurvivorsSpousePension: 4_000 }),
        annuityParameters: {
          hasGuaranteedFactor: false,
          conversionFactor: 200,
          estimatedMonthlyAnnuity: null,
          annuityTaxType: null,
          guaranteedPaymentMonths: null,
        },
      },
    ],
  };

  it("uses 'none' when nothing is saved, and reports the gap in years and in money", () => {
    const result = analyseCover(buildTestProfile(base), "self");
    expect(result.saved).toBeNull();
    expect(result.plan.option).toBe("none");
    expect(result.retirementAge).toBe(55);
    expect(result.windows.gapYears).toBeCloseTo(5 - FREE, 10);
    expect(result.monthlyCost).toBe(0);
    expect(result.totalCost).toBe(0);
    expect(result.survivors).toMatchObject({ insuredMonthly: 4_000, balanceOnlyMonthly: 3_000, gapMonthly: 1_000 });
  });

  it("prices the pension insurance from the risk deduction on file", () => {
    const result = analyseCover(
      buildTestProfile({ ...base, coverPlan: plan({ option: "keepPensionInsurance" }) }),
      "self",
    );
    expect(result.saved?.option).toBe("keepPensionInsurance");
    expect(result.monthlyCost).toBe(90);
    expect(result.totalCost).toBeCloseTo(90 * 12 * (5 - FREE), 6);
    expect(result.windows.gapYears).toBe(0);
  });

  it("lets a given plan and retirement age replace the saved ones", () => {
    const profile = buildTestProfile({ ...base, coverPlan: plan({ option: "keepPensionInsurance" }) });
    const result = analyseCover(profile, "self", { plan: plan({ option: "none" }), retirementAge: 58 });
    expect(result.retirementAge).toBe(58);
    expect(result.plan.option).toBe("none");
    expect(result.windows.gapYears).toBeCloseTo(2 - FREE, 10);
  });

  it("projects the balance to the start of the gap, so a later start changes the estimate", () => {
    const profile = buildTestProfile({ ...base, investmentReturnPct: 5 });
    const result = analyseCover(profile, "self", { plan: plan({ option: "keepPensionInsurance", keepPayingAfterArrangement: false }) });
    // Real rate 5% for the 5 years to age 55 plus 2 years more to the end of the arrangement.
    const expectedBalance = 600_000 * Math.pow(1.05, 5 + 2);
    expect(result.survivors?.balanceOnlyMonthly).toBeCloseTo(expectedBalance / 200, 4);
    expect(result.survivors?.gapMonthly).toBe(0);
  });

  it("has no gap in money when no account states a survivors' pension", () => {
    const result = analyseCover(
      buildTestProfile({ ...base, pensionAccountOverrides: [cover({ monthlyRiskDeduction: 90 })] }),
      "self",
    );
    expect(result.survivors).toBeNull();
  });

  it("uses the spouse's own plan, age and accounts for the spouse", () => {
    const profile = buildTestProfile({
      age: 50,
      retirementAge: 55,
      maritalStatus: "married",
      investmentReturnPct: 0,
      inflationPct: 0,
      coverPlan: plan({ option: "none" }),
      spouse: { age: 48, retirementAge: 52, coverPlan: plan({ option: "termLife", termEndAge: 58, monthlyCost: 250 }) },
      pensionBalances: [600_000, 300_000],
      pensionAccountOverrides: [
        cover({ monthlySurvivorsSpousePension: 4_000 }),
        {
          ...cover({ monthlySurvivorsSpousePension: 3_000 }),
          owner: "spouse" as const,
          annuityParameters: {
            hasGuaranteedFactor: false,
            conversionFactor: 150,
            estimatedMonthlyAnnuity: null,
            annuityTaxType: null,
            guaranteedPaymentMonths: null,
          },
        },
      ],
    });
    const self = analyseCover(profile, "self");
    const spouse = analyseCover(profile, "spouse");
    expect(self.retirementAge).toBe(55);
    expect(spouse.retirementAge).toBe(52);
    expect(spouse.plan.option).toBe("termLife");
    expect(spouse.windows.coverEndAge).toBe(58);
    expect(spouse.monthlyCost).toBe(250);
    expect(spouse.survivors).toMatchObject({ insuredMonthly: 3_000, balanceOnlyMonthly: 2_000, gapMonthly: 1_000 });
    expect(self.survivors?.insuredMonthly).toBe(4_000);
    expect(self.survivors?.accountsWithoutFactor).toBe(1);
  });
});

describe("planForOption", () => {
  it("keeps the saved plan for its own option, with everything typed into it", () => {
    const saved = plan({ option: "termLife", monthlyCost: 300, termEndAge: 58, needUntilAge: 62 });
    expect(planForOption(saved, "termLife")).toBe(saved);
  });

  it("starts a fresh plan for another option and carries only the need-until age", () => {
    const saved = plan({ option: "termLife", monthlyCost: 300, termEndAge: 58, needUntilAge: 62 });
    expect(planForOption(saved, "keepPensionInsurance")).toEqual({
      ...createCoverPlan("keepPensionInsurance"),
      needUntilAge: 62,
    });
  });

  it("starts from a blank plan when nothing is saved", () => {
    expect(planForOption(null, "none")).toEqual(createCoverPlan("none"));
  });
});

describe("compareCoverOptions and findCoverNotices", () => {
  const account = {
    ...cover({ monthlyRiskDeduction: 90, monthlySurvivorsSpousePension: 4_000 }),
    annuityParameters: {
      hasGuaranteedFactor: false,
      conversionFactor: 200,
      estimatedMonthlyAnnuity: null,
      annuityTaxType: null,
      guaranteedPaymentMonths: null,
    },
  };
  const base = {
    age: 50,
    retirementAge: 55,
    investmentReturnPct: 0,
    inflationPct: 0,
    pensionBalances: [600_000],
    pensionAccountOverrides: [account],
  };

  it("lists the three options in order, each with its gap and cost, and marks the saved one", () => {
    const [comparison] = compareCoverOptions(buildTestProfile(base));
    expect(comparison.person).toBe("self");
    expect(comparison.retirementAge).toBe(55);
    expect(comparison.rows.map((row) => row.option)).toEqual(["none", "keepPensionInsurance", "termLife"]);
    expect(comparison.rows.map((row) => row.isSaved)).toEqual([false, false, false]);
    expect(comparison.rows[0].windows.gapYears).toBeCloseTo(5 - FREE, 10);
    expect(comparison.rows[0].survivors?.gapMonthly).toBe(1_000);
    expect(comparison.rows[1].windows.gapYears).toBe(0);
    expect(comparison.rows[1].monthlyCost).toBe(90);
    expect(comparison.rows[2].monthlyCost).toBeNull();
    expect(comparison.rows[2].totalCost).toBeNull();
  });

  it("marks the saved option and uses its own figures", () => {
    const saved = plan({ option: "termLife", monthlyCost: 300, termEndAge: 58 });
    const [comparison] = compareCoverOptions(buildTestProfile({ ...base, coverPlan: saved }));
    expect(comparison.rows.map((row) => row.isSaved)).toEqual([false, false, true]);
    expect(comparison.rows[2].monthlyCost).toBe(300);
    expect(comparison.rows[2].windows.gapYears).toBe(2);
    // A cost typed for the term policy is not the pension insurance's cost.
    expect(comparison.rows[1].monthlyCost).toBe(90);
  });

  it("uses the saved need-until age for every option", () => {
    const saved = plan({ option: "none", needUntilAge: 65 });
    const [comparison] = compareCoverOptions(buildTestProfile({ ...base, coverPlan: saved }));
    expect(comparison.rows.map((row) => row.windows.needEndAge)).toEqual([65, 65, 65]);
    expect(comparison.rows[0].windows.gapYears).toBeCloseTo(10 - FREE, 10);
    // Paying on after the arrangement keeps the pension insurance until the age it is needed until.
    expect(comparison.rows[1].windows.gapYears).toBe(0);
  });

  it("lists nobody when no cover is on file or the cover already lasts to the age it is needed until", () => {
    expect(compareCoverOptions(buildTestProfile({ age: 50, retirementAge: 55, pensionBalances: [600_000] }))).toEqual([]);
    expect(compareCoverOptions(buildTestProfile({ ...base, retirementAge: 62 }))).toEqual([]);
  });

  it("compares the spouse separately, from the spouse's own retirement age", () => {
    const profile = buildTestProfile({
      ...base,
      maritalStatus: "married",
      spouse: { age: 48, retirementAge: 52 },
      pensionBalances: [600_000, 300_000],
      pensionAccountOverrides: [account, { ...account, owner: "spouse" as const }],
    });
    const comparisons = compareCoverOptions(profile);
    expect(comparisons.map((c) => [c.person, c.retirementAge])).toEqual([
      ["self", 55],
      ["spouse", 52],
    ]);
  });

  it("notices only people with cover on file, no saved plan and a gap", () => {
    expect(findCoverNotices(buildTestProfile(base)).map((notice) => notice.person)).toEqual(["self"]);
    expect(findCoverNotices(buildTestProfile({ ...base, coverPlan: plan({ option: "none" }) }))).toEqual([]);
    expect(findCoverNotices(buildTestProfile({ ...base, retirementAge: 60 }))).toEqual([]);
    expect(findCoverNotices(buildTestProfile({ age: 50, retirementAge: 55, pensionBalances: [1] }))).toEqual([]);
  });
});
