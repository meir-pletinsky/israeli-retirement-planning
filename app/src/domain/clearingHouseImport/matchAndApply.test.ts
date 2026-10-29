import { describe, expect, it } from "vitest";
import { EMPTY_PROFILE, createEmptyPensionAccount, type PensionAccount, type ProfileData } from "../../types";
import {
  applyImport,
  defaultSelectedFields,
  diffField,
  matchCandidates,
  type ImportPlan,
} from "./matchAndApply";
import type { ImportedAccountCandidate, ImportedFields } from "./types";

function candidate(key: string, fields: ImportedFields): ImportedAccountCandidate {
  return {
    key,
    productTypeCode: 2,
    fields,
    warnings: [],
    projections: [],
    display: { planName: null, employerName: null },
    valuationDate: null,
  };
}

function account(overrides: Partial<PensionAccount> = {}): PensionAccount {
  return { ...createEmptyPensionAccount(), id: overrides.id ?? "existing-1", ...overrides };
}

const official = <T,>(value: T) => ({ value, confidence: "official" as const, source: "test" });
const uncertain = <T,>(value: T) => ({ value, confidence: "uncertain" as const, source: "test" });

function profileWith(accounts: PensionAccount[]): ProfileData {
  return { ...EMPTY_PROFILE, pensionSavings: { ...EMPTY_PROFILE.pensionSavings, accounts } };
}

describe("diffField and defaultSelectedFields", () => {
  it("treats every field of a new account as new", () => {
    expect(diffField(null, "totalAccumulatedBalance", 100)).toBe("new");
  });

  it("separates empty, same and different existing values", () => {
    const existing = account({ totalAccumulatedBalance: 100, providerName: "", policyNumber: "5550001" });
    expect(diffField(existing, "providerName", "קרן")).toBe("fillsEmpty");
    expect(diffField(existing, "totalAccumulatedBalance", 100.004)).toBe("same");
    expect(diffField(existing, "totalAccumulatedBalance", 120)).toBe("differs");
    expect(diffField(existing, "policyNumber", "5550001")).toBe("same");
  });

  it("ticks certain additions only", () => {
    const existing = account({ totalAccumulatedBalance: 100, providerName: "" });
    const selected = defaultSelectedFields(
      candidate("a", {
        totalAccumulatedBalance: official(120),
        providerName: official("קרן"),
        feeFromAccumulationPercent: uncertain(0.5),
        policyNumber: official("5550001"),
      }),
      existing,
    );
    expect(selected).toEqual(expect.arrayContaining(["providerName", "policyNumber"]));
    expect(selected).not.toContain("totalAccumulatedBalance");
    expect(selected).not.toContain("feeFromAccumulationPercent");
  });

  it("ticks every certain field of a new account", () => {
    const selected = defaultSelectedFields(
      candidate("a", { totalAccumulatedBalance: official(120), investmentTrackName: uncertain("מסלול") }),
      null,
    );
    expect(selected).toEqual(["totalAccumulatedBalance"]);
  });
});

describe("matchCandidates", () => {
  it("matches by policy number and provider", () => {
    const existing = account({ id: "x", owner: "self", providerName: "קרן א", policyNumber: "55-0001" });
    const matches = matchCandidates(
      [candidate("c1", { policyNumber: official("550001"), providerName: official("קרן א") })],
      [existing],
      "self",
    );
    expect(matches.get("c1")).toBe("x");
  });

  it("accepts a long policy number even when the provider is named differently", () => {
    const existing = account({ id: "x", owner: "self", providerName: "שם ישן", policyNumber: "123456789012" });
    const matches = matchCandidates(
      [candidate("c1", { policyNumber: official("123456789012"), providerName: official("שם חדש") })],
      [existing],
      "self",
    );
    expect(matches.get("c1")).toBe("x");
  });

  it("does not match a short number across different providers", () => {
    const existing = account({ id: "x", owner: "self", providerName: "קרן ב", policyNumber: "1234" });
    const matches = matchCandidates(
      [candidate("c1", { policyNumber: official("1234"), providerName: official("קרן א") })],
      [existing],
      "self",
    );
    expect(matches.size).toBe(0);
  });

  it("ignores accounts that belong to the other person", () => {
    const existing = account({ id: "x", owner: "spouse", providerName: "קרן א", policyNumber: "123456789" });
    expect(
      matchCandidates([candidate("c1", { policyNumber: official("123456789") })], [existing], "self").size,
    ).toBe(0);
  });

  it("never matches two candidates to one account", () => {
    const existing = account({ id: "x", owner: "self", policyNumber: "123456789" });
    const matches = matchCandidates(
      [candidate("c1", { policyNumber: official("123456789") }), candidate("c2", { policyNumber: official("123456789") })],
      [existing],
      "self",
    );
    expect([...matches.values()]).toEqual(["x"]);
  });

  it("pairs a lone candidate with a lone account of the same provider and category that has no policy number", () => {
    const existing = account({ id: "x", owner: "self", providerName: "קרן א", productCategory: "studyFund" });
    const only = candidate("c1", {
      providerName: official("קרן א"),
      productCategory: official("studyFund"),
    });
    expect(matchCandidates([only], [existing], "self").get("c1")).toBe("x");

    const rival = candidate("c2", { providerName: official("קרן א"), productCategory: official("studyFund") });
    expect(matchCandidates([only, rival], [existing], "self").size).toBe(0);

    const twin = account({ id: "y", owner: "self", providerName: "קרן א", productCategory: "studyFund" });
    expect(matchCandidates([only], [existing, twin], "self").size).toBe(0);
  });
});

