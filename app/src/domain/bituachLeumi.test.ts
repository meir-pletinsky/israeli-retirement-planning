import { describe, expect, it } from "vitest";

import { buildTestProfile } from "../test/domainFixtures";
import {
  estimateBituachLeumiPension,
  mayQualifyForIncomeSupplement,
  statutoryRetirementAge,
} from "./bituachLeumi";
import { womenRetirementAge } from "./bituachLeumiRates";

const YEAR = 2026;
const INCLUDED = { includeInProjection: true };

describe("womenRetirementAge", () => {
  it("follows the birth-year table from 62 up to 65", () => {
    expect(womenRetirementAge(1955)).toBe(62);
    expect(womenRetirementAge(1959)).toBe(62);
    expect(womenRetirementAge(1960)).toBeCloseTo(62 + 4 / 12);
    expect(womenRetirementAge(1961)).toBeCloseTo(62 + 8 / 12);
    expect(womenRetirementAge(1962)).toBe(63);
    expect(womenRetirementAge(1965)).toBeCloseTo(63.75);
    expect(womenRetirementAge(1966)).toBe(64);
    expect(womenRetirementAge(1969)).toBeCloseTo(64.75);
    expect(womenRetirementAge(1970)).toBe(65);
    expect(womenRetirementAge(1995)).toBe(65);
  });
});

describe("statutoryRetirementAge", () => {
  it("is 67 for men and the table age for women", () => {
    expect(statutoryRetirementAge("male", 1990)).toBe(67);
    expect(statutoryRetirementAge("female", 1990)).toBe(65);
    expect(statutoryRetirementAge("female", 1962)).toBe(63);
  });

  it("falls back to the men's age when gender is unknown", () => {
    expect(statutoryRetirementAge(null, 1962)).toBe(67);
  });
});

describe("estimateBituachLeumiPension", () => {
  it("pays the basic pension plus the maximum 50% seniority supplement", () => {
    // Man aged 40: insured since 21 (19 years) plus 27 more to 67 = 46 years -> capped at 50%.
    const profile = buildTestProfile({ age: 40, gender: "male", bituachLeumi: INCLUDED });
    const result = estimateBituachLeumiPension(profile, 67, YEAR);
    expect(result).toMatchObject({
      included: true,
      eligible: true,
      source: "calculated",
      statutoryRetirementAge: 67,
      claimAge: 67,
      insuredYearsAtClaim: 46,
      seniorityRate: 0.5,
      deferralRate: 0,
      monthlyPension: 2757,
    });
  });

  it("delays the claim to the women's statutory age when retiring earlier", () => {
    // Woman aged 40 in 2026 (born 1986) claims at 65 even though she stops working at 60.
    const profile = buildTestProfile({ age: 40, gender: "female", bituachLeumi: INCLUDED });
    const result = estimateBituachLeumiPension(profile, 60, YEAR);
    expect(result.claimAge).toBe(65);
    expect(result.statutoryRetirementAge).toBe(65);
    expect(result.monthlyPension).toBe(2757);
  });

  it("adds 5% per full year the pension is deferred past the statutory age", () => {
    // Man aged 60 retiring at 69: two deferred years -> +10% on the 50%-seniority pension.
    const profile = buildTestProfile({ age: 60, gender: "male", bituachLeumi: INCLUDED });
    const result = estimateBituachLeumiPension(profile, 69, YEAR);
    expect(result.claimAge).toBe(69);
    expect(result.deferralRate).toBeCloseTo(0.1);
    expect(result.monthlyPension).toBe(3033);
  });

  it("cannot defer beyond the universal eligibility age of 70", () => {
    const profile = buildTestProfile({ age: 60, gender: "male", bituachLeumi: INCLUDED });
    const result = estimateBituachLeumiPension(profile, 75, YEAR);
    expect(result.claimAge).toBe(70);
    expect(result.deferralRate).toBeCloseTo(0.15);
    expect(result.monthlyPension).toBe(3171);
  });

  it("scales the seniority supplement with entered insured years", () => {
    // 8 insured years at 67 -> 16% supplement; eligible through the 60-of-last-10 test.
    const profile = buildTestProfile({
      age: 62,
      gender: "male",
      bituachLeumi: { ...INCLUDED, insuredYearsToDate: 3 },
    });
    const result = estimateBituachLeumiPension(profile, 67, YEAR);
    expect(result.insuredYearsAtClaim).toBe(8);
    expect(result.seniorityRate).toBeCloseTo(0.16);
    expect(result.eligible).toBe(true);
    expect(result.monthlyPension).toBe(2132);
  });

  it("is eligible at exactly 60 recent insured months and not at 48", () => {
    const profile = buildTestProfile({
      age: 66,
      gender: "male",
      bituachLeumi: { ...INCLUDED, insuredYearsToDate: 4 },
    });
    // Retiring at 67 adds a year: 5 years = 60 months within the last 10 years.
    const eligible = estimateBituachLeumiPension(profile, 67, YEAR);
    expect(eligible.eligible).toBe(true);
    expect(eligible.monthlyPension).toBe(2022);

    // Retiring now leaves 48 months, ending a year before the claim.
    const notEligible = estimateBituachLeumiPension(profile, 66, YEAR);
    expect(notEligible.eligible).toBe(false);
    expect(notEligible.monthlyPension).toBe(0);
  });

  it("does not count old insurance toward the recent-months test", () => {
    // 10 insured years (120 months) but insurance ended at 50 and the claim is at 67:
    // below 144 lifetime months, and none fall within the last 10 years.
    const profile = buildTestProfile({
      age: 50,
      gender: "male",
      bituachLeumi: { ...INCLUDED, insuredYearsToDate: 10 },
    });
    const result = estimateBituachLeumiPension(profile, 50, YEAR);
    expect(result.eligible).toBe(false);
    expect(result.monthlyPension).toBe(0);
  });

  it("uses a user-entered amount instead of the computed one", () => {
    const profile = buildTestProfile({
      age: 50,
      gender: "male",
      bituachLeumi: { ...INCLUDED, insuredYearsToDate: 10, monthlyPensionOverride: 3000 },
    });
    const result = estimateBituachLeumiPension(profile, 50, YEAR);
    expect(result).toMatchObject({ source: "override", eligible: true, monthlyPension: 3000 });
  });

  it("pays nothing when excluded from projections", () => {
    const profile = buildTestProfile({
      age: 40,
      gender: "male",
      bituachLeumi: { includeInProjection: false, monthlyPensionOverride: 3000 },
    });
    const result = estimateBituachLeumiPension(profile, 67, YEAR);
    expect(result.included).toBe(false);
    expect(result.monthlyPension).toBe(0);
  });
});

describe("mayQualifyForIncomeSupplement", () => {
  it("is true only below the single-person guarantee", () => {
    expect(mayQualifyForIncomeSupplement(4000)).toBe(true);
    expect(mayQualifyForIncomeSupplement(4375)).toBe(false);
    expect(mayQualifyForIncomeSupplement(9000)).toBe(false);
  });
});
