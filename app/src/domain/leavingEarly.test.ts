import { describe, expect, it } from "vitest";

import { buildTestProfile } from "../test/domainFixtures";
import { buildLeavingEarlyCost } from "./leavingEarly";

const zeroReal = { investmentReturnPct: 4, inflationPct: 4 };

/** An ISO date `years` from now (the test clock is pinned to 2026-06-15). */
const isoDateInYears = (years: number) =>
  new Date(Date.now() + years * 365.25 * 24 * 3600 * 1000).toISOString().slice(0, 10);

/** A 55-year-old retiring at 65 with 1,100 shares: 100 already theirs, 400 vesting in 9 years and 300 each in 10.5 and 11.5. */
const profileWith = (options: { keepsVestingAfterLeaving?: boolean; priceUSD?: number } = {}) =>
  buildTestProfile({
    age: 55,
    gender: "male",
    retirementAge: 65,
    pensionBalances: [400_000],
    equity: [
      {
        quantity: 1_100,
        priceUSD: options.priceUSD ?? 50,
        employerGrant: {
          keepsVestingAfterLeaving: options.keepsVestingAfterLeaving,
          vestingTranches: [
            { vestDate: isoDateInYears(9), quantity: 400 },
            { vestDate: isoDateInYears(10.5), quantity: 300 },
            { vestDate: isoDateInYears(11.5), quantity: 300 },
          ],
        },
      },
    ],
    ...zeroReal,
  });

describe("buildLeavingEarlyCost", () => {
  it("counts the shares that are still unvested on the retirement date as lost", () => {
    const cost = buildLeavingEarlyCost(profileWith());
    expect(cost).not.toBeNull();
    expect(cost?.retirementDate).toBe(isoDateInYears(10));
    // 300 + 300 shares * $50 * 3.7.
    expect(cost?.lostShares).toBe(600);
    expect(cost?.lostValue).toBe(111_000);
  });

  it("describes the next batch to vest and what staying until then adds each month", () => {
    const next = buildLeavingEarlyCost(profileWith())?.next;
    expect(next?.vestDate).toBe(isoDateInYears(10.5));
    expect(next?.monthsLater).toBe(6);
    expect(next?.shares).toBe(300);
    expect(next?.value).toBe(55_500);
    expect(next?.monthlyNetGain).toBeGreaterThan(0);
    // Keeping 55,500 for the rest of the plan cannot add more than it is worth per month.
    expect(next?.monthlyNetGain).toBeLessThan(55_500 / 12);
  });

  it("loses more shares the earlier the owner retires, and none when every batch has vested", () => {
    expect(buildLeavingEarlyCost(profileWith(), "early")?.lostShares).toBe(1_000);
    expect(buildLeavingEarlyCost(profileWith(), "delayed")).toBeNull();
  });

  it("is null when the grant keeps vesting after leaving", () => {
    expect(buildLeavingEarlyCost(profileWith({ keepsVestingAfterLeaving: true }))).toBeNull();
  });

  it("is null without employer shares, or when the lost shares have no price", () => {
    expect(buildLeavingEarlyCost(buildTestProfile({ age: 55, retirementAge: 65 }))).toBeNull();
    expect(buildLeavingEarlyCost(profileWith({ priceUSD: 0 }))).toBeNull();
  });

  it("leaves out shares that vest on the retirement date or earlier", () => {
    const profile = buildTestProfile({
      age: 55,
      retirementAge: 65,
      equity: [
        {
          quantity: 100,
          priceUSD: 10,
          employerGrant: { vestingTranches: [{ vestDate: isoDateInYears(9), quantity: 100 }] },
        },
      ],
    });
    expect(buildLeavingEarlyCost(profile)).toBeNull();
  });
});
