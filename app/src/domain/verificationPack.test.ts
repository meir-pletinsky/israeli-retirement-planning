import { describe, expect, it } from "vitest";

import { buildTestProfile } from "../test/domainFixtures";
import { buildTraceCouple } from "../test/traceFixtures";
import type { ProfileData } from "../types";
import { MAX_RETIREMENT_SEARCH_AGE } from "./constants";
import { calculateFundingGap, calculateFundingGapAtAge } from "./fundingGap";
import { retirementTimingShiftedTo } from "./household";
import { checkTrace } from "./traceCheck";
import {
  buildVerificationPack,
  serializeVerificationPack,
  VerificationPackLeakError,
  type VerificationPack,
} from "./verificationPack";
import { findLeaks, REDACTED_TEXT } from "./verificationRedaction";

const EVALUATED_AT = new Date("2026-10-30T12:00:00Z");

/** The invented couple with identifying text on every account and holding. */
function identifiedCouple(): ProfileData {
  const profile = buildTraceCouple();
  return {
    ...profile,
    pensionSavings: {
      ...profile.pensionSavings,
      accounts: profile.pensionSavings.accounts.map((account, index) => ({
        ...account,
        providerName: `Fictional Provider ${index}`,
        policyNumber: `99900012${index}`,
        fundId: `77700056${index}`,
        investmentAndFees: { ...account.investmentAndFees, investmentTrackName: `Fictional Track ${index}` },
      })),
    },
    equity: {
      ...profile.equity,
      holdings: profile.equity.holdings.map((holding, index) => ({
        ...holding,
        tickerSymbol: `ZQXW${index}`,
        companyName: `Fictional Company ${index}`,
        custodianOrBroker: `Fictional Broker ${index}`,
      })),
    },
  };
}

const SENSITIVE_TEXT = (profile: ProfileData): string[] => [
  ...profile.pensionSavings.accounts.flatMap((account) => [
    account.id,
    account.providerName,
    account.policyNumber,
    account.fundId,
    account.investmentAndFees.investmentTrackName,
  ]),
  ...profile.equity.holdings.flatMap((holding) => [
    holding.id,
    holding.tickerSymbol,
    holding.companyName,
    holding.custodianOrBroker,
    ...holding.employerGrantDetails.vestingTranches.map((tranche) => tranche.id),
  ]),
];

