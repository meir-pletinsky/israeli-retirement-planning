import { describe, expect, it } from "vitest";

import { parseReportTexts, type ImportedAccountCandidate } from "../../domain/clearingHouseImport";
import { EMPTY_PROFILE } from "../../types";
import { buildTestProfile } from "../../test/domainFixtures";
import { activePension, product, report, toXml } from "../../test/fixtures/clearingHouse/builders";
import {
  buildImportPlan,
  countPlan,
  defaultSelectedPersonal,
  initialAccountState,
  personalDiff,
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
