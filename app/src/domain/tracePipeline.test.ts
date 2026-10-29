import { describe, expect, it } from "vitest";

import { buildTraceCouple } from "../test/traceFixtures";
import { buildTestProfile } from "../test/domainFixtures";
import { buildHousehold, resolveRetirementTiming } from "./household";
import { calculateFundingGapForTiming } from "./fundingGap";
import { estimateRetirementIncomeForTiming } from "./retirementIncome";
import { runTraced } from "./trace";
import { checkTrace } from "./traceCheck";
import { constantsSnapshot } from "./traceConstants";

const EVALUATED_AT = new Date("2026-10-30T12:00:00Z");

describe("calculation trace of the income pipeline", () => {
  const profile = buildTraceCouple();
  const timing = resolveRetirementTiming(profile, "standard");

  it("does not change the result", () => {
    const untraced = estimateRetirementIncomeForTiming(profile, timing);
    const { result } = runTraced(() => estimateRetirementIncomeForTiming(profile, timing), {
      evaluatedAt: new Date(),
    });
    expect(result).toEqual(untraced);
  });

  it("records the expected steps and tables", () => {
    const { log } = runTraced(() => estimateRetirementIncomeForTiming(profile, timing), {
      evaluatedAt: EVALUATED_AT,
    });
    const ids = new Set(log.steps.map((step) => step.id));
    for (const id of [
      "self/currentAge",
      "spouse/currentAge",
      "self/bituachLeumi/monthlyPension",
      "spouse/bituachLeumi/monthlyPension",
      "retirementYears",
      "horizonYears",
      "realRate",
      "income/monthsInRetirement",
      "income/monthlyRate",
      "income/self/catchUpGrowth",
      "income/spouse/catchUpGrowth",
      "income/monthlyIncome",
      "income/monthlyIncomeTodayMoney",
    ]) {
      expect(ids, id).toContain(id);
    }
    const tables = log.tables.map((table) => table.id);
    expect(tables).toEqual(expect.arrayContaining(["members", "income/streams", "income/spendable", "income/solver"]));
    expect(log.steps.filter((step) => step.id.includes("#"))).toEqual([]);
  });

  it("is reproducible for the same evaluation time", () => {
    const run = () =>
      runTraced(() => estimateRetirementIncomeForTiming(profile, timing), { evaluatedAt: EVALUATED_AT })
        .log;
    expect(run()).toEqual(run());
  });

  it("checks out against its own inputs and the constants", () => {
    const { log } = runTraced(() => estimateRetirementIncomeForTiming(profile, timing), {
      evaluatedAt: EVALUATED_AT,
    });
    const report = checkTrace(log, { profile, constants: constantsSnapshot() });
    expect(report.issues).toEqual([]);
    expect(report.exprChecked).toBeGreaterThan(40);
    expect(report.provenanceChecked).toBeGreaterThan(100);
  });

  it("ties the displayed income to the solver", () => {
    const { result, log } = runTraced(() => estimateRetirementIncomeForTiming(profile, timing), {
      evaluatedAt: EVALUATED_AT,
    });
    const step = log.steps.find((entry) => entry.id === "income/monthlyIncomeTodayMoney");
    expect(step?.output).toBe(result.monthlyIncomeTodayMoney);
  });

  it("lets the household build alone", () => {
    const { result, log } = runTraced(() => buildHousehold(profile, timing), {
      evaluatedAt: EVALUATED_AT,
    });
    expect(result.members).toHaveLength(2);
    expect(log.steps.some((step) => step.id === "baseYear" && step.output === 2026)).toBe(true);
  });

  describe("when retiring before the pension unlocks", () => {
    const early = buildTestProfile({
      age: 50,
      gender: "male",
      retirementAge: 55,
      monthlyGrossSalary: 25_000,
      investmentReturnPct: 5,
      inflationPct: 2,
      pensionBalances: [900_000],
      pensionAccountOverrides: [
        {
          productCategory: "comprehensivePension",
          accountStatus: "paidUpFrozen",
          annuityParameters: {
            hasGuaranteedFactor: false,
            conversionFactor: 200,
            estimatedMonthlyAnnuity: null,
            annuityTaxType: null,
            guaranteedPaymentMonths: null,
          },
        },
      ],
      otherAssets: 150_000,
    });
    const earlyTiming = resolveRetirementTiming(early, "standard");

    it("records the bridge and still checks out", () => {
      const untraced = estimateRetirementIncomeForTiming(early, earlyTiming);
      const { result, log } = runTraced(() => estimateRetirementIncomeForTiming(early, earlyTiming), {
        evaluatedAt: EVALUATED_AT,
      });
      expect(result).toEqual(untraced);
      expect(result.access.bridgeLimited).toBe(true);
      const ids = new Set(log.steps.map((step) => step.id));
      expect(ids).toContain("income/limitingAge");
      const solver = log.tables.find((table) => table.id === "income/solver");
      expect(solver?.rows.length).toBeGreaterThanOrEqual(2);
      const report = checkTrace(log, { profile: early, constants: constantsSnapshot() });
      expect(report.issues).toEqual([]);
    });
  });
});

