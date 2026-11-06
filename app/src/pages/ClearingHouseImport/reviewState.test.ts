import { describe, expect, it } from "vitest";

import { parseReportTexts, type ImportedAccountCandidate } from "../../domain/clearingHouseImport";
import { EMPTY_PROFILE } from "../../types";
import { buildTestProfile } from "../../test/domainFixtures";
import { activePension, product, report, toXml } from "../../test/fixtures/clearingHouse/builders";
import {
  accountValueRows,
  buildImportPlan,
  candidateBalance,
  countPlan,
  countWarnings,
  defaultSelectedPersonal,
  initialAccountState,
  needsAttention,
  personalDiff,
  selectableKeys,
  suggestedPersonal,
  targetRetirementAge,
} from "./reviewState";

const NOW = new Date("2026-06-15T12:00:00");

function parse() {
  const { result } = parseReportTexts({ xmlTexts: [toXml(report({}, product({}, activePension())))], ignoredFiles: 0 }, NOW);
  return result;
}

describe("personalDiff", () => {
  it("tells empty, equal and different values apart", () => {
    expect(personalDiff(null, 40)).toBe("fillsEmpty");
    expect(personalDiff(40, 40.2)).toBe("same");
    expect(personalDiff(40, 45)).toBe("differs");
    expect(personalDiff("male", "male")).toBe("same");
    expect(personalDiff("male", "female")).toBe("differs");
  });
});

describe("personal suggestions", () => {
  it("offers no marital status for a partner", () => {
    const { personal } = parse();
    expect(suggestedPersonal(personal, "self").map((row) => row.key)).toContain("maritalStatus");
    expect(suggestedPersonal(personal, "spouse").map((row) => row.key)).not.toContain("maritalStatus");
  });

  it("ticks only certain values that fill an empty field", () => {
    const { personal } = parse();
    const selected = defaultSelectedPersonal(personal, EMPTY_PROFILE, "self");
    expect(selected).toEqual(expect.arrayContaining(["gender", "age", "monthlyGrossSalary"]));
    expect(selected).not.toContain("maritalStatus");

    const filled = buildTestProfile({ age: 30, gender: "female", monthlyGrossSalary: 15000 });
    expect(defaultSelectedPersonal(personal, filled, "self")).toEqual([]);
  });
});

describe("targetRetirementAge", () => {
  it("uses the owner's retirement age and falls back to 67", () => {
    const profile = buildTestProfile({ retirementAge: 62 });
    expect(targetRetirementAge(profile, "self")).toBe(62);
    expect(targetRetirementAge(profile, "spouse")).toBe(67);
  });

  it("falls back to the statutory age for the person's gender and age, from the profile or the report", () => {
    const woman = buildTestProfile({ age: 56, gender: "female" });
    expect(targetRetirementAge(woman, "self")).toBe(65);
    const empty = buildTestProfile({});
    const personal = {
      gender: { value: "female" as const, confidence: "official" as const, source: "MIN" },
      age: { value: 56, confidence: "official" as const, source: "TAARICH-LEYDA" },
    };
    expect(targetRetirementAge(empty, "self", personal)).toBe(65);
    expect(targetRetirementAge(empty, "self")).toBe(67);
  });
});

describe("import plan", () => {
  it("leaves out unincluded accounts and counts the chosen values", () => {
    const result = parse();
    const [candidate] = result.candidates as ImportedAccountCandidate[];
    const state = initialAccountState(candidate, null);
    expect(state.include).toBe(true);
    expect(state.updateAccountId).toBeNull();

    const plan = buildImportPlan("self", result.candidates, { [candidate.key]: state }, result.personal, ["age"]);
    const counts = countPlan(plan);
    expect(counts.accounts).toBe(1);
    expect(counts.personal).toBe(1);
    expect(counts.values).toBe(state.selected.length + 1);

    const excluded = buildImportPlan(
      "self",
      result.candidates,
      { [candidate.key]: { ...state, include: false } },
      result.personal,
      [],
    );
    expect(excluded.accounts).toEqual([]);
    expect(countPlan(excluded)).toEqual({ accounts: 0, personal: 0, values: 0 });
  });

  it("does not count an included account with nothing ticked", () => {
    const result = parse();
    const [candidate] = result.candidates;
    const plan = buildImportPlan(
      "self",
      result.candidates,
      { [candidate.key]: { include: true, updateAccountId: null, selected: [] } },
      result.personal,
      [],
    );
    expect(countPlan(plan).accounts).toBe(0);
  });
});

describe("review summary helpers", () => {
  const withMatch = () => {
    const result = parse();
    const [candidate] = result.candidates as ImportedAccountCandidate[];
    return { result, candidate };
  };

  it("marks a replacing or uncertain value for a look, and nothing that is new, equal or certain", () => {
    expect(needsAttention("official", "new")).toBe(false);
    expect(needsAttention("uncertain", "new")).toBe(true);
    expect(needsAttention("official", "fillsEmpty")).toBe(false);
    expect(needsAttention("uncertain", "fillsEmpty")).toBe(true);
    expect(needsAttention("official", "differs")).toBe(true);
    expect(needsAttention("uncertain", "same")).toBe(false);
    expect(needsAttention("official", "same")).toBe(false);
  });

  it("lists the report's values and leaves attention off for a plain new account", () => {
    const { candidate } = withMatch();
    const rows = accountValueRows(candidate, null);
    expect(rows.map((row) => row.key)).toContain("totalAccumulatedBalance");
    expect(rows.every((row) => row.diff === "new")).toBe(true);
    expect(rows.filter((row) => row.attention).every((row) => row.imported.confidence === "uncertain")).toBe(true);
    expect(selectableKeys(rows)).toEqual(rows.map((row) => row.key));
  });

  it("flags a value that would replace the profile's and keeps equal values out of the selectable ones", () => {
    const { candidate } = withMatch();
    const base = buildTestProfile({ pensionBalances: [50000] });
    const existing = {
      ...base.pensionSavings.accounts[0],
      totalAccumulatedBalance: candidate.fields.totalAccumulatedBalance!.value,
    };
    const same = accountValueRows(candidate, existing).find((row) => row.key === "totalAccumulatedBalance")!;
    expect(same.diff).toBe("same");
    expect(same.attention).toBe(false);
    expect(selectableKeys(accountValueRows(candidate, existing))).not.toContain("totalAccumulatedBalance");

    const differing = { ...existing, totalAccumulatedBalance: 1 };
    const changed = accountValueRows(candidate, differing).find((row) => row.key === "totalAccumulatedBalance")!;
    expect(changed.diff).toBe("differs");
    expect(changed.attention).toBe(true);
  });

  it("reads the balance of an account and tolerates one without", () => {
    const { candidate } = withMatch();
    expect(candidateBalance(candidate)).toBe(120000);
    const { totalAccumulatedBalance: _removed, ...fields } = candidate.fields;
    expect(candidateBalance({ ...candidate, fields })).toBeNull();
  });

  it("counts only the warnings worth reading, from the report and from each account", () => {
    const { candidate } = withMatch();
    const warned = {
      ...candidate,
      warnings: [{ code: "negativeBalance" as const }, { code: "oldPensionFund" as const }],
    };
    expect(countWarnings([warned], [{ code: "staleReport" }, { code: "newerSchemaVersion" }])).toBe(2);
    expect(countWarnings([], [])).toBe(0);
  });
});
