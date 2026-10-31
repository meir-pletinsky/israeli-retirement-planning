import { describe, expect, it } from "vitest";

import { buildTestProfile } from "../../test/domainFixtures";
import {
  activePension,
  HOLDER_ID,
  product,
  report,
  type HolderOptions,
} from "../../test/fixtures/clearingHouse/builders";
import { mapClearingHouseReport, mergeReportResults } from "./mapReport";
import { assessOwner, suggestOwner } from "./ownerCheck";

const NOW = new Date(2026, 5, 15);
const NUMBER = "7770001";

/** The report is for a 46-year-old man unless the holder says otherwise. */
function resultFor(holder: HolderOptions = {}, number = NUMBER) {
  const mapped = mapClearingHouseReport(report({}, product({ holder }, activePension({ number }))), { now: NOW });
  return mergeReportResults([mapped]);
}

describe("assessOwner", () => {
  it("finds nothing to question when the profile is empty", () => {
    const profile = buildTestProfile({});
    expect(assessOwner(resultFor(), profile, "self").concerns).toEqual([]);
    expect(assessOwner(resultFor(), profile, "spouse").concerns).toEqual([]);
  });

  it("accepts the same person, allowing for a stale age", () => {
    const profile = buildTestProfile({ age: 44, gender: "male" });
    expect(assessOwner(resultFor(), profile, "self").concerns).toEqual([]);
  });

  it("flags a different gender", () => {
    const profile = buildTestProfile({ gender: "female" });
    expect(assessOwner(resultFor(), profile, "self").concerns).toEqual(["genderDiffers"]);
  });

  it("flags an age more than two years away and reports both ages", () => {
    const near = assessOwner(resultFor(), buildTestProfile({ age: 44 }), "self");
    expect(near.concerns).toEqual([]);

    const far = assessOwner(resultFor(), buildTestProfile({ age: 43 }), "self");
    expect(far.concerns).toEqual(["ageDiffers"]);
    expect(far.reportAge).toBe(46);
    expect(far.profileAge).toBe(43);
  });

  it("judges the partner against the partner's details, not the user's", () => {
    const profile = buildTestProfile({
      age: 30,
      gender: "female",
      maritalStatus: "married",
      spouse: { age: 46, gender: "male" },
    });
    expect(assessOwner(resultFor(), profile, "self").concerns).toEqual(["genderDiffers", "ageDiffers"]);
    expect(assessOwner(resultFor(), profile, "spouse").concerns).toEqual([]);
  });

  it("flags a report whose accounts are already saved under the other person", () => {
    const profile = buildTestProfile({
      maritalStatus: "married",
      spouse: { age: 46 },
      pensionBalances: [1000],
      pensionAccountOverrides: [{ owner: "spouse", policyNumber: NUMBER }],
    });
    expect(assessOwner(resultFor(), profile, "self").concerns).toEqual(["matchesOtherOwner"]);
    expect(assessOwner(resultFor(), profile, "spouse").concerns).toEqual([]);
  });

  it("recognises the holder's ID number on one of the other person's accounts", () => {
    const profile = buildTestProfile({
      maritalStatus: "married",
      pensionBalances: [1000],
      pensionAccountOverrides: [{ owner: "spouse", policyNumber: HOLDER_ID.replace(/^0+/, "") }],
    });
    expect(assessOwner(resultFor({}, "5550001"), profile, "self").concerns).toEqual(["matchesOtherOwner"]);
  });
});

describe("suggestOwner", () => {
  it("suggests the user when nothing contradicts it", () => {
    expect(suggestOwner(resultFor(), buildTestProfile({ age: 46, gender: "male" }))).toBe("self");
    expect(suggestOwner(resultFor(), buildTestProfile({}))).toBe("self");
  });

  it("suggests the partner when the report clashes with the user and fits the partner", () => {
    const profile = buildTestProfile({
      age: 30,
      gender: "female",
      maritalStatus: "married",
      spouse: { age: 46, gender: "male" },
    });
    expect(suggestOwner(resultFor(), profile)).toBe("spouse");
  });

  it("suggests the partner when the accounts are already saved under the partner", () => {
    const profile = buildTestProfile({
      maritalStatus: "married",
      pensionBalances: [1000],
      pensionAccountOverrides: [{ owner: "spouse", policyNumber: NUMBER }],
    });
    expect(suggestOwner(resultFor(), profile)).toBe("spouse");
  });

  it("keeps the user when the partner would clash as well", () => {
    const profile = buildTestProfile({
      age: 30,
      gender: "female",
      maritalStatus: "married",
      spouse: { age: 70, gender: "female" },
    });
    expect(suggestOwner(resultFor(), profile)).toBe("self");
  });

  it("never suggests a partner the profile does not have", () => {
    const profile = buildTestProfile({ age: 30, gender: "female" });
    expect(suggestOwner(resultFor(), profile)).toBe("self");
  });
});

describe("holder IDs", () => {
  it("lists each person once, however the number is written", () => {
    const one = mapClearingHouseReport(report({}, product({ holder: { id: "000000018" } }, activePension())), { now: NOW });
    const two = mapClearingHouseReport(report({}, product({ holder: { id: "18" } }, activePension())), { now: NOW });
    const merged = mergeReportResults([one, two]);
    expect(merged.holderIds).toHaveLength(1);
    expect(merged.warnings.some((warning) => warning.code === "multipleHolders")).toBe(false);
  });

  it("warns when the files are about more than one person", () => {
    const one = mapClearingHouseReport(report({}, product({ holder: { id: "000000018" } }, activePension())), { now: NOW });
    const two = mapClearingHouseReport(
      report({}, product({ holder: { id: "000000026" } }, activePension({ number: "2" }))),
      { now: NOW, fileIndex: 1 },
    );
    const merged = mergeReportResults([one, two]);
    expect(merged.holderIds).toHaveLength(2);
    expect(merged.warnings).toContainEqual({ code: "multipleHolders", params: { count: 2 } });
  });
});
