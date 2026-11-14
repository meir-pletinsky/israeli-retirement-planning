import { describe, expect, it } from "vitest";

import { buildTestProfile } from "../test/domainFixtures";
import type { ProfileData } from "../types";
import { calculateFundingGap } from "./fundingGap";
import { buildHousehold } from "./household";
import {
  ageGridColumns,
  applyWhatIf,
  baselineWhatIf,
  buildAgeGrid,
  canChoosePensionStart,
  evaluateWhatIf,
  whatIfMargin,
  whatIfNotes,
  whatIfRanges,
  whatIfSensitivity,
  whatIfValues,
} from "./whatIf";

const CONTRIBUTING = {
  accountStatus: "activeContributing" as const,
  contributions: { employeeRatePercent: 6, employerRatePercent: 6.5, severanceRatePercent: 6 },
};

const single = buildTestProfile({
  age: 55,
  retirementAge: 65,
  monthlyGrossSalary: 20_000,
  pensionBalances: [1_500_000],
  pensionAccountOverrides: [CONTRIBUTING],
  retirementMonthlyExpenses: 9_000,
  investmentReturnPct: 6,
  inflationPct: 2.5,
});

const couple = buildTestProfile({
  age: 55,
  retirementAge: 65,
  monthlyGrossSalary: 20_000,
  pensionBalances: [1_500_000, 800_000],
  pensionAccountOverrides: [CONTRIBUTING, { owner: "spouse", ...CONTRIBUTING }],
  otherAssets: 400_000,
  equity: [{ quantity: 1_000, priceUSD: 100, unrealizedCapitalGainUSD: 40_000, capitalGainsTaxRatePercent: 25 }],
  usdToIlsRate: { rate: 3.6 },
  retirementMonthlyExpenses: 14_000,
  maritalStatus: "married",
  spouse: { age: 52, retirementAge: 63, monthlyGrossSalary: 12_000 },
});

const FACTOR_200 = {
  hasGuaranteedFactor: true,
  conversionFactor: 200,
  estimatedMonthlyAnnuity: null,
  annuityTaxType: null,
  guaranteedPaymentMonths: null,
};

const annuitant = buildTestProfile({
  age: 55,
  retirementAge: 62,
  monthlyGrossSalary: 20_000,
  pensionBalances: [1_500_000, 800_000],
  pensionAccountOverrides: [
    { ...CONTRIBUTING, productCategory: "comprehensivePension", annuityParameters: FACTOR_200 },
    { ...CONTRIBUTING, productCategory: "managersInsurance", owner: "spouse", annuityParameters: FACTOR_200 },
  ],
  retirementMonthlyExpenses: 12_000,
  investmentReturnPct: 6,
  inflationPct: 2.5,
  maritalStatus: "married",
  spouse: { age: 52, retirementAge: 63, monthlyGrossSalary: 12_000 },
});

