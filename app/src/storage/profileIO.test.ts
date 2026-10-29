import { describe, expect, it, vi } from "vitest";

import {
  EMPTY_ACCOUNT_CONTRIBUTIONS,
  EMPTY_BITUACH_LEUMI,
  EMPTY_PROFILE,
  createEmptyPensionAccount,
  type ProfileData,
} from "../types";
import { exportProfileToFile, importProfileFromFile } from "./profileIO";

function makeJsonFile(content: string, name = "profile.json"): File {
  return new File([content], name, { type: "application/json" });
}

describe("importProfileFromFile", () => {
  it("parses and normalizes a valid profile export", async () => {
    const profile: ProfileData = {
      ...EMPTY_PROFILE,
      personal: { ...EMPTY_PROFILE.personal, age: 42 },
    };
    const file = makeJsonFile(JSON.stringify(profile));

    const result = await importProfileFromFile(file);

    expect(result.personal.age).toBe(42);
    expect(result.pensionSavings.accounts).toEqual([]);
  });

  it("fills in missing fields with defaults", async () => {
    const file = makeJsonFile(JSON.stringify({ personal: { age: 30 } }));

    const result = await importProfileFromFile(file);

    expect(result.personal.age).toBe(30);
    expect(result.equity).toEqual(EMPTY_PROFILE.equity);
    expect(result.assumptions).toEqual(EMPTY_PROFILE.assumptions);
  });

  it("rejects invalid JSON", async () => {
    const file = makeJsonFile("not json");

    await expect(importProfileFromFile(file)).rejects.toThrow();
  });

  it("rejects JSON that doesn't look like a profile export", async () => {
    const file = makeJsonFile(JSON.stringify({ foo: "bar" }));

    await expect(importProfileFromFile(file)).rejects.toThrow();
  });

  it("rejects a JSON array", async () => {
    const file = makeJsonFile(JSON.stringify([1, 2, 3]));

    await expect(importProfileFromFile(file)).rejects.toThrow();
  });

  it("backfills contribution fields on accounts exported before they existed", async () => {
    const { contributions: _omitted, ...legacyAccount } = createEmptyPensionAccount();
    const legacyProfile = {
      personal: { age: 45 },
      pensionSavings: { accounts: [legacyAccount], otherAssets: null },
    };

    const result = await importProfileFromFile(makeJsonFile(JSON.stringify(legacyProfile)));

    expect(result.personal.monthlyGrossSalary).toBeNull();
    expect(result.pensionSavings.accounts[0].contributions).toEqual(EMPTY_ACCOUNT_CONTRIBUTIONS);
  });

  it("preserves contribution rates already present on an account", async () => {
    const account = {
      ...createEmptyPensionAccount(),
      contributions: {
        monthlySalaryBase: null,
        employeeRatePercent: 6,
        employerRatePercent: 6.5,
        severanceRatePercent: null,
      },
    };
    const file = makeJsonFile(
      JSON.stringify({ pensionSavings: { accounts: [account], otherAssets: null } }),
    );

    const result = await importProfileFromFile(file);

    expect(result.pensionSavings.accounts[0].contributions).toEqual(account.contributions);
  });

  it("includes the Bituach Leumi pension by default for profiles exported before it existed", async () => {
    const result = await importProfileFromFile(makeJsonFile(JSON.stringify({ personal: { age: 50 } })));

    expect(result.bituachLeumi).toEqual(EMPTY_BITUACH_LEUMI);
    expect(result.bituachLeumi.includeInProjection).toBe(true);
  });

  it("preserves saved Bituach Leumi settings", async () => {
    const bituachLeumi = { includeInProjection: false, insuredYearsToDate: 12, monthlyPensionOverride: 2500 };

    const result = await importProfileFromFile(
      makeJsonFile(JSON.stringify({ personal: { age: 50 }, bituachLeumi })),
    );

    expect(result.bituachLeumi).toEqual(bituachLeumi);
  });
});

describe("exportProfileToFile", () => {
  it("triggers a download via an anchor click", () => {
    const createObjectURL = vi.fn(() => "blob:mock-url");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });

    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    exportProfileToFile(EMPTY_PROFILE);

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");

    clickSpy.mockRestore();
    vi.unstubAllGlobals();
  });
});
