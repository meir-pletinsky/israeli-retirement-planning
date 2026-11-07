import { describe, expect, it } from "vitest";

import { buildTestProfile } from "../test/domainFixtures";
import { estimateIncomeBreakdown, type IncomeBandKey } from "./incomeBreakdown";
import {
  buildIncomeComposition,
  type IncomeCompositionStage,
  type IncomeKind,
} from "./incomeComposition";
import { estimateNetIncome } from "./netIncome";
import { estimateRetirementIncome } from "./retirementIncome";

type Overrides = Parameters<typeof buildTestProfile>[0];

// Uncategorised test accounts are always accessible; pension products open only at 60.
const LOCKED_ACCOUNTS = [
  { productCategory: "comprehensivePension" as const },
  { productCategory: "comprehensivePension" as const },
];

const WITH_FACTOR = {
  productCategory: "comprehensivePension" as const,
  annuityParameters: {
    hasGuaranteedFactor: false,
    conversionFactor: 200,
    estimatedMonthlyAnnuity: null,
    annuityTaxType: null,
    guaranteedPaymentMonths: null,
  },
};

function plan(extra: Overrides = {}) {
  return buildTestProfile({
    age: 40,
    retirementAge: 67,
    gender: "male",
    monthlyGrossSalary: 20_000,
    investmentReturnPct: 5,
    inflationPct: 2,
    pensionBalances: [900_000, 300_000],
    retirementMonthlyExpenses: 9_000,
    ...extra,
  });
}

const compose = (profile: ReturnType<typeof plan>) => buildIncomeComposition(estimateIncomeBreakdown(profile));

const amount = (stage: IncomeCompositionStage, band: IncomeBandKey, kind: IncomeKind) =>
  stage.parts.find((part) => part.band === band && part.kind === kind)?.monthly ?? 0;

describe("buildIncomeComposition", () => {
  it("is empty when no income is estimated", () => {
    expect(buildIncomeComposition([])).toEqual([]);
    expect(compose(plan({ pensionBalances: [] }))).toEqual([]);
  });

  it("shows only withdrawals, in the retirement year, when the savings have no conversion factor", () => {
    const profile = plan();
    const stages = compose(profile);
    const income = estimateRetirementIncome(profile).monthlyIncomeTodayMoney;

    expect(stages).toHaveLength(1);
    expect(stages[0]).toMatchObject({ age: 67, reason: "retirement" });
    expect(stages[0].parts.every((part) => part.kind === "withdrawal")).toBe(true);
    expect(amount(stages[0], "pensionFund", "withdrawal")).toBeGreaterThan(0);
    expect(Math.abs(stages[0].total - income)).toBeLessThanOrEqual(1);
  });

  it("separates the withdrawals from savings held outside the pension accounts", () => {
    const [stage] = compose(plan({ pensionBalances: [], otherAssets: 1_000_000 }));
    expect(amount(stage, "investments", "withdrawal")).toBeGreaterThan(0);
    expect(amount(stage, "pensionFund", "withdrawal")).toBe(0);
    expect(amount(stage, "pensionFund", "payment")).toBe(0);
  });

  it("shows an account with a conversion factor as a lifelong payment, not a withdrawal", () => {
    const annuitised = compose(plan({ pensionAccountOverrides: [WITH_FACTOR, WITH_FACTOR] }))[0];
    const drawnDown = compose(plan({ pensionAccountOverrides: LOCKED_ACCOUNTS }))[0];

    expect(amount(annuitised, "pensionFund", "payment")).toBeGreaterThan(0);
    expect(amount(annuitised, "pensionFund", "withdrawal")).toBe(0);
    expect(amount(drawnDown, "pensionFund", "payment")).toBe(0);
    expect(amount(drawnDown, "pensionFund", "withdrawal")).toBeGreaterThan(0);
  });

  it("lists the payments before the withdrawals", () => {
    const [stage] = compose(
      plan({
        retirementAge: 67,
        otherAssets: 500_000,
        pensionAccountOverrides: [WITH_FACTOR, WITH_FACTOR],
        bituachLeumi: { includeInProjection: true, monthlyPensionOverride: 3_000 },
      }),
    );
    const kinds = stage.parts.map((part) => part.kind);
    expect(kinds).toContain("payment");
    expect(kinds).toContain("withdrawal");
    expect(kinds.indexOf("withdrawal")).toBeGreaterThan(kinds.lastIndexOf("payment"));
  });

  it("adds a stage once the state pension starts after the user retires", () => {
    const stages = compose(
      plan({
        retirementAge: 60,
        otherAssets: 500_000,
        bituachLeumi: { includeInProjection: true, monthlyPensionOverride: 3_000 },
      }),
    );

    expect(stages.map((stage) => [stage.age, stage.reason])).toEqual([
      [60, "retirement"],
      [67, "payments"],
    ]);
    expect(amount(stages[0], "bituachLeumi", "payment")).toBe(0);
    expect(amount(stages[1], "bituachLeumi", "payment")).toBe(3_000);
    expect(Math.abs(stages[0].total - stages[1].total)).toBeLessThanOrEqual(2);
  });

  it("adds a stage when a pension annuity starts after the user retires, with no state pension", () => {
    const stages = compose(
      plan({
        retirementAge: 55,
        otherAssets: 600_000,
        pensionAccountOverrides: [WITH_FACTOR, WITH_FACTOR],
      }),
    );

    expect(stages.map((stage) => [stage.age, stage.reason])).toEqual([
      [55, "retirement"],
      [60, "payments"],
    ]);
    expect(amount(stages[0], "pensionFund", "payment")).toBe(0);
    expect(amount(stages[1], "pensionFund", "payment")).toBeGreaterThan(0);
  });

  it("has one stage when the state pension starts the day the user retires", () => {
    const stages = compose(
      plan({ bituachLeumi: { includeInProjection: true, monthlyPensionOverride: 3_000 } }),
    );
    expect(stages).toHaveLength(1);
    expect(amount(stages[0], "bituachLeumi", "payment")).toBe(3_000);
  });

  it("has one stage and no state pension when it is left out of the projection", () => {
    const stages = compose(plan({ retirementAge: 60, otherAssets: 500_000 }));
    expect(stages).toHaveLength(1);
    expect(stages[0].parts.some((part) => part.band === "bituachLeumi")).toBe(false);
  });

  it("totals the gross income the Dashboard's net income estimate starts from", () => {
    const profile = plan({
      retirementAge: 60,
      otherAssets: 500_000,
      bituachLeumi: { includeInProjection: true, monthlyPensionOverride: 3_000 },
    });
    const years = estimateNetIncome(profile).years;
    for (const stage of compose(profile)) {
      const year = years.find((candidate) => candidate.age === stage.age);
      expect(year).toBeDefined();
      expect(Math.abs(stage.total - year!.grossMonthly)).toBeLessThanOrEqual(2);
    }
  });

  it("keeps each stage's total equal to the sum of its parts", () => {
    for (const stage of compose(plan({ retirementAge: 55, otherAssets: 600_000, pensionAccountOverrides: LOCKED_ACCOUNTS }))) {
      expect(stage.total).toBe(stage.parts.reduce((sum, part) => sum + part.monthly, 0));
    }
  });
});