describe("calculation trace of the funding gap", () => {
  const couple = buildTraceCouple();
  const coupleTiming = resolveRetirementTiming(couple, "standard");
  const early = buildTestProfile({
    age: 50,
    gender: "male",
    retirementAge: 55,
    monthlyGrossSalary: 25_000,
    investmentReturnPct: 5,
    inflationPct: 2,
    pensionBalances: [900_000],
    pensionAccountOverrides: [{ productCategory: "comprehensivePension", accountStatus: "paidUpFrozen" }],
    otherAssets: 150_000,
    retirementMonthlyExpenses: 12_000,
  });
  const earlyTiming = resolveRetirementTiming(early, "standard");

  const cases = [
    { name: "a couple", profile: couple, timing: coupleTiming },
    { name: "a single person retiring early", profile: early, timing: earlyTiming },
  ];

  for (const { name, profile, timing } of cases) {
    describe(name, () => {
      const untraced = calculateFundingGapForTiming(profile, timing);
      const traced = runTraced(() => calculateFundingGapForTiming(profile, timing), {
        evaluatedAt: EVALUATED_AT,
      });

      it("gives the same result with tracing on", () => {
        expect(traced.result).toEqual(untraced);
      });

      it("checks out against its own inputs and the constants", () => {
        const report = checkTrace(traced.log, { profile, constants: constantsSnapshot() });
        expect(report.issues).toEqual([]);
        expect(report.exprChecked).toBeGreaterThan(50);
        expect(report.provenanceChecked).toBeGreaterThan(100);
      });

      it("catches a tampered tax step and a tampered link", () => {
        const steps = traced.log.steps.map((step) =>
          step.id === "net/binding/self/tax/incomeTax"
            ? { ...step, output: Number(step.output) + 1 }
            : step.id === "net/binding/self/tax/totalTax"
              ? {
                  ...step,
                  inputs: {
                    ...step.inputs,
                    incomeTax: { ...step.inputs.incomeTax, value: Number(step.inputs.incomeTax.value) + 5 },
                  },
                }
              : step,
        );
        const report = checkTrace({ ...traced.log, steps }, { profile, constants: constantsSnapshot() });
        const kinds = report.issues.map((issue) => `${issue.stepId}:${issue.kind}`);
        expect(kinds).toContain("net/binding/self/tax/incomeTax:expr-mismatch");
        expect(kinds).toContain("net/binding/self/tax/totalTax:step-mismatch");
      });

      it("records every stage once, with no repeated ids", () => {
        const ids = new Set(traced.log.steps.map((step) => step.id));
        expect(traced.log.steps.filter((step) => step.id.includes("#"))).toEqual([]);
        expect(ids.size).toBe(traced.log.steps.length);
        for (const id of [
          "income/monthlyIncomeTodayMoney",
          "drawdown/annualSpending",
          "drawdown/rows",
          "net/lowestNetMonthly",
          "net/bindingYear",
          "net/binding/taxYear",
          "net/binding/streamsTotal",
          "net/binding/fromSavings",
          "net/binding/grossMonthly",
          "net/binding/taxMonthly",
          "net/binding/self/tax/totalTax",
          "net/grossMonthlyIncome",
          "net/taxMonthly",
          "net/netMonthlyIncome",
          "net/effectiveTaxRate",
          "fundingGap/monthlyGap",
          "fundingGap/status",
        ]) {
          expect(ids, id).toContain(id);
        }
        const tables = traced.log.tables.map((table) => table.id);
        expect(tables).toEqual(
          expect.arrayContaining(["drawdown/sources", "drawdown/years", "net/years", "net/binding/holdings"]),
        );
      });

      it("ties each displayed figure to its step", () => {
        const output = (id: string) => traced.log.steps.find((step) => step.id === id)?.output;
        expect(output("net/netMonthlyIncome")).toBe(traced.result.estimatedMonthlyIncome);
        expect(output("net/grossMonthlyIncome")).toBe(traced.result.grossMonthlyIncome);
        expect(output("net/taxMonthly")).toBe(traced.result.estimatedMonthlyTax);
        expect(output("fundingGap/monthlyGap")).toBe(traced.result.monthlyGap);
        expect(output("fundingGap/status")).toBe(traced.result.status);
      });

      it("has a year row for every retirement year, as many as the drawdown has", () => {
        const years = traced.log.tables.find((table) => table.id === "net/years");
        const drawdown = traced.log.tables.find((table) => table.id === "drawdown/years");
        expect(years?.rows.length).toBeGreaterThan(10);
        expect(drawdown?.rows.length).toBeGreaterThan(years?.rows.length ?? 0);
      });
    });
  }

  it("replays the binding year for a spouse as well", () => {
    const { log } = runTraced(() => calculateFundingGapForTiming(couple, coupleTiming), {
      evaluatedAt: EVALUATED_AT,
    });
    const ids = new Set(log.steps.map((step) => step.id));
    expect(ids).toContain("net/binding/spouse/tax/totalTax");
    expect(ids).toContain("net/binding/spouse/incomeParts/pension");
  });
});
