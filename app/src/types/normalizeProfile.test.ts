import { describe, expect, it } from "vitest";

import { buildTestProfile } from "../test/domainFixtures";
import { EMPTY_BITUACH_LEUMI, EMPTY_SPOUSE, normalizeProfile } from "./index";

describe("normalizeProfile", () => {
  it("adds an empty spouse to a profile saved before couples were supported", () => {
    const { spouse: _spouse, ...legacy } = buildTestProfile({ age: 40 });
    const result = normalizeProfile(legacy);
    expect(result.spouse).toEqual(EMPTY_SPOUSE);
  });

  it("merges a partial spouse onto the defaults, including their Bituach Leumi data", () => {
    const result = normalizeProfile({
      spouse: { age: 52, bituachLeumi: { insuredYearsToDate: 12 } },
    } as Parameters<typeof normalizeProfile>[0]);
    expect(result.spouse.age).toBe(52);
    expect(result.spouse.retirementAge).toBeNull();
    expect(result.spouse.bituachLeumi).toEqual({ ...EMPTY_BITUACH_LEUMI, insuredYearsToDate: 12 });
  });

  it("defaults a saved spouse's credit points to null so the gender default applies", () => {
    const { creditPoints: _creditPoints, ...withoutPoints } = EMPTY_SPOUSE;
    const result = normalizeProfile({
      spouse: { ...withoutPoints, age: 52 },
    } as unknown as Parameters<typeof normalizeProfile>[0]);
    expect(result.spouse.creditPoints).toBeNull();
    expect(EMPTY_SPOUSE.creditPoints).toBeNull();
  });

  it("keeps a spouse's saved credit points", () => {
    const result = normalizeProfile({
      spouse: { age: 52, creditPoints: 2.5 },
    } as Parameters<typeof normalizeProfile>[0]);
    expect(result.spouse.creditPoints).toBe(2.5);
  });

  it("owns accounts without an owner by the primary user and keeps spouse ownership", () => {
    const profile = buildTestProfile({ pensionBalances: [1, 2, 3] });
    const accounts = profile.pensionSavings.accounts.map((account, index) => {
      const { owner: _owner, ...rest } = account;
      return index === 1 ? { ...rest, owner: "spouse" as const } : rest;
    });
    const result = normalizeProfile({
      ...profile,
      pensionSavings: { ...profile.pensionSavings, accounts },
    } as Parameters<typeof normalizeProfile>[0]);
    expect(result.pensionSavings.accounts.map((account) => account.owner)).toEqual([
      "self",
      "spouse",
      "self",
    ]);
  });
});