describe("applyWhatIf", () => {
  it("returns the saved profile itself when nothing is changed", () => {
    expect(applyWhatIf(single, baselineWhatIf(single))).toBe(single);
  });

  it("never changes the saved profile", () => {
    const before = JSON.stringify(couple);
    applyWhatIf(couple, {
      ...baselineWhatIf(couple),
      retirementAge: 60,
      spouseRetirementAge: 60,
      monthlySpending: 10_000,
      sharesChangePct: -30,
      dollarChangePct: -10,
    });
    expect(JSON.stringify(couple)).toBe(before);
  });

  it("changes the ages, the assumptions and the spending", () => {
    const derived = applyWhatIf(couple, {
      ...baselineWhatIf(couple),
      retirementAge: 62,
      spouseRetirementAge: 60,
      investmentReturnPct: 7,
      inflationPct: 3,
      monthlySpending: 11_000,
      planningHorizonAge: 95,
    });
    expect(derived.personal.retirementAge).toBe(62);
    expect(derived.spouse.retirementAge).toBe(60);
    expect(derived.assumptions).toMatchObject({ investmentReturnPct: 7, inflationPct: 3, planningHorizonAge: 95 });
    expect(derived.expenses.retirementMonthly).toBe(11_000);
  });

  it("ignores a spouse age when the plan covers one person", () => {
    const derived = applyWhatIf(single, { ...baselineWhatIf(single), spouseRetirementAge: 60, retirementAge: 63 });
    expect(derived.spouse).toBe(single.spouse);
  });

  it("scales an itemised budget and keeps its essential and discretionary split", () => {
    const itemised = buildTestProfile({
      age: 55,
      retirementAge: 65,
      pensionBalances: [1_500_000],
      expenseItems: [
        { name: "Rent", amount: 6_000, necessity: "essential" },
        { name: "Travel", amount: 2_000, necessity: "discretionary" },
      ],
    });
    const derived = applyWhatIf(itemised, { ...baselineWhatIf(itemised), monthlySpending: 12_000 });
    expect(derived.expenses.mode).toBe("detailed");
    expect(derived.expenses.items.map((item) => item.amount)).toEqual([9_000, 3_000]);
  });

  it("moves share prices and the dollar rate", () => {
    const derived = applyWhatIf(couple, { ...baselineWhatIf(couple), sharesChangePct: -20, dollarChangePct: 10 });
    expect(derived.equity.holdings[0].currentMarketPriceUSD).toBeCloseTo(80);
    expect(derived.equity.usdToIlsRate).toBeCloseTo(3.96);
  });

  it("saves a pension start later than the earliest age, and null when it follows retirement", () => {
    const base = baselineWhatIf(annuitant);
    expect(base.pensionStartAge).toBeNull();
    const later = applyWhatIf(annuitant, { ...base, pensionStartAge: 66, spousePensionStartAge: 68 });
    expect(later.personal.pensionStartAge).toBe(66);
    expect(later.spouse.pensionStartAge).toBe(68);
    const following = applyWhatIf(annuitant, { ...base, retirementAge: 66, pensionStartAge: 66, spousePensionStartAge: 60 });
    expect(following.personal.pensionStartAge).toBeNull();
    expect(following.spouse.pensionStartAge).toBeNull();
  });

  it("ignores a spouse pension start when the plan covers one person", () => {
    const derived = applyWhatIf(single, { ...baselineWhatIf(single), spousePensionStartAge: 68, retirementAge: 63 });
    expect(derived.spouse).toBe(single.spouse);
  });

  it("starts the annuity later and pays a larger monthly amount from then", () => {
    const annuityOf = (profile: ProfileData) =>
      buildHousehold(profile, { selfAge: 62, spouseAge: 63 }).members[0].sources.find((s) => s.annuity)!.annuity!;
    const early = annuityOf(annuitant);
    const late = annuityOf(applyWhatIf(annuitant, { ...baselineWhatIf(annuitant), pensionStartAge: 67 }));
    expect(early.startAge).toBe(62);
    expect(late.startAge).toBe(67);
    expect(late.monthly).toBeGreaterThan(early.monthly);
  });
});