describe("applyImport", () => {
  const personal = {
    gender: official("female" as const),
    maritalStatus: uncertain("married" as const),
    age: official(41),
    monthlyGrossSalary: official(18000),
  };

  it("adds a new account for the chosen owner with only the selected fields", () => {
    const plan: ImportPlan = {
      owner: "spouse",
      accounts: [
        {
          candidate: candidate("c1", {
            providerName: official("קרן א"),
            totalAccumulatedBalance: official(250000),
            employeeRatePercent: official(6),
            monthlySalaryBase: official(27000),
            investmentTrackName: official("מסלול"),
          }),
          updateAccountId: null,
          selectedFields: ["providerName", "totalAccumulatedBalance", "monthlySalaryBase", "employeeRatePercent"],
        },
      ],
      personal: {},
      selectedPersonal: [],
    };
    const patch = applyImport(profileWith([]), plan);
    const added = patch.pensionSavings?.accounts[0];
    expect(added).toMatchObject({
      owner: "spouse",
      providerName: "קרן א",
      totalAccumulatedBalance: 250000,
      contributions: { monthlySalaryBase: 27000, employeeRatePercent: 6 },
    });
    expect(added?.investmentAndFees.investmentTrackName).toBe("");
  });

  it("updates an existing account in place and leaves the others alone", () => {
    const keep = account({ id: "keep", totalAccumulatedBalance: 5 });
    const target = account({ id: "target", totalAccumulatedBalance: 100, policyNumber: "777" });
    const plan: ImportPlan = {
      owner: "self",
      accounts: [
        {
          candidate: candidate("c1", { totalAccumulatedBalance: official(900), severanceBalance: official(300) }),
          updateAccountId: "target",
          selectedFields: ["totalAccumulatedBalance", "severanceBalance"],
        },
      ],
      personal: {},
      selectedPersonal: [],
    };
    const accounts = applyImport(profileWith([keep, target]), plan).pensionSavings?.accounts ?? [];
    expect(accounts).toHaveLength(2);
    expect(accounts[0]).toEqual(keep);
    expect(accounts[1]).toMatchObject({
      id: "target",
      policyNumber: "777",
      totalAccumulatedBalance: 900,
      balanceBreakdown: { severanceBalance: 300 },
    });
  });

  it("does not touch accounts when nothing is selected", () => {
    const patch = applyImport(profileWith([]), {
      owner: "self",
      accounts: [{ candidate: candidate("c1", { totalAccumulatedBalance: official(1) }), updateAccountId: null, selectedFields: [] }],
      personal: {},
      selectedPersonal: [],
    });
    expect(patch.pensionSavings).toBeUndefined();
  });

  it("applies the selected personal values to the holder, marital status included", () => {
    const patch = applyImport(profileWith([]), {
      owner: "self",
      accounts: [],
      personal,
      selectedPersonal: ["gender", "maritalStatus", "age", "monthlyGrossSalary"],
    });
    expect(patch.personal).toMatchObject({ gender: "female", maritalStatus: "married", age: 41, monthlyGrossSalary: 18000 });
    expect(patch.spouse).toBeUndefined();
  });

  it("applies gender, age and salary to a spouse, but never marital status", () => {
    const patch = applyImport(profileWith([]), {
      owner: "spouse",
      accounts: [],
      personal,
      selectedPersonal: ["gender", "maritalStatus", "age", "monthlyGrossSalary"],
    });
    expect(patch.spouse).toMatchObject({ gender: "female", age: 41, monthlyGrossSalary: 18000 });
    expect(patch.personal).toBeUndefined();
    expect(JSON.stringify(patch.spouse)).not.toContain("maritalStatus");
  });

  it("ignores a selected personal key with no suggestion", () => {
    const patch = applyImport(profileWith([]), {
      owner: "self",
      accounts: [],
      personal: { age: official(41) },
      selectedPersonal: ["age", "gender"],
    });
    expect(patch.personal?.age).toBe(41);
    expect(patch.personal?.gender).toBe(EMPTY_PROFILE.personal.gender);
  });

  it("does not mutate the profile it is given", () => {
    const existing = account({ id: "target", totalAccumulatedBalance: 100 });
    const profile = profileWith([existing]);
    const snapshot = JSON.stringify(profile);
    applyImport(profile, {
      owner: "self",
      accounts: [{ candidate: candidate("c1", { totalAccumulatedBalance: official(5) }), updateAccountId: "target", selectedFields: ["totalAccumulatedBalance"] }],
      personal,
      selectedPersonal: ["age"],
    });
    expect(JSON.stringify(profile)).toBe(snapshot);
  });
});
