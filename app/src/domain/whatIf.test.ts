import { describe, expect, it } from "vitest";

import { buildTestProfile } from "../test/domainFixtures";
import { DEFAULT_WITHDRAWAL_MIX, WITHDRAWAL_MIX_KEYS } from "../types";
import type { ProfileData, WithdrawalMix } from "../types";
import { calculateFundingGap } from "./fundingGap";
import { buildHousehold } from "./household";
import {
  ageGridColumns,
  applyWhatIf,
  availableWithdrawalKinds,
  baselineWhatIf,
  buildAgeGrid,
  canChoosePensionStart,
  effectiveWithdrawalMix,
  evaluateWhatIf,
  rebalanceWithdrawalMix,
  sameWhatIfValue,
  whatIfMargin,
  whatIfNotes,
  whatIfPlanPatch,
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

  it("changes how far income may exceed spending without moving any income", () => {
    const base = baselineWhatIf(couple);
    expect(base.incomeCapPct).toBe(5);
    const derived = applyWhatIf(couple, { ...base, incomeCapPct: 12 });
    expect(derived.assumptions.incomeCapPct).toBe(12);
    expect(evaluateWhatIf(derived).netMonthlyIncome).toBe(evaluateWhatIf(couple).netMonthlyIncome);
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

  it("carries the withdrawal order and mix into the household and the saved plan", () => {
    const base = baselineWhatIf(couple);
    expect(base.withdrawalStrategy).toBe("proRata");
    expect(base.withdrawalMix).toEqual(DEFAULT_WITHDRAWAL_MIX);
    const values = { ...base, withdrawalStrategy: "custom" as const, withdrawalMix: { studyFund: 50, shares: 30, deposits: 20 } };
    const derived = applyWhatIf(couple, values);
    expect(derived.assumptions).toMatchObject({ withdrawalStrategy: "custom", withdrawalMix: values.withdrawalMix });
    expect(buildHousehold(derived, { selfAge: 62, spouseAge: 60 }).withdrawalMix).toEqual(values.withdrawalMix);
    expect(whatIfPlanPatch(couple, values).assumptions).toMatchObject({ withdrawalStrategy: "custom" });
  });

  it("treats a mix with the same parts as unchanged", () => {
    const base = baselineWhatIf(single);
    expect(applyWhatIf(single, { ...base, withdrawalMix: { ...base.withdrawalMix } })).toBe(single);
    expect(sameWhatIfValue("withdrawalMix", base, { ...base, withdrawalMix: { studyFund: 40, shares: 30, deposits: 30 } })).toBe(false);
    expect(sameWhatIfValue("withdrawalStrategy", base, { ...base, withdrawalStrategy: "custom" })).toBe(false);
  });
});

describe("rebalanceWithdrawalMix", () => {
  const sum = (mix: WithdrawalMix) => WITHDRAWAL_MIX_KEYS.reduce((total, key) => total + mix[key], 0);

  it("keeps the parts adding up to 100 and the moved one where it was put", () => {
    for (const key of WITHDRAWAL_MIX_KEYS) {
      for (const percent of [0, 1, 33, 50, 77, 100]) {
        const next = rebalanceWithdrawalMix({ studyFund: 20, esop: 10, shares: 40, deposits: 30 }, key, percent);
        expect(sum(next)).toBe(100);
        expect(next[key]).toBe(percent);
      }
    }
  });

  it("shares what is left between the others in proportion to what they had", () => {
    expect(
      rebalanceWithdrawalMix({ studyFund: 20, esop: 0, shares: 60, deposits: 20 }, "studyFund", 40),
    ).toEqual({ studyFund: 40, esop: 0, shares: 45, deposits: 15 });
  });

  it("splits what is left equally when the others had nothing", () => {
    expect(
      rebalanceWithdrawalMix({ studyFund: 100, esop: 0, shares: 0, deposits: 0 }, "studyFund", 60),
    ).toEqual({ studyFund: 60, esop: 14, shares: 13, deposits: 13 });
  });

  it("keeps a value outside 0 to 100 inside it", () => {
    expect(rebalanceWithdrawalMix(DEFAULT_WITHDRAWAL_MIX, "shares", 140).shares).toBe(100);
    expect(rebalanceWithdrawalMix(DEFAULT_WITHDRAWAL_MIX, "shares", -5).shares).toBe(0);
  });

  it("moves only the kinds on offer and zeroes the rest", () => {
    const kinds = ["studyFund", "deposits"] as const;
    const next = rebalanceWithdrawalMix({ studyFund: 34, esop: 0, shares: 33, deposits: 33 }, "studyFund", 70, kinds);
    expect(next).toEqual({ studyFund: 70, esop: 0, shares: 0, deposits: 30 });
    expect(rebalanceWithdrawalMix(next, "deposits", 10, kinds)).toEqual({ studyFund: 90, esop: 0, shares: 0, deposits: 10 });
  });
});

describe("effectiveWithdrawalMix", () => {
  it("zeroes the kinds the plan lacks and shares the 100 among the rest by their weights", () => {
    expect(
      effectiveWithdrawalMix({ studyFund: 34, esop: 0, shares: 33, deposits: 33 }, ["studyFund", "deposits"]),
    ).toEqual({ studyFund: 51, esop: 0, shares: 0, deposits: 49 });
  });

  it("splits equally among held kinds that were given nothing", () => {
    expect(
      effectiveWithdrawalMix({ studyFund: 34, esop: 0, shares: 33, deposits: 33 }, ["esop"]),
    ).toEqual({ studyFund: 0, esop: 100, shares: 0, deposits: 0 });
    expect(
      effectiveWithdrawalMix({ studyFund: 100, esop: 0, shares: 0, deposits: 0 }, ["esop", "shares"]),
    ).toEqual({ studyFund: 0, esop: 50, shares: 50, deposits: 0 });
  });
});

describe("availableWithdrawalKinds", () => {
  it("lists the kinds of savings the plan holds, in the mix's order", () => {
    const everything = buildTestProfile({
      age: 55,
      retirementAge: 60,
      pensionBalances: [500_000, 400_000],
      pensionAccountOverrides: [{ productCategory: "studyFund" }, { productCategory: "comprehensivePension" }],
      otherAssets: 100_000,
      bankDeposits: [{ amount: 100_000 }],
      equity: [{ quantity: 1_000, priceUSD: 100, employerGrant: {} }],
      usdToIlsRate: { rate: 3.6 },
    });
    expect(availableWithdrawalKinds(everything)).toEqual(["studyFund", "esop", "shares", "deposits"]);
  });

  it("leaves out what the plan does not have", () => {
    const lean = buildTestProfile({
      age: 55,
      retirementAge: 60,
      pensionBalances: [500_000],
      pensionAccountOverrides: [{ productCategory: "studyFund" }],
      bankDeposits: [{ amount: 100_000 }],
    });
    expect(availableWithdrawalKinds(lean)).toEqual(["studyFund", "deposits"]);
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

  it("offers the income allowance from 0 to at least 25%, and wider when the saved one is larger", () => {
    expect(whatIfRanges(couple).incomeCapPct).toEqual({ min: 0, max: 25, step: 1 });
    const wide = { ...couple, assumptions: { ...couple.assumptions, incomeCapPct: 40 } };
    expect(whatIfRanges(wide).incomeCapPct.max).toBe(40);
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

  it("does not test the income allowance, which moves no income", () => {
    expect(rows.map((row) => row.key)).not.toContain("incomeCapPct");
  });

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
