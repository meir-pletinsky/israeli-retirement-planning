import { describe, expect, it } from "vitest";

import {
  EMPTY_PROFILE,
  createEmptyPensionAccount,
  type ImportedReport,
  type PensionAccount,
  type ProfileData,
} from "../../types";
import { countSampleAccounts, removeSampleImport } from "./sampleImport";

const report = (id: string, sample: boolean): ImportedReport => ({
  id,
  owner: "self",
  personKeys: [],
  firstName: null,
  ageAtImport: null,
  reportDate: null,
  importedAt: "2026-05-02",
  sample,
});

const account = (id: string, reportId: string | null): PensionAccount => ({
  ...createEmptyPensionAccount(),
  id,
  reportId,
});

function profileWith(accounts: PensionAccount[], reports: ImportedReport[]): ProfileData {
  return { ...EMPTY_PROFILE, pensionSavings: { ...EMPTY_PROFILE.pensionSavings, accounts, reports } };
}

const mixed = profileWith(
  [account("typed", null), account("real", "real-report"), account("demo-1", "demo"), account("demo-2", "demo")],
  [report("real-report", false), report("demo", true)],
);

describe("countSampleAccounts", () => {
  it("counts only the accounts that point at a sample report", () => {
    expect(countSampleAccounts(mixed)).toBe(2);
  });

  it("is zero when no sample was imported", () => {
    expect(countSampleAccounts(profileWith([account("typed", null)], [report("real-report", false)]))).toBe(0);
    expect(countSampleAccounts(EMPTY_PROFILE)).toBe(0);
  });

  it("is zero once the sample's accounts are gone, even if its record remains", () => {
    expect(countSampleAccounts(profileWith([account("typed", null)], [report("demo", true)]))).toBe(0);
  });
});

describe("removeSampleImport", () => {
  it("removes the sample's accounts and records and keeps everything else", () => {
    const patch = removeSampleImport(mixed);
    expect(patch.pensionSavings!.accounts.map((entry) => entry.id)).toEqual(["typed", "real"]);
    expect(patch.pensionSavings!.reports.map((entry) => entry.id)).toEqual(["real-report"]);
    expect(patch.pensionSavings!.otherAssets).toBe(mixed.pensionSavings.otherAssets);
  });

  it("covers several sample imports at once", () => {
    const twice = profileWith(
      [account("a", "demo-a"), account("b", "demo-b"), account("typed", null)],
      [report("demo-a", true), report("demo-b", true)],
    );
    const patch = removeSampleImport(twice);
    expect(patch.pensionSavings!.accounts.map((entry) => entry.id)).toEqual(["typed"]);
    expect(patch.pensionSavings!.reports).toEqual([]);
  });

  it("does not mutate the profile it is given", () => {
    const before = JSON.stringify(mixed);
    removeSampleImport(mixed);
    expect(JSON.stringify(mixed)).toBe(before);
  });
});