describe("whatIfRanges", () => {
  it("keeps the saved value on a step, inside the limits", () => {
    const ranges = whatIfRanges(couple);
    expect(ranges.retirementAge).toEqual({ min: 55, max: 75, step: 1 });
    expect(ranges.spouseRetirementAge.min).toBe(53);
    expect(ranges.monthlySpending.min).toBe(7_000);
    expect(ranges.monthlySpending.max).toBe(24_500);
    const odd = buildTestProfile({ age: 40, retirementAge: 50, investmentReturnPct: 4.3, inflationPct: 7.9 });
    expect(whatIfRanges(odd).investmentReturnPct.min).toBe(0.3);
    expect(whatIfRanges(odd).inflationPct.max).toBe(7.9);
    expect(whatIfRanges(odd).retirementAge.min).toBe(50);
  });

  it("never lets the retirement age fall below today's age or the app's floor", () => {
    expect(whatIfRanges(buildTestProfile({ age: 62, retirementAge: 64 })).retirementAge.min).toBe(62);
    expect(whatIfRanges(buildTestProfile({ age: 35, retirementAge: 55 })).retirementAge.min).toBe(50);
  });

  it("starts the pension start range at the earliest age the draft's retirement allows", () => {
    const base = baselineWhatIf(annuitant);
    expect(whatIfRanges(annuitant, base).pensionStartAge).toEqual({ min: 62, max: 70, step: 1 });
    expect(whatIfRanges(annuitant, { ...base, retirementAge: 58 }).pensionStartAge).toEqual({ min: 60, max: 70, step: 1 });
    expect(whatIfRanges(annuitant, { ...base, retirementAge: 72 }).pensionStartAge).toEqual({ min: 72, max: 72, step: 1 });
    expect(whatIfRanges(annuitant, { ...base, spouseRetirementAge: 66 }).spousePensionStartAge.min).toBe(66);
  });
});

describe("whatIfNotes", () => {
  it("explains that pension funds are locked before 60", () => {
    const notes = whatIfNotes(single, { ...baselineWhatIf(single), retirementAge: 58 });
    expect(notes.map((note) => note.key)).toContain("pensionLocked");
    expect(whatIfNotes(single, baselineWhatIf(single)).map((note) => note.key)).not.toContain("pensionLocked");
  });

  it("explains a delayed pension only for someone whose annuity can be delayed", () => {
    const delayed = { ...baselineWhatIf(annuitant), pensionStartAge: 67 };
    expect(whatIfNotes(annuitant, baselineWhatIf(annuitant)).map((note) => note.key)).not.toContain("pensionDelayed");
    expect(whatIfNotes(annuitant, delayed)).toContainEqual({ key: "pensionDelayed", slider: "pensionStartAge", age: 67 });
    expect(whatIfNotes(single, { ...baselineWhatIf(single), pensionStartAge: 67 }).map((note) => note.key)).not.toContain(
      "pensionDelayed",
    );
  });
});

describe("canChoosePensionStart", () => {
  it("needs an annuity that is modelled and has not started paying", () => {
    expect(canChoosePensionStart(annuitant, "self")).toBe(true);
    expect(canChoosePensionStart(annuitant, "spouse")).toBe(true);
    expect(canChoosePensionStart(single, "self")).toBe(false);
    const paying = buildTestProfile({
      age: 55,
      retirementAge: 62,
      pensionBalances: [1_000_000],
      pensionAccountOverrides: [
        { productCategory: "comprehensivePension", accountStatus: "payingAnnuity", annuityParameters: FACTOR_200 },
      ],
    });
    expect(canChoosePensionStart(paying, "self")).toBe(false);
  });
});

describe("evaluateWhatIf", () => {
  it("agrees with the plan's own funding gap at the baseline", () => {
    const outcome = evaluateWhatIf(single);
    const gap = calculateFundingGap(single, "standard");
    expect(outcome.netMonthlyIncome).toBe(gap.estimatedMonthlyIncome);
    expect(outcome.monthlyGap).toBe(gap.monthlyGap);
  });

  it("shows more sustainable income when retirement is put off", () => {
    const later = evaluateWhatIf(applyWhatIf(single, { ...baselineWhatIf(single), retirementAge: 70 }));
    expect(later.netMonthlyIncome).toBeGreaterThan(evaluateWhatIf(single).netMonthlyIncome);
  });

  it("has no gap or planned cash flow without planned spending", () => {
    const none = evaluateWhatIf(buildTestProfile({ age: 55, retirementAge: 65, pensionBalances: [1_500_000] }));
    expect(none.monthlyGap).toBeNull();
    expect(none.cashFlow).toBeNull();
  });
});