describe("verification pack", () => {
  const profile = identifiedCouple();
  const built = buildVerificationPack({
    profile,
    target: { kind: "scenario", scenario: "standard" },
    evaluatedAt: EVALUATED_AT,
  });
  const { pack, redactionKey } = built;

  it("describes the run", () => {
    expect(pack.format).toBe("retirement-planning-verification-pack");
    expect(pack.evaluatedAt).toBe(EVALUATED_AT.toISOString());
    expect(pack.target).toEqual({ kind: "scenario", scenario: "standard" });
    expect(pack.timing).toEqual({ selfAge: 62, spouseAge: 64 });
    expect(pack.audit.guide.length).toBeGreaterThan(5);
    expect(pack.audit.prompt).toContain("Part A");
  });

  it("shows the same figures as the app", () => {
    expect(pack.displayed.fundingGap).toEqual(calculateFundingGap(profile, "standard"));
    const steps = new Map(pack.trace.steps.map((step) => [step.id, step.output]));
    expect(steps.get("fundingGap/monthlyGap")).toBe(pack.displayed.fundingGap.monthlyGap);
    expect(steps.get("net/netMonthlyIncome")).toBe(pack.displayed.fundingGap.estimatedMonthlyIncome);
  });

  it("re-checks cleanly against its own redacted inputs and constants", () => {
    expect(pack.selfCheck.issues).toEqual([]);
    expect(pack.selfCheck.exprChecked).toBeGreaterThan(100);
    expect(pack.selfCheck.provenanceChecked).toBeGreaterThan(300);
    const again = checkTrace(
      { evaluatedAt: pack.evaluatedAt, steps: pack.trace.steps, tables: pack.trace.tables },
      { profile: pack.inputs, constants: pack.constants },
    );
    expect(again).toEqual(pack.selfCheck);
  });

  it("lets an auditor catch a changed step, input or constant", () => {
    const check = (steps: typeof pack.trace.steps, inputs: unknown = pack.inputs, constants = pack.constants) =>
      checkTrace({ evaluatedAt: pack.evaluatedAt, steps, tables: pack.trace.tables }, { profile: inputs, constants });

    const tamperedOutput = pack.trace.steps.map((step) =>
      step.id === "net/binding/taxMonthly" ? { ...step, output: Number(step.output) + 100 } : step,
    );
    expect(check(tamperedOutput).issues.map((issue) => issue.kind)).toContain("expr-mismatch");

    const changedInputs = structuredClone(pack.inputs) as { personal: { monthlyGrossSalary: number } };
    changedInputs.personal.monthlyGrossSalary += 1;
    expect(check(pack.trace.steps, changedInputs).issues.map((issue) => issue.kind)).toContain("profile-mismatch");

    const changedConstants = structuredClone(pack.constants) as { TAX_RATES: { capitalGainsRate: number } };
    changedConstants.TAX_RATES.capitalGainsRate += 0.01;
    expect(check(pack.trace.steps, pack.inputs, changedConstants).issues.map((issue) => issue.kind)).toContain(
      "const-mismatch",
    );
  });

  it("covers every retirement age and the compared ages", () => {
    const { columns, rows } = pack.displayed.gapByAge;
    expect(columns[0]).toBe("primaryAge");
    expect(rows[0][0]).toBe(45);
    expect(rows[rows.length - 1][0]).toBe(MAX_RETIREMENT_SEARCH_AGE);
    const at62 = rows.find((row) => row[0] === 62);
    const gap = calculateFundingGapAtAge(profile, 62);
    expect(at62).toEqual([62, 60, gap.grossMonthlyIncome, gap.estimatedMonthlyTax, gap.estimatedMonthlyIncome, gap.desiredMonthlyExpenses, gap.monthlyGap, gap.status]);

    const standard = pack.displayed.ageComparison.find((row) => row.retirementAge === 62);
    expect(standard?.netMonthlyIncome).toBe(pack.displayed.fundingGap.estimatedMonthlyIncome);
    expect(standard?.monthlyGap).toBe(pack.displayed.fundingGap.monthlyGap);
    expect(pack.displayed.feasibility.status).toBeDefined();
  });

  it("lists the steps that round", () => {
    expect(pack.roundingSteps).toEqual(
      expect.arrayContaining(["net/binding/grossMonthly", "net/binding/taxMonthly", "fundingGap/monthlyGap"]),
    );
  });

  describe("privacy", () => {
    const text = serializeVerificationPack(pack);

    it("holds no identifying text from the inputs", () => {
      for (const sensitive of SENSITIVE_TEXT(profile)) {
        expect(text, sensitive).not.toContain(sensitive);
      }
    });

    it("uses aliases that the key resolves, and only the key holds the real ids", () => {
      expect(text).toContain("account[acct1]");
      const aliases = new Set(text.match(/\b(acct|holding|tranche)\d+\b/g));
      expect(aliases.size).toBeGreaterThan(5);
      const keyed = new Map(redactionKey.entries.map((entry) => [entry.alias, entry]));
      for (const alias of aliases) expect(keyed.has(alias), alias).toBe(true);

      const first = keyed.get("acct1");
      expect(first?.id).toBe(profile.pensionSavings.accounts[0].id);
      expect(first?.details.providerName).toBe("Fictional Provider 0");
      expect(first?.details.policyNumber).toBe("999000120");
      expect(keyed.get("holding1")?.details.tickerSymbol).toBe("ZQXW0");

      const keyText = JSON.stringify(redactionKey);
      expect(keyText).toContain("test-account-0");
      expect(redactionKey.warning).toMatch(/Do not send/);
    });

    it("keeps numbers, enums and dates, and replaces other text", () => {
      const inputs = pack.inputs as ProfileData;
      expect(inputs.personal.monthlyGrossSalary).toBe(profile.personal.monthlyGrossSalary);
      const [first] = inputs.pensionSavings.accounts;
      const [original] = profile.pensionSavings.accounts;
      expect(first.id).toBe("acct1");
      expect(first.providerName).toBe(REDACTED_TEXT);
      expect(first.policyNumber).toBe(REDACTED_TEXT);
      expect(first.fundId).toBe(REDACTED_TEXT);
      expect(first.investmentAndFees.investmentTrackName).toBe(REDACTED_TEXT);
      expect(first.productCategory).toBe(original.productCategory);
      expect(first.totalAccumulatedBalance).toBe(original.totalAccumulatedBalance);
      const study = inputs.pensionSavings.accounts.find((account) => account.productCategory === "studyFund");
      expect(study?.joinDate).toBe("2018-01-01");
    });

    it("drops text in a field the allow-list does not know", () => {
      const odd = { ...identifiedCouple(), futureNote: "free text a reviewer should not see" } as ProfileData;
      const result = buildVerificationPack({
        profile: odd,
        target: { kind: "scenario", scenario: "standard" },
        evaluatedAt: EVALUATED_AT,
      });
      expect((result.pack.inputs as { futureNote: string }).futureNote).toBe(REDACTED_TEXT);
    });

    it("refuses to export when text from the inputs is still in the pack", () => {
      const leaky = {
        inputs: {},
        trace: {
          steps: [
            {
              id: "account[test-account-0]/balance",
              title: "t",
              formula: "f",
              inputs: { a: { value: 1, from: "profile:x" } },
              output: 1,
            },
          ],
          tables: [],
        },
      };
      expect(findLeaks(leaky, ["test-account-0"])).toEqual(["trace.steps[0].id"]);
      expect(findLeaks(leaky, ["something-else"])).toEqual([]);
      const error = new VerificationPackLeakError(["trace.steps[0].id"]);
      expect(error.message).not.toContain("test-account-0");
    });
  });

  describe("serialization", () => {
    it("round-trips and keeps each table row on one line", () => {
      const text = serializeVerificationPack(pack);
      expect(JSON.parse(text)).toEqual(JSON.parse(JSON.stringify(pack)));
      expect(text).not.toContain("u0000");
      const rowLines = text.split("\n").filter((line) => /^\s*\[(-?\d|")/.test(line));
      expect(rowLines.length).toBeGreaterThan(50);
      expect(rowLines.every((line) => line.trim().endsWith("]") || line.trim().endsWith("],"))).toBe(true);
      expect(text.split("\n").length).toBeLessThan(JSON.stringify(pack, null, 1).split("\n").length);
    });
  });
});

describe("verification pack for other targets", () => {
  it("traces the primary user retiring at an age, with the spouse moved by the same years", () => {
    const profile = buildTraceCouple();
    const { pack } = buildVerificationPack({
      profile,
      target: { kind: "age", age: 58 },
      evaluatedAt: EVALUATED_AT,
    });
    expect(pack.timing).toEqual(retirementTimingShiftedTo(profile, 58));
    expect(pack.selfCheck.issues).toEqual([]);
    const row = pack.displayed.ageComparison.find((outcome) => outcome.retirementAge === 58);
    expect(row?.netMonthlyIncome).toBe(pack.displayed.fundingGap.estimatedMonthlyIncome);
  });

  it("works for a single person with no accounts to alias", () => {
    const profile = buildTestProfile({ age: 40, retirementAge: 65, pensionBalances: [] });
    const { pack, redactionKey } = buildVerificationPack({
      profile,
      target: { kind: "scenario", scenario: "early" },
      evaluatedAt: EVALUATED_AT,
    });
    expect(pack.selfCheck.issues).toEqual([]);
    expect(redactionKey.entries).toEqual([]);
    expect(pack.displayed.fundingGap).toEqual(
      expect.objectContaining({ status: expect.stringMatching(/onTrack|shortfall/) }),
    );
  });

  it("uses the recorded evaluation time for the untraced figures too", () => {
    const profile = buildTraceCouple();
    const at = new Date("2033-03-01T00:00:00Z");
    const { pack } = buildVerificationPack({
      profile,
      target: { kind: "scenario", scenario: "standard" },
      evaluatedAt: at,
    });
    const baseYear = pack.trace.steps.find((step) => step.id === "baseYear");
    expect(baseYear?.output).toBe(2033);
    const standard = pack.displayed.ageComparison.find((row) => row.retirementAge === 62);
    expect(standard?.netMonthlyIncome).toBe(pack.displayed.fundingGap.estimatedMonthlyIncome);
  });
});

export type { VerificationPack };
