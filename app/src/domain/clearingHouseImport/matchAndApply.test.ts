import { describe, expect, it } from "vitest";
import {
  EMPTY_PROFILE,
  createEmptyPensionAccount,
  type ImportedReport,
  type PensionAccount,
  type ProfileData,
} from "../../types";
import {
  applyImport,
  defaultSelectedFields,
  diffField,
  matchCandidates,
  reportInfoFor,
  type ImportPlan,
  type ImportReportInfo,
} from "./matchAndApply";
import type { ImportedAccountCandidate, ImportedFields, ReportMapResult } from "./types";

function candidate(key: string, fields: ImportedFields): ImportedAccountCandidate {
  return {
    key,
    productTypeCode: 2,
    fields,
    warnings: [],
    projections: [],
    annuityBasis: null,
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

  it("treats the unticked guaranteed box as empty, so an imported guarantee fills it", () => {
    const existing = account({
      annuityParameters: { ...createEmptyPensionAccount().annuityParameters, conversionFactor: 150 },
    });
    expect(diffField(existing, "hasGuaranteedFactor", true)).toBe("fillsEmpty");
    expect(diffField(existing, "conversionFactor", 150)).toBe("same");
    expect(diffField(existing, "conversionFactor", 190)).toBe("differs");
    expect(diffField(existing, "estimatedMonthlyAnnuity", 3200)).toBe("fillsEmpty");

    const ticked = account({
      annuityParameters: { ...createEmptyPensionAccount().annuityParameters, hasGuaranteedFactor: true },
    });
    expect(diffField(ticked, "hasGuaranteedFactor", true)).toBe("same");
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

  describe("a policy number that is the holder's ID", () => {
    const shared = (key: string, provider: string, category: "comprehensivePension" | "generalPension") => ({
      ...candidate(key, {
        policyNumber: official("000000018"),
        providerName: official(provider),
        productCategory: official(category),
      }),
      warnings: [{ code: "policyNumberIsHolderId" as const }],
    });

    it("matches only the account of the same provider and kind", () => {
      const sameKind = account({
        id: "x",
        owner: "self",
        providerName: "קרן א",
        productCategory: "comprehensivePension",
        policyNumber: "18",
      });
      const otherKind = account({
        id: "y",
        owner: "self",
        providerName: "קרן א",
        productCategory: "generalPension",
        policyNumber: "18",
      });
      const matches = matchCandidates([shared("c1", "קרן א", "comprehensivePension")], [otherKind, sameKind], "self");
      expect(matches.get("c1")).toBe("x");
    });

    it("is not distinctive on its own, however long, unlike an ordinary policy number", () => {
      const existing = account({
        id: "x",
        owner: "self",
        providerName: "שם ישן",
        productCategory: "comprehensivePension",
        policyNumber: "000000018",
      });
      expect(matchCandidates([shared("c1", "שם חדש", "comprehensivePension")], [existing], "self").size).toBe(0);
    });

    it("does not guess between two candidates of the same provider and kind", () => {
      const existing = account({
        id: "x",
        owner: "self",
        providerName: "קרן א",
        productCategory: "comprehensivePension",
        policyNumber: "18",
      });
      const matches = matchCandidates(
        [shared("c1", "קרן א", "comprehensivePension"), shared("c2", "קרן א", "comprehensivePension")],
        [existing],
        "self",
      );
      expect(matches.size).toBe(0);
    });
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

  it("writes the annuity fields into the account's annuity parameters", () => {
    const plan: ImportPlan = {
      owner: "self",
      accounts: [
        {
          candidate: candidate("c1", {
            hasGuaranteedFactor: official(true),
            conversionFactor: official(157.5),
            estimatedMonthlyAnnuity: official(3200),
          }),
          updateAccountId: null,
          selectedFields: ["hasGuaranteedFactor", "conversionFactor", "estimatedMonthlyAnnuity"],
        },
      ],
      personal: {},
      selectedPersonal: [],
    };
    const added = applyImport(profileWith([]), plan).pensionSavings?.accounts[0];
    expect(added?.annuityParameters).toMatchObject({
      hasGuaranteedFactor: true,
      conversionFactor: 157.5,
      estimatedMonthlyAnnuity: 3200,
    });
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

describe("recording the report an import came from", () => {
  const info = (overrides: Partial<ImportReportInfo> = {}): ImportReportInfo => ({
    personKeys: ["key-a"],
    firstName: "Dana",
    ageAtImport: 46,
    reportDate: "2026-05-01",
    importedAt: "2026-05-02",
    sample: false,
    ...overrides,
  });
  const choice = (updateAccountId: string | null = null) => ({
    candidate: candidate("c1", { totalAccumulatedBalance: official(5) }),
    updateAccountId,
    selectedFields: ["totalAccumulatedBalance" as const],
  });
  const plan = (report: ImportReportInfo | null, owner: "self" | "spouse" = "self", updateId: string | null = null): ImportPlan => ({
    owner,
    accounts: [choice(updateId)],
    personal: {},
    selectedPersonal: [],
    report,
  });
  const record = (id: string, overrides: Partial<ImportedReport> = {}): ImportedReport => ({
    ...info(),
    id,
    owner: "self",
    ...overrides,
  });
  const withReports = (accounts: PensionAccount[], reports: ImportedReport[]): ProfileData => ({
    ...EMPTY_PROFILE,
    pensionSavings: { ...EMPTY_PROFILE.pensionSavings, accounts, reports },
  });

  it("saves a record with the owner and points every written account at it", () => {
    const patch = applyImport(profileWith([]), plan(info(), "spouse"));
    const [saved] = patch.pensionSavings!.reports;
    expect(saved).toMatchObject({ owner: "spouse", firstName: "Dana", personKeys: ["key-a"] });
    expect(patch.pensionSavings!.accounts[0].reportId).toBe(saved.id);
  });

  it("records nothing when the plan carries no report", () => {
    const patch = applyImport(profileWith([]), plan(null));
    expect(patch.pensionSavings!.reports).toEqual([]);
    expect(patch.pensionSavings!.accounts[0].reportId).toBeNull();
  });

  it("re-points an updated account at the new record and drops the report it replaces", () => {
    const profile = withReports([account({ id: "target", reportId: "old" })], [record("old")]);
    const patch = applyImport(profile, plan(info(), "self", "target"));
    const reports = patch.pensionSavings!.reports;
    expect(reports).toHaveLength(1);
    expect(reports[0].id).not.toBe("old");
    expect(patch.pensionSavings!.accounts[0].reportId).toBe(reports[0].id);
  });

  it("keeps an earlier report that accounts still point at", () => {
    const profile = withReports(
      [account({ id: "target", reportId: "old" }), account({ id: "other", reportId: "old" })],
      [record("old")],
    );
    const patch = applyImport(profile, plan(info(), "self", "target"));
    expect(patch.pensionSavings!.reports.map((report) => report.id)).toContain("old");
    expect(patch.pensionSavings!.reports).toHaveLength(2);
  });

  it("keeps the reports of other people and the other owner", () => {
    const profile = withReports([], [record("someone", { personKeys: ["key-b"] }), record("partner", { owner: "spouse" })]);
    const patch = applyImport(profile, plan(info()));
    expect(patch.pensionSavings!.reports.map((report) => report.id)).toEqual(
      expect.arrayContaining(["someone", "partner"]),
    );
    expect(patch.pensionSavings!.reports).toHaveLength(3);
  });

  it("does not let a sample replace a real report, or the other way round", () => {
    const profile = withReports([], [record("real"), record("demo", { sample: true, personKeys: [] })]);
    expect(applyImport(profile, plan(info())).pensionSavings!.reports.map((report) => report.id)).not.toContain("real");
    const afterSample = applyImport(profile, plan(info({ sample: true, personKeys: [] }))).pensionSavings!.reports;
    expect(afterSample.map((report) => report.id)).toContain("real");
    expect(afterSample.map((report) => report.id)).not.toContain("demo");
  });

  it("records the report when only personal details are picked", () => {
    const patch = applyImport(profileWith([]), {
      owner: "self",
      accounts: [],
      personal: { age: official(46) },
      selectedPersonal: ["age"],
      report: info(),
    });
    expect(patch.pensionSavings!.reports).toHaveLength(1);
  });
});

describe("reportInfoFor", () => {
  const person = { idNumber: "18", firstName: "Dana", familyName: "Demo", birthDate: "19800320", age: 46, keys: ["k1", "k2"] };
  const result = (overrides: Partial<ReportMapResult> = {}): ReportMapResult => ({
    schemaVersion: 9,
    candidates: [
      { ...candidate("c1", {}), valuationDate: "2026-04-30" },
      { ...candidate("c2", {}), valuationDate: "2026-05-31" },
    ],
    skipped: [],
    personal: {},
    warnings: [],
    holderIds: ["18"],
    people: [person],
    ...overrides,
  });

  it("keeps the first name, age, newest valuation date and fingerprints, and nothing else about the person", () => {
    const info = reportInfoFor(result(), new Date(2026, 5, 3), false);
    expect(info).toEqual({
      personKeys: ["k1", "k2"],
      firstName: "Dana",
      ageAtImport: 46,
      reportDate: "2026-05-31",
      importedAt: "2026-06-03",
      sample: false,
    });
    expect(JSON.stringify(info)).not.toContain("Demo");
  });

  it("never keeps fingerprints for the sample", () => {
    expect(reportInfoFor(result(), new Date(2026, 5, 3), true)).toMatchObject({ personKeys: [], sample: true });
  });

  it("copes with a report that names nobody and has no dates", () => {
    const info = reportInfoFor(result({ people: [], candidates: [], personal: { age: official(52) } }), new Date(2026, 5, 3), false);
    expect(info).toMatchObject({ firstName: null, ageAtImport: 52, reportDate: null, personKeys: [] });
  });
});
