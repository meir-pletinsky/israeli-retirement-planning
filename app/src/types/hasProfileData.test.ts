import { describe, expect, it } from "vitest";

import { buildTestProfile } from "../test/domainFixtures";
import { EMPTY_PROFILE, hasProfileData, normalizeProfile } from "./index";

describe("hasProfileData", () => {
  it("is false for a fresh profile, however it was built", () => {
    expect(hasProfileData(EMPTY_PROFILE)).toBe(false);
    expect(hasProfileData(normalizeProfile(null))).toBe(false);
    expect(hasProfileData(normalizeProfile(JSON.parse(JSON.stringify(EMPTY_PROFILE))))).toBe(false);
  });

  it("is true once a personal field is filled in", () => {
    expect(hasProfileData({ ...EMPTY_PROFILE, personal: { ...EMPTY_PROFILE.personal, age: 45 } })).toBe(true);
  });

  it("is true for a spouse, an expense, a changed assumption or comparison ages", () => {
    expect(hasProfileData({ ...EMPTY_PROFILE, spouse: { ...EMPTY_PROFILE.spouse, age: 41 } })).toBe(true);
    expect(
      hasProfileData({ ...EMPTY_PROFILE, expenses: { ...EMPTY_PROFILE.expenses, currentMonthly: 9000 } }),
    ).toBe(true);
    expect(
      hasProfileData({
        ...EMPTY_PROFILE,
        assumptions: { ...EMPTY_PROFILE.assumptions, inflationPct: EMPTY_PROFILE.assumptions.inflationPct + 1 },
      }),
    ).toBe(true);
    expect(hasProfileData({ ...EMPTY_PROFILE, comparisonAges: [60, 65, 70] })).toBe(true);
  });

  it("is true when the only data is an account or a holding", () => {
    const accountsOnly = {
      ...EMPTY_PROFILE,
      pensionSavings: buildTestProfile({ pensionBalances: [100000] }).pensionSavings,
    };
    const holdingsOnly = {
      ...EMPTY_PROFILE,
      equity: buildTestProfile({ equity: [{ quantity: 10, priceUSD: 50, category: "private" }] }).equity,
    };
    expect(accountsOnly.pensionSavings.accounts).toHaveLength(1);
    expect(holdingsOnly.equity.holdings).toHaveLength(1);
    expect(hasProfileData(accountsOnly)).toBe(true);
    expect(hasProfileData(holdingsOnly)).toBe(true);
  });
});