describe("whatIfSensitivity", () => {
  const values = baselineWhatIf(couple);
  const rows = whatIfSensitivity(couple, values);

  it("covers the couple's own parameters, largest swing first", () => {
    expect(rows.map((row) => row.key)).toEqual(
      expect.arrayContaining([
        "retirementAge",
        "spouseRetirementAge",
        "investmentReturnPct",
        "inflationPct",
        "monthlySpending",
        "sharesChangePct",
        "dollarChangePct",
      ]),
    );
    expect(rows.map((row) => row.swing)).toEqual([...rows.map((row) => row.swing)].sort((a, b) => b - a));
  });

  it("moves the margin the way the assumption points", () => {
    const byKey = (key: string) => rows.find((row) => row.key === key)!;
    expect(byKey("retirementAge").up!.delta).toBeGreaterThan(0);
    expect(byKey("investmentReturnPct").down!.delta).toBeLessThan(0);
    expect(byKey("monthlySpending").up!.delta).toBeLessThan(0);
    expect(byKey("monthlySpending").up!.value).toBe(15_400);
  });

  it("leaves out the spouse and the shares for a single person without holdings", () => {
    const keys = whatIfSensitivity(single, baselineWhatIf(single)).map((row) => row.key);
    expect(keys).not.toContain("spouseRetirementAge");
    expect(keys).not.toContain("sharesChangePct");
  });

  it("tests the pension start only for someone with an annuity that can be delayed", () => {
    const keys = (profile: ProfileData) => whatIfSensitivity(profile, baselineWhatIf(profile)).map((row) => row.key);
    expect(keys(annuitant)).toEqual(expect.arrayContaining(["pensionStartAge", "spousePensionStartAge"]));
    expect(keys(single)).not.toContain("pensionStartAge");
    const row = whatIfSensitivity(annuitant, baselineWhatIf(annuitant)).find((r) => r.key === "pensionStartAge")!;
    expect(row.down).toBeNull();
    expect(row.up).toMatchObject({ value: 64 });
  });

  it("does not test past a slider's limit", () => {
    const { max } = whatIfRanges(single).retirementAge;
    const nearMax = whatIfSensitivity(single, whatIfValues(single, { retirementAge: max - 1 }));
    expect(nearMax.find((r) => r.key === "retirementAge")!.up).toMatchObject({ value: max });
    const atMax = whatIfSensitivity(single, whatIfValues(single, { retirementAge: max }));
    expect(atMax.find((r) => r.key === "retirementAge")!.up).toBeNull();
  });
});

describe("buildAgeGrid", () => {
  it("has a row per retirement age and a column per value, centred on the draft", () => {
    const grid = buildAgeGrid(single, baselineWhatIf(single), "investmentReturnPct");
    expect(grid.rows).toEqual([59, 61, 63, 65, 67, 69, 71]);
    expect(grid.columns).toEqual([4, 5, 6, 7, 8]);
    expect(grid.cells).toHaveLength(7);
    expect(grid.cells[0]).toHaveLength(5);
  });

  it("agrees with the margin of the draft at its own cell", () => {
    const values = baselineWhatIf(single);
    const grid = buildAgeGrid(single, values, "investmentReturnPct");
    expect(grid.cells[grid.rows.indexOf(65)][grid.columns.indexOf(6)]).toBe(whatIfMargin(single));
  });

  it("offers the spouse's age only to a couple, and spending only with a budget", () => {
    expect(ageGridColumns(single)).toEqual(["investmentReturnPct", "monthlySpending"]);
    expect(ageGridColumns(couple)).toContain("spouseRetirementAge");
    expect(ageGridColumns(buildTestProfile({ age: 55, retirementAge: 65 }))).toEqual(["investmentReturnPct"]);
  });

  it("keeps only the retirement ages the slider allows", () => {
    const grid = buildAgeGrid(single, whatIfValues(single, { retirementAge: 57 }), "investmentReturnPct");
    expect(Math.min(...grid.rows)).toBeGreaterThanOrEqual(55);
  });
});
